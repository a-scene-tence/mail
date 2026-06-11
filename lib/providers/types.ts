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
}

/** 등록된 사용자 계정 (자격증명은 서버에만, 여기엔 식별자만). */
export interface MailAccount {
  id: string;
  providerId: string;
  /** 표시용 이메일 주소 */
  address: string;
}

export interface MailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  /** ISO 8601 */
  date: string;
  unread: boolean;
}

export interface MailDraft {
  to: string[];
  subject: string;
  body: string;
}

export interface ListOptions {
  /** 통합 받은편지함이면 생략, 계정별이면 지정 */
  accountId?: string;
  limit?: number;
  cursor?: string;
}

/** 제공자 게이트웨이 공통 인터페이스 (구현은 서버 또는 api-client 경유). */
export interface MailGateway {
  listMessages(opts: ListOptions): Promise<MailMessage[]>;
  getMessage(accountId: string, messageId: string): Promise<MailMessage>;
  sendMessage(accountId: string, draft: MailDraft): Promise<{ id: string }>;
}
