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
- 2026-06-13 | Vercel 배포 실패 `No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan` | M10에서 `api/messages/move.ts`를 추가해 `/api/*.ts` 함수가 13개가 됨(Hobby 상한 12) | `delete.ts`를 제거하고 삭제를 `move.ts`로 통합(`to='trash'`면 `deleteMessage` 경유, 폴백 유지). 클라이언트 `mailApi.deleteMessage`도 `/api/messages/move`(`to='trash'`) 호출로 변경 | **`api/` 최상위 `.ts` 파일은 곧 서버리스 함수 1개**. 새 엔드포인트 추가 전 함수 수(현재 12)를 확인하고, 한도 임박 시 관련 동작을 한 함수에 메서드/파라미터로 합칠 것.

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

## M4 — 메일 관리(삭제/회신/전달) (2026-06-12 추가)

- 삭제 = **휴지통 이동(복구 가능)**. `mailbox.deleteMessage` 디스패치 → Gmail `trashGmail`(`/messages/{id}/trash`, `gmail.modify` 스코프), IMAP `trashImap`(specialUse `\\Trash` 폴더 탐색 후 `messageMove`, 없으면 `messageDelete` 폴백).
- **Gmail 삭제는 `gmail.modify` 스코프 필요** → 기존 Gmail 계정 **재로그인(재동의) 필수**(gmail.send 때와 동일). `GOOGLE_SCOPES`에서 `gmail.readonly`를 `gmail.modify`로 대체(modify가 읽기 포함).
- 회신/전달 = 발송 파이프라인 재사용. 작성 화면이 원본을 `getMessage`로 다시 불러 프리필(URL엔 `mode/accountId/srcId`만, 큰 본문 미포함). 회신은 `In-Reply-To`/`References` 헤더 + Gmail `threadId`로 스레드 연결, 전달은 새 대화.
- `MailMessage.messageId`(RFC Message-ID)·`threadId`, `MailDraft.inReplyTo`/`references`/`threadId` 추가.
- 죽은 스텁 `lib/providers/gmail.ts` 삭제(`lib/providers/imap.ts`와 동일 사유 — 미사용 + MailGateway 변경 동기화 부담).

## M11 — 로딩 속도 + '로딩중' 표시 (2026-06-13 추가)

- **전역 로딩 표시**: `components/GlobalLoadingBar.tsx`가 `useIsFetching()`으로 화면 최상단 얇은 진행 바 + '로딩중…' 라벨 표시(최초 로드·배경 새로고침·prefetch 모두). `globals.css`에 `@keyframes loadingbar`. `Providers.tsx`에서 전역 렌더.
- **캐시 영속(의존성 없음)**: `Providers.tsx`가 react-query v5 `dehydrate`/`hydrate`로 `messages`·`accounts`·`folders` 성공 쿼리만 localStorage(`mail:rqcache:v1`, 24h)에 디바운스 저장→재진입 시 즉시 표시. **본문(`message`)·자격증명은 저장 안 함**(용량·보안).
- **Gmail 배치**: `lib/server/gmail.ts` `listGmail`이 목록 메타를 `https://gmail.googleapis.com/batch/gmail/v1` multipart 1요청으로 수집(N+1 제거). 실패 시 기존 id별 `Promise.all`로 폴백.
- **IMAP 단일 연결 다폴더**: `lib/server/imap.ts` `listImapMany`(연결 1회로 폴더 순회+folder 태깅). `mailbox.listMailboxes`를 제공자 분기로 재구성(Gmail은 토큰 1회 교환, IMAP은 단일 연결). 죽은 `fetchFolder` 제거(`listImap`은 잔존하나 미사용).
- 기본 조회 개수 `app/mail/page.tsx` 30→20.

## M10 — 폴더 이동(메일 이동) (2026-06-13 추가)

- 이동 = `mailbox.moveMessage(r, id, from, to)` 디스패치 → Gmail `moveGmail`(`/messages/{id}/modify`로 대상 라벨 추가 + 원본 라벨 제거, `gmail.modify` 스코프 — 삭제와 동일 스코프라 추가 재동의 불필요), IMAP `moveImap`(원본 폴더 lock 후 `messageMove`, from/to 모두 `resolveMailbox`로 경로 해석, 같은 폴더면 no-op).
- `api/messages/move.ts`(body `{accountId,id,from,to}`). **삭제도 이 엔드포인트로 통합** — Hobby 플랜 서버리스 함수 12개 제한 때문에 `delete.ts`를 없애고 `to='trash'`면 `deleteMessage`(IMAP 영구삭제 폴백 유지) 경유. `mailApi.deleteMessage`는 `to='trash'`로, `mailApi.moveMessage(accountId,id,to,from?)`는 일반 폴더로 호출. `MailGateway` 인터페이스 확장.
- 이동은 **단일 계정에서만** 노출(폴더 식별자가 제공자별로 달라 전체계정 합산 뷰에선 대상 모호). `app/mail/page.tsx` 선택 모드 툴바에 '이동' 버튼 → 폴더 칩 피커(계정 폴더 전체) → 일괄 이동(`Promise.allSettled`, 실패분만 선택 유지 — 삭제 패턴 재사용). `app/read/page.tsx`도 읽기 화면 액션바에 '이동'(폴더 피커는 현재 폴더 제외, `showMove`일 때만 `listFolders` 조회).
- 각 메시지의 출처 폴더는 `MailMessage.folder`(M9에서 도입)를 from으로 사용해 정확한 폴더에서 이동.

## 변경 이력
- 2026-06-15: M17 — 메일 작성 첨부파일. `MailDraft.attachments`(`DraftAttachment{filename,mimeType,data(base64)}`) + 공용 상수 `MAX_ATTACHMENTS_TOTAL_BYTES`(3MB) 추가. 첨부는 **새 엔드포인트 없이**(서버리스 12/12) 기존 `/api/messages/send` JSON에 인라인 base64로 실어 보냄(Vercel 본문 4.5MB 한도 → 총 3MB 제한, 클라 차단+서버 413 방어). `app/compose/page.tsx`: 숨긴 file input + '파일 추가', `FileReader.readAsDataURL`→접두사 제거 base64, 칩(파일명·크기·제거), 누적 용량 검사, 읽는 중 발송 비활성. `lib/server/gmail.ts` `buildMime`: 첨부 있으면 `multipart/mixed`(본문 1파트+첨부 N파트, `encodeSubject`로 한글 파일명 RFC2047, 76자 base64 줄바꿈), 없으면 기존 단일 파트 유지(회귀 0). `lib/server/smtp.ts`: nodemailer `attachments`(content=base64). 회신/전달 프리필과 무관하게 동작.
- 2026-06-15: M16 — 받은/보낸/휴지통 탭 불러오기 체감 속도 개선. (1) 탭 프리페치가 사실상 무효였던 버그 수정 — `app/mail/page.tsx`의 인접 대분류 prefetch가 키를 `['messages',acct,next,'']`(4요소)로 만들어 실제 키 `['messages',acct,effectiveMailbox,query,pageSize]`(5요소, `pageSize:20`)와 불일치 → 전환 시 캐시 hit이 안 됐고 단일계정은 제외됨. `categoryMailbox(cat)`(단일=`defaultSelection`, 전체=inbox 자동합산/별칭)으로 **실제 키와 정확히 일치**시키고 단일계정까지 확장, `staleTime`으로 중복 방지. (2) IMAP 폴더 목록 메모리 캐시(`lib/server/imap.ts` `listBoxes`, 워밍 인스턴스·TTL 5분·메타데이터만) — 보낸/휴지통 별칭 해석의 `client.list()` 추가 왕복을 제거. `listImapMany`/`trashImap`/`moveImap`/`listImapFolders`가 캐시 사용, 받은편지함(INBOX)만이면 list 0회 유지. TLS connect 바닥·`staleTime`(60s)·단일연결 순회는 신선도/연결수 위험으로 유지.
- 2026-06-14: M15 — 메일 로딩/작업 실행 체감 속도 개선. 삭제·이동이 느렸던 핵심 원인은 프런트가 mutation을 await한 뒤 `invalidateQueries(['messages'])`로 **목록 전체를 콜드 재조회**(IMAP은 매 요청 새 TLS ~1s)하고, 읽기화면은 `window.location.href`로 **앱을 하드 리로드**했던 것. (1) `app/mail/page.tsx` 삭제/이동을 **낙관적 업데이트**로 전환 — `queryClient.setQueriesData({queryKey:['messages']})`로 캐시 목록에서 즉시 제거 후 mutation은 백그라운드, 실패 시에만 `invalidateQueries`로 동기화(성공 시 블로킹 재조회 없음). (2) `app/read/page.tsx`는 낙관적 제거 + **`useRouter().push('/mail/')`**(SPA 네비게이션, 하드 리로드/캐시 폐기 제거), 미사용 `delErr/moveErr` 정리. (3) `lib/server/imap.ts` `trashImap`/`moveImap`이 `client.list()`를 **최대 1회만** 호출하도록 `resolveMailbox(…, boxes?)`+`needsList`로 공유(흔한 inbox→폴더 이동은 list 0회 유지). (4) `components/GlobalLoadingBar.tsx`는 fetch가 **~350ms 이상 지속될 때만** 노출(캐시 hit·prefetch 깜빡임 제거). IMAP 무상태 TLS 바닥·`staleTime`(60s)·단일연결 폴더순회는 신선도/연결수 위험으로 유지.
- 2026-06-14: M14 — 전체뷰(모든 계정) 받은편지함에서 **각 계정이 정한 폴더 자동 합산**. 전체뷰에선 폴더 식별자가 제공자별로 달라 그동안 대표 INBOX만 합산했는데, 계정-스코프 복합키 **`accountId|folderId`**(accountId에 `:`가 이미 있어 구분자는 `|`)로 표현해 백엔드가 계정별로 다른 folderIds를 적용. `api/messages/list.ts`가 `mailbox` 토큰을 글로벌(`fid`)/계정-스코프(`aid|fid`)로 분리, 스코프 지정 계정만 그 폴더로 조회(나머지 skip), 글로벌·단일계정 경로는 기존 그대로(하위호환). `app/mail/page.tsx`: **전체 탭엔 폴더 선택 UI가 없고**, 각 계정이 단일계정 화면 '폴더 설정'으로 정해둔 `visibleFolders`(계정별 localStorage)를 `effect`에서 읽어 복합키 토큰으로 자동 합산(미설정 계정은 'inbox' 별칭, 아무도 설정 안 했으면 전체가 'inbox' 별칭 → 추가 조회·비용 0). 메시지의 `accountId`+`folder`(plain fid) 식별은 불변이라 읽기/삭제/이동 무영향. (초안은 전체뷰 폴더 피커였으나, 사용자 요청대로 '계정별 설정 폴더 자동 포함'으로 재설계.)
- 2026-06-11: 초안 작성(규칙·제약·오류 로그 틀).
- 2026-06-11: M2 — Gmail OAuth 실연동(start/callback), Gmail REST 목록/읽기, AES-256-GCM 자격증명 암호화, 세션 쿠키(httpOnly), 저장소 추상화(memory/KV). 오류 로그 1건 추가.
- 2026-06-11: M2 검증 준비 — `DEPLOY.md`(Vercel 배포·검증 런북), `/api/health` 핑 엔드포인트 추가.
- 2026-06-11: M2 배포 디버그 — `package.json`에 `"type":"module"` 추가(서버리스 ESM 파싱 오류 수정).
- 2026-06-11: M3 — IMAP 수신(imapflow+mailparser), SMTP 발송(nodemailer), Gmail 발송(RFC822+gmail.send), 제공자 디스패처(mailbox.ts), IMAP 로그인 엔드포인트, 작성 화면. StoredAccount.secret 일반화.
- 2026-06-11: M3 검증 — OAuth `access_denied`(Testing 테스트 사용자 미등록) 진단. Production 게시(외부 배포) 경로 채택, `DEPLOY.md`에 게시 상태 가이드 추가.
- 2026-06-11: M3 검증 — 콜백 "로그인 실패" 진단 패치(`?reason=<stage>` 노출). 실원인은 `CREDENTIALS_ENCRYPTION_KEY` Vercel 미설정(`@seal`). 환경변수 설정으로 해결. `DEPLOY.md`에 `?reason=` 진단표 추가.
- 2026-06-12: M4 — 메일 삭제(휴지통)·회신·전달(스레드 연결). `api/messages/delete`, `trashGmail`/`trashImap`, `gmail.modify` 스코프, 작성 화면 reply/forward 프리필. 죽은 스텁 `lib/providers/gmail.ts` 제거.
- 2026-06-12: M4.1 — 받은편지함 선택 모드(다중 선택 일괄 삭제, 단일 선택 회신/전달). 프론트만 변경(`app/mail/page.tsx`·`components/MailListItem.tsx`), 기존 `mailApi.deleteMessage`·`/compose` 프리필 재사용.
- 2026-06-12: IMAP 로그인 안내/진단 개선 — 제공자 레지스트리에 `imapHelp`(설정 단계·앱 비밀번호·해외 로그인 차단 주의) 추가해 로그인 화면에 노출. `/api/auth/imap/login`이 실패 `reason`(auth/connect)+`detail`(서버 응답) 반환, `ImapLoginError`로 프론트에 구체 사유 표시.
- 2026-06-12: 네이버 IMAP 안내 정정 — IMAP/POP3 설정은 **PC 웹 전용**(모바일 환경설정엔 없음), **2025-06-24부터 2단계 인증+앱 비밀번호 필수**(계정 비밀번호 불가). 레지스트리 `imapHelp` 문구 갱신.
- 2026-06-13: M13 — 재진입 체감 속도. 캐시 복원을 `useEffect`→`useState` 초기화 함수로 옮겨 **첫 페인트 전 동기 hydrate**(`components/Providers.tsx`) → 앱 재진입 시 직전 목록을 스켈레톤 없이 즉시 표시(`window` 가드, 정적 export 빌드 시 무시; useEffect엔 dehydrate 저장만 잔존). 목록 스켈레톤 판정을 `accountsQ.isLoading||messagesQ.isLoading`→`messagesQ.isLoading`으로 좁힘(계정 조회 로딩이 캐시된 목록을 가리지 않게, `app/mail/page.tsx`). Gmail 액세스 토큰 메모리 캐시(`lib/server/google.ts`, refresh token→{token,exp}, `credentials.expiry_date` 또는 50분 폴백, 1분 skew) → 워밍 인스턴스에서 반복 요청·백그라운드 갱신의 Google 왕복(~250–500ms) 제거. IMAP은 무상태 TLS ~1s 바닥 유지(재진입 즉시표시로 체감 개선).
- 2026-06-13: M12 — 전체 메일 보기('더 보기' 점진 로드). 서버 조회 상한 50→500(`api/messages/list.ts`). 프론트 `pageSize` 상태(기본 20, '더 보기'로 +20씩 최대 500)를 `messagesQ` `limit`·queryKey에 반영, 탭/폴더/계정/검색 전환 시 20으로 리셋(`app/mail/page.tsx`). 목록 하단 '더 보기' 버튼(검색 아님 + 반환수≥요청수 + 500 미만일 때, `keepPreviousData`로 기존 목록 유지). Gmail 배치 100개 청크 분할(`gmailMetaBatch`→`gmailMetaBatchChunk`, `Promise.all`, 한 청크 실패 시 전체 폴백). IMAP은 큰 limit에서 더 오래된 범위 fetch라 변경 없음.
- 2026-06-13: M11 — 로딩 속도 + '로딩중' 표시. 전역 상단 로딩 바(`GlobalLoadingBar`, `useIsFetching`), react-query 캐시 localStorage 영속(목록류만, 본문·자격증명 제외), Gmail 목록 배치 API(폴백 유지), IMAP 다폴더 단일 연결(`listImapMany`), 기본 개수 30→20.
- 2026-06-13: M10 — 폴더 이동. `moveMessage` 디스패처(Gmail modify 라벨 교체 / IMAP messageMove), `api/messages/move`, `mailApi.moveMessage`. 단일 계정 한정 — 받은편지함 선택 모드 툴바 '이동' 버튼 + 폴더 칩 피커(`app/mail/page.tsx`), 읽기 화면 '이동' 액션(`app/read/page.tsx`). 출처 폴더는 `MailMessage.folder`.
- 2026-06-13: M9.3 — 폴더 선택은 받은편지함 분류에서만(보낸/휴지통 숨김) + 표시 폴더 체크 설정 부활(받은편지함 한정). 받은편지함 분류 폴더 중 '폴더 설정'으로 칩에 표시할 폴더를 골라 localStorage(`mail:visibleFolders:<accountId>`) 영속, 평소엔 표시 폴더만 칩으로 다중 선택. 보낸/휴지통은 대표 폴더 자동 조회(폴더 UI 없음).
- 2026-06-13: M9.2 — 대분류(받은편지함/보낸편지함/휴지통) 3탭 + 대분류 내 폴더 다중 선택. `Category`로 폴더 분류(sent/trash 외 모두 받은편지함). 백엔드 `'trash'` 별칭 추가(gmailLabel→TRASH, resolveMailbox→specialUse `\\Trash`)로 전체계정 휴지통 합산 지원. 단일 계정은 대분류 탭 아래 그 분류 폴더를 칩으로 다중 선택(기본=대표 폴더). 좌우 스와이프로 대분류 전환. M9.1 표시폴더 localStorage 설정은 대분류 모델로 대체(제거).
- 2026-06-13: M9.1 — '전체 폴더' 자동표시 제거, 표시 폴더 설정 추가. 계정별 `visibleFolders`를 localStorage(`mail:visibleFolders:<accountId>`)에 영속(자격증명 아님). '폴더 설정' 토글로 바에 표시할 폴더 선택(기본 받은+보낸), 평소엔 표시 폴더만 칩으로 노출하고 그중 다중 선택해 합산. `app/mail/page.tsx`만 변경.
- 2026-06-13: M9 — 폴더 다중 선택 + 전체 폴더 합산. `MailMessage.folder`로 각 메시지의 소속 폴더 태깅(집계 목록에서 열람/삭제를 정확한 폴더로). `mailbox.ts` `listMailboxes(r,limit,folderIds[],query?)`(폴더별 fetch→folder 태깅→accountId:id 중복 제거→merge/sort/slice, 폴더 상한 15), `fetchFolder` 헬퍼 추출. `api/messages/list`는 `mailbox` 콤마 분리. 프론트: 단일 계정 선택 시 받은/보낸 탭 대신 폴더 체크박스 칩(전체 폴더 토글 + 개별), `selectedFolders` 상태+useEffect 기본값(받은편지함), `MailListItem` read 링크는 `message.folder`, Ref·삭제·회신/전달도 메시지 폴더 사용.
- 2026-06-12: M8 — 모든 폴더(메일함) 탐색(스팸 제외). `Mailbox`를 임의 문자열 폴더 식별자로 일반화(Gmail labelId / IMAP path; 'inbox'/'sent'는 의미 별칭). 신규 `api/folders.ts`+`listFolders` 디스패처(Gmail `listGmailLabels` SPAM/UNREAD 제외+한글 표시명 / IMAP `listImapFolders` specialUse `\\Junk`·스팸 폴백명 제외). `listGmail` label 문자열화+`includeSpamTrash=true`(휴지통 조회). list/get/delete/attachment 엔드포인트 mailbox 문자열 통과. 프론트: 단일 계정 선택 시 '기타 폴더' 드롭다운(`useQuery(['folders',accountId])`), 받은/보낸 탭은 전체계정 합산 유지.
- 2026-06-12: M7 — 진입 단순화(마케팅 `/` 제거→`/mail` 리다이렉트, 죽은 `AccountsSection`/`AccountList` 삭제), 받은편지함 내 계정 패널(현재 로그인 상태·연결 해제·계정 추가). 연결 해제: `store.unlinkSession`+`deleteAccount`, 신규 `api/accounts/remove.ts`, `removeAccount` 클라이언트. 검색 버그 수정: 제공자 네이티브 검색(Gmail q/IMAP SEARCH) 제거→`mailbox.ts`에서 최근 `SEARCH_WINDOW`(50) 메타데이터를 받아 서버 substring 필터(제공자 색인·CJK 차이 무관, 예측 가능). 좌우 스와이프로 받은/보낸 탭 전환(터치 핸들러).
- 2026-06-12: M6 — 첨부파일 보기/다운로드 + 로딩 체감 단축 + 계정(구글/네이버) 필터 탭 + 서버 전체 검색. 첨부: `MailAttachment` 메타(getImap `parsed.attachments` id=인덱스 / getGmail payload `attachmentId`), 신규 `api/messages/attachment.ts`(바이너리, 파일명/타입은 클라이언트 메타에서 쿼리 전달), 읽기 화면 첨부 칩+이미지 인라인 미리보기. 검색: `ListOptions.query`→`/api/messages/list?q=`→Gmail `&q=`/IMAP `client.search({or:[subject,from,to,body]})`, 메일함 전체. 계정 탭: `accountsQ`+`getProvider().label`로 칩, `accountId` 필터(기존 파라미터 재사용). 속도: react-query `placeholderData:keepPreviousData`+`staleTime`60s/`gcTime`10m+반대 탭 prefetch(콜드 조회 자체는 IMAP TLS·Gmail N+1로 한계).
- 2026-06-12: M5 — 보낸편지함 + 수신확인 요청 + 2단계 인증 단계 안내. `Mailbox`('inbox'|'sent') 타입을 list/get/delete 스택 전체에 관통(`mailbox.ts`·`imap.ts` `resolveMailbox` specialUse `\\Sent`, Gmail label `SENT`). 작성 화면 '수신확인 요청' 체크박스→`MailDraft.readReceipt`→MDN 헤더(`Disposition-Notification-To`/`Return-Receipt-To`, gmail.ts+smtp.ts). `imapHelp.twoFactor.steps`로 네이버/다음 2단계 인증·앱 비밀번호 발급 단계 노출. 받은/보낸 탭(`app/mail/page.tsx`), 보낸함은 수신자(to) 표시.
