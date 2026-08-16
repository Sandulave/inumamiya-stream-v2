import Link from 'next/link';
import { headers } from 'next/headers';
import HighlightsExplorer from './HighlightsExplorer';
import {
  HighlightFilters,
  HighlightMomentsResponse,
  HighlightSort,
} from '../../../highlights/types';

type Props = {
  params: Promise<{ vodId: string }>;
  searchParams: Promise<{
    sort?: string;
    minAudioStars?: string;
    minChatStars?: string;
    hasClips?: string;
  }>;
};

type TwitchVideo = {
  id: string;
  title: string;
  published_at: string;
  duration: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TWITCH_CHANNEL = 'inumamiya';

function normalizeHostname(host: string | null) {
  const firstHost = (host ?? 'localhost').split(',')[0].trim();

  if (firstHost.startsWith('[')) {
    const closingBracketIndex = firstHost.indexOf(']');
    return closingBracketIndex > 0
      ? firstHost.slice(1, closingBracketIndex)
      : 'localhost';
  }

  return firstHost.split(':')[0] || 'localhost';
}

async function getRequestHostname() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    'localhost';

  return normalizeHostname(host);
}

function parseSort(value?: string): HighlightSort {
  if (
    value === 'audio' ||
    value === 'chat' ||
    value === 'clips' ||
    value === 'timestamp'
  ) {
    return value;
  }

  return 'timestamp';
}

function parseStars(value?: string) {
  const parsed = Number(value ?? '0');

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    return 0;
  }

  return parsed;
}

function parseHasClips(value?: string) {
  if (value === 'true') {
    return true;
  }

  return undefined;
}

function buildMomentsUrl(vodId: string, filters: HighlightFilters) {
  const params = new URLSearchParams({
    sort: filters.sort,
    minAudioStars: String(filters.minAudioStars),
    minChatStars: String(filters.minChatStars),
  });

  if (filters.hasClips !== undefined) {
    params.set('hasClips', String(filters.hasClips));
  }

  return `${API_BASE_URL}/highlights/vods/${encodeURIComponent(vodId)}/moments?${params.toString()}`;
}

async function fetchMoments(vodId: string, filters: HighlightFilters) {
  try {
    const response = await fetch(buildMomentsUrl(vodId, filters), {
      cache: 'no-store',
    });

    if (response.status === 404) {
      return { status: 'not-found' as const, data: null };
    }

    if (!response.ok) {
      return { status: 'error' as const, data: null };
    }

    return {
      status: 'ok' as const,
      data: (await response.json()) as HighlightMomentsResponse,
    };
  } catch {
    return { status: 'error' as const, data: null };
  }
}

async function fetchVodMetadata(vodId: string): Promise<TwitchVideo | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/twitch/videos/${TWITCH_CHANNEL}?first=30&sort=latest`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { videos?: TwitchVideo[] };

    return data.videos?.find((video) => video.id === vodId) ?? null;
  } catch {
    return null;
  }
}

export default async function HighlightMomentsPage({
  params,
  searchParams,
}: Props) {
  const [{ vodId }, query, parentHost] = await Promise.all([
    params,
    searchParams,
    getRequestHostname(),
  ]);
  const filters: HighlightFilters = {
    sort: parseSort(query.sort),
    minAudioStars: parseStars(query.minAudioStars),
    minChatStars: parseStars(query.minChatStars),
    hasClips: parseHasClips(query.hasClips),
  };
  const [momentsResult, vodMetadata] = await Promise.all([
    fetchMoments(vodId, filters),
    fetchVodMetadata(vodId),
  ]);

  return (
    <main className="page highlightPage">
      <header className="highlightHeader">
        <Link href="/" className="backToArchivesLink">
          ← アーカイブへ
        </Link>
        <div>
          <p className="pageLabel">Twitch archive moments</p>
          <h1>見どころ探索</h1>
          <p className="highlightLead">
            音の変化やチャットの反応から、気になる場面を探せます。
          </p>
          {vodMetadata ? (
            <div className="highlightVodMeta">
              <span>{vodMetadata.title}</span>
              <span>{new Date(vodMetadata.published_at).toLocaleDateString('ja-JP')}</span>
              <span>{vodMetadata.duration}</span>
            </div>
          ) : (
            <div className="highlightVodMeta">
              <span>アーカイブID: {vodId}</span>
            </div>
          )}
        </div>
      </header>

      <HighlightsExplorer
        vodId={vodId}
        parentHost={parentHost}
        filters={filters}
        resultStatus={momentsResult.status}
        momentsResponse={momentsResult.data}
      />
    </main>
  );
}
