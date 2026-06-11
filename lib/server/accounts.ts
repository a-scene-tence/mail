import { open } from './crypto.js';
import { accessTokenFromRefresh } from './google.js';
import { getStore, type StoredAccount } from './store.js';

// 세션 → 연결된 계정 + 유효한 access token 해석. 서버 전용.

export interface ResolvedAccount {
  account: StoredAccount;
  accessToken: string;
}

/** 세션에 연결된 계정들의 access token을 발급해 반환. */
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
      const refreshToken = open(account.refreshToken);
      const accessToken = await accessTokenFromRefresh(refreshToken);
      return { account, accessToken } satisfies ResolvedAccount;
    }),
  );

  return resolved.filter((r): r is ResolvedAccount => r !== null);
}
