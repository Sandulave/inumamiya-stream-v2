"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

type FeedbackPost = {
  id: string;
  name: string;
  message: string;
  createdAt: string;
};

type FeedbackListResponse = {
  posts: FeedbackPost[];
};

const MAX_NAME_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 500;

export default function FeedbackBoard() {
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingPostIds, setDeletingPostIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [status, setStatus] = useState<string | null>(null);

  const trimmedMessage = useMemo(() => message.trim(), [message]);
  const canSubmit = trimmedMessage.length > 0 && !isSubmitting;

  useEffect(() => {
    let isMounted = true;

    async function loadPosts() {
      setIsLoading(true);
      setStatus(null);

      try {
        const response = await fetch('/api/feedback', { cache: 'no-store' });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as FeedbackListResponse;

        if (isMounted) {
          setPosts(data.posts);
        }
      } catch {
        if (isMounted) {
          setStatus('投稿を読み込めませんでした。少し時間をおいて再度お試しください。');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setStatus('メッセージを入力してください。');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const created = (await response.json()) as FeedbackPost;
      setPosts((current) => [created, ...current].slice(0, 50));
      setName('');
      setMessage('');
      setStatus('投稿しました。ありがとうございます。');
    } catch {
      setStatus('投稿できませんでした。入力内容を確認して再度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteFeedback(postId: string) {
    setDeletingPostIds((current) => new Set(current).add(postId));
    setStatus(null);

    try {
      const response = await fetch(
        `/api/feedback?id=${encodeURIComponent(postId)}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setPosts((current) => current.filter((post) => post.id !== postId));
      setStatus('削除しました。');
    } catch {
      setStatus('削除できませんでした。少し時間をおいて再度お試しください。');
    } finally {
      setDeletingPostIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  function formatPostedAt(value: string) {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tokyo',
    }).format(new Date(value));
  }

  return (
    <section className="feedbackSection">
      <div className="panelTopBar">
        <div>
          <h2 className="panelTitle">ご意見・不具合</h2>
          <p className="feedbackLead">
            サイトの感想、不具合、ほしい改善を一言で送れます。
          </p>
        </div>
      </div>

      <form className="feedbackForm" onSubmit={submitFeedback}>
        <label className="feedbackField">
          <span>名前（任意）</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="名無しさん"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="feedbackField">
          <span>メッセージ</span>
          <textarea
            value={message}
            required
            maxLength={MAX_MESSAGE_LENGTH}
            rows={4}
            placeholder="気づいたことをどうぞ"
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <div className="feedbackFormFooter">
          <span>{message.length}/{MAX_MESSAGE_LENGTH}</span>
          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? '投稿中...' : '投稿する'}
          </button>
        </div>
        {status ? <p className="feedbackStatus">{status}</p> : null}
      </form>

      <div className="feedbackPosts">
        {isLoading ? <p className="feedbackEmpty">読み込み中...</p> : null}
        {!isLoading && posts.length === 0 ? (
          <p className="feedbackEmpty">まだ投稿はありません。</p>
        ) : null}
        {posts.map((post) => (
          <article key={post.id} className="feedbackPostCard">
            <div className="feedbackPostHeader">
              <div>
                <strong>{post.name}</strong>
                <time dateTime={post.createdAt}>{formatPostedAt(post.createdAt)}</time>
              </div>
              <button
                type="button"
                className="feedbackDeleteButton"
                disabled={deletingPostIds.has(post.id)}
                onClick={() => void deleteFeedback(post.id)}
              >
                {deletingPostIds.has(post.id) ? '削除中...' : '削除'}
              </button>
            </div>
            <p>{post.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
