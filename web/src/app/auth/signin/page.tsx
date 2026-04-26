import { signIn } from '@/auth';

export const dynamic = 'force-dynamic';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-xl font-semibold">BD updates</h1>
      <p className="mb-6 text-sm text-ink-400">
        Sign in with your owner email. A magic link will be sent.
      </p>
      <FormBody searchParamsPromise={searchParams} />
    </main>
  );
}

async function FormBody({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParamsPromise;
  const callbackUrl = sp.callbackUrl ?? '/inbox';
  return (
    <form
      className="space-y-3"
      action={async (formData) => {
        'use server';
        const email = String(formData.get('email') ?? '').trim();
        await signIn('resend', { email, redirectTo: callbackUrl });
      }}
    >
      <label className="block">
        <span className="label mb-1 block">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          placeholder="you@example.com"
        />
      </label>
      <button className="btn btn-primary w-full" type="submit">
        Send magic link
      </button>
      {sp.error ? (
        <p className="text-sm text-rose-400">Sign-in failed. Check the address.</p>
      ) : null}
    </form>
  );
}
