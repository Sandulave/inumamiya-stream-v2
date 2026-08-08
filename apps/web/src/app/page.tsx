type HealthResponse = {
  status: string;
};

export default async function Home() {
  const response = await fetch("http://localhost:3001/health", {
    cache: "no-store",
  });

  const health: HealthResponse = await response.json();

  return (
    <main>
      <h1>配信者専用視聴ページ</h1>
      <p>API状態: {health.status}</p>
    </main>
  );
}