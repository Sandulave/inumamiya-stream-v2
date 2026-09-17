'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

type Visit = { id: string; expires: number; referrer: string };
const SESSION_KEY = 'portal_analytics_visit';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const visit = useRef<Visit | null>(null);

  useEffect(() => {
    if (!/^(\/|\/archives\/\d{1,20})$/.test(pathname) || navigator.doNotTrack === '1') return;
    const track = () => {
      if (document.visibilityState !== 'visible' || lastPath.current === pathname) return;
      lastPath.current = pathname;
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
        if (stored && typeof stored === 'object' && 'id' in stored && 'expires' in stored && 'referrer' in stored &&
          typeof stored.id === 'string' && typeof stored.expires === 'number' && typeof stored.referrer === 'string') {
          visit.current = stored as Visit;
        }
      } catch { /* Tracking also works when browser storage is unavailable. */ }
      if (!visit.current || visit.current.expires <= Date.now()) {
        let referrer = '';
        try {
          const url = new URL(document.referrer);
          if (url.hostname !== window.location.hostname) referrer = url.origin;
        } catch { /* Direct visits have no referrer. */ }
        visit.current = { id: crypto.randomUUID(), expires: 0, referrer };
      }
      visit.current.expires = Date.now() + 30 * 60_000;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(visit.current)); } catch { /* Optional storage. */ }
      const title = (document.querySelector('main h1')?.textContent ?? document.title).trim().slice(0, 200);
      void fetch('/api/analytics/pageview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ id: crypto.randomUUID(), path: pathname, title, sessionId: visit.current.id, referrer: visit.current.referrer }),
      }).catch(() => {});
    };
    track();
    document.addEventListener('visibilitychange', track);
    return () => document.removeEventListener('visibilitychange', track);
  }, [pathname]);

  return null;
}
