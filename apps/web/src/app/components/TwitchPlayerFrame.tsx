type PlayerType = 'vod' | 'clip';

type Props = {
  type: PlayerType;
  id: string;
  parentHost: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  startSeconds?: number;
  className?: string;
};

function formatTwitchTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${hours}h${minutes}m${remainingSeconds}s`;
}

export function buildTwitchPlayerSrc({
  type,
  id,
  parentHost,
  autoplay = true,
  muted = false,
  startSeconds,
}: Omit<Props, 'title' | 'className'>) {
  const params = new URLSearchParams({
    parent: parentHost,
    autoplay: String(autoplay),
    muted: String(muted),
  });

  if (type === 'vod') {
    params.set('video', `v${id}`);

    if (typeof startSeconds === 'number' && Number.isFinite(startSeconds)) {
      params.set('time', formatTwitchTime(startSeconds));
    }

    return `https://player.twitch.tv/?${params.toString()}`;
  }

  params.set('clip', id);

  return `https://clips.twitch.tv/embed?${params.toString()}`;
}

export default function TwitchPlayerFrame({
  type,
  id,
  parentHost,
  title = 'Twitch Player',
  autoplay = true,
  muted = false,
  startSeconds,
  className,
}: Props) {
  const src = buildTwitchPlayerSrc({
    type,
    id,
    parentHost,
    autoplay,
    muted,
    startSeconds,
  });

  return (
    <iframe
      className={className}
      src={src}
      title={title}
      allow="autoplay; fullscreen"
      allowFullScreen
      frameBorder="0"
      scrolling="no"
    />
  );
}
