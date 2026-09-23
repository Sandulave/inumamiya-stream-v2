'use client';

import { useId, useState } from 'react';

export default function ChatPanel({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  const chatId = useId();

  return (
    <aside className={`chatPanel${open ? ' isChatOpen' : ''}`}>
      <button
        type="button"
        className="mobileChatToggle"
        aria-expanded={open}
        aria-controls={chatId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>チャット</span>
        <span>{open ? '閉じる −' : '開く ＋'}</span>
      </button>
      <div className="chatWrapper" id={chatId}>
        <iframe src={src} title="Twitch Chat" frameBorder="0" scrolling="no" />
      </div>
    </aside>
  );
}
