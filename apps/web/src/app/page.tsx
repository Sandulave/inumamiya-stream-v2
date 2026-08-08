type HealthResponse = {
  status: string;
};

async function getHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch("http://localhost:3001/health", {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <main>
      <h1>配信者専用視聴ページ</h1>
      <p>API状態: {health?.status ?? "接続できません"}</p>
    </main>
  );
}