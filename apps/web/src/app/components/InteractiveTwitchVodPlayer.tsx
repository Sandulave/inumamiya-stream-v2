"use client";

import { useEffect, useRef } from 'react';
import { formatTwitchTime } from './TwitchPlayerFrame';

type TwitchPlayer = {
  destroy: () => void;
  play: () => void;
  seek: (timestamp: number) => void;
  addEventListener: (event: string, callback: () => void) => void;
};

type TwitchPlayerConstructor = new (
  target: HTMLElement,
  options: {
    width: string;
    height: string;
    video: string;
    parent: string[];
    autoplay: boolean;
    muted: boolean;
    time: string;
  },
) => TwitchPlayer;

type TwitchSdk = {
  Player: TwitchPlayerConstructor & { READY: string };
};

declare global {
  interface Window {
    Twitch?: TwitchSdk;
  }
}

let twitchSdkPromise: Promise<TwitchSdk> | null = null;

function loadTwitchSdk() {
  if (window.Twitch) return Promise.resolve(window.Twitch);
  if (twitchSdkPromise) return twitchSdkPromise;

  twitchSdkPromise = new Promise((resolve, reject) => {
    const scriptId = 'twitch-embed-sdk';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');
    const handleLoad = () => {
      if (window.Twitch) resolve(window.Twitch);
      else reject(new Error('Twitch player SDK did not initialize.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load Twitch player SDK.')), {
      once: true,
    });

    if (!existingScript) {
      script.id = scriptId;
      script.src = 'https://player.twitch.tv/js/embed/v1.js';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return twitchSdkPromise;
}

type Props = {
  vodId: string;
  parentHost: string;
  startSeconds: number;
  onReady: (playAt: (timestampSeconds: number) => void) => void;
  title: string;
  className?: string;
};

export default function InteractiveTwitchVodPlayer({
  vodId,
  parentHost,
  startSeconds,
  onReady,
  title,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  const latestStartSecondsRef = useRef(startSeconds);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    latestStartSecondsRef.current = startSeconds;
  }, [startSeconds]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    let disposed = false;
    let player: TwitchPlayer | null = null;

    void loadTwitchSdk()
      .then((twitch) => {
        if (disposed || !host) return;

        player = new twitch.Player(host, {
          width: '100%',
          height: '100%',
          video: `v${vodId}`,
          parent: [parentHost],
          autoplay: false,
          muted: false,
          time: formatTwitchTime(latestStartSecondsRef.current),
        });
        playerRef.current = player;
        player.addEventListener(twitch.Player.READY, () => {
          if (disposed || !player) return;
          onReadyRef.current((timestampSeconds) => {
            if (!disposed && player) {
              player.seek(timestampSeconds);
              player.play();
            }
          });
        });
      })
      .catch(() => {
        // Twitch shows any embed loading error in the player area.
      });

    return () => {
      disposed = true;
      playerRef.current = null;
      player?.destroy();
    };
  }, [parentHost, vodId]);

  return <div ref={hostRef} className={className} aria-label={title} />;
}
