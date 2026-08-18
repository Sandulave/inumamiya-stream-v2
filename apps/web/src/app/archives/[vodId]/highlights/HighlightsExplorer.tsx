"use client";

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  HighlightChapter,
  HighlightChaptersResponse,
  HighlightFilters,
  HighlightMoment,
  HighlightMomentsResponse,
  HighlightSort,
  HighlightTimelinePoint,
  HighlightTimelineResponse,
} from '../../../highlights/types';

type Props = {
  vodId: string;
  filters: HighlightFilters;
  resultStatus: 'ok' | 'not-found' | 'error';
  momentsResponse: HighlightMomentsResponse | null;
  timelineResponse: HighlightTimelineResponse | null;
  chaptersResponse: HighlightChaptersResponse | null;
  selectedMomentSeconds?: number;
  shareFeedbackMomentSeconds?: number | null;
  onSelectMoment: (moment: HighlightMoment) => void;
  onSeek: (timestampSeconds: number) => void;
  onShareMoment: (moment: HighlightMoment) => void;
};

const sortOptions: { value: HighlightSort; label: string }[] = [
  { value: 'timestamp', label: '時間順' },
  { value: 'audio', label: '音が強い順' },
  { value: 'chat', label: 'チャットが強い順' },
  { value: 'clips', label: 'Clipが多い順' },
];

const starFilterOptions = [0, 1, 2, 3, 4, 5];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function Stars({ value, label }: { value: number; label: string }) {
  const safeValue = Math.min(Math.max(Math.floor(value), 0), 5);

  return (
    <span
      className={`starRating ${safeValue === 0 ? 'isQuiet' : ''}`}
      aria-label={`${label}: ${safeValue} / 5`}
    >
      <span aria-hidden="true">
        {'★'.repeat(safeValue)}
        {'☆'.repeat(5 - safeValue)}
      </span>
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

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

function formatChapterDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }

  return `${minutes}分`;
}

function resolveThumbnailUrl(thumbnailUrl: string) {
  if (/^https?:\/\//.test(thumbnailUrl)) {
    return thumbnailUrl;
  }

  return new URL(thumbnailUrl, API_BASE_URL).toString();
}

function buildAreaPath(
  points: HighlightTimelinePoint[],
  durationSeconds: number,
  getValue: (point: HighlightTimelinePoint) => number,
) {
  if (points.length === 0 || durationSeconds <= 0) {
    return '';
  }

  const top = 8;
  const bottom = 92;
  const commands = points.map((point, index) => {
    const x = (point.timestampSeconds / durationSeconds) * 100;
    const y = bottom - (Math.max(0, Math.min(100, getValue(point))) / 100) * (bottom - top);

    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`;
  });
  const lastX =
    ((points.at(-1)?.timestampSeconds ?? durationSeconds) / durationSeconds) * 100;
  const firstX = (points[0].timestampSeconds / durationSeconds) * 100;

  return `${commands.join(' ')} L ${lastX.toFixed(3)} 96 L ${firstX.toFixed(3)} 96 Z`;
}

function TimelineGraph({
  title,
  tone,
  points,
  durationSeconds,
  selectedMomentSeconds,
  getValue,
  getPeakTimestamp,
  renderTooltip,
  onSeek,
}: {
  title: string;
  tone: 'audio' | 'chat';
  points: HighlightTimelinePoint[];
  durationSeconds: number;
  selectedMomentSeconds?: number;
  getValue: (point: HighlightTimelinePoint) => number;
  getPeakTimestamp: (point: HighlightTimelinePoint) => number;
  renderTooltip: (point: HighlightTimelinePoint) => string;
  onSeek: (timestampSeconds: number) => void;
}) {
  const [hovered, setHovered] = useState<HighlightTimelinePoint | null>(null);
  const path = buildAreaPath(points, durationSeconds, getValue);
  const selectedX =
    selectedMomentSeconds !== undefined && durationSeconds > 0
      ? (selectedMomentSeconds / durationSeconds) * 100
      : null;

  function pickPoint(clientX: number, currentTarget: SVGSVGElement) {
    const rect = currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const timestamp = ratio * durationSeconds;

    return points.reduce((closest, point) =>
      Math.abs(point.timestampSeconds - timestamp) <
      Math.abs(closest.timestampSeconds - timestamp)
        ? point
        : closest,
    );
  }

  return (
    <div className={`timelineGraph timelineGraph-${tone}`}>
      <div className="timelineGraphTop">
        <h3>{title}</h3>
        {hovered ? (
          <span className="timelineTooltip">{renderTooltip(hovered)}</span>
        ) : null}
      </div>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
        onPointerMove={(event) => setHovered(pickPoint(event.clientX, event.currentTarget))}
        onPointerLeave={() => setHovered(null)}
        onClick={(event) => {
          const point = pickPoint(event.clientX, event.currentTarget);
          onSeek(getPeakTimestamp(point));
        }}
      >
        <path className="timelineGridLine" d="M 0 50 L 100 50" />
        <path className="timelineArea" d={path} />
        {selectedX !== null ? (
          <line
            className="timelineSelectedMarker"
            x1={selectedX}
            x2={selectedX}
            y1="4"
            y2="96"
          />
        ) : null}
      </svg>
      <div className="timelineAxis">
        <span>0:00</span>
        <span>{formatTimestamp(durationSeconds)}</span>
      </div>
    </div>
  );
}

function ChapterStrip({
  chapters,
  durationSeconds,
  onSeek,
}: {
  chapters: HighlightChapter[];
  durationSeconds: number;
  onSeek: (timestampSeconds: number) => void;
}) {
  if (chapters.length === 0 || durationSeconds <= 0) {
    return null;
  }

  return (
    <div className="chapterStrip">
      <div className="chapterStripTop">
        <h3>ゲーム / カテゴリ</h3>
      </div>
      <div className="chapterTrack" role="list">
        {chapters.map((chapter) => {
          const startPercent = Math.max(
            0,
            Math.min(100, (chapter.startSeconds / durationSeconds) * 100),
          );
          const widthPercent = Math.max(
            0.2,
            Math.min(
              100 - startPercent,
              (chapter.durationSeconds / durationSeconds) * 100,
            ),
          );
          const label = chapter.categoryName;
          const title = `${label} ${formatTimestamp(
            chapter.startSeconds,
          )} - ${formatTimestamp(chapter.endSeconds)} (${formatChapterDuration(
            chapter.durationSeconds,
          )})`;

          return (
            <button
              key={`${chapter.startSeconds}-${chapter.endSeconds}-${label}`}
              type="button"
              className="chapterSegment"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={title}
              aria-label={`${label} ${formatTimestamp(chapter.startSeconds)}から再生`}
              role="listitem"
              onClick={() => onSeek(chapter.startSeconds)}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="timelineAxis">
        <span>0:00</span>
        <span>{formatTimestamp(durationSeconds)}</span>
      </div>
    </div>
  );
}

export default function HighlightsExplorer({
  vodId,
  filters,
  resultStatus,
  momentsResponse,
  timelineResponse,
  chaptersResponse,
  selectedMomentSeconds,
  shareFeedbackMomentSeconds,
  onSelectMoment,
  onSeek,
  onShareMoment,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLElement | null>(null);
  const moments = useMemo(
    () => momentsResponse?.moments ?? [],
    [momentsResponse],
  );
  const selectedMoment = useMemo(() => {
    return (
      moments.find((moment) => moment.timestampSeconds === selectedMomentSeconds) ??
      null
    );
  }, [moments, selectedMomentSeconds]);

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

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedMomentSeconds]);

  function updateQuery(next: Partial<HighlightFilters>) {
    const merged = {
      ...filters,
      ...next,
    };
    const params = new URLSearchParams();
    params.set('view', 'highlights');

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

    if (selectedMomentSeconds !== undefined) {
      params.set('moment', String(Math.floor(selectedMomentSeconds)));
    }

    startTransition(() => {
      router.replace(`/archives/${encodeURIComponent(vodId)}?${params.toString()}`);
    });
  }

  function seekTimeline(timestampSeconds: number) {
    onSeek(Math.max(0, Math.floor(timestampSeconds)));
  }

  if (resultStatus === 'not-found') {
    return (
      <section className="highlightEmptyState">
        <h2>この配信はまだ見どころ解析されていません</h2>
        <p>解析JSONが用意されると、音の変化やチャット反応が表示されます。</p>
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
        {selectedMoment ? (
          <div className="selectedMomentSummary">
            <span className="selectedMomentBadge">選択中</span>
            <div>
              <p>{selectedMoment.timestamp}</p>
              <span>見どころの少し前から再生します</span>
            </div>
          </div>
        ) : null}
        {timelineResponse && timelineResponse.points.length > 0 ? (
          <div className="timelinePanel">
            {chaptersResponse && chaptersResponse.chapters.length > 0 ? (
              <ChapterStrip
                chapters={chaptersResponse.chapters}
                durationSeconds={chaptersResponse.durationSeconds}
                onSeek={seekTimeline}
              />
            ) : null}
            <TimelineGraph
              title="音の変化"
              tone="audio"
              points={timelineResponse.points}
              durationSeconds={timelineResponse.durationSeconds}
              selectedMomentSeconds={selectedMoment?.timestampSeconds}
              getValue={(point) => point.audio.level}
              getPeakTimestamp={(point) => point.audio.peakTimestampSeconds}
              renderTooltip={(point) =>
                `${formatTimestamp(point.audio.peakTimestampSeconds)} 音の変化: ${Math.round(point.audio.level)} / 100`
              }
              onSeek={seekTimeline}
            />
            <TimelineGraph
              title="チャット速度"
              tone="chat"
              points={timelineResponse.points}
              durationSeconds={timelineResponse.durationSeconds}
              selectedMomentSeconds={selectedMoment?.timestampSeconds}
              getValue={(point) => point.chat.level}
              getPeakTimestamp={(point) => point.chat.peakTimestampSeconds}
              renderTooltip={(point) =>
                `${formatTimestamp(point.chat.peakTimestampSeconds)} 直近10秒: ${point.chat.messageCount10s}件`
              }
              onSeek={seekTimeline}
            />
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
                解析のしくみ
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
                    配信中の音の変化とチャットの反応を解析し、変化が大きかった場面を探しやすくしています。
                  </p>
                  <dl>
                    <div>
                      <dt>音の変化</dt>
                      <dd>普段より急に音が大きくなった場面</dd>
                    </div>
                    <div>
                      <dt>チャット反応</dt>
                      <dd>短時間にコメントが増えた場面</dd>
                    </div>
                  </dl>
                  <p>
                    星は面白さやおすすめ度ではなく、このアーカイブ内での相対的な変化の強さです。
                  </p>
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
              const isSelected = selectedMoment?.timestampSeconds === moment.timestampSeconds;

              return (
                <article
                  key={`${moment.timestampSeconds}-${moment.timestamp}`}
                  ref={isSelected ? selectedCardRef : undefined}
                  className={`momentCard ${isSelected ? 'isSelected' : ''} ${moment.thumbnailUrl ? 'hasThumbnail' : ''}`}
                >
                  {moment.thumbnailUrl ? (
                    <div className="momentThumbnail">
                      <Image
                        src={resolveThumbnailUrl(moment.thumbnailUrl)}
                        unoptimized
                        alt={`${moment.timestamp}付近の見どころサムネイル`}
                        fill
                        sizes="(max-width: 720px) 100vw, 150px"
                        style={{ objectFit: 'cover' }}
                        onError={(event) => {
                          event.currentTarget
                            .closest('.momentThumbnail')
                            ?.setAttribute('hidden', '');
                        }}
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

                  </div>
                  <div className="momentCardActions">
                    <button
                      type="button"
                      className="watchMomentButton"
                      onClick={() => onSelectMoment(moment)}
                    >
                      ▶ ここから見る
                    </button>
                    <button
                      type="button"
                      className="shareMomentButton"
                      onClick={() => onShareMoment(moment)}
                    >
                      <span aria-hidden="true">🔗</span>
                      共有
                    </button>
                  </div>
                  {shareFeedbackMomentSeconds === moment.timestampSeconds ? (
                    <p className="shareMomentFeedback">リンクをコピーしました</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </section>
  );
}
