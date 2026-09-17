import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Home, LockKeyhole, LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { analyticsApi, analyticsConfigured, isAnalyticsAdmin } from '@/lib/analytics-server';
import RefreshButton from './RefreshButton';
import './analytics.css';

export const metadata: Metadata = {
  title: 'アクセス解析 | いぬまみや',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

type CountRow = { name: string; views: number };
type Summary = {
  days: number; start: string; end: string; generatedAt: string; startedAt: string | null;
  views: number; sessions: number; archiveViews: number;
  daily: { day: string; views: number; sessions: number }[];
  pages: { path: string; title: string; views: number; sessions: number }[];
  referrers: CountRow[]; devices: CountRow[];
};
const number = (value: number) => value.toLocaleString('ja-JP');
const date = (value: string) => value.replaceAll('-', '/');
const loginErrors: Record<string, string> = {
  invalid: 'パスワードが違います。',
  limited: '試行回数の上限に達しました。15分後にお試しください。',
  unavailable: '現在ログインできません。しばらくしてからお試しください。',
};

function Brand() {
  return <span className="analyticsBrand"><Image src="/icon.png" alt="" width={32} height={32} />いぬまみや<span>管理</span></span>;
}

export default async function AnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string; error?: string }>;
}) {
  const params = await searchParams;
  const configured = analyticsConfigured();
  if (!configured || !await isAnalyticsAdmin()) {
    return (
      <main className="analyticsRoot analyticsLoginRoot" lang="ja">
        <header className="analyticsHeader"><Brand /><Link href="/" className="analyticsIconButton" title="サイトへ戻る" aria-label="サイトへ戻る"><Home size={18} /></Link></header>
        <section className="analyticsLogin">
          <LockKeyhole size={28} className="analyticsLoginIcon" />
          <h1>アクセス解析</h1><p className="analyticsMuted">管理者ログイン</p>
          {!configured ? <p role="status" className="analyticsNotice">管理画面はまだ設定されていません。</p> : (
            <form action="/api/admin/login" method="post">
              <label htmlFor="analytics-password">パスワード</label>
              <input id="analytics-password" name="password" type="password" autoComplete="current-password" required maxLength={512} />
              {params.error && loginErrors[params.error] && <p role="alert" className="analyticsError">{loginErrors[params.error]}</p>}
              <button type="submit" className="analyticsPrimaryButton">ログイン</button>
            </form>
          )}
        </section>
      </main>
    );
  }
  const days = [1, 7, 30, 90].includes(Number(params.days)) ? Number(params.days) : 7;
  let summary: Summary | null = null;
  try {
    const response = await analyticsApi(`summary?days=${days}`);
    if (response.ok) summary = await response.json() as Summary;
  } catch { /* Keep the management page available during API outages. */ }
  const peak = Math.max(1, ...summary?.daily.map((item) => item.views) ?? []);
  return (
    <main className="analyticsRoot" lang="ja">
      <header className="analyticsHeader">
        <Brand />
        <nav aria-label="管理メニュー">
          <Link href="/" className="analyticsIconButton" title="サイトへ戻る" aria-label="サイトへ戻る"><Home size={18} /></Link>
          <form action="/api/admin/logout" method="post"><button className="analyticsTextButton" type="submit"><LogOut size={16} />ログアウト</button></form>
        </nav>
      </header>
      <div className="analyticsContent">
        <div className="analyticsTitleRow"><div><p className="analyticsEyebrow"><LockKeyhole size={12} />PRIVATE</p><h1>アクセス解析</h1></div>
          <div className="analyticsPeriod"><nav aria-label="集計期間">{[[1, '今日'], [7, '7日間'], [30, '30日間'], [90, '90日間']].map(([value, label]) => (
            <Link key={value} href={`/admin/analytics?days=${value}`} prefetch={false} aria-current={days === value ? 'page' : undefined}>{label}</Link>
          ))}</nav><RefreshButton /></div>
        </div>
        {!summary ? <section className="analyticsNotice" role="alert"><h2>集計データを取得できませんでした</h2><p>しばらくしてから更新してください。</p><RefreshButton /></section> : <>
          <div className="analyticsDateRow"><span>{date(summary.start)} - {date(summary.end)}<span className="analyticsTimezone">日本時間</span></span><span>更新 {new Date(summary.generatedAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}</span></div>
          <dl className="analyticsStats">
            <div><dt>ページ閲覧数</dt><dd>{number(summary.views)}<span>PV</span></dd></div>
            <div><dt title="同じタブで30分以内に続けて閲覧したアクセスを1訪問として集計">訪問数</dt><dd>{number(summary.sessions)}<span>訪問</span></dd></div>
            <div><dt>アーカイブ閲覧数</dt><dd>{number(summary.archiveViews)}<span>PV</span></dd></div>
            <div><dt>1訪問あたり</dt><dd>{summary.sessions ? (summary.views / summary.sessions).toFixed(1) : '0.0'}<span>ページ</span></dd></div>
          </dl>
          <section className="analyticsSection">
            <div className="analyticsSectionHeading"><h2>アクセス推移</h2><span className="analyticsLegend"><i />ページ閲覧数</span></div>
            <div className="analyticsChartWrap">
              <div className="analyticsChartScale"><span>{number(peak)}</span><span>{number(Math.floor(peak / 2))}</span><span>0</span></div>
              <div className="analyticsChart" style={{ gridTemplateColumns: `repeat(${summary.daily.length}, minmax(0, 1fr))` }} aria-label="日別のページ閲覧数">
                {summary.daily.map((item) => <div key={item.day} className="analyticsBarColumn" tabIndex={0} aria-label={`${date(item.day)}、${item.views} PV、${item.sessions}訪問`}>
                  <div className="analyticsBar" style={{ height: `${item.views / peak * 100}%`, minHeight: item.views ? 3 : 0 }} />
                  <span className="analyticsChartTooltip">{date(item.day)}<strong>{number(item.views)} PV</strong>{number(item.sessions)}訪問</span>
                </div>)}
                {summary.views === 0 && <p className="analyticsChartEmpty">この期間のアクセスはまだありません</p>}
              </div>
            </div>
            <div className="analyticsChartDates"><span>{date(summary.start)}</span><span>{date(summary.end)}</span></div>
          </section>
          <section className="analyticsSection">
            <div className="analyticsSectionHeading"><h2>人気のページ</h2><span className="analyticsMuted">上位20件</span></div>
            {summary.pages.length === 0 ? <p className="analyticsEmpty">閲覧されたページはまだありません</p> : <div className="analyticsTableWrap"><table className="analyticsTable"><thead><tr><th scope="col">ページ</th><th scope="col">閲覧数</th><th scope="col">訪問数</th></tr></thead><tbody>
              {summary.pages.map((page, index) => <tr key={page.path}><td><div className="analyticsPageCell"><span className="analyticsRank">{index + 1}</span><div><Link href={page.path} target="_blank" rel="noopener noreferrer">{page.title || (page.path === '/' ? 'トップページ' : '配信アーカイブ')}<ArrowUpRight size={14} /></Link><span className="analyticsPath">{page.path}</span></div></div></td><td>{number(page.views)}</td><td>{number(page.sessions)}</td></tr>)}
            </tbody></table></div>}
          </section>
          <div className="analyticsBreakdowns">
            <section className="analyticsSection"><div className="analyticsSectionHeading"><h2>流入元</h2><span className="analyticsMuted">PV</span></div>
              {summary.referrers.length === 0 ? <p className="analyticsEmpty">まだデータがありません</p> : <ul className="analyticsBreakdownList">{summary.referrers.map((row) => <li key={row.name}><div><span>{row.name === 'direct' ? '直接アクセス / 不明' : row.name}</span><strong>{number(row.views)}</strong></div><progress max={summary.views} value={row.views} aria-label={`${row.name}: ${row.views} PV`} /></li>)}</ul>}
            </section>
            <section className="analyticsSection"><div className="analyticsSectionHeading"><h2>端末</h2><span className="analyticsMuted">割合</span></div>
              {summary.devices.length === 0 ? <p className="analyticsEmpty">まだデータがありません</p> : <ul className="analyticsBreakdownList">{summary.devices.map((row) => <li key={row.name}><div><span>{row.name === 'mobile' ? <Smartphone size={16} /> : row.name === 'tablet' ? <Tablet size={16} /> : <Monitor size={16} />}{row.name === 'mobile' ? 'スマートフォン' : row.name === 'tablet' ? 'タブレット' : 'パソコン'}</span><strong>{Math.round(row.views / summary.views * 100)}% <small>{number(row.views)} PV</small></strong></div><progress max={summary.views} value={row.views} aria-label={`${row.name}: ${row.views} PV`} /></li>)}</ul>}
            </section>
          </div>
          <footer className="analyticsFooter">{summary.startedAt ? `計測開始 ${new Date(summary.startedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : '計測待ち'}<span>保存期間 90日</span></footer>
        </>}
      </div>
    </main>
  );
}
