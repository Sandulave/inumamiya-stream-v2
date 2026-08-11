"use client";

import React, { KeyboardEvent, useMemo, useState } from 'react';
import Image from 'next/image';
import { games, pcSpecs, profileLinks, qrLinks } from '../../data/streamerData';

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
  url: string;
  thumbnail_url: string;
  title: string;
  published_at: string;
  view_count: number;
  duration: string;
};

type Props = {
  clips: TwitchClip[] | null;
  videos: TwitchVideo[] | null;
  isLive: boolean;
  selectedVideoId?: string | null;
  onSelectArchive?: (videoId: string) => void;
};

function VideoThumbnail({
  src,
  alt,
  sizes,
}: {
  src: string;
  alt: string;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`clipThumbnail ${failed ? 'thumbnailFallback' : ''}`}>
      {!failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          style={{ objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="thumbnailPlaceholder">サムネイルを読み込めませんでした</div>
      )}
    </div>
  );
}

const tabs = [
  { id: 'clips', label: 'クリップ' },
  { id: 'archive', label: 'アーカイブ' },
  { id: 'links', label: 'リンク' },
  { id: 'games', label: 'ゲーム' },
  { id: 'pcspec', label: 'PC SPEC' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function TabPanel({ clips, videos, isLive, selectedVideoId, onSelectArchive }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('clips');

  function formatVideoThumbnail(url: string) {
    return url
      .replace(/%\{width\}/g, '320')
      .replace(/%\{height\}/g, '180');
  }

  const tabPanels = useMemo(
    () => ({
      clips: (
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
                  rel="noreferrer noopener"
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
      ),
      archive: (
        <section className="archiveSection">
          <div className="sectionHeader">
            <h2>最近の配信アーカイブ</h2>
            <p>最新6件のアーカイブを表示します。</p>
          </div>
          {videos === null ? (
            <p>アーカイブを取得できませんでした。</p>
          ) : videos.length === 0 ? (
            <p>現在表示できるアーカイブはありません。</p>
          ) : (
            <div className="archiveGrid">
              {videos.map((video) => (
                <div key={video.id} className="archiveCardWrapper">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="archiveCard"
                  >
                    <VideoThumbnail
                      src={formatVideoThumbnail(video.thumbnail_url)}
                      alt={video.title}
                      sizes="(max-width: 768px) 100vw, 320px"
                    />
                    <div className="clipInfo">
                      <p className="clipTitle">{video.title}</p>
                      <p className="clipMeta">公開: {formatVideoDate(video.published_at)}</p>
                      <p className="clipMeta">長さ: {formatDuration(video.duration)}</p>
                      <p className="clipMeta">再生数: {video.view_count} 回</p>
                    </div>
                  </a>
                  <div className="archiveActions">
                    {!isLive && onSelectArchive ? (
                      <button
                        type="button"
                        className={`archivePlayButton ${selectedVideoId === video.id ? 'playing' : ''}`}
                        onClick={() => onSelectArchive(video.id)}
                        disabled={selectedVideoId === video.id}
                      >
                        {selectedVideoId === video.id ? '再生中' : 'この画面で再生'}
                      </button>
                    ) : null}
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="archiveExternalLink"
                    >
                      Twitchで見る
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ),
      links: (
        <section className="linkTabSection">
          <div className="sectionHeader">
            <h2>外部リンク</h2>
            <p>配信ページや公式リンクをまとめています。</p>
          </div>
          <div className="linkGrid">
            {profileLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="linkCard"
              >
                <div>
                  <p className="linkCardTitle">{link.name}</p>
                  <p className="linkCardDescription">{link.description}</p>
                </div>
                <span className="linkExternal">↗</span>
              </a>
            ))}
          </div>
          <div className="sectionHeader">
            <h2>QR LINKS</h2>
            <p>スマホで読み取りやすいQRカードです。</p>
          </div>
          <div className="qrGrid">
            {qrLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="qrCard"
              >
                <div className="qrImageWrapper">
                  <div className="qrImageInner">
                    <Image
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        link.url,
                      )}`}
                      alt={`${link.name} QRコード`}
                      fill
                      sizes="180px"
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                </div>
                <div className="qrCardBody">
                  <p className="qrCardTitle">{link.name}</p>
                  <p className="qrCardDescription">{link.description}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      ),
      games: (
        <section className="gameSection">
          <div className="sectionHeader">
            <h2>INUMAMIYA GAMES</h2>
            <p>旧サイト掲載のゲームをプレイできるリンクです。</p>
          </div>
          <div className="gameGrid">
            {games.map((game) => (
              <article key={game.name} className="gameCard">
                <div>
                  <p className="gameCardLabel">GAME</p>
                  <h3 className="gameCardTitle">{game.name}</h3>
                  <p className="gameCardDescription">{game.description}</p>
                </div>
                <a
                  href={game.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="gamePlayButton"
                >
                  プレイする
                </a>
              </article>
            ))}
          </div>
        </section>
      ),
      pcspec: (
        <section className="pcSpecSection">
          <div className="sectionHeader">
            <h2>PC SPEC</h2>
            <p>旧サイトの PC スペックを読みやすいカード形式で掲載します。</p>
          </div>
          <div className="pcSpecGrid">
            {pcSpecs.map((section) => (
              <div key={section.title} className="pcSpecCard">
                <p className="pcSpecCardTitle">{section.title}</p>
                <ul className="pcSpecList">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ),
    }),
    [clips, videos, isLive, onSelectArchive, selectedVideoId],
  );

  function formatVideoDate(isoString: string) {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(date);
  }

  function formatDuration(duration: string) {
    const hoursMatch = duration.match(/(\d+)h/);
    const minutesMatch = duration.match(/(\d+)m/);
    const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }

    return `${minutes}分`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveTab(tabs[index].id);
    }
  }

  return (
    <div className="tabContainer">
      <div className="tabList" role="tablist" aria-label="コンテンツタブ">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`tabButton ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="tabPanel"
        >
          {activeTab === tab.id ? tabPanels[tab.id] : null}
        </div>
      ))}
    </div>
  );
}
