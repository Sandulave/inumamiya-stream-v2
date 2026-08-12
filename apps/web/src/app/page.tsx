import ProfileSlider from './components/ProfileSlider';
import ViewerExperience from './components/ViewerExperience';

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
};

type TwitchStreamResponse = {
  isLive: boolean;
  stream: {
    title: string;
    game_name: string;
    viewer_count: number;
  } | null;
};

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

type TwitchPageData = {
  user: TwitchUser | null;
  stream: TwitchStreamResponse | null;
  errorMessage: string | null;
};

type TwitchClipListResponse = {
  clips: TwitchClip[];
  pagination?: {
    cursor?: string;
  };
};

type TwitchVideoListResponse = {
  videos: TwitchVideo[];
  pagination?: {
    cursor?: string;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TWITCH_CHANNEL = 'inumamiya';
const TWITCH_PARENT_HOST = process.env.NEXT_PUBLIC_TWITCH_PARENT_HOST ?? 'localhost';

async function fetchTwitchData(login: string): Promise<TwitchPageData> {
  const userRequest = fetch(`${API_BASE_URL}/twitch/users/${login}`, {
    cache: 'no-store',
  });
  const streamRequest = fetch(`${API_BASE_URL}/twitch/streams/${login}`, {
    cache: 'no-store',
  });

  const [userResult, streamResult] = await Promise.allSettled([
    userRequest,
    streamRequest,
  ]);

  let user: TwitchUser | null = null;
  let stream: TwitchStreamResponse | null = null;
  let errorMessage: string | null = null;

  if (userResult.status === 'fulfilled') {
    const response = userResult.value;
    if (response.ok) {
      user = (await response.json()) as TwitchUser;
    } else {
      errorMessage = `ユーザー情報の取得に失敗しました（HTTP ${response.status}）`;
    }
  } else {
    errorMessage = 'ユーザー情報の取得中にエラーが発生しました。';
  }

  if (streamResult.status === 'fulfilled') {
    const response = streamResult.value;
    if (response.ok) {
      stream = (await response.json()) as TwitchStreamResponse;
    } else {
      errorMessage =
        errorMessage ??
        `配信情報の取得に失敗しました（HTTP ${response.status}）`;
    }
  } else {
    errorMessage = errorMessage ?? '配信情報の取得中にエラーが発生しました。';
  }

  return { user, stream, errorMessage };
}

async function fetchTwitchClips(
  login: string,
): Promise<TwitchClipListResponse | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/twitch/clips/${login}?first=6&sort=latest`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data as TwitchClipListResponse;
  } catch {
    return null;
  }
}

async function fetchTwitchVideos(
  login: string,
): Promise<TwitchVideoListResponse | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/twitch/videos/${login}?first=6&sort=latest`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data as TwitchVideoListResponse;
  } catch {
    return null;
  }
}

// Site overview removed to eliminate old/duplicated static copy text.

function ProfileGallerySection({ initialImage }: { initialImage?: string }) {
  return (
    <section className="gallerySection heroProfileSection">
      <ProfileSlider initialImage={initialImage} />
    </section>
  );
}

export default async function Home() {
  const [{ user, stream, errorMessage }, clipData, videoData] = await Promise.all([
    fetchTwitchData('inumamiya'),
    fetchTwitchClips('inumamiya'),
    fetchTwitchVideos('inumamiya'),
  ]);
  const streamStatusText = stream?.isLive ? 'LIVE' : 'OFF AIR';

  const chatSrc = `https://www.twitch.tv/embed/${encodeURIComponent(
    TWITCH_CHANNEL,
  )}/chat?parent=${encodeURIComponent(TWITCH_PARENT_HOST)}`;

  return (
    <main className="page">
      <section className="heroSection">
        <div className="heroStatusBadge">
          <span className={`statusBadge ${stream?.isLive ? 'live' : 'offair'}`}>
            {streamStatusText}
          </span>
        </div>
        <div className="heroInner">
          <div className="heroLeft">
            <header className="pageHeader">
              <div>
                <p className="pageLabel">Twitch fan viewing portal</p>
                <h1>いぬまみや専用視聴ページ</h1>
              </div>
            </header>

            <div className="viewerHeader">
              {user ? (
                <div className="profileSummary heroProfileSummary">
                  <div>
                    <p className="loginName heroLoginName">@{user.login}</p>
                  </div>
                </div>
              ) : (
                <div className="profileSummary">
                  <p>プロフィール情報を読み込めませんでした。</p>
                </div>
              )}
              <ProfileGallerySection initialImage={user?.profile_image_url} />
              {user ? (
                <p className="profileDescription">
                  {user.description || '現在、自己紹介は設定されていません。'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <section className="statusBanner statusBannerError">
          <p>{errorMessage}</p>
        </section>
      ) : null}

      <section className="twitch-viewer-layout">
        <div className="viewerMain">
            <ViewerExperience
              channel={TWITCH_CHANNEL}
              parentHost={TWITCH_PARENT_HOST}
              isLive={stream?.isLive ?? false}
              userLogin={user?.login ?? TWITCH_CHANNEL}
              clips={clipData?.clips ?? null}
              videos={videoData?.videos ?? null}
              initialClipCursor={clipData?.pagination?.cursor}
              initialVideoCursor={videoData?.pagination?.cursor}
            />
          </div>
        <aside className="chatPanel">
          <div className="chatWrapper">
            <iframe
              src={chatSrc}
              title="Twitch Chat"
              frameBorder="0"
              scrolling="no"
            />
          </div>
        </aside>
      </section>
    </main>
  );
}
