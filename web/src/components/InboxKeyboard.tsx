'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Adds j/k navigation between drafts in the inbox list. The list/detail
 * components themselves stay server-rendered.
 */
export function InboxKeyboard({ ids, selectedId }: { ids: string[]; selectedId: string }) {
  const router = useRouter();
  useEffect(() => {
    function go(delta: number) {
      const i = ids.indexOf(selectedId);
      const next = ids[Math.max(0, Math.min(ids.length - 1, i + delta))];
      if (next && next !== selectedId) {
        router.push(`/inbox?id=${next}`);
      }
    }
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'j') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'k') {
        e.preventDefault();
        go(-1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, selectedId, router]);
  return null;
}
