import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_SECONDS, analyticsApi, analyticsClientKey, analyticsConfigured,
  getAnalyticsSession, isSameOrigin,
} from '@/lib/analytics-server';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const destination = new URL('/admin/analytics', request.url);
  const failure = (code: string) => {
    destination.searchParams.set('error', code);
    return NextResponse.redirect(destination, 303);
  };
  if (!analyticsConfigured()) return failure('unavailable');
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return new Response(null, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 4096) return new Response(null, { status: 413 });
  const password = new URLSearchParams(raw).get('password');
  if (!password || password.length > 512) return failure('invalid');
  try {
    const response = await analyticsApi('login', {
      method: 'POST',
      body: JSON.stringify({ password, client: analyticsClientKey(request) }),
    });
    if (!response.ok) {
      return failure(response.status === 429 ? 'limited' : response.status === 401 ? 'invalid' : 'unavailable');
    }
    const session = await getAnalyticsSession();
    if (!session) return failure('unavailable');
    session.authenticatedUntil = Date.now() + ADMIN_SESSION_SECONDS * 1000;
    await session.save();
    return NextResponse.redirect(destination, 303);
  } catch {
    return failure('unavailable');
  }
}
