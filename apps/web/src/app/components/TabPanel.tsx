"use client";

import { KeyboardEvent, ReactNode, useRef, useState } from 'react';
import Image from 'next/image';
import { games, pcSpecs, profileLinks, qrLinks } from '../../data/streamerData';

type TwitchClip = {
  id: string;
  url: string;
  embed_url: string;
  creator_name: string;
  title: string;
  thumbnail_url: string;
  view_count: number;
  created_at: string;
};

type TwitchVideo = {
  id: string;
  url: string;
  thumbnail_url: string;
  title: string;
  published_at: string;
  view_count: number;
  duration: string;
};

type Props = {
  clips: TwitchClip[] | null;
  videos: TwitchVideo[] | null;
  login: string;
  isLive: boolean;
  initialClipCursor?: string;
  initialVideoCursor?: string;
  selectedVideoId?: string | null;
  selectedClipId?: string | null;
  onSelectArchive?: (videoId: string) => void;
  onSelectClip?: (clipId: string) => void;
};

type SortMode = 'latest' | 'views';

type TwitchClipListResponse = {
  clips: TwitchClip[];
  pagination?: {
    cursor?: string;
  };
  hasMore?: boolean;
  sort?: SortMode;
};

type TwitchVideoListResponse = {
  videos: TwitchVideo[];
  pagination?: {
    cursor?: string;
  };
  hasMore?: boolean;
  sort?: SortMode;
};

const tabs = [
  { id: 'archive', label: 'アーカイブ' },
  { id: 'clips', label: 'クリップ' },
  { id: 'links', label: 'リンク' },
  { id: 'games', label: 'ゲーム' },
  { id: 'pcspec', label: 'PC SPEC' },
] as const;

type TabId = (typeof tabs)[number]['id'];

type ServiceIconId =
  | 'amazon'
  | 'discord'
  | 'domodomo'
  | 'line'
  | 'twitch'
  | 'uploader'
  | 'x'
  | 'youtube';

const serviceIconIds: Record<string, ServiceIconId> = {
  Twitch: 'twitch',
  X: 'x',
  'Amazon Wish List': 'amazon',
  'アップローダー': 'uploader',
  Discord: 'discord',
  YouTube: 'youtube',
  'どもども動画': 'domodomo',
  'LINE OPENCHAT': 'line',
};

const serviceImageIcons: Partial<
  Record<ServiceIconId, { src: string; alt: string }>
> = {
  discord: {
    src: '/qr/discord-symbol.svg',
    alt: 'Discord',
  },
  line: {
    src: '/qr/line-brand-icon.png',
    alt: 'LINE',
  },
};

function getServiceSlug(name: string) {
  return serviceIconIds[name] ?? 'twitch';
}

function LinkServiceMark({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  const iconId = getServiceSlug(name);
  const imageIcon = serviceImageIcons[iconId];

  if (imageIcon) {
    return (
      <span className={`${className} hasImageIcon`}>
        <Image
          src={imageIcon.src}
          alt=""
          fill
          sizes="48px"
          className="linkCardIconImage"
          unoptimized={imageIcon.src.endsWith('.svg')}
        />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <ServiceIcon name={name} />
    </span>
  );
}

function ServiceIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const iconId = getServiceSlug(name);

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      focusable="false"
    >
      {iconId === 'twitch' ? (
        <path d="M5 3h16v11l-4 4h-4l-3 3H7v-3H3V7l2-4Zm2 2-1 3v8h4v3l3-3h4l2-2V5H7Zm4 4h2v5h-2V9Zm5 0h2v5h-2V9Z" />
      ) : null}
      {iconId === 'x' ? (
        <path d="M4 4h4.2l4.4 5.7L17.6 4H21l-6.8 7.8L21 20h-4.2l-4.8-6.2L6.5 20H3l7.4-8.4L4 4Zm3.1 1.8 10.6 12.4h1.1L8.2 5.8H7.1Z" />
      ) : null}
      {iconId === 'amazon' ? (
        <>
          <path d="M7.2 16.1c2.7 1.8 7.2 1.9 10.1.2.5-.3.9.4.4.8-3.3 2.6-8.3 2.2-11.2.1-.5-.4.1-1.5.7-1.1Z" />
          <path d="M15.9 17.3c.8-.1 2.4-.3 2.8.2.4.5-.5 1.8-.9 2.4-.2.3-.7.2-.6-.2.1-.4.5-1.2.3-1.4-.2-.2-1.1-.1-1.5-.1-.4.1-.5-.8-.1-.9ZM13.2 4.2c2.6 0 4.2 1.3 4.2 3.6V14c0 .5.2.9.6 1.2l-2.3 2c-.6-.5-.9-.8-1.1-1.3-1 .9-1.9 1.4-3.4 1.4-2.1 0-3.7-1.3-3.7-3.9 0-2 1.1-3.4 2.6-4.1 1.3-.6 3.2-.7 4.6-.9v-.5c0-.9-.1-2-1.9-2-1.2 0-2.2.6-2.5 1.7l-2.4-.3c.6-2.2 2.4-3.1 5.3-3.1Zm1.5 6.1c-2.1.1-4.3.4-4.3 2.5 0 1.1.6 1.7 1.5 1.7.7 0 1.5-.4 2-1.1.6-.8.8-1.5.8-2.6v-.5Z" />
        </>
      ) : null}
      {iconId === 'uploader' ? (
        <path d="M12 3 6.8 8.2l1.6 1.6 2.5-2.5V15h2.2V7.3l2.5 2.5 1.6-1.6L12 3ZM5 14h2.2v3.8h9.6V14H19v6H5v-6Z" />
      ) : null}
      {iconId === 'discord' ? (
        <path d="M8.2 5.2c2.5-.8 5-.8 7.6 0l.5.9c2.5.7 3.8 2.2 4.2 4.6.4 2.2-.2 4.5-1.6 6.7-1.7 1.1-3.3 1.5-4.8 1.4l-.7-1.4c.7-.2 1.3-.5 1.9-.8-2.1.7-4.2.7-6.3 0 .6.4 1.2.6 1.9.8l-.7 1.4c-1.5.1-3.1-.3-4.8-1.4-1.4-2.2-2-4.5-1.6-6.7.4-2.4 1.7-3.9 4.2-4.6l.2-.9Zm1 8.7c.8 0 1.4-.7 1.4-1.5s-.6-1.5-1.4-1.5-1.4.7-1.4 1.5.6 1.5 1.4 1.5Zm5.6 0c.8 0 1.4-.7 1.4-1.5s-.6-1.5-1.4-1.5-1.4.7-1.4 1.5.6 1.5 1.4 1.5Z" />
      ) : null}
      {iconId === 'youtube' ? (
        <path d="M21.3 7.6c-.2-.9-.9-1.6-1.8-1.8C17.9 5.4 12 5.4 12 5.4s-5.9 0-7.5.4c-.9.2-1.6.9-1.8 1.8-.4 1.6-.4 4.4-.4 4.4s0 2.8.4 4.4c.2.9.9 1.6 1.8 1.8 1.6.4 7.5.4 7.5.4s5.9 0 7.5-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.4.4-4.4s0-2.8-.4-4.4ZM10 15.1V8.9l5.4 3.1-5.4 3.1Z" />
      ) : null}
      {iconId === 'domodomo' ? (
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v13c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-13Zm2.5.7v11.6h11V6.2h-11Zm3.2 2.3 5.3 3.5-5.3 3.5v-7Z" />
      ) : null}
      {iconId === 'line' ? (
        <path d="M12 4C7.6 4 4 6.9 4 10.5c0 3.2 2.7 5.8 6.3 6.4l.4 2.5c.1.5.7.7 1.1.4l3.3-2.4c3-.9 4.9-3.5 4.9-6.9C20 6.9 16.4 4 12 4Zm-4.2 8.5V8.8h1.1v2.7h1.7v1H7.8Zm3.4 0V8.8h1.1v3.7h-1.1Zm2 0V8.8h1l1.5 2.1V8.8h1v3.7h-1l-1.5-2.1v2.1h-1Zm4.1 0V8.8h2.6v1h-1.5v.4h1.4v.9h-1.4v.4H20v1h-2.7Z" />
      ) : null}
    </svg>
  );
}

function QrCenterVisual({
  visual,
  name,
}: {
  visual: (typeof qrLinks)[number]['centerVisual'];
  name: string;
}) {
  if (visual.kind === 'image') {
    return (
      <span
        className={`qrLogoBadge qrLogoBadgeImage ${visual.service ? `qrLogoBadge-${visual.service}` : ''}`}
        aria-hidden="true"
      >
        <Image
          src={visual.src}
          alt={visual.alt}
          fill
          sizes="44px"
          className="qrCenterImage"
        />
      </span>
    );
  }

  return (
    <span
      className={`qrLogoBadge qrLogoBadge-${visual.service}`}
      aria-label={`${name} ロゴ`}
    >
      <QrBrandMark service={visual.service} />
    </span>
  );
}

function QrBrandMark({
  service,
}: {
  service: 'youtube' | 'domodomo-video';
}) {
  if (service === 'youtube') {
    return (
      <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">
        <rect x="5" y="12" width="38" height="24" rx="7" fill="#ff0033" />
        <path d="M21 18.5 31 24l-10 5.5v-11Z" fill="#fff" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">
      <circle cx="24" cy="24" r="19" fill="#ff8bd2" />
      <rect x="14" y="15" width="20" height="18" rx="5" fill="#fff" />
      <path
        d="M21 19.5 29 24l-8 4.5v-9Z"
        fill="#ff5abf"
      />
    </svg>
  );
}

function VideoThumbnail({
  src,
  alt,
  sizes,
}: {
  src: string;
  alt: string;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`clipThumbnail ${failed ? 'thumbnailFallback' : ''}`}>
      {!failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          style={{ objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="thumbnailPlaceholder">サムネイルを読み込めませんでした</div>
      )}
    </div>
  );
}

function LoadMoreFooter({
  cursor,
  isLoading,
  status,
  onLoadMore,
}: {
  cursor?: string;
  isLoading: boolean;
  status: string | null;
  onLoadMore: () => void;
}) {
  if (!cursor && !status) {
    return null;
  }

  return (
    <div className="loadMoreFooter">
      {cursor ? (
        <button
          type="button"
          className="loadMoreButton"
          onClick={onLoadMore}
          disabled={isLoading}
        >
          もっと見る
        </button>
      ) : null}
      {status ? <p className="loadMoreStatus">{status}</p> : null}
    </div>
  );
}

function SortControl({
  label,
  value,
  onChange,
  isLoading,
}: {
  label: string;
  value: SortMode;
  onChange: (value: SortMode) => void;
  isLoading: boolean;
}) {
  return (
    <div className="sortControl" aria-label={label}>
      <div className="sortControlButtons">
        <button
          type="button"
          className={`sortButton ${value === 'latest' ? 'active' : ''}`}
          aria-pressed={value === 'latest'}
          disabled={isLoading}
          onClick={() => onChange('latest')}
        >
          最新
        </button>
        <button
          type="button"
          className={`sortButton ${value === 'views' ? 'active' : ''}`}
          aria-pressed={value === 'views'}
          disabled={isLoading}
          onClick={() => onChange('views')}
        >
          再生数
        </button>
      </div>
    </div>
  );
}

export default function TabPanel({
  clips,
  videos,
  login,
  isLive,
  initialClipCursor,
  initialVideoCursor,
  selectedVideoId,
  selectedClipId,
  onSelectArchive,
  onSelectClip,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('archive');
  const [visibleClips, setVisibleClips] = useState<TwitchClip[] | null>(clips);
  const [visibleVideos, setVisibleVideos] = useState<TwitchVideo[] | null>(videos);
  const [clipCursor, setClipCursor] = useState(initialClipCursor);
  const [videoCursor, setVideoCursor] = useState(initialVideoCursor);
  const [loadingClips, setLoadingClips] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [clipStatus, setClipStatus] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [clipSortMode, setClipSortMode] = useState<SortMode>('latest');
  const [videoSortMode, setVideoSortMode] = useState<SortMode>('latest');
  const clipRequestGeneration = useRef(0);
  const videoRequestGeneration = useRef(0);

  function formatVideoThumbnail(url: string) {
    return url
      .replace(/%\{width\}/g, '320')
      .replace(/%\{height\}/g, '180');
  }

  function appendUnique<T extends { id: string }>(current: T[], incoming: T[]) {
    const existingIds = new Set(current.map((item) => item.id));
    const uniqueItems = incoming.filter((item) => !existingIds.has(item.id));

    return {
      items: [...current, ...uniqueItems],
      added: uniqueItems.length,
    };
  }

  function sortVideosByMode(items: TwitchVideo[], mode: SortMode) {
    return [...items].sort((a, b) => {
      if (mode === 'views') {
        const viewDifference = b.view_count - a.view_count;

        if (viewDifference !== 0) {
          return viewDifference;
        }
      }

      return (
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );
    });
  }

  async function loadMoreClips() {
    if (!clipCursor || loadingClips) return;

    const requestSort = clipSortMode;
    const requestGeneration = ++clipRequestGeneration.current;
    setLoadingClips(true);
    setClipStatus('読み込み中…');

    try {
      const response = await fetch(
        `/api/twitch/clips/${encodeURIComponent(login)}?first=6&sort=${requestSort}&after=${encodeURIComponent(clipCursor)}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as TwitchClipListResponse;
      if (
        requestGeneration !== clipRequestGeneration.current ||
        data.sort !== requestSort
      ) {
        return;
      }

      setVisibleClips((current) => {
        const base = current ?? [];
        const { items, added } = appendUnique(base, data.clips);
        setClipStatus(added > 0 ? `${added}件追加しました` : '新しいクリップはありません');
        return items;
      });
      setClipCursor(data.pagination?.cursor);
    } catch {
      setClipStatus('クリップを追加取得できませんでした。');
    } finally {
      if (requestGeneration === clipRequestGeneration.current) {
        setLoadingClips(false);
      }
    }
  }

  async function loadClipsForSort(mode: SortMode) {
    if ((mode === clipSortMode && visibleClips !== null) || loadingClips) return;

    const requestGeneration = ++clipRequestGeneration.current;
    setLoadingClips(true);
    setClipStatus(null);
    setClipSortMode(mode);
    setClipCursor(undefined);
    setVisibleClips([]);

    try {
      const response = await fetch(
        `/api/twitch/clips/${encodeURIComponent(login)}?first=6&sort=${mode}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as TwitchClipListResponse;
      if (
        requestGeneration !== clipRequestGeneration.current ||
        data.sort !== mode
      ) {
        return;
      }

      setVisibleClips(data.clips);
      setClipCursor(data.pagination?.cursor);
      setClipStatus(null);
    } catch {
      setClipStatus('クリップを取得できませんでした。');
    } finally {
      if (requestGeneration === clipRequestGeneration.current) {
        setLoadingClips(false);
      }
    }
  }

  async function loadMoreVideos() {
    if (!videoCursor || loadingVideos) return;

    const requestSort = videoSortMode;
    const requestGeneration = ++videoRequestGeneration.current;
    setLoadingVideos(true);
    setVideoStatus('読み込み中…');

    try {
      const response = await fetch(
        `/api/twitch/videos/${encodeURIComponent(login)}?first=6&sort=${requestSort}&after=${encodeURIComponent(videoCursor)}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as TwitchVideoListResponse;
      if (
        requestGeneration !== videoRequestGeneration.current ||
        data.sort !== requestSort
      ) {
        return;
      }

      setVisibleVideos((current) => {
        const base = current ?? [];
        const { items, added } = appendUnique(base, data.videos);
        setVideoStatus(added > 0 ? `${added}件追加しました` : '新しいアーカイブはありません');
        return sortVideosByMode(items, requestSort);
      });
      setVideoCursor(data.pagination?.cursor);
    } catch {
      setVideoStatus('アーカイブを追加取得できませんでした。');
    } finally {
      if (requestGeneration === videoRequestGeneration.current) {
        setLoadingVideos(false);
      }
    }
  }

  async function loadVideosForSort(mode: SortMode) {
    if ((mode === videoSortMode && visibleVideos !== null) || loadingVideos) return;

    const requestGeneration = ++videoRequestGeneration.current;
    setLoadingVideos(true);
    setVideoStatus(null);
    setVideoSortMode(mode);
    setVideoCursor(undefined);
    setVisibleVideos([]);

    try {
      const response = await fetch(
        `/api/twitch/videos/${encodeURIComponent(login)}?first=6&sort=${mode}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as TwitchVideoListResponse;
      if (
        requestGeneration !== videoRequestGeneration.current ||
        data.sort !== mode
      ) {
        return;
      }

      setVisibleVideos(sortVideosByMode(data.videos, mode));
      setVideoCursor(data.pagination?.cursor);
      setVideoStatus(null);
    } catch {
      setVideoStatus('アーカイブを取得できませんでした。');
    } finally {
      if (requestGeneration === videoRequestGeneration.current) {
        setLoadingVideos(false);
      }
    }
  }

  function onPlayableCardKeyDown(
    event: KeyboardEvent<HTMLElement>,
    action: () => void,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }

  function formatVideoDate(isoString: string) {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(date);
  }

  function formatDuration(duration: string) {
    const hoursMatch = duration.match(/(\d+)h/);
    const minutesMatch = duration.match(/(\d+)m/);
    const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }

    return `${minutes}分`;
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveTab(tabs[index].id);
    }
  }

  function renderArchivePanel() {
    if (visibleVideos === null) {
      return <p>アーカイブを取得できませんでした。</p>;
    }

    if (visibleVideos.length === 0 && !loadingVideos) {
      return <p>現在表示できるアーカイブはありません。</p>;
    }

    const displayedVideos = sortVideosByMode(visibleVideos, videoSortMode);

    return (
      <section className="archiveSection">
        <div className="panelTopBar">
          <div>
            <h2 className="panelTitle">アーカイブ</h2>
          </div>
          <SortControl
            label="アーカイブの並び順"
            value={videoSortMode}
            onChange={loadVideosForSort}
            isLoading={loadingVideos}
          />
        </div>
        <div className="archiveGrid">
          {displayedVideos.map((video) => {
            const isPlaying = selectedVideoId === video.id;
            const canPlay = !isLive && Boolean(onSelectArchive);

            return (
              <article
                key={video.id}
                className={`archiveCardWrapper playableCard ${canPlay ? 'canPlay' : 'isDisabled'} ${isPlaying ? 'isPlaying' : ''}`}
                role={canPlay ? 'button' : undefined}
                tabIndex={canPlay ? 0 : undefined}
                aria-disabled={canPlay ? undefined : true}
                onClick={canPlay ? () => onSelectArchive?.(video.id) : undefined}
                onKeyDown={
                  canPlay
                    ? (event) => onPlayableCardKeyDown(event, () => onSelectArchive?.(video.id))
                    : undefined
                }
              >
                <div className="archiveCard">
                  <VideoThumbnail
                    src={formatVideoThumbnail(video.thumbnail_url)}
                    alt={video.title}
                    sizes="(max-width: 768px) 100vw, 320px"
                  />
                  <div className="clipInfo">
                    <p className="clipTitle">{video.title}</p>
                    <p className="clipMeta">公開: {formatVideoDate(video.published_at)}</p>
                    <p className="clipMeta">長さ: {formatDuration(video.duration)}</p>
                    <p className="clipMeta">再生数: {video.view_count} 回</p>
                  </div>
                </div>
                {isPlaying ? (
                  <div className="archiveActions">
                    <span className="playingBadge">再生中</span>
                  </div>
                ) : null}
              </article>
            );
          })}
          <LoadMoreFooter
            cursor={videoCursor}
            isLoading={loadingVideos}
            status={videoStatus}
            onLoadMore={loadMoreVideos}
          />
        </div>
      </section>
    );
  }

  function renderClipsPanel() {
    if (visibleClips === null) {
      return <p>クリップの取得に失敗しました。</p>;
    }

    return (
      <section className="clipSection">
        <div className="panelTopBar">
          <div>
            <h2 className="panelTitle">クリップ</h2>
          </div>
          <SortControl
            label="クリップの並び順"
            value={clipSortMode}
            onChange={loadClipsForSort}
            isLoading={loadingClips}
          />
        </div>
        <div className="clipGrid">
          {visibleClips.map((clip) => {
            const isPlaying = selectedClipId === clip.id;
            const canPlay = !isLive && Boolean(onSelectClip);

            return (
              <article
                key={clip.id}
                className={`clipCardWrapper playableCard ${canPlay ? 'canPlay' : 'isDisabled'} ${isPlaying ? 'isPlaying' : ''}`}
                role={canPlay ? 'button' : undefined}
                tabIndex={canPlay ? 0 : undefined}
                aria-disabled={canPlay ? undefined : true}
                onClick={canPlay ? () => onSelectClip?.(clip.id) : undefined}
                onKeyDown={
                  canPlay
                    ? (event) => onPlayableCardKeyDown(event, () => onSelectClip?.(clip.id))
                    : undefined
                }
              >
                <div className="clipCard">
                  <div className="clipThumbnail">
                    <Image
                      src={clip.thumbnail_url}
                      alt={clip.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 240px"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                  <div className="clipInfo">
                    <p className="clipTitle">{clip.title}</p>
                    <p className="clipMeta">
                      {clip.creator_name} ・ {clip.view_count} 視聴
                    </p>
                  </div>
                </div>
                {isPlaying ? (
                  <div className="archiveActions">
                    <span className="playingBadge">再生中</span>
                  </div>
                ) : null}
              </article>
            );
          })}
          <LoadMoreFooter
            cursor={clipCursor}
            isLoading={loadingClips}
            status={clipStatus}
            onLoadMore={loadMoreClips}
          />
        </div>
      </section>
    );
  }

  const tabPanels = {
    archive: renderArchivePanel(),
    clips: renderClipsPanel(),
    links: (
      <section className="linkTabSection">
        <div className="panelTopBar">
          <div>
            <h2 className="panelTitle">リンク</h2>
          </div>
        </div>
          <div className="linkGrid">
          {profileLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className={`linkCard service-${getServiceSlug(link.name)}`}
            >
              <LinkServiceMark name={link.name} className="linkCardIcon" />
              <div className="linkCardBody">
                <p className="linkCardTitle">{link.name}</p>
                <p className="linkCardDescription">{link.description}</p>
              </div>
              <span className="linkCardGhost" aria-hidden="true">
                <ServiceIcon name={link.name} />
              </span>
              <span className="linkExternal">↗</span>
            </a>
          ))}
        </div>
        <div className="sectionHeader">
          <h2>QR LINKS</h2>
          <p>スマホで読み取りやすいQRカードです。</p>
        </div>
        <div className="qrGrid">
          {qrLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className={`qrCard service-${getServiceSlug(link.name)}`}
            >
              <p className="qrCardTitle">{link.name}</p>
              <div className="qrImageWrapper">
                <div className="qrImageInner">
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=16&data=${encodeURIComponent(
                      link.url,
                    )}`}
                    alt={`${link.name} QRコード`}
                    fill
                    sizes="224px"
                    className="qrCodeImage"
                  />
                  <QrCenterVisual visual={link.centerVisual} name={link.name} />
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>
    ),
    games: (
      <section className="gameSection">
        <div className="panelTopBar">
          <div>
            <h2 className="panelTitle">INUMAMIYA GAMES</h2>
          </div>
        </div>
        <div className="gameGrid">
          {games.map((game) => (
            <article key={game.name} className="gameCard">
              <div>
                <p className="gameCardLabel">GAME</p>
                <h3 className="gameCardTitle">{game.name}</h3>
                <p className="gameCardDescription">{game.description}</p>
              </div>
              <a
                href={game.url}
                target="_blank"
                rel="noreferrer noopener"
                className="gamePlayButton"
              >
                プレイする
              </a>
            </article>
          ))}
        </div>
      </section>
    ),
    pcspec: (
      <section className="pcSpecSection">
        <div className="panelTopBar">
          <div>
            <h2 className="panelTitle">PC SPEC</h2>
          </div>
        </div>
        <div className="pcSpecGrid">
          {pcSpecs.map((section) => (
            <div key={section.title} className="pcSpecCard">
              <p className="pcSpecCardTitle">{section.title}</p>
              <ul className="pcSpecList">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    ),
  } satisfies Record<TabId, ReactNode>;

  return (
    <div className="tabContainer">
      <div className="tabList" role="tablist" aria-label="コンテンツタブ">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`tabButton ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="tabPanel"
        >
          {activeTab === tab.id ? tabPanels[tab.id] : null}
        </div>
      ))}
    </div>
  );
}
