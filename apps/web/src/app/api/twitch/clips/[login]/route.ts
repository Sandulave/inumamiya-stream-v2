const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function GET(
  request: Request,
  context: { params: Promise<{ login: string }> },
) {
  const { login } = await context.params;
  const requestUrl = new URL(request.url);
  const params = new URLSearchParams();

  params.set('first', requestUrl.searchParams.get('first') ?? '6');
  params.set('sort', requestUrl.searchParams.get('sort') ?? 'latest');

  const after = requestUrl.searchParams.get('after');
  if (after) {
    params.set('after', after);
  }

  const response = await fetch(
    `${API_BASE_URL}/twitch/clips/${encodeURIComponent(login)}?${params.toString()}`,
    { cache: 'no-store' },
  );

  return Response.json(await response.json(), { status: response.status });
}
