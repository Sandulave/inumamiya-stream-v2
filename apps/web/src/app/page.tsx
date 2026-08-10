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

export default async function Home() {
  const { user, stream, errorMessage } = await fetchTwitchData('inumamiya');

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
