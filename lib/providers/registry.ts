import type { MailProvider } from './types';

// 지원 제공자 레지스트리. 새 제공자는 여기에 메타데이터만 추가하면 UI에 자동 노출된다.
// (IMAP/SMTP 호스트는 공개 정보 기준. 실제 연결/검증은 백엔드 게이트웨이에서.)
export const PROVIDERS: MailProvider[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    homepage: 'https://mail.google.com',
    domain: 'gmail.com',
    auth: 'oauth',
  },
  {
    id: 'naver',
    label: '네이버 메일',
    homepage: 'https://mail.naver.com',
    domain: 'naver.com',
    auth: 'imap',
    imap: { host: 'imap.naver.com', port: 993, secure: true },
    smtp: { host: 'smtp.naver.com', port: 465, secure: true },
  },
  {
    id: 'daum',
    label: '다음 메일',
    homepage: 'https://mail.daum.net',
    domain: 'daum.net',
    auth: 'imap',
    imap: { host: 'imap.daum.net', port: 993, secure: true },
    smtp: { host: 'smtp.daum.net', port: 465, secure: true },
  },
  {
    id: 'outlook',
    label: 'Outlook',
    homepage: 'https://outlook.live.com',
    domain: 'outlook.com',
    auth: 'imap',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  },
];

export function getProvider(id: string): MailProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
