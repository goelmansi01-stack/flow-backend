import nodemailer from 'nodemailer';
import axios from 'axios';
import { config } from '../../lib/config';
import { AppError } from '../../lib/types';
import type { ExecutionContext, NotifyNodeConfig } from '../../lib/types';

export async function notifyHandler(
  _ctx: ExecutionContext,
  nodeConfig: NotifyNodeConfig,
): Promise<Record<string, unknown>> {
  const { channel, message, to, subject } = nodeConfig;

  if (channel === 'email') {
    return sendEmail(to, subject, message);
  }

  if (channel === 'slack') {
    return sendSlack(message);
  }

  throw new AppError(422, `Unknown notify channel: "${channel}"`, 'NOTIFY_ERROR');
}

async function sendEmail(
  to: string | undefined,
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

async function sendSlack(message: string): Promise<Record<string, unknown>> {
  if (!config.SLACK_WEBHOOK_URL) {
    throw new AppError(500, 'Slack webhook URL not configured', 'NOTIFY_ERROR');
  }

  await axios.post(config.SLACK_WEBHOOK_URL, { text: message });
  return { channel: 'slack', sent: true };
}
