import { headers } from 'next/headers';
import { buildTwitchPlayerSrc } from '../components/TwitchPlayerFrame';

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

function normalizeHostname(host: string | null) {
  const firstHost = (host ?? 'localhost').split(',')[0].trim();

  if (firstHost.startsWith('[')) {
    const closingBracketIndex = firstHost.indexOf(']');
    return closingBracketIndex > 0
      ? firstHost.slice(1, closingBracketIndex)
      : 'localhost';
  }

  return firstHost.split(':')[0] || 'localhost';
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

  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    'localhost';
  const hostname = normalizeHostname(host);
  const iframeSrc = buildTwitchPlayerSrc({
    type,
    id,
    parentHost: hostname,
  });

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
