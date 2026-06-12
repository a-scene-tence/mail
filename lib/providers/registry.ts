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
      ],
      twoFactor: {
        steps: [
          'PC 웹 naver.com 로그인 → 우측 상단 프로필(이메일) 클릭 → "내 프로필" (또는 nid.naver.com 접속)',
          '왼쪽 메뉴 "보안설정" → "2단계 인증" 선택',
          '비밀번호 재확인 후 인증 수단(네이버앱 알림/전화번호) 등록하고 2단계 인증을 "사용"으로 켜기',
          '같은 보안설정 화면에서 "애플리케이션 비밀번호 관리" 클릭',
          '"애플리케이션 비밀번호 생성" → 용도 이름(예: 통합메일) 입력 → "비밀번호 생성하기"',
          '표시된 16자리 비밀번호를 복사해 아래 "앱 비밀번호" 칸에 입력 (계정 비밀번호 아님)',
        ],
      },
      note: 'IMAP/POP3 설정 메뉴는 PC 웹에만 있습니다(모바일 환경설정엔 없음). 2025-06-24부터 IMAP 접속에 2단계 인증+앱 비밀번호가 필수라 계정 비밀번호로는 로그인되지 않습니다. 계속 막히면 네이버 보안설정의 "해외 로그인 차단"도 해제해 보세요(서버가 해외 리전에서 접속). 모바일은 네이버앱 → 좌측상단 메뉴 → 프로필 → 보안설정에서도 2단계 인증을 켤 수 있습니다.',
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
      ],
      twoFactor: {
        steps: [
          '카카오 2단계 인증을 쓰면 앱 비밀번호가 필요합니다 — accounts.kakao.com 로그인',
          '"보안" → "2단계 인증" 켜기',
          '"앱 비밀번호(외부 서비스용)" 발급 → 아래 비밀번호 칸에 입력',
        ],
      },
      note: 'IMAP 설정 메뉴는 보통 PC 웹 환경설정에 있습니다. 2단계 인증 미사용 시 계정 비밀번호로도 로그인됩니다.',
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
