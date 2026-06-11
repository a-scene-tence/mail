// 세션 쿠키 헬퍼. 쿠키에는 자격증명이 아니라 불투명한 session id만 담는다.
export const SESSION_COOKIE = 'mail_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

/** Cookie 헤더에서 session id 추출. */
export function readSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Set-Cookie 헤더 값 생성 (httpOnly + Secure + SameSite=Lax). */
export function buildSessionCookie(sessionId: string): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE}`,
  ].join('; ');
}
