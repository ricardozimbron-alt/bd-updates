import { requireOwner } from '@/lib/auth-guard';
import { AppShell } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireOwner();
  const env = (k: string) => (process.env[k] ? '✓ set' : '— not set');
  return (
    <AppShell active="settings">
      <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
        <h1 className="mb-4 text-lg font-semibold">Settings</h1>
        <p className="mb-6 text-xs text-ink-400">
          Operational settings for the deployment. Most live in environment variables; this
          page surfaces them so you can audit at a glance. Edit by changing env vars and
          redeploying.
        </p>

        <div className="space-y-3 rounded border border-ink-800 p-4 text-sm">
          <Row label="Owner email" value={process.env.OWNER_EMAIL ?? '— not set'} />
          <Row label="Anthropic model" value={process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'} />
          <Row label="ANTHROPIC_API_KEY" value={env('ANTHROPIC_API_KEY')} />
          <Row label="DATABASE_URL" value={env('DATABASE_URL')} />
          <Row label="RESEND_API_KEY" value={env('RESEND_API_KEY')} />
          <Row label="AUTH_SECRET" value={env('AUTH_SECRET')} />
          <Row label="NEXTAUTH_URL" value={process.env.NEXTAUTH_URL ?? '— not set'} />
          <Row
            label="Notification batch window"
            value={`${process.env.NOTIFICATION_BATCH_WINDOW_SECONDS ?? '300'}s`}
          />
        </div>

        <h2 className="mb-2 mt-8 text-sm font-semibold">Cron schedules</h2>
        <pre className="overflow-x-auto rounded border border-ink-800 bg-ink-900/60 p-3 font-mono text-[11px] text-ink-200">
{`CRON_CMA_ATOM_BUSINESS = ${process.env.CRON_CMA_ATOM_BUSINESS ?? '*/10 6-19 * * *'}
CRON_CMA_ATOM_OFFHOURS = ${process.env.CRON_CMA_ATOM_OFFHOURS ?? '*/30 0-5,20-23 * * *'}
CRON_EC_PRESS_BUSINESS = ${process.env.CRON_EC_PRESS_BUSINESS ?? '*/10 6-19 * * *'}
CRON_EC_PRESS_OFFHOURS = ${process.env.CRON_EC_PRESS_OFFHOURS ?? '*/30 0-5,20-23 * * *'}
CRON_EC_CASES_BUSINESS = ${process.env.CRON_EC_CASES_BUSINESS ?? '*/15 6-19 * * *'}
CRON_EC_CASES_OFFHOURS = ${process.env.CRON_EC_CASES_OFFHOURS ?? '0 0-5,20-23 * * *'}
CRON_DGCOMP_DAILY      = ${process.env.CRON_DGCOMP_DAILY      ?? '0 6 * * *'}`}
        </pre>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 pb-2 last:border-0 last:pb-0">
      <span className="text-ink-400">{label}</span>
      <span className="font-mono text-xs text-ink-200">{value}</span>
    </div>
  );
}
