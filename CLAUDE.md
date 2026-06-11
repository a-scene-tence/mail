# CLAUDE.md — 규칙 / 제약 / 오류 로그

> 이 문서는 작업하며 지속 업데이트한다. **오류·버그가 발생하면 반드시 "오류 로그"에 기록**해 같은 오류의 재발을 방지한다.

## 1. 프로젝트 한 줄 요약

흩어진 이메일 계정을 한 곳에서 로그인해 읽고 보내는 통합 메일 앱. 개발=Vercel(웹), 배포=앱인토스 미니앱. 디자인=29cm 정통 미니멀. 상세는 `spec.md`, `design.md`.

## 2. 빌드 / 실행 명령

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (로컬 웹)
npm run build      # 정적 export 빌드 → out/ 생성 (앱인토스 호환 1차 증거)
npm run start      # 정적 결과 미리보기 (옵션)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## 3. 아키텍처 제약 (가장 중요)

- **앱인토스는 SSR 금지.** 프론트는 반드시 `next.config`의 `output: 'export'`(정적 export)로 유지한다.
  - ⇒ `getServerSideProps`, Server Actions, Next API Route(`app/api`), 런타임 서버 컴포넌트 의존 금지.
  - ⇒ `next/image`는 `unoptimized: true`.
  - ⇒ 동적 라우트는 정적 파라미터로만.
- **메일/서버 로직은 정적 번들 밖**, 루트 `/api/*.ts`(Vercel 서버리스 함수)에 둔다. 프론트는 HTTPS로 호출.
- 한 Vercel 배포가 정적 프론트(`out/`) + `/api/*`를 함께 호스팅.
- 배포·검증 절차는 `DEPLOY.md` 참고. 라우팅 스모크 테스트: `GET /api/health` → `{"ok":true}`.

## 4. 코딩 규칙

- TypeScript **strict**. `any` 지양, 공통 타입은 `lib/providers/types.ts` 등에서 공유.
- 디렉터리 컨벤션: `app/`(라우트/화면), `components/`(UI), `lib/`(로직·게이트웨이·클라이언트), `api/`(서버리스).
- 스타일은 Tailwind + `globals.css`의 CSS 변수 토큰 사용. 색/폰트 하드코딩 대신 토큰.
- 클라이언트 컴포넌트는 필요한 곳에만 `'use client'`.

## 5. 보안 규칙

- 자격증명(OAuth refresh token, IMAP 비밀번호)을 **클라이언트(localStorage/번들)에 저장 금지.**
- 서버에서 대칭키 암호화 후 저장(저장소는 다음 단계). 키/시크릿은 환경변수(`.env`)로만, 커밋 금지.
- 토큰 전송은 HTTPS + `Authorization` 헤더.

## 6. 제공자(Provider) 추가 방법

1. `lib/providers/registry.ts`에 메타데이터(id/label/homepage/auth/imap/smtp) 추가.
2. `auth: 'oauth'`면 `gmail.ts`류 게이트웨이, `auth: 'imap'`면 `imap.ts` 공용 게이트웨이 재사용.
3. UI는 자동으로 `ProviderCard`에 노출(레지스트리 기반).

## 7. 오류 로그 (버그·이슈 누적 — 재발 방지)

> 형식: `날짜 | 증상 | 원인 | 해결 | 재발 방지`

- 2026-06-11 | `next build` 린트 단계에서 `Definition for rule '@typescript-eslint/no-var-requires' was not found` 에러 | `eslint-config-next`에 해당 룰이 없는데 `// eslint-disable-next-line @typescript-eslint/no-var-requires` 주석을 달아 ESLint가 "존재하지 않는 룰 비활성화"로 에러 처리 | 동적 `require('@vercel/kv')`를 정적 `import { kv } from '@vercel/kv'`로 바꾸고 disable 주석 제거(KV는 호출 시점에만 연결되므로 정적 import 안전) | next 환경에 없는 룰을 비활성화 주석으로 참조하지 말 것. 동적 require 대신 정적 import 우선.
- 2026-06-11 | Vercel 서버리스 `/api/*.ts` 함수 `SyntaxError: Unexpected token 'export'` (`/var/task/api/health.js:4`) | `tsconfig.json`의 `"module":"esnext"`로 인해 Vercel이 `/api/*.ts`를 ESM 구문(`export default`)으로 컴파일하는데, `package.json`에 `"type":"module"`이 없어 Node.js가 `.js` 파일을 CJS로 로드 → 파싱 실패 | `package.json`에 `"type": "module"` 추가 | `tsconfig` `"module":"esnext"` 사용 시 반드시 `package.json`에 `"type":"module"` 포함. `/api/*.ts`에 `require()`/`__dirname`/`__filename` 쓰지 말 것(ESM에서 사용 불가).
- 2026-06-11 | `"type":"module"` 적용 후 `/api/messages/list` 등에서 `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/lib/server/session'` | Node.js ESM 로더는 상대 경로 import에 **명시적 파일 확장자**를 요구하는데, `@vercel/node`가 `/api/*.ts`를 번들 없이 파일별 트랜스파일만 해서 컴파일된 `.js`가 확장자 없는 `'../../lib/server/session'`을 그대로 import → 해석 실패 | `api/**`·`lib/server/**`의 모든 상대 import에 `.js` 확장자 추가(`'./crypto'`→`'./crypto.js'`). `moduleResolution:'bundler'`라 `.js`가 `.ts`로 해석되어 typecheck·Next 빌드 정상 | ESM(`"type":"module"`)에서 상대 import는 항상 `.js` 확장자 명시. 프론트(Next 번들러)는 확장자 불필요하나 서버리스(Node 직접 실행)는 필수.

### 자주 밟는 함정 체크리스트
- [ ] `output:'export'` 깨는 기능(SSR/Server Action/Next API Route) 추가하지 않았는가?
- [ ] `next/image`에 `unoptimized` 유지했는가?
- [ ] 서버 로직을 실수로 프론트(`app/`)에 넣지 않았는가? (→ `api/`·`lib/server/`로)
- [ ] `lib/server/imap.ts`·`smtp.ts`·`mailbox.ts` 등 서버 전용 파일을 `app/`·`components/`·`lib/providers/`에서 import하지 않았는가? (imapflow/nodemailer가 static bundle에 포함되면 빌드 실패)
- [ ] 새 `lib/server/` 파일의 상대 import에 `.js` 확장자가 붙어 있는가?
- [ ] 자격증명을 클라이언트에 저장하지 않았는가?
- [ ] `npm run build`가 `out/`를 에러 없이 생성하는가?
- [ ] `grep -r 'imapflow\|nodemailer\|mailparser' out/`가 0건인가? (번들 누수 확인)

## M3 — 제공자 디스패치 패턴 (2026-06-11 추가)

- `lib/server/mailbox.ts`가 제공자 디스패처. 엔드포인트(`api/messages/*`)는 여기만 호출.
- `StoredAccount.secret`: OAuth refresh token 또는 IMAP 앱 비밀번호 (암호화). 기존 `refreshToken` 필드 backward-compat 읽기(`accounts.ts`).
- `resolveAccounts`는 복호화된 `secret`만 반환. access token 교환은 dispatcher 내부(oauth 분기만).
- Gmail 발송: `gmail.send` 스코프 필요. 기존 Gmail 계정은 **재로그인(재동의) 필수**.
- Outlook: Microsoft가 기본 인증(Basic Auth) 비활성화 → IMAP 비밀번호 로그인 불가. Naver/Daum이 실 테스트 대상.
- 네이버: 메일 설정 → POP3/IMAP 사용 ON + 앱 비밀번호(2FA 시) 필요.

## 변경 이력
- 2026-06-11: 초안 작성(규칙·제약·오류 로그 틀).
- 2026-06-11: M2 — Gmail OAuth 실연동(start/callback), Gmail REST 목록/읽기, AES-256-GCM 자격증명 암호화, 세션 쿠키(httpOnly), 저장소 추상화(memory/KV). 오류 로그 1건 추가.
- 2026-06-11: M2 검증 준비 — `DEPLOY.md`(Vercel 배포·검증 런북), `/api/health` 핑 엔드포인트 추가.
- 2026-06-11: M2 배포 디버그 — `package.json`에 `"type":"module"` 추가(서버리스 ESM 파싱 오류 수정).
- 2026-06-11: M3 — IMAP 수신(imapflow+mailparser), SMTP 발송(nodemailer), Gmail 발송(RFC822+gmail.send), 제공자 디스패처(mailbox.ts), IMAP 로그인 엔드포인트, 작성 화면. StoredAccount.secret 일반화.
- 2026-06-11: M3 검증 — OAuth `access_denied`(Testing 테스트 사용자 미등록) 진단. Production 게시(외부 배포) 경로 채택, `DEPLOY.md`에 게시 상태 가이드 추가.
