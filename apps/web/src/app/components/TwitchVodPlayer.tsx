'use client';

import Script from 'next/script';
import { useEffect, useId, useRef, useState } from 'react';
import TwitchPlayerFrame, { formatTwitchTime } from './TwitchPlayerFrame';

type Player = {
  seek: (seconds: number) => void;
  play: () => void;
  isPaused: () => boolean;
  addEventListener: (event: string, callback: () => void) => void;
  removeEventListener: (event: string, callback: () => void) => void;
};

type TwitchSDK = {
  Player: {
    new (id: string, options: Record<string, unknown>): Player;
    READY: string;
    PLAYING: string;
    PLAYBACK_BLOCKED: string;
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
  const requestPlaybackRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef({ startSeconds, playbackRequestId });
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  // Keep the latest request even if the user clicks before Twitch is ready.
  useEffect(() => {
    pendingRef.current = { startSeconds, playbackRequestId };
    requestPlaybackRef.current?.();
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
    let ready = false;
    let hasStartedPlayback = false;
    let seekOnPlayback: number | null = null;

    function requestPlayback() {
      if (!ready) return;
      const request = pendingRef.current;
      if (!hasStartedPlayback || seekOnPlayback !== null || player.isPaused()) {
        // READY only means commands are accepted. A paused mobile player may
        // update its displayed time while loading/resuming the previous video.
        // Wait for real playback before applying the most recent target.
        seekOnPlayback = request.startSeconds;
        if (request.playbackRequestId > 0) player.play();
      } else {
        seekOnPlayback = null;
        player.seek(request.startSeconds);
      }
    }
    requestPlaybackRef.current = requestPlayback;
    const iframe = container.querySelector('iframe');
    if (iframe) iframe.title = 'Twitchアーカイブプレイヤー';

    function onReady() {
      ready = true;
      requestPlayback();
    }
    function onPlaying() {
      hasStartedPlayback = true;
      setPlaybackBlocked(false);
      if (seekOnPlayback !== null) {
        const target = seekOnPlayback;
        // Clear before seeking: seeking may itself emit another PLAYING event.
        seekOnPlayback = null;
        player.seek(target);
      }
    }
    function onPlaybackBlocked() {
      setPlaybackBlocked(true);
    }
    player.addEventListener(twitch.Player.READY, onReady);
    player.addEventListener(twitch.Player.PLAYING, onPlaying);
    player.addEventListener(twitch.Player.PLAYBACK_BLOCKED, onPlaybackBlocked);
    return () => {
      player.removeEventListener(twitch.Player.READY, onReady);
      player.removeEventListener(twitch.Player.PLAYING, onPlaying);
      player.removeEventListener(twitch.Player.PLAYBACK_BLOCKED, onPlaybackBlocked);
      requestPlaybackRef.current = null;
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
      {playbackBlocked ? (
        <p className="twitchPlaybackNotice" role="status">
          動画内の▶を押してください。選んだ時刻から再生します。
        </p>
      ) : null}
    </>
  );
}
