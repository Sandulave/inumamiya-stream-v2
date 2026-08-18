const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function GET() {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    cache: 'no-store',
  });

  return Response.json(await response.json(), { status: response.status });
}

export async function POST(request: Request) {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(await request.json()),
  });

  return Response.json(await response.json(), { status: response.status });
}
