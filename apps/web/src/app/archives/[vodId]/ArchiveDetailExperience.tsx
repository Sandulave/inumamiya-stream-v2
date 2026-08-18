"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import TwitchPlayerFrame from '../../components/TwitchPlayerFrame';
import {
  HighlightChaptersResponse,
  HighlightFilters,
  HighlightMoment,
  HighlightMomentsResponse,
  HighlightTimelineResponse,
} from '../../highlights/types';
import HighlightsExplorer from './highlights/HighlightsExplorer';

export type ArchiveViewMode = 'archive' | 'highlights';

export type TwitchVideoMetadata = {
  id: string;
  title: string;
  published_at: string;
  duration: string;
  game_name?: string;
};

type Props = {
  vodId: string;
  parentHost: string;
  initialView: ArchiveViewMode;
  initialMomentSeconds?: number;
  filters: HighlightFilters;
  resultStatus: 'ok' | 'not-found' | 'error';
  momentsResponse: HighlightMomentsResponse | null;
  timelineResponse: HighlightTimelineResponse | null;
  chaptersResponse: HighlightChaptersResponse | null;
  vodMetadata: TwitchVideoMetadata | null;
};

const PLAYBACK_LEAD_SECONDS = 5;

function getPlaybackStart(timestampSeconds: number) {
  return Math.max(0, Math.floor(timestampSeconds - PLAYBACK_LEAD_SECONDS));
}

function formatPublishedDate(value?: string) {
  if (!value) {
    return '不明';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
}

function parseMomentParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

function buildHighlightsPath(vodId: string, momentSeconds?: number) {
  const params = new URLSearchParams({ view: 'highlights' });

  if (momentSeconds !== undefined) {
    params.set('moment', String(Math.floor(momentSeconds)));
  }

  return `/archives/${encodeURIComponent(vodId)}?${params.toString()}`;
}

function buildArchivePath(vodId: string) {
  return `/archives/${encodeURIComponent(vodId)}`;
}

function getPrimaryCategory(
  vodMetadata: TwitchVideoMetadata | null,
  chaptersResponse: HighlightChaptersResponse | null,
) {
  return (
    vodMetadata?.game_name ??
    chaptersResponse?.chapters.find((chapter) => chapter.categoryName)?.categoryName ??
    null
  );
}

export default function ArchiveDetailExperience({
  vodId,
  parentHost,
  initialView,
  initialMomentSeconds,
  filters,
  resultStatus,
  momentsResponse,
  timelineResponse,
  chaptersResponse,
  vodMetadata,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: ArchiveViewMode =
    searchParams.get('view') === 'highlights' ? 'highlights' : initialView;
  const selectedMomentSeconds =
    view === 'highlights'
      ? parseMomentParam(searchParams.get('moment'))
      : undefined;
  const [playerStartSeconds, setPlayerStartSeconds] = useState(
    initialMomentSeconds !== undefined ? getPlaybackStart(initialMomentSeconds) : 0,
  );
  const [playbackRequestId, setPlaybackRequestId] = useState(0);
  const [shareFeedbackMomentSeconds, setShareFeedbackMomentSeconds] = useState<
    number | null
  >(null);
  const primaryCategory = useMemo(
    () => getPrimaryCategory(vodMetadata, chaptersResponse),
    [vodMetadata, chaptersResponse],
  );
  const activePlayerStartSeconds =
    selectedMomentSeconds !== undefined
      ? getPlaybackStart(selectedMomentSeconds)
      : playerStartSeconds;

  function showArchive() {
    router.push(buildArchivePath(vodId));
  }

  function showHighlights() {
    router.push(buildHighlightsPath(vodId, selectedMomentSeconds));
  }

  function selectMoment(moment: HighlightMoment) {
    setPlayerStartSeconds(getPlaybackStart(moment.timestampSeconds));
    setPlaybackRequestId((current) => current + 1);
    router.push(buildHighlightsPath(vodId, moment.timestampSeconds));
  }

  function seekTimestamp(timestampSeconds: number) {
    setPlayerStartSeconds(Math.max(0, Math.floor(timestampSeconds)));
    setPlaybackRequestId((current) => current + 1);
    router.replace(buildHighlightsPath(vodId));
  }

  async function shareMoment(moment: HighlightMoment) {
    const url = `${window.location.origin}${buildHighlightsPath(
      vodId,
      moment.timestampSeconds,
    )}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch {
      // The share URL is still represented by the button action even if copy is blocked.
    } finally {
      setShareFeedbackMomentSeconds(moment.timestampSeconds);
      window.setTimeout(() => setShareFeedbackMomentSeconds(null), 1800);
    }
  }

  return (
    <section className="archiveDetailShell">
      <div className="archiveModeSwitch" role="tablist" aria-label="アーカイブ表示">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archive'}
          className={`archiveModeButton ${view === 'archive' ? 'active' : ''}`}
          onClick={showArchive}
        >
          ▶ アーカイブ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'highlights'}
          className={`archiveModeButton ${view === 'highlights' ? 'active' : ''}`}
          onClick={showHighlights}
        >
          ☆ 見どころ探索
        </button>
      </div>

      <section
        className={`archiveDetailContent ${
          view === 'highlights' ? 'isHighlights' : 'isArchive'
        }`}
      >
        <div className="archiveDetailPlayerColumn">
          <div className="highlightPlayerShell archiveDetailPlayer">
            <TwitchPlayerFrame
              key={`${vodId}-${activePlayerStartSeconds}-${playbackRequestId}`}
              type="vod"
              id={vodId}
              parentHost={parentHost}
              startSeconds={activePlayerStartSeconds}
              title="Twitchアーカイブプレイヤー"
            />
          </div>
        </div>

        {view === 'archive' ? (
          <section className="archiveOverviewPanel">
            <div>
              <p className="pageLabel">Archive</p>
              <h2>{vodMetadata?.title ?? `アーカイブ ${vodId}`}</h2>
            </div>
            <dl className="archiveOverviewMeta">
              <div>
                <dt>公開日時</dt>
                <dd>{formatPublishedDate(vodMetadata?.published_at)}</dd>
              </div>
              <div>
                <dt>長さ</dt>
                <dd>{vodMetadata?.duration ?? '不明'}</dd>
              </div>
              <div>
                <dt>ゲーム / カテゴリ</dt>
                <dd>{primaryCategory ?? '不明'}</dd>
              </div>
            </dl>
            <Link className="highlightExploreLink" href={buildHighlightsPath(vodId)}>
              ☆ 見どころ探索を開く
            </Link>
          </section>
        ) : (
          <HighlightsExplorer
            vodId={vodId}
            filters={filters}
            resultStatus={resultStatus}
            momentsResponse={momentsResponse}
            timelineResponse={timelineResponse}
            chaptersResponse={chaptersResponse}
            selectedMomentSeconds={selectedMomentSeconds}
            shareFeedbackMomentSeconds={shareFeedbackMomentSeconds}
            onSelectMoment={selectMoment}
            onSeek={seekTimestamp}
            onShareMoment={shareMoment}
          />
        )}
      </section>
    </section>
  );
}
