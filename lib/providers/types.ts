// 다중 제공자 모델의 공통 타입. 화면은 제공자 구현을 몰라도 동작한다.

export type AuthKind = 'oauth' | 'imap';

export interface MailProvider {
  /** 'gmail' | 'naver' | 'daum' | 'outlook' ... */
  id: string;
  /** 화면 표기명 */
  label: string;
  /** 서비스 대표 링크 */
  homepage: string;
  /** 인증 방식 */
  auth: AuthKind;
  /** 브랜드 표기용 짧은 도메인 (예: gmail.com) */
  domain: string;
  /** imap 제공자만 */
  imap?: { host: string; port: number; secure: boolean };
  /** imap 제공자만 (발송) */
  smtp?: { host: string; port: number; secure: boolean };
  /** imap 제공자 로그인 전 설정 안내 (IMAP 켜기·앱 비밀번호 등) */
  imapHelp?: {
    /** 설정 화면 링크 */
    settingsUrl?: string;
    /** 단계별 안내 (IMAP/SMTP 사용 켜기) */
    steps: string[];
    /** 2단계 인증 + 앱 비밀번호 발급 단계 (필요한 제공자만) */
    twoFactor?: { steps: string[] };
    /** 추가 주의사항 (예: Outlook 기본 인증 차단) */
    note?: string;
  };
}

/** 등록된 사용자 계정 (자격증명은 서버에만, 여기엔 식별자만). */
export interface MailAccount {
  id: string;
  providerId: string;
  /** 표시용 이메일 주소 */
  address: string;
}

export interface MailAttachment {
  /** 다운로드 식별자 — Gmail: attachmentId, IMAP: 첨부 배열 인덱스 */
  id: string;
  filename: string;
  mimeType: string;
  /** 바이트 크기 */
  size: number;
}

export interface MailMessage {
  id: string;
  /** 메시지가 속한 계정 (통합 받은편지함에서 출처 구분) */
  accountId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  /** ISO 8601 */
  date: string;
  unread: boolean;
  /** 본문 — getMessage에서만 채워짐 */
  bodyText?: string;
  bodyHtml?: string;
  /** RFC Message-ID 헤더 — 회신 스레드 연결용 (getMessage에서 채워짐) */
  messageId?: string;
  /** Gmail 스레드 식별자 — 회신을 같은 대화로 묶을 때 사용 */
  threadId?: string;
  /** 첨부파일 메타데이터 — getMessage에서만 채워짐 (내용은 별도 다운로드) */
  attachments?: MailAttachment[];
  /** 이 메시지를 가져온 폴더 식별자 — 다폴더 집계 시 열람/삭제를 정확한 폴더로 */
  folder?: string;
}

export interface MailDraft {
  to: string[];
  subject: string;
  body: string;
  /** 회신 시 원본 Message-ID (In-Reply-To 헤더) */
  inReplyTo?: string;
  /** 회신 시 참조 체인 (References 헤더) */
  references?: string[];
  /** Gmail 회신을 같은 스레드로 묶을 때 */
  threadId?: string;
  /** 수신확인 요청 (MDN Disposition-Notification-To 헤더 발송) */
  readReceipt?: boolean;
}

/**
 * 조회할 메일함 식별자.
 * - 'inbox' / 'sent' : 제공자 공통 의미 별칭(전체계정 합산 탭에서 사용).
 * - 그 외 문자열 : 특정 계정의 폴더 식별자(Gmail=labelId, IMAP=폴더 path).
 */
export type Mailbox = string;

/** 계정의 메일함(폴더/라벨) 한 개. */
export interface MailFolder {
  /** 폴더 식별자 — Gmail labelId 또는 IMAP path */
  id: string;
  /** 표시명 */
  name: string;
  kind?: 'inbox' | 'sent' | 'trash' | 'drafts' | 'folder';
}

export interface ListOptions {
  /** 통합 받은편지함이면 생략, 계정별이면 지정 */
  accountId?: string;
  limit?: number;
  cursor?: string;
  /** 받은편지함(기본) 또는 보낸편지함 */
  mailbox?: Mailbox;
  /** 검색어 — 있으면 서버에서 메일함 전체 검색 (Gmail q / IMAP SEARCH) */
  query?: string;
}

/** 제공자 게이트웨이 공통 인터페이스 (구현은 서버 또는 api-client 경유). */
export interface MailGateway {
  listMessages(opts: ListOptions): Promise<MailMessage[]>;
  getMessage(
    accountId: string,
    messageId: string,
    mailbox?: Mailbox,
  ): Promise<MailMessage>;
  sendMessage(accountId: string, draft: MailDraft): Promise<{ id: string }>;
  deleteMessage(
    accountId: string,
    messageId: string,
    mailbox?: Mailbox,
  ): Promise<{ ok: true }>;
}
