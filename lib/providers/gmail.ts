import type {
  ListOptions,
  MailDraft,
  MailGateway,
  MailMessage,
} from './types';

// Gmail 게이트웨이 (서버 측). 골격 단계는 시그니처+스텁.
// 다음 단계(M2): googleapis OAuth2 + Gmail API 연결.
export const gmailGateway: MailGateway = {
  async listMessages(_opts: ListOptions): Promise<MailMessage[]> {
    // TODO(M2): users.messages.list + get
    return [];
  },
  async getMessage(_accountId: string, _messageId: string): Promise<MailMessage> {
    // TODO(M2): users.messages.get
    throw new Error('gmailGateway.getMessage: 미구현(M2)');
  },
  async sendMessage(
    _accountId: string,
    _draft: MailDraft,
  ): Promise<{ id: string }> {
    // TODO(M2): users.messages.send (raw MIME)
    throw new Error('gmailGateway.sendMessage: 미구현(M2)');
  },
};
