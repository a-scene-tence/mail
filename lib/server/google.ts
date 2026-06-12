import { OAuth2Client } from 'google-auth-library';

// Google OAuth2 클라이언트 + 프로필 조회. 서버 전용.
// 필요한 환경변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  // gmail.modify는 읽기/발송/휴지통 이동을 모두 포함 (삭제=trash 권한 제공).
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

export function oauthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI 환경변수가 필요합니다.');
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/** 동의 화면 URL (refresh token을 받기 위해 offline + consent). */
export function buildAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });
}

export interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
}

/** authorization code → 토큰 교환. refresh token 필수. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'refresh_token 미발급 — prompt=consent/access_type=offline 확인 필요',
    );
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? '',
  };
}

/** refresh token으로 유효한 access token 발급(자동 갱신). */
export async function accessTokenFromRefresh(
  refreshToken: string,
): Promise<string> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('access token 발급 실패');
  return token;
}

/** access token으로 로그인된 사용자 이메일 조회. */
export async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`userinfo 실패: ${res.status}`);
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error('이메일 정보를 가져오지 못했습니다.');
  return data.email;
}
