import { open } from './crypto.js';
import { getStore, type StoredAccount } from './store.js';

// 세션 → 연결된 계정 + 복호화된 secret. 서버 전용.
// accessToken 발급은 dispatcher(mailbox.ts)에서 제공자별로 처리한다.

export interface ResolvedAccount {
  account: StoredAccount;
  /** 복호화된 자격증명 (OAuth refresh token 또는 IMAP 앱 비밀번호) */
  secret: string;
}

/** 세션에 연결된 계정들의 자격증명을 복호화해 반환. */
export async function resolveAccounts(
  sessionId: string,
  filterAccountId?: string,
): Promise<ResolvedAccount[]> {
  const store = getStore();
  const ids = await store.getSessionAccountIds(sessionId);
  const targetIds = filterAccountId
    ? ids.filter((id) => id === filterAccountId)
    : ids;

  const resolved = await Promise.all(
    targetIds.map(async (id) => {
      const account = await store.getAccount(id);
      if (!account) return null;
      // 이전 KV 레코드(refreshToken 필드)와 하위호환 읽기
      const sealed =
        account.secret ??
        (account as unknown as { refreshToken: typeof account.secret }).refreshToken;
      const secret = open(sealed);
      return { account, secret } satisfies ResolvedAccount;
    }),
  );

  return resolved.filter((r): r is ResolvedAccount => r !== null);
}
