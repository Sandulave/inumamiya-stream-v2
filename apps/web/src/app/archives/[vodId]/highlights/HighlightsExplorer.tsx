"use client";

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import TwitchPlayerFrame from '../../../components/TwitchPlayerFrame';
import {
  HighlightFilters,
  HighlightMoment,
  HighlightMomentsResponse,
  HighlightSort,
} from '../../../highlights/types';

type Props = {
  vodId: string;
  parentHost: string;
  filters: HighlightFilters;
  resultStatus: 'ok' | 'not-found' | 'error';
  momentsResponse: HighlightMomentsResponse | null;
};

const sortOptions: { value: HighlightSort; label: string }[] = [
  { value: 'timestamp', label: '時間順' },
  { value: 'audio', label: '音が強い順' },
  { value: 'chat', label: 'チャットが強い順' },
  { value: 'clips', label: 'Clipが多い順' },
];

const starFilterOptions = [0, 1, 2, 3, 4, 5];
const PLAYBACK_LEAD_SECONDS = 5;

function Stars({ value, label }: { value: number; label: string }) {
  const safeValue = Math.min(Math.max(Math.floor(value), 0), 5);

  return (
    <span
      className={`starRating ${safeValue === 0 ? 'isQuiet' : ''}`}
      aria-label={`${label}: ${safeValue} / 5`}
    >
      <span aria-hidden="true">{'★'.repeat(safeValue)}{'☆'.repeat(5 - safeValue)}</span>
    </span>
  );
}

function formatViews(value: number) {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  }

  return `${remainingSeconds}秒`;
}

function getPlaybackStart(moment: HighlightMoment) {
  return Math.max(0, Math.floor(moment.timestampSeconds - PLAYBACK_LEAD_SECONDS));
}

export default function HighlightsExplorer({
  vodId,
  parentHost,
  filters,
  resultStatus,
  momentsResponse,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement>(null);
  const moments = useMemo(
    () => momentsResponse?.moments ?? [],
    [momentsResponse],
  );
  const [selectedMomentSeconds, setSelectedMomentSeconds] = useState(
    moments[0]?.timestampSeconds,
  );
  const [playbackRequestId, setPlaybackRequestId] = useState(0);

  const selectedMoment = useMemo(() => {
    return (
      moments.find((moment) => moment.timestampSeconds === selectedMomentSeconds) ??
      moments[0] ??
      null
    );
  }, [moments, selectedMomentSeconds]);

  const playerStartSeconds = selectedMoment ? getPlaybackStart(selectedMoment) : 0;

  useEffect(() => {
    if (!isInfoOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        infoPopoverRef.current &&
        !infoPopoverRef.current.contains(event.target as Node)
      ) {
        setIsInfoOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isInfoOpen]);

  function updateQuery(next: Partial<HighlightFilters>) {
    const merged = {
      ...filters,
      ...next,
    };
    const params = new URLSearchParams();

    if (merged.sort !== 'timestamp') {
      params.set('sort', merged.sort);
    }

    if (merged.minAudioStars > 0) {
      params.set('minAudioStars', String(merged.minAudioStars));
    }

    if (merged.minChatStars > 0) {
      params.set('minChatStars', String(merged.minChatStars));
    }

    if (merged.hasClips !== undefined) {
      params.set('hasClips', String(merged.hasClips));
    }

    startTransition(() => {
      router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  function selectMoment(moment: HighlightMoment) {
    setSelectedMomentSeconds(moment.timestampSeconds);
    setPlaybackRequestId((current) => current + 1);
  }

  if (resultStatus === 'not-found') {
    return (
      <section className="highlightEmptyState">
        <h2>この配信はまだ見どころ解析されていません</h2>
        <p>解析JSONが用意されると、ここに音の変化やチャット反応が表示されます。</p>
      </section>
    );
  }

  if (resultStatus === 'error') {
    return (
      <section className="highlightEmptyState highlightErrorState">
        <h2>見どころ情報を読み込めませんでした</h2>
        <p>時間をおいてからもう一度開いてください。</p>
      </section>
    );
  }

  return (
    <section className="highlightExplorerLayout" aria-busy={isPending}>
      <div className="highlightPlayerColumn">
        <div className="highlightPlayerShell">
          <TwitchPlayerFrame
            key={`${vodId}-${playerStartSeconds}-${playbackRequestId}`}
            type="vod"
            id={vodId}
            parentHost={parentHost}
            startSeconds={playerStartSeconds}
            title="Twitchアーカイブプレイヤー"
          />
        </div>
        {selectedMoment ? (
          <div className="selectedMomentSummary">
            <span className="selectedMomentBadge">選択中</span>
            <div>
              <p>{selectedMoment.timestamp}</p>
              <span>見どころの少し前から再生します</span>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="highlightListPanel">
        <div className="highlightListHeader">
          <div>
            <h2>見どころ探索</h2>
            <p>{momentsResponse?.momentCount ?? 0}件</p>
          </div>
          <div className="highlightHeaderActions">
            <div
              ref={infoPopoverRef}
              className="highlightInfoPopoverWrap"
              onMouseEnter={() => setIsInfoOpen(true)}
              onMouseLeave={() => setIsInfoOpen(false)}
            >
              <button
                type="button"
                className="highlightAboutLink"
                aria-expanded={isInfoOpen}
                aria-controls="highlight-info-popover"
                onClick={() => setIsInfoOpen((current) => !current)}
                onFocus={() => setIsInfoOpen(true)}
              >
                ⓘ 解析のしくみ
              </button>
              {isInfoOpen ? (
                <div
                  id="highlight-info-popover"
                  className="highlightInfoPopover"
                  role="dialog"
                  aria-label="見どころ探索について"
                >
                  <h3>見どころ探索について</h3>
                  <p>
                    配信中の音の変化とチャットの反応を解析し、変化が大きかった場所を探しやすくしています。
                  </p>
                  <dl>
                    <div>
                      <dt>音の変化</dt>
                      <dd>普段より急に音が大きくなった場所</dd>
                    </div>
                    <div>
                      <dt>チャット反応</dt>
                      <dd>短時間にコメントが増えた場所</dd>
                    </div>
                  </dl>
                  <p>
                    ★は面白さやおすすめ度ではなく、このアーカイブ内での相対的な変化の強さです。
                  </p>
                  <p>見どころは前後の流れが分かるよう、少し前から再生します。</p>
                </div>
              ) : null}
            </div>
            {isPending ? <span className="highlightLoadingPill">読み込み中</span> : null}
          </div>
        </div>

        <div className="highlightControls">
          <label className="highlightControl">
            <span>並び順</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                updateQuery({ sort: event.target.value as HighlightSort })
              }
              aria-label="見どころの並び順"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="highlightControl">
            <span>音</span>
            <select
              value={filters.minAudioStars}
              onChange={(event) =>
                updateQuery({ minAudioStars: Number(event.target.value) })
              }
              aria-label="音の変化の最小星数"
            >
              {starFilterOptions.map((stars) => (
                <option key={stars} value={stars}>
                  {stars === 0 ? 'すべて' : `★${stars}以上`}
                </option>
              ))}
            </select>
          </label>

          <label className="highlightControl">
            <span>チャット</span>
            <select
              value={filters.minChatStars}
              onChange={(event) =>
                updateQuery({ minChatStars: Number(event.target.value) })
              }
              aria-label="チャット反応の最小星数"
            >
              {starFilterOptions.map((stars) => (
                <option key={stars} value={stars}>
                  {stars === 0 ? 'すべて' : `★${stars}以上`}
                </option>
              ))}
            </select>
          </label>

          <label className="highlightClipToggle">
            <input
              type="checkbox"
              checked={filters.hasClips === true}
              onChange={(event) =>
                updateQuery({ hasClips: event.target.checked ? true : undefined })
              }
            />
            <span>Clipありのみ</span>
          </label>
        </div>

        {moments.length === 0 ? (
          <div className="highlightFilterEmpty">
            この条件に合う見どころはありません
          </div>
        ) : (
          <div className="momentList">
            {moments.map((moment) => {
              const isSelected =
                selectedMoment?.timestampSeconds === moment.timestampSeconds;

              return (
                <article
                  key={`${moment.timestampSeconds}-${moment.timestamp}`}
                  className={`momentCard ${isSelected ? 'isSelected' : ''} ${moment.thumbnailUrl ? 'hasThumbnail' : ''}`}
                >
                  {moment.thumbnailUrl ? (
                    <div className="momentThumbnail">
                      <Image
                        src={moment.thumbnailUrl}
                        alt={`${moment.timestamp}付近の見どころ候補サムネイル`}
                        fill
                        sizes="(max-width: 720px) 100vw, 150px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                  ) : null}

                  <div className="momentCardBody">
                    <div className="momentCardTop">
                      <div>
                        <p className="momentTimestamp">{moment.timestamp}</p>
                      </div>
                      {isSelected ? (
                        <span className="momentSelectedText">選択中</span>
                      ) : null}
                    </div>

                    <div className="momentSignals">
                      <div className="momentSignal">
                        <span>音の変化</span>
                        <Stars value={moment.audioStars} label="音の変化" />
                      </div>
                      <div className="momentSignal">
                        <span>チャット反応</span>
                        <Stars value={moment.chatStars} label="チャット反応" />
                      </div>
                    </div>

                    {moment.clipCount > 0 ? (
                      <div className="momentClips">
                        <p className="momentClipCount">
                          Clip {moment.clipCount}件
                        </p>
                        {moment.clips.map((clip) => (
                          <a
                            key={clip.id}
                            className="momentClipCard"
                            href={clip.url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            <span className="momentClipThumb">
                              <Image
                                src={clip.thumbnailUrl}
                                alt=""
                                fill
                                sizes="96px"
                                style={{ objectFit: 'cover' }}
                              />
                            </span>
                            <span className="momentClipInfo">
                              <strong>{clip.title}</strong>
                              <small>
                                {clip.creatorName} ・ {formatViews(clip.viewCount)}視聴 ・{' '}
                                {formatDuration(clip.duration)}
                              </small>
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="watchMomentButton"
                      onClick={() => selectMoment(moment)}
                    >
                      ここから見る
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </section>
  );
}
