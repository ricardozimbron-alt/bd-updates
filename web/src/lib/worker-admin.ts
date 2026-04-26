/**
 * Server-side helper to call the worker's admin endpoints from web actions.
 * The worker exposes /admin/* on its health port; we hit it over the internal
 * URL set in WORKER_ADMIN_URL.
 */
const ADMIN_URL = process.env.WORKER_ADMIN_URL ?? '';
const ADMIN_TOKEN = process.env.WORKER_ADMIN_TOKEN ?? '';

export async function callWorkerAdmin(
  path: string,
  searchParams: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  if (!ADMIN_URL) {
    return { ok: false, status: 0, body: 'WORKER_ADMIN_URL not set' };
  }
  const u = new URL(path, ADMIN_URL);
  for (const [k, v] of Object.entries(searchParams)) u.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN;
  const res = await fetch(u.toString(), { method: 'POST', headers });
  return { ok: res.ok, status: res.status, body: await res.text() };
}
