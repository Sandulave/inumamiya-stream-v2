import { NextResponse } from 'next/server';
import { analyticsOrigin, getAnalyticsSession, isSameOrigin } from '@/lib/analytics-server';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  (await getAnalyticsSession())?.destroy();
  return NextResponse.redirect(new URL('/admin/analytics', analyticsOrigin(request)), 303);
}
