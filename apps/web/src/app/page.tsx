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
      <h1>配信者専用視聴ページ</h1>

      {errorMessage ? (
        <section>
          <h2>エラー</h2>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      <section>
        <h2>プロフィール</h2>
        {user ? (
          <div>
            <img
              src={user.profile_image_url}
              alt={`${user.display_name} のプロフィール画像`}
              width={128}
              height={128}
              style={{ borderRadius: '50%' }}
            />
            <p>
              <strong>表示名:</strong> {user.display_name}
            </p>
            <p>
              <strong>ログイン:</strong> {user.login}
            </p>
            <p>
              <strong>自己紹介:</strong> {user.description || 'なし'}
            </p>
          </div>
        ) : (
          <p>プロフィール情報を読み込めませんでした。</p>
        )}
      </section>

      <section>
        <h2>配信状況</h2>
        {streamSection}
      </section>

      <section className="twitch-embed-section">
        <div className="embed-player">
          <iframe
            src={playerSrc}
            height="100%"
            width="100%"
            allowFullScreen
            frameBorder="0"
            scrolling="no"
            title="Twitch Player"
          />
        </div>
        <div className="embed-chat">
          <iframe
            src={chatSrc}
            height="100%"
            width="100%"
            frameBorder="0"
            scrolling="no"
            title="Twitch Chat"
          />
        </div>
      </section>
    </main>
  );
}
