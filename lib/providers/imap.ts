import type {
  ListOptions,
  MailDraft,
  MailGateway,
  MailMessage,
} from './types';

// IMAP/SMTP 공용 게이트웨이 (서버 측). 골격 단계는 시그니처+스텁.
// 다음 단계(M3): imapflow(수신) + nodemailer(발송) 연결. 호스트는 registry 참고.
export const imapGateway: MailGateway = {
  async listMessages(_opts: ListOptions): Promise<MailMessage[]> {
    // TODO(M3): imapflow fetch
    return [];
  },
  async getMessage(_accountId: string, _messageId: string): Promise<MailMessage> {
    // TODO(M3): imapflow fetch (단일)
    throw new Error('imapGateway.getMessage: 미구현(M3)');
  },
  async sendMessage(
    _accountId: string,
    _draft: MailDraft,
  ): Promise<{ id: string }> {
    // TODO(M3): nodemailer sendMail
    throw new Error('imapGateway.sendMessage: 미구현(M3)');
  },
};
