import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/auth/signin');
  }
  const owner = (process.env.OWNER_EMAIL ?? '').toLowerCase();
  if (session.user.email.toLowerCase() !== owner) {
    redirect('/auth/signin');
  }
  return session;
}
