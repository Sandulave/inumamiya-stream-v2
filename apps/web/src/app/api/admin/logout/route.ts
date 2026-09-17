import { NextResponse } from 'next/server';
import { getAnalyticsSession, isSameOrigin } from '@/lib/analytics-server';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  (await getAnalyticsSession())?.destroy();
  return NextResponse.redirect(new URL('/admin/analytics', request.url), 303);
}
