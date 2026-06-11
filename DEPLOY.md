# 배포 & 검증 가이드

> 이 문서는 Vercel 배포와 M2(Gmail OAuth) 검증 절차를 담는다. 작업하며 지속 업데이트한다.

## 아키텍처 한 줄
한 Vercel 배포가 **정적 export 프론트(`out/`)** 와 **루트 `/api/*` 서버리스 함수**를 함께 호스팅한다. 프론트는 같은 오리진의 `/api/*`를 호출한다. (앱인토스 번들은 정적 프론트만 포함하고 같은 Vercel 도메인의 `/api/*`를 호출)

> 서버리스는 무상태라 `memory` 저장소는 콜백→목록 호출 간 유지되지 않음 ⇒ **Vercel KV(Upstash Redis) 필수**(`CREDENTIAL_STORE=kv`). 자격증명은 서버 저장소에만 AES-256-GCM 암호화 보관.

---

## M2 검증 런북 (Vercel 배포)

### 사전 결정값
- **프로젝트명** → 안정 도메인 `https://<project>.vercel.app` 확정 (Preview 아님, **Production 도메인**).
- 콜백 URL = `https://<project>.vercel.app/api/auth/google/callback`
  → Google 콘솔의 "승인된 리디렉션 URI" 및 `GOOGLE_REDIRECT_URI` 와 **완전 일치**해야 함.

### 1) Vercel 프로젝트 생성 + 1차 배포
- `a-scene-tence/mail` 임포트, 브랜치 `claude/unified-email-client-9kpyp0`.
- Framework Preset = **Next.js**(자동). Output Directory 별도 지정 불필요(`output:'export'`는 `next.config`가 처리).
- 배포해서 **Production 도메인 확정**.

### 2) Vercel KV(Upstash Redis) 연결
- Vercel → **Storage → Create Database → Upstash for Redis** → 프로젝트에 **Connect**.
- **Primary Region: Washington D.C. (US East, 권장)** — Vercel 함수 기본 리전 `iad1`과 동일 리전이므로 KV 왕복 지연이 최소화됨. Seoul은 Vercel KV 통합에서 제공되지 않음.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수 주입 확인(`lib/server/store.ts`의 `@vercel/kv`가 사용). 이름이 다르면 두 키를 수동 추가.

### 3) Google Cloud 설정
- **Gmail API 사용 설정** (안 하면 목록 호출 403).
- **OAuth 동의 화면**: External(Testing 가능), **Test users**에 검증용 Gmail 계정 추가.
- **OAuth 클라이언트 ID**: 유형 **Web application**, Authorized redirect URIs = 위 콜백 URL → `client_id`/`client_secret` 확보.

### 4) Vercel 환경변수 (Production) → 저장 후 Redeploy

| 키 | 값 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 콘솔 값 |
| `GOOGLE_REDIRECT_URI` | `https://<project>.vercel.app/api/auth/google/callback` |
| `APP_BASE_URL` | `https://<project>.vercel.app` |
| `CREDENTIALS_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `CREDENTIAL_STORE` | `kv` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | (2단계 자동 주입) |
| `NEXT_PUBLIC_API_BASE_URL` | 비움(같은 오리진) |

### 5) 스모크 테스트 — API 라우팅 먼저 (가장 중요)
```bash
curl -i https://<project>.vercel.app/api/health
# 기대: 200 {"ok":true,"service":"unified-mail-api"}

curl -i https://<project>.vercel.app/api/messages/list
# 기대: 200 {"messages":[]}   (세션 없음 → 빈 목록)
```
HTML(SPA)/404가 나오면 루트 `/api`가 함수로 안 잡힌 것 → 아래 "라우팅 폴백".

### 6) OAuth E2E 워크스루
1. `https://<project>.vercel.app` → **계정 추가** → **Gmail(으)로 계속**.
2. "확인되지 않은 앱" 화면이면 **고급 → 이동**(Testing 상태 정상).
3. 동의 후 `/mail/`로 리다이렉트 → **받은편지함 목록**(통합 INBOX, 최신순) 표시.
4. 메일 클릭 → `/read/`에서 **제목·발신자·본문** 표시.
5. 홈(`/`)에서 **연결된 계정** 표시.

### 7) 보안 확인
- DevTools → Application: `mail_session` 쿠키가 **HttpOnly·Secure**, 값은 불투명 id뿐.
- `localStorage`/`sessionStorage`에 자격증명 없음. refresh token은 KV에 암호화 저장.

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| `redirect_uri_mismatch` | 콜백 URL 불일치 | Google 콘솔·`GOOGLE_REDIRECT_URI`·실제 도메인 3곳 완전 일치 |
| 콜백 후 `/login?error=oauth` | refresh_token 미발급/교환 실패 | 계정 보안에서 기존 앱 권한 해제 후 재동의 (재발급) |
| 목록 빈 + 로그 403 | Gmail API 미사용 설정 | 3단계 Enable |
| `access_denied` | Test users 미등록 | 동의화면에 계정 추가 |
| `/api/*` 가 HTML/404 | 루트 함수 미인식 | 라우팅 폴백 |
| `KV_REST_API_URL ... missing` | 환경변수 누락 | 2·4단계 추가 후 redeploy |

> 1차 디버그: Vercel **Runtime Logs**에서 함수별 에러 확인.

## 라우팅 폴백 (스모크 테스트 실패 시에만)
단일 배포의 루트 `/api`는 정상 동작이 기대값이나, 함수로 안 잡히면:
- (A) 최소 `vercel.json`으로 함수 런타임 명시, 또는
- (B) **API를 별도 Vercel 프로젝트로 분리**(`NEXT_PUBLIC_API_BASE_URL`로 연결). 교차 출처가 되므로 쿠키 `SameSite=None; Secure` + CORS 헤더 코드 변경 필요(`lib/server/session.ts`, `api/*`).

---

## 검증 완료 기준 (DoD)
- 스모크 테스트(`/api/health`, `/api/messages/list`) 통과
- Gmail 로그인 → 목록 → 읽기 3종 동작
- 세션 쿠키 HttpOnly · 자격증명 클라이언트 미노출

---

## M3 검증 추가 항목

### Gmail 발송 — gmail.send 스코프 추가
- `GOOGLE_SCOPES`에 `gmail.send` 추가됨 → **기존 Gmail 계정은 재로그인 필요** (기존 refresh token에 발송 권한 없음).
- 계정 추가 → Gmail(으)로 계속 → 재동의 → 발송 권한 획득.

### OAuth 게시 상태 — `access_denied` 해결 (테스트 사용자 vs Production 게시)
재로그인 시 `403 access_denied`("테스터만 액세스 가능")는 앱이 **Testing** 상태인데 로그인 계정이 **테스트 사용자 미등록**일 때 발생. 두 가지 해결책:

**(A) Testing 유지 + 테스트 사용자 추가** — 가장 단순.
- OAuth consent screen → **Test users → ADD USERS** → 로그인 계정 추가.
- ⚠️ Testing 모드는 sensitive/restricted 스코프(gmail.*)에서 **refresh token이 7일 후 만료** → 7일마다 재로그인 필요.

**(B) Production 게시(외부 배포)** — 지속 사용·다수 계정에 유리. (본 프로젝트 채택)
1. OAuth consent screen → **Publishing status → PUBLISH APP** → "In production" 확인.
2. 검증(Verification) 제출 화면이 떠도 **지금 제출 불필요** — 미검증 상태로도 우회 경로 동작.
3. 재로그인 → **"확인되지 않은 앱"** 경고 → **고급 → {도메인}(으)로 이동(안전하지 않음)** → 동의.
- 미검증 Production: restricted 스코프는 **최대 100명**까지 권한 부여 가능(본인+소수 검증엔 충분). refresh token 7일 만료 **없음**.
- 경고 제거 + 100명 초과 공개는 Google **보안 심사(CASA, 수 주)** 필요 — 개인용이면 미검증 Production으로 충분.
- 폴백: Production에서 restricted 스코프가 우회 없이 하드 차단되면 (A) Testing + 테스트 사용자로 전환.

### 네이버 IMAP 사전 설정
1. 네이버 메일 → 환경설정 → POP3/IMAP 설정 → **IMAP/SMTP 사용: ON** 저장.
2. 2단계 인증 사용 시: 네이버 계정 보안 → **애플리케이션 비밀번호** 발급 → 로그인 화면에서 앱 비밀번호 사용.

### 다음(카카오) IMAP 사전 설정
- 다음 메일 → 환경설정 → 메일 외부 접속 설정 → **IMAP 사용 가능** 체크.

### Outlook 주의
- Microsoft는 소비자 계정의 **기본 인증(Basic Auth)을 비활성화**함 → 앱 비밀번호 방식 IMAP 로그인 불가.
- Outlook 연동은 향후 OAuth 흐름 구현 시 가능. 현재는 UI에 표시되지만 로그인 시 인증 오류 발생.

### M3 스모크 테스트
```bash
# IMAP 로그인 (curl로 직접 검증)
curl -i -c /tmp/cookies.txt -X POST https://<project>.vercel.app/api/auth/imap/login \
  -H 'Content-Type: application/json' \
  -d '{"providerId":"naver","address":"you@naver.com","password":"앱비밀번호"}'
# 기대: 200 {"ok":true,"account":{...}}

# 로그인 후 목록 조회
curl -i -b /tmp/cookies.txt https://<project>.vercel.app/api/messages/list
# 기대: 200 {"messages":[...]}

# Gmail 발송 (재로그인 후)
# → UI 작성 화면(/compose)에서 계정 선택 → 발송
```

## 변경 이력
- 2026-06-11: M2 검증 런북 작성(Vercel 배포 기준).
- 2026-06-11: M3 추가 — Gmail 발송 스코프/재동의, 네이버/다음 IMAP 설정, Outlook 제약, M3 스모크 테스트.
- 2026-06-11: OAuth 게시 상태 가이드 추가 — `access_denied` 해결(테스트 사용자 vs Production 게시), Testing 7일 토큰 만료·미검증 Production 100명 한도 주의.
