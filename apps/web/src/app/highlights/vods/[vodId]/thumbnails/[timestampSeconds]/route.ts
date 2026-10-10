const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function errorResponse(status: number) {
  return Response.json(
    { message: 'Thumbnail could not be loaded' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ vodId: string; timestampSeconds: string }> },
) {
  const { vodId, timestampSeconds } = await context.params;

  if (
    !/^\d+$/.test(vodId) ||
    !/^\d+$/.test(timestampSeconds) ||
    !Number.isSafeInteger(Number(timestampSeconds))
  ) {
    return errorResponse(400);
  }

  try {
    const response = await fetch(
      `${API_BASE_URL.replace(/\/$/, '')}/highlights/vods/${vodId}/thumbnails/${timestampSeconds}`,
      { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    );

    if (!response.ok) {
      return errorResponse(response.status);
    }

    const contentType = response.headers.get('Content-Type');
    if (!contentType?.startsWith('image/')) {
      return errorResponse(502);
    }

    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': response.headers.get('Cache-Control') ?? 'public, max-age=86400',
    });
    for (const name of ['ETag', 'Last-Modified']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(response.body, { status: response.status, headers });
  } catch {
    return errorResponse(502);
  }
}
