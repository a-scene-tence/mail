import { kv } from '@vercel/kv';
import type { Sealed } from './crypto.js';

// 자격증명/세션 저장소. 자격증명은 서버에만 보관(암호화)하고,
// 클라이언트는 오직 불투명한 session id 만 쿠키로 가진다.
//
// 어댑터:
//  - memory : 개발/테스트용(서버리스에선 인스턴스 간 비영속). 기본값.
//  - kv     : Vercel KV(Upstash). KV_REST_API_URL/TOKEN 환경변수로 동작.
// 선택: CREDENTIAL_STORE=kv 면 KV, 아니면 memory.

export interface StoredAccount {
  id: string; // `${providerId}:${address}`
  providerId: string;
  address: string;
  /** 암호화된 자격증명 (OAuth refresh token 또는 IMAP 앱 비밀번호) */
  secret: Sealed;
}

export interface CredentialStore {
  putAccount(acc: StoredAccount): Promise<void>;
  getAccount(id: string): Promise<StoredAccount | null>;
  /** 계정 레코드 삭제(자격증명 영구 폐기). */
  deleteAccount(id: string): Promise<void>;
  /** 세션에 계정 연결(있으면 병합). */
  linkSession(sessionId: string, accountId: string): Promise<void>;
  /** 세션에서 계정 연결 해제. */
  unlinkSession(sessionId: string, accountId: string): Promise<void>;
  getSessionAccountIds(sessionId: string): Promise<string[]>;
}

// ── memory adapter ──────────────────────────────────────────────
const memAccounts = new Map<string, StoredAccount>();
const memSessions = new Map<string, Set<string>>();

const memoryStore: CredentialStore = {
  async putAccount(acc) {
    memAccounts.set(acc.id, acc);
  },
  async getAccount(id) {
    return memAccounts.get(id) ?? null;
  },
  async deleteAccount(id) {
    memAccounts.delete(id);
  },
  async linkSession(sessionId, accountId) {
    const set = memSessions.get(sessionId) ?? new Set<string>();
    set.add(accountId);
    memSessions.set(sessionId, set);
  },
  async unlinkSession(sessionId, accountId) {
    memSessions.get(sessionId)?.delete(accountId);
  },
  async getSessionAccountIds(sessionId) {
    return Array.from(memSessions.get(sessionId) ?? []);
  },
};

// ── kv adapter (Vercel KV) ──────────────────────────────────────
// 모듈 로드 시 연결되지 않으며, 실제 호출 시점에만 KV_REST_API_* 를 사용한다.
function kvStore(): CredentialStore {
  return {
    async putAccount(acc) {
      await kv.set(`account:${acc.id}`, acc);
    },
    async getAccount(id) {
      return (await kv.get<StoredAccount>(`account:${id}`)) ?? null;
    },
    async deleteAccount(id) {
      await kv.del(`account:${id}`);
    },
    async linkSession(sessionId, accountId) {
      await kv.sadd(`session:${sessionId}`, accountId);
    },
    async unlinkSession(sessionId, accountId) {
      await kv.srem(`session:${sessionId}`, accountId);
    },
    async getSessionAccountIds(sessionId) {
      return (await kv.smembers(`session:${sessionId}`)) ?? [];
    },
  };
}

let cached: CredentialStore | null = null;

export function getStore(): CredentialStore {
  if (cached) return cached;
  cached = process.env.CREDENTIAL_STORE === 'kv' ? kvStore() : memoryStore;
  return cached;
}
