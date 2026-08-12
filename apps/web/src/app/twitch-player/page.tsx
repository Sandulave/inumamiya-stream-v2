import { headers } from 'next/headers';

type PlayerType = 'vod' | 'clip';

type Props = {
  searchParams: Promise<{
    id?: string;
    type?: string;
  }>;
};

function isPlayerType(value: string | undefined): value is PlayerType {
  return value === 'vod' || value === 'clip';
}

function isValidPlayerId(type: PlayerType, id: string | undefined) {
  if (!id) return false;

  if (type === 'vod') {
    return /^\d+$/.test(id);
  }

  return /^[A-Za-z0-9_-]+$/.test(id);
}

function buildTwitchSrc(type: PlayerType, id: string, hostname: string) {
  const parentParam = `parent=${encodeURIComponent(hostname)}`;

  // Twitch/browser autoplay is best-effort; the embedded player may still require user interaction.
  if (type === 'vod') {
    return `https://player.twitch.tv/?video=v${encodeURIComponent(id)}&${parentParam}&autoplay=true&muted=false`;
  }

  return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(id)}&${parentParam}&autoplay=true&muted=false`;
}

export default async function TwitchPlayerPage({ searchParams }: Props) {
  const [{ type, id }, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  if (!isPlayerType(type) || !id || !isValidPlayerId(type, id)) {
    return (
      <main style={{ margin: 0, padding: 16 }}>
        <p>Invalid Twitch player parameters.</p>
      </main>
    );
  }

  const host = requestHeaders.get('host') ?? 'localhost';
  const hostname = host.split(':')[0];
  const iframeSrc = buildTwitchSrc(type, id, hostname);

  return (
    <main
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        minWidth: 400,
        minHeight: 300,
        background: '#000',
      }}
    >
      <iframe
        src={iframeSrc}
        title="Twitch Player"
        allow="autoplay; fullscreen"
        allowFullScreen
        style={{
          border: 0,
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </main>
  );
}
