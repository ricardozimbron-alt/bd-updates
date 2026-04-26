import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM ?? 'BD updates <onboarding@resend.dev>';

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!resendApiKey) return null;
  if (!client) client = new Resend(resendApiKey);
  return client;
}

export async function sendOwnerNotification(args: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): Promise<{ delivered: boolean; reason?: string; id?: string }> {
  const r = getClient();
  if (!r) {
    return { delivered: false, reason: 'RESEND_API_KEY not set' };
  }
  const result = await r.emails.send({
    from: fromAddress,
    to: args.to,
    subject: args.subject,
    text: args.bodyText,
    html: args.bodyHtml ?? `<pre style="font-family:ui-monospace,monospace">${escapeHtml(args.bodyText)}</pre>`,
  });
  if (result.error) {
    return { delivered: false, reason: result.error.message };
  }
  return { delivered: true, id: result.data?.id };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
