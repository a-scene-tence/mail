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
    imapHelp: {
      settingsUrl: 'https://mail.naver.com',
      steps: [
        'PC(데스크톱) 웹 mail.naver.com 접속 — 모바일이면 브라우저 메뉴에서 "데스크톱 사이트/PC 버전"으로 전환',
        '좌하단 환경설정 → 상단 POP3/IMAP 설정 탭',
        "'IMAP/SMTP 사용'을 사용함으로 설정 후 저장",
        '네이버ID 2단계 인증 켜기 → 애플리케이션 비밀번호 발급 (2025-06-24부터 필수)',
        '로그인 비밀번호 칸에는 계정 비밀번호가 아니라 위 앱 비밀번호를 입력',
      ],
      note: 'IMAP/POP3 설정 메뉴는 PC 웹에만 있습니다(모바일 환경설정엔 없음). 2025-06-24부터 IMAP 접속에 2단계 인증+앱 비밀번호가 필수라 계정 비밀번호로는 로그인되지 않습니다. 계속 막히면 네이버 보안설정의 "해외 로그인 차단"도 해제해 보세요(서버가 해외 리전에서 접속).',
    },
  },
  {
    id: 'daum',
    label: '다음 메일',
    homepage: 'https://mail.daum.net',
    domain: 'daum.net',
    auth: 'imap',
    imap: { host: 'imap.daum.net', port: 993, secure: true },
    smtp: { host: 'smtp.daum.net', port: 465, secure: true },
    imapHelp: {
      settingsUrl: 'https://mail.daum.net',
      steps: [
        'PC(데스크톱) 웹 mail.daum.net 접속 — 모바일이면 브라우저에서 "데스크톱 사이트"로 전환',
        '환경설정 → IMAP/POP3 설정',
        "'IMAP/SMTP 사용'을 켜고 저장",
        '카카오 2단계 인증 사용 시: 카카오계정 → 보안 → 앱 비밀번호 발급',
        '계정 비밀번호 또는 위 앱 비밀번호를 입력',
      ],
      note: 'IMAP 설정 메뉴는 보통 PC 웹 환경설정에 있습니다.',
    },
  },
  {
    id: 'outlook',
    label: 'Outlook',
    homepage: 'https://outlook.live.com',
    domain: 'outlook.com',
    auth: 'imap',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    imapHelp: {
      steps: [],
      note: 'Microsoft가 소비자 계정의 비밀번호(기본 인증) IMAP 로그인을 차단했습니다. 현재 Outlook은 비밀번호 로그인이 동작하지 않으며, 향후 OAuth 연동으로 지원될 예정입니다.',
    },
  },
];

export function getProvider(id: string): MailProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
