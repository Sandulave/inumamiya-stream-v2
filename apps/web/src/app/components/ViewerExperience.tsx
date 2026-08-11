"use client";

import React, { useCallback, useMemo, useRef, useState } from 'react';
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

type Props = {
  channel: string;
  parentHost: string;
  isLive: boolean;
  userLogin: string;
  streamInfo: React.ReactNode;
  clips: TwitchClip[] | null;
  videos: TwitchVideo[] | null;
};

export default function ViewerExperience({
  channel,
  parentHost,
  isLive,
  userLogin,
  streamInfo,
  clips,
  videos,
}: Props) {
  const latestVideoId = useMemo(() => {
    if (!videos || videos.length === 0) return null;
    return videos[0].id;
  }, [videos]);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const activeVideoId = isLive ? null : selectedVideoId ?? latestVideoId;

  const effectiveParentHost = useMemo(() => {
    if (typeof window !== 'undefined' && parentHost === 'localhost') {
      return window.location.hostname;
    }
    return parentHost;
  }, [parentHost]);

  const iframeSrc = useMemo(() => {
    const parentParam = `parent=${encodeURIComponent(effectiveParentHost)}`;
    if (isLive) {
      return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parentParam}&autoplay=false`;
    }

    if (activeVideoId) {
      return `https://player.twitch.tv/?video=v${encodeURIComponent(activeVideoId)}&${parentParam}&autoplay=false`;
    }

    return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parentParam}&autoplay=false`;
  }, [channel, effectiveParentHost, isLive, activeVideoId]);

  const handleSelectArchive = useCallback(
    (videoId: string) => {
      setSelectedVideoId(videoId);
      playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [],
  );

  return (
    <>
      <div className="playerWrapper" ref={playerRef}>
        <iframe
          src={iframeSrc}
          title="Twitch Player"
          allowFullScreen
          frameBorder="0"
          scrolling="no"
        />
      </div>
      <div className="playerActions">
        <a
          href={`https://subs.twitch.tv/${userLogin}`}
          target="_blank"
          rel="noreferrer noopener"
          className="subscribeButton"
        >
          サブスクする
        </a>
      </div>

      <section className="streamInfoSection">
        <h2>配信状況</h2>
        {streamInfo}
      </section>

      <TabPanel
        clips={clips}
        videos={videos}
        isLive={isLive}
        selectedVideoId={activeVideoId ?? undefined}
        onSelectArchive={handleSelectArchive}
      />
    </>
  );
}
