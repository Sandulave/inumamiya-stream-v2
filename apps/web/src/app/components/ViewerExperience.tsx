"use client";

import { useCallback, useMemo, useRef, useState } from 'react';
import TabPanel from './TabPanel';

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
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  view_count: number;
  type: string;
  duration: string;
};

type SelectedContent =
  | { type: 'vod'; id: string }
  | { type: 'clip'; id: string }
  | null;

type Props = {
  channel: string;
  parentHost: string;
  isLive: boolean;
  userLogin: string;
  clips: TwitchClip[] | null;
  videos: TwitchVideo[] | null;
  initialClipCursor?: string;
  initialVideoCursor?: string;
};

function buildPlayerRoute(type: 'vod' | 'clip', id: string) {
  const params = new URLSearchParams({ type, id });

  return `/twitch-player?${params.toString()}`;
}

function buildVodIframeSrc(videoId: string, parentHost: string) {
  const parentParam = `parent=${encodeURIComponent(parentHost)}`;

  return `https://player.twitch.tv/?video=v${encodeURIComponent(videoId)}&${parentParam}&autoplay=true&muted=false`;
}

export default function ViewerExperience({
  channel,
  parentHost,
  isLive,
  userLogin,
  clips,
  videos,
  initialClipCursor,
  initialVideoCursor,
}: Props) {
  const latestVideoId = useMemo(() => {
    if (!videos || videos.length === 0) return null;
    return videos[0].id;
  }, [videos]);

  const [selectedContent, setSelectedContent] = useState<SelectedContent>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const effectiveParentHost = useMemo(() => {
    if (typeof window !== 'undefined' && parentHost === 'localhost') {
      return window.location.hostname;
    }

    return parentHost;
  }, [parentHost]);

  const liveIframeSrc = useMemo(() => {
    const parentParam = `parent=${encodeURIComponent(effectiveParentHost)}`;

    return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parentParam}&autoplay=false`;
  }, [channel, effectiveParentHost]);

  const embeddedContent = useMemo(() => {
    if (isLive) return null;

    if (selectedContent?.type === 'clip') {
      return selectedContent;
    }

    if (selectedContent?.type === 'vod') {
      return selectedContent;
    }

    if (latestVideoId) {
      return { type: 'vod', id: latestVideoId } as const;
    }

    return null;
  }, [isLive, latestVideoId, selectedContent]);

  const embeddedPlayerSrc = useMemo(() => {
    if (!embeddedContent) return null;

    if (embeddedContent.type === 'vod') {
      return buildVodIframeSrc(embeddedContent.id, effectiveParentHost);
    }

    return buildPlayerRoute(embeddedContent.type, embeddedContent.id);
  }, [effectiveParentHost, embeddedContent]);

  const handleSelectArchive = useCallback((videoId: string) => {
    setSelectedContent({ type: 'vod', id: videoId });
    playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSelectClip = useCallback((clipId: string) => {
    setSelectedContent({ type: 'clip', id: clipId });
    playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <div className="playerWrapper" ref={playerRef}>
        {embeddedContent && embeddedPlayerSrc ? (
          <iframe
            key={`${embeddedContent.type}-${embeddedContent.id}`}
            src={embeddedPlayerSrc}
            title="Twitch Player"
            allow="autoplay; fullscreen"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        ) : (
          <iframe
            key={`live-${channel}`}
            src={liveIframeSrc}
            title="Twitch Live Player"
            allow="autoplay; fullscreen"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
          />
        )}
      </div>
      <div className="playerActions">
        <a
          href={`https://subs.twitch.tv/${userLogin}`}
          target="_blank"
          rel="noreferrer noopener"
          className="subscribeButton"
        >
          <span className="subscribeIcon" aria-hidden="true">★</span>
          サブスクする
        </a>
      </div>

      <TabPanel
        clips={clips}
        videos={videos}
        login={userLogin}
        isLive={isLive}
        initialClipCursor={initialClipCursor}
        initialVideoCursor={initialVideoCursor}
        selectedVideoId={
          selectedContent?.type === 'vod'
            ? selectedContent.id
            : selectedContent === null && !isLive
              ? latestVideoId
              : undefined
        }
        selectedClipId={selectedContent?.type === 'clip' ? selectedContent.id : undefined}
        onSelectArchive={handleSelectArchive}
        onSelectClip={handleSelectClip}
      />
    </>
  );
}
