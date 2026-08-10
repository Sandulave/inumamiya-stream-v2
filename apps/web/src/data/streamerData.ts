export type ExternalLink = {
  name: string;
  url: string;
  description: string;
};

export type GameInfo = {
  name: string;
  description: string;
  url: string;
};

export type PcSpecSection = {
  title: string;
  items: string[];
};

export type GalleryImage = {
  alt: string;
  src: string;
};

export type QrLink = {
  name: string;
  url: string;
  description: string;
};

export const sitePhrases = [
  'ネットや配信の話題を、ゆるくまとめるプロフィールページ。',
  'ふらっと立ち寄れる配信ラウンジ',
  '雑談 / ゲーム / ゆるトーク',
];

export const profileLinks: ExternalLink[] = [
  {
    name: 'Twitch',
    url: 'https://www.twitch.tv/inumamiya',
    description: '公式配信ページ',
  },
  {
    name: 'X',
    url: 'https://x.com/inu_no_gohan',
    description: '最新ツイートをチェック',
  },
  {
    name: 'Amazon Wish List',
    url: 'https://www.amazon.co.jp/hz/wishlist/ls/2ZT0QCKYJFK2B?ref_=wl_share',
    description: '欲しいものリスト',
  },
  {
    name: 'アップローダー',
    url: 'https://ux.getuploader.com/NewInumamiya/',
    description: 'イラストや素材のアップローダー',
  },
  {
    name: 'Discord',
    url: 'https://discord.gg/CcRNgETs7W',
    description: 'ファンコミュニティ',
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/channel/UC3K67dwtrnZFI_dVn5LYWGA',
    description: '公式YouTubeチャンネル',
  },
  {
    name: 'どもども動画',
    url: 'https://www.youtube.com/channel/UCeaXl91nkdPp6isMzI548vg',
    description: 'どもども動画チャンネル',
  },
  {
    name: 'LINE OPENCHAT',
    url: 'https://line.me/ti/g2/nbHvs4pt-v_8nhwuRxD_o_0CEAM1L1HiFBfpzqA?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
    description: 'LINEオープンチャット',
  },
];

export const qrLinks: QrLink[] = [
  {
    name: 'Discord',
    url: 'https://discord.gg/CcRNgETs7W',
    description: 'ファンコミュニティ',
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/channel/UC3K67dwtrnZFI_dVn5LYWGA',
    description: '公式YouTubeチャンネル',
  },
  {
    name: 'どもども動画',
    url: 'https://www.youtube.com/channel/UCeaXl91nkdPp6isMzI548vg',
    description: 'どもども動画チャンネル',
  },
  {
    name: 'LINE OPENCHAT',
    url: 'https://line.me/ti/g2/nbHvs4pt-v_8nhwuRxD_o_0CEAM1L1HiFBfpzqA?utm_source=invitation&utm_medium=link_copy&utm_campaign=default',
    description: 'オープンチャット',
  },
];

export const games: GameInfo[] = [
  {
    name: '黄色い犬くん走り幅跳び',
    description: 'ランキング対応のゲーム。跳躍感を楽しめるステージでスコアを競えます。',
    url: 'https://inumamiya.github.io/inu_no_takatobi/',
  },
  {
    name: '虹色いぬくんゲーム',
    description: 'カラフルな世界を進むアクション風味のミニゲームです。',
    url: 'https://inumamiya.github.io/inu-sui/',
  },
  {
    name: 'チェッカーシューティング 体験版',
    description: '君はクリアできるか！？ シンプルながら中毒性のある体験版です。',
    url: 'https://inumamiya.github.io/CHECKER_SHOOTING/',
  },
];

export const pcSpecs: PcSpecSection[] = [
  {
    title: 'OS',
    items: ['Windows 11 Home 64bit', 'Microsoftアカウント設定済み', 'Officeなし'],
  },
  {
    title: 'CPU',
    items: ['AMD Ryzen 7 9700X', '8コア / 16スレッド', '3.8GHzベース / 5.5GHzブースト'],
  },
  {
    title: 'CPUクーラー',
    items: ['ID-COOLING 空冷クーラー', '120mm PWMファン', '型番: FROZN-A410'],
  },
  {
    title: 'GPU',
    items: ['NVIDIA GeForce RTX 5070 Ti', '16GB VRAM', 'HDMI / DisplayPort'],
  },
  {
    title: 'マザーボード',
    items: ['ASUS TUF GAMING B650-PLUS WIFI', '2.5GBASE-T LAN', 'Wi-Fi 6 / Bluetooth 5.2'],
  },
  {
    title: 'メモリ',
    items: ['DDR5-5600 16GB', 'Model: MTC8C1084S1UC56BD1', 'シングル構成'],
  },
  {
    title: 'ストレージ',
    items: ['WD Black SN7100 1TB', '読込 最大 7250MB/s', '書込 最大 6900MB/s'],
  },
  {
    title: '電源・ケース',
    items: ['750W 80PLUS GOLD 電源', 'ATX 3.1対応', 'G-GEARプレミアムミドルタワー'],
  },
  {
    title: '備考',
    items: ['GPUサポートホルダー同梱', 'Officeなし', '追加サービスなし'],
  },
];

export const profileGallery: GalleryImage[] = [
  {
    alt: 'プロフ画像 1',
    src: 'https://inumamiya-stream.vercel.app/profile/inu_kao1.png',
  },
  {
    alt: 'プロフ画像 2',
    src: 'https://inumamiya-stream.vercel.app/profile/inu_kao2.png',
  },
  {
    alt: 'プロフ画像 3',
    src: 'https://inumamiya-stream.vercel.app/profile/inu_kao3.jpeg',
  },
  {
    alt: 'プロフ画像 4',
    src: 'https://inumamiya-stream.vercel.app/profile/inu_kao4.jpg',
  },
];
