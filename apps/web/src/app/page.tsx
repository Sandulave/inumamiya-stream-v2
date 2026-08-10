import Image from 'next/image';

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

type TwitchPageData = {
  user: TwitchUser | null;
  stream: TwitchStreamResponse | null;
  errorMessage: string | null;
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

async function fetchTwitchClips(login: string): Promise<TwitchClip[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/twitch/clips/${login}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data.clips as TwitchClip[];
  } catch {
    return null;
  }
}

export default async function Home() {
  const [{ user, stream, errorMessage }, clips] = await Promise.all([
    fetchTwitchData('inumamiya'),
    fetchTwitchClips('inumamiya'),
  ]);

  const streamSection = stream ? (
    stream.isLive && stream.stream ? (
      <div>
        <p>配信中</p>
        <p>
          <strong>タイトル:</strong> {stream.stream.title}
        </p>
        <p>
          <strong>ゲーム名:</strong> {stream.stream.game_name}
        </p>
        <p>
          <strong>視聴者数:</strong> {stream.stream.viewer_count}
        </p>
      </div>
    ) : (
      <p>オフライン</p>
    )
  ) : (
    <p>配信情報を読み込めませんでした。</p>
  );

  const playerSrc = `https://player.twitch.tv/?channel=${encodeURIComponent(
    TWITCH_CHANNEL,
  )}&parent=${encodeURIComponent(TWITCH_PARENT_HOST)}&autoplay=false`;
  const chatSrc = `https://www.twitch.tv/embed/${encodeURIComponent(
    TWITCH_CHANNEL,
  )}/chat?parent=${encodeURIComponent(TWITCH_PARENT_HOST)}`;

  return (
    <main className="page">
      <header className="pageHeader">
        <div>
          <p className="pageLabel">Twitch 専用視聴ページ</p>
          <h1>{user?.display_name ?? '配信者'}</h1>
        </div>
      </header>

      {errorMessage ? (
        <section className="statusBanner statusBannerError">
          <p>{errorMessage}</p>
        </section>
      ) : null}

      <section className="twitch-viewer-layout">
        <div className="viewerMain">
          <div className="viewerHeader">
            {user ? (
              <div className="profileSummary">
                <div className="profileAvatar">
                  <Image
                    src={user.profile_image_url}
                    alt={`${user.display_name} のプロフィール画像`}
                    width={80}
                    height={80}
                    className="avatarImage"
                  />
                </div>
                <div>
                  <p className="displayName">{user.display_name}</p>
                  <p className="loginName">@{user.login}</p>
                </div>
                <div className="streamStatus">
                  <span>{stream?.isLive ? '配信中' : 'オフライン'}</span>
                </div>
              </div>
            ) : (
              <div className="profileSummary">
                <p>プロフィール情報を読み込めませんでした。</p>
              </div>
            )}
            {user ? (
              <p className="profileDescription">
                {user.description || '現在、自己紹介は設定されていません。'}
              </p>
            ) : null}
          </div>

          <div className="playerWrapper">
            <iframe
              src={playerSrc}
              title="Twitch Player"
              allowFullScreen
              frameBorder="0"
              scrolling="no"
            />
          </div>

          <section className="streamInfoSection">
            <h2>配信状況</h2>
            {streamSection}
          </section>

          <section className="clipSection">
            <div className="clipSectionHeader">
              <h2>最新クリップ</h2>
              <p>{clips ? `最新 ${clips.length} 件` : 'クリップ情報を読み込めませんでした'}</p>
            </div>
            {clips ? (
              <div className="clipGrid">
                {clips.map((clip) => (
                  <a
                    key={clip.id}
                    href={clip.url}
                    target="_blank"
                    rel="noreferrer"
                    className="clipCard"
                  >
                    <div className="clipThumbnail">
                      <Image
                        src={clip.thumbnail_url}
                        alt={clip.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 240px"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>
                    <div className="clipInfo">
                      <p className="clipTitle">{clip.title}</p>
                      <p className="clipMeta">
                        {clip.creator_name} ・ {clip.view_count} 視聴
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p>クリップの取得に失敗しました。</p>
            )}
          </section>
        </div>

        <aside className="chatPanel">
          <div className="chatHeader">
            <p>チャット</p>
          </div>
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
