import crypto from 'node:crypto';

// 자격증명(refresh token 등) 저장용 대칭키 암호화 — AES-256-GCM.
// 키는 서버 환경변수 CREDENTIALS_ENCRYPTION_KEY (32바이트 hex = 64자) 에서만 읽는다.
// 클라이언트에는 절대 노출되지 않는다.

export interface Sealed {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY 가 없거나 형식이 잘못됨 (32바이트 hex = 64자 필요)',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function seal(plaintext: string): Sealed {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

export function open(sealed: Sealed): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(sealed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}

/** 세션 ID 등 난수 토큰 생성. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
