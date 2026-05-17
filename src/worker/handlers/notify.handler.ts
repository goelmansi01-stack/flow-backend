import nodemailer from 'nodemailer';
import { config } from '../../lib/config';
import { AppError } from '../../lib/types';
import type { ExecutionContext, NotifyNodeConfig } from '../../lib/types';

export async function notifyHandler(
  _ctx: ExecutionContext,
  nodeConfig: NotifyNodeConfig,
): Promise<Record<string, unknown>> {
  const { to, subject, body } = nodeConfig;
  return sendEmail(to, subject, body);
}

async function sendEmail(
  to: string,
  subject: string | undefined,
  message: string,
): Promise<Record<string, unknown>> {
  if (!to) throw new AppError(422, 'Email notify requires a "to" address', 'NOTIFY_ERROR');
  if (!config.SMTP_HOST) throw new AppError(500, 'SMTP not configured', 'NOTIFY_ERROR');

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });

  const info = await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: subject ?? 'Flow Notification',
    text: message,
  });

  return { channel: 'email', messageId: info.messageId, accepted: info.accepted };
}

