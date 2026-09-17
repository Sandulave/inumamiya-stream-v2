'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="analyticsIconButton" title="更新" aria-label="更新"
      disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw size={18} className={pending ? 'analyticsSpinning' : undefined} />
    </button>
  );
}
