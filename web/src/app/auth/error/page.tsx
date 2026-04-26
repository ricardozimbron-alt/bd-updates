export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-xl font-semibold text-rose-300">Sign-in failed</h1>
      <p className="text-sm text-ink-400">{sp.error ?? 'Unknown error.'}</p>
      <a href="/auth/signin" className="btn mt-6 self-start">Try again</a>
    </main>
  );
}
