import 'server-only';
import { createHmac } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

export function analyticsConfigured() {
  return (process.env.ANALYTICS_API_TOKEN?.length ?? 0) >= 32 &&
    (process.env.ANALYTICS_SESSION_SECRET?.length ?? 0) >= 32;
}

export async function getAnalyticsSession() {
  if (!analyticsConfigured()) return null;
  return getIronSession<{ authenticatedUntil: number }>(await cookies(), {
    password: process.env.ANALYTICS_SESSION_SECRET!,
    cookieName: 'portal_analytics_admin',
    ttl: ADMIN_SESSION_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    },
  });
}

export async function isAnalyticsAdmin() {
  const session = await getAnalyticsSession();
  return typeof session?.authenticatedUntil === 'number' && session.authenticatedUntil > Date.now();
}

export function analyticsClientKey(request: Request) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHmac('sha256', process.env.ANALYTICS_API_TOKEN!)
    .update(`${new Date().toISOString().slice(0, 10)}:${address}`)
    .digest('hex');
}

export function isSameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export function analyticsApi(path: string, init: RequestInit = {}) {
  const baseUrl = process.env.ANALYTICS_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return fetch(`${baseUrl.replace(/\/$/, '')}/analytics/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ANALYTICS_API_TOKEN ?? ''}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
}
