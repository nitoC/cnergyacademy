import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG, AppConfig } from '../config/configuration';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  template: string;
  data?: Record<string, unknown>;
}

/**
 * Transactional email abstraction. No real email provider is configured in
 * this codebase: the "outbox" transport writes each message as JSON to
 * MAIL_OUTBOX_DIR so developers and tests can follow verification and
 * password-reset links. To go live, add a transport (SES, Postmark, …)
 * behind this same interface.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    if (this.config.mail.transport === 'disabled') {
      this.logger.warn({ msg: 'Mail transport disabled; message dropped', to: message.to, template: message.template });
      return;
    }
    const dir = path.resolve(this.config.mail.outboxDir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${message.template}-${Math.random().toString(36).slice(2, 8)}.json`);
    await writeFile(file, JSON.stringify({ from: this.config.mail.from, ...message, createdAt: new Date() }, null, 2));
    this.logger.log({ msg: 'Mail written to outbox', to: message.to, template: message.template, file });
  }
}
