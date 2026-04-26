import Link from 'next/link';
import { signOut } from '@/auth';
import { Assistant } from './Assistant';
import { ThemeToggle } from './ThemeToggle';
import { KeyboardHelp } from './KeyboardHelp';

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: 'home' | 'inbox' | 'archive' | 'clients' | 'rules' | 'sources' | 'settings';
}) {
  const link = (k: string, label: string, href: string) => (
    <Link
      href={href}
      className={
        'rounded px-2 py-1 text-sm transition-colors ' +
        (active === k
          ? 'bg-ink-800 text-ink-100'
          : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100')
      }
    >
      {label}
    </Link>
  );
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-ink-800 px-4 py-2">
        <Link href="/" className="font-semibold tracking-tight hover:text-ink-50">
          BD updates
        </Link>
        <nav className="flex gap-1">
          {link('home', 'Today', '/')}
          {link('inbox', 'Inbox', '/inbox')}
          {link('archive', 'Archive', '/archive')}
          {link('clients', 'Clients', '/clients')}
          {link('rules', 'Rules', '/rules')}
          {link('sources', 'Sources', '/sources')}
          {link('settings', 'Settings', '/settings')}
        </nav>
        <div className="flex-1" />
        <ThemeToggle />
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/auth/signin' });
          }}
        >
          <button className="text-xs text-ink-400 hover:text-ink-100" type="submit">
            sign out
          </button>
        </form>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <Assistant />
      <KeyboardHelp />
    </div>
  );
}
