import {
  analyticsApi, analyticsClientKey, analyticsConfigured, isAnalyticsAdmin, isSameOrigin,
} from '@/lib/analytics-server';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  if (!analyticsConfigured()) return new Response(null, { status: 204 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response(null, { status: 415 });
  }
  const userAgent = request.headers.get('user-agent') ?? '';
  if (/bot|spider|crawler|preview/i.test(userAgent) || await isAnalyticsAdmin()) {
    return new Response(null, { status: 204 });
  }
  const raw = await request.text();
  if (raw.length > 4096) return new Response(null, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const device = /ipad|tablet/i.test(userAgent) ? 'tablet' : /mobile|iphone|android/i.test(userAgent) ? 'mobile' : 'desktop';
  let referrer = '';
  try {
    if (typeof body.referrer === 'string' && body.referrer) {
      const url = new URL(body.referrer);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname !== new URL(request.url).hostname) {
        referrer = url.origin;
      }
    }
  } catch { /* Invalid referrers are treated as direct visits. */ }
  try {
    const response = await analyticsApi('pageview', {
      method: 'POST',
      body: JSON.stringify({
        id: body.id, path: body.path, title: body.title, sessionId: body.sessionId,
        referrer, device, client: analyticsClientKey(request),
      }),
    });
    return new Response(null, { status: response.ok ? 204 : response.status >= 500 ? 503 : response.status });
  } catch {
    return new Response(null, { status: 503 });
  }
}
