'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAccounts, mailApi } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';

export default function ComposePage() {
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
  });
  const accounts = accountsQ.data ?? [];

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const accountId = from || accounts[0]?.id || '';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toList = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!accountId || toList.length === 0 || !subject || !body) return;
    setSending(true);
    setErrMsg(null);
    try {
      await mailApi.sendMessage(accountId, { to: toList, subject, body });
      window.location.href = '/mail/';
    } catch {
      setErrMsg('발송에 실패했습니다. 다시 시도해 주세요.');
      setSending(false);
    }
  }

  const canSubmit =
    !sending && accountId && to.trim() && subject && body;

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/mail/" className="eyebrow">
        ← 받은편지함
      </Link>

      <header className="mb-10 mt-6">
        <Label>Compose</Label>
        <h1 className="display mt-3">메일 작성</h1>
      </header>

      {accountsQ.isLoading ? (
        <div className="h-4 w-32 animate-pulse bg-hairline" />
      ) : accounts.length === 0 ? (
        <p className="text-gray">
          연결된 계정이 없습니다.{' '}
          <Link href="/login" className="underline">
            계정 추가 →
          </Link>
        </p>
      ) : (
        <form className="space-y-8" onSubmit={onSubmit}>
          <div>
            <span className="eyebrow mb-2 block">보내는 계정</span>
            <select
              className="w-full border-0 border-b border-hairline bg-transparent py-2 text-base text-ink outline-none focus:border-ink"
              value={accountId}
              onChange={(e) => setFrom(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.address}
                </option>
              ))}
            </select>
          </div>

          <TextField
            id="to"
            label="받는 사람"
            type="text"
            placeholder="email@example.com (여러 명은 쉼표로)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          <TextField
            id="subject"
            label="제목"
            type="text"
            placeholder="제목"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <Textarea
            id="body"
            label="본문"
            placeholder="내용을 입력하세요"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {errMsg && (
            <p className="border-t border-ink pt-3 text-sm text-ink">{errMsg}</p>
          )}

          <Button type="submit" disabled={!canSubmit}>
            {sending ? '발송 중…' : '보내기'}
          </Button>
        </form>
      )}
    </main>
  );
}
