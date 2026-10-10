'use client';

import Script from 'next/script';
import { useEffect, useId, useRef, useState } from 'react';
import TwitchPlayerFrame, { formatTwitchTime } from './TwitchPlayerFrame';

type Player = {
  seek: (seconds: number) => void;
  play: () => void;
  addEventListener: (event: string, callback: () => void) => void;
  removeEventListener: (event: string, callback: () => void) => void;
};

type TwitchSDK = {
  Player: {
    new (id: string, options: Record<string, unknown>): Player;
    READY: string;
  };
};

export default function TwitchVodPlayer({
  id,
  parentHost,
  startSeconds,
  playbackRequestId,
}: {
  id: string;
  parentHost: string;
  startSeconds: number;
  playbackRequestId: number;
}) {
  const elementId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef({ startSeconds, playbackRequestId });
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);

  // Keep the latest request even if the user clicks before Twitch is ready.
  useEffect(() => {
    pendingRef.current = { startSeconds, playbackRequestId };
    if (readyRef.current && playerRef.current) {
      playerRef.current.seek(startSeconds);
      if (playbackRequestId > 0) playerRef.current.play();
    }
  }, [startSeconds, playbackRequestId]);

  useEffect(() => {
    if (!sdkReady) return;
    const twitch = (window as Window & { Twitch?: TwitchSDK }).Twitch;
    const container = containerRef.current;
    if (!twitch || !container) return;

    const player = new twitch.Player(elementId, {
      video: `v${id}`,
      parent: [parentHost],
      width: '100%',
      height: '100%',
      autoplay: false,
      time: formatTwitchTime(pendingRef.current.startSeconds),
    });
    playerRef.current = player;
    const iframe = container.querySelector('iframe');
    if (iframe) iframe.title = 'Twitchアーカイブプレイヤー';

    function onReady() {
      readyRef.current = true;
      player.seek(pendingRef.current.startSeconds);
      if (pendingRef.current.playbackRequestId > 0) player.play();
    }
    player.addEventListener(twitch.Player.READY, onReady);
    return () => {
      player.removeEventListener(twitch.Player.READY, onReady);
      readyRef.current = false;
      playerRef.current = null;
      container.replaceChildren();
    };
  }, [sdkReady, elementId, id, parentHost]);

  return (
    <>
      <Script
        src="https://player.twitch.tv/js/embed/v1.js"
        onReady={() => setSdkReady(true)}
        onError={() => setSdkFailed(true)}
      />
      {sdkFailed ? (
        <TwitchPlayerFrame
          key={playbackRequestId}
          type="vod"
          id={id}
          parentHost={parentHost}
          startSeconds={startSeconds}
          autoplay={playbackRequestId > 0}
          title="Twitchアーカイブプレイヤー"
        />
      ) : (
        <div id={elementId} ref={containerRef} className="twitchVodPlayer" />
      )}
    </>
  );
}
