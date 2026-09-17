import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function analyticsDay(time: number): string {
  return new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private database?: DatabaseSync;
  private lastCleanupDay = '';

  constructor(private readonly config: ConfigService) {}

  onModuleDestroy() {
    this.database?.close();
    this.database = undefined;
  }

  assertAccess(authorization: string | undefined) {
    const token = this.config.get<string>('ANALYTICS_API_TOKEN');
    if (!token || token.length < 32) {
      throw new ServiceUnavailableException('Analytics is not configured');
    }
    if (!this.equal(authorization ?? '', `Bearer ${token}`)) {
      throw new UnauthorizedException();
    }
  }

  authenticate(input: unknown) {
    const password = this.config.get<string>('ANALYTICS_ADMIN_PASSWORD');
    if (!password || password.length < 16) {
      throw new ServiceUnavailableException(
        'Analytics login is not configured',
      );
    }
    const body = this.record(input);
    const client = this.clientKey(body.client);
    this.limit(`login:${client}`, 5, 15 * 60_000);
    if (
      typeof body.password !== 'string' ||
      body.password.length > 512 ||
      !this.equal(body.password, password)
    ) {
      throw new UnauthorizedException();
    }
    this.db()
      .prepare('DELETE FROM rate_limits WHERE key = ?')
      .run(`login:${client}`);
    return { authenticated: true };
  }

  recordPageView(input: unknown) {
    const body = this.record(input);
    if (
      typeof body.id !== 'string' ||
      !UUID.test(body.id) ||
      typeof body.sessionId !== 'string' ||
      !UUID.test(body.sessionId) ||
      typeof body.path !== 'string' ||
      !/^(\/|\/archives\/\d{1,20})$/.test(body.path) ||
      typeof body.title !== 'string' ||
      body.title.length > 200 ||
      !['desktop', 'mobile', 'tablet'].includes(String(body.device))
    ) {
      throw new BadRequestException('Invalid page view');
    }
    const client = this.clientKey(body.client);
    this.limit(`event:${client}`, 120, 60_000);
    let referrer = 'direct';
    if (typeof body.referrer === 'string' && body.referrer !== '') {
      try {
        const url = new URL(body.referrer);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.hostname.length > 253
        ) {
          throw new Error('Invalid referrer');
        }
        referrer = url.hostname.toLowerCase();
      } catch {
        throw new BadRequestException('Invalid referrer');
      }
    }
    const now = Date.now();
    const db = this.db();
    this.cleanup(now);
    const session = createHmac(
      'sha256',
      this.config.getOrThrow<string>('ANALYTICS_API_TOKEN'),
    )
      .update(body.sessionId)
      .digest('hex');
    db.prepare(
      `INSERT OR IGNORE INTO page_views
      (id, occurred_at, day, path, title, session, referrer, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      body.id,
      now,
      analyticsDay(now),
      body.path,
      body.title.replace(/\p{Cc}/gu, '').trim(),
      session,
      referrer,
      String(body.device),
    );
    db.prepare(
      "INSERT OR IGNORE INTO metadata (key, value) VALUES ('started_at', ?)",
    ).run(new Date(now).toISOString());
  }

  summary(rawDays: string | undefined) {
    const days = rawDays === undefined ? 7 : Number(rawDays);
    if (![1, 7, 30, 90].includes(days)) {
      throw new BadRequestException('days must be 1, 7, 30 or 90');
    }
    const now = Date.now();
    const today = analyticsDay(now);
    const start = analyticsDay(now - (days - 1) * DAY_MS);
    const db = this.db();
    this.cleanup(now);
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS views,
      COUNT(DISTINCT session) AS sessions,
      COALESCE(SUM(CASE WHEN path LIKE '/archives/%' THEN 1 ELSE 0 END), 0) AS archiveViews
      FROM page_views WHERE day BETWEEN ? AND ?`,
      )
      .get(start, today)!;
    const dailyRows = db
      .prepare(
        `SELECT day, COUNT(*) AS views,
      COUNT(DISTINCT session) AS sessions FROM page_views
      WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
      )
      .all(start, today);
    const daily = Array.from({ length: days }, (_, index) => {
      const day = analyticsDay(now - (days - 1 - index) * DAY_MS);
      const row = dailyRows.find((item) => item.day === day);
      return {
        day,
        views: Number(row?.views ?? 0),
        sessions: Number(row?.sessions ?? 0),
      };
    });
    const pages = db
      .prepare(
        `SELECT p.path, COUNT(*) AS views,
      COUNT(DISTINCT p.session) AS sessions,
      (SELECT title FROM page_views latest WHERE latest.path = p.path
        ORDER BY occurred_at DESC, id DESC LIMIT 1) AS title
      FROM page_views p WHERE p.day BETWEEN ? AND ?
      GROUP BY p.path ORDER BY views DESC, p.path LIMIT 20`,
      )
      .all(start, today);
    const referrers = db
      .prepare(
        `SELECT referrer AS name, COUNT(*) AS views
      FROM page_views WHERE day BETWEEN ? AND ? GROUP BY referrer
      ORDER BY views DESC, referrer LIMIT 20`,
      )
      .all(start, today);
    const devices = db
      .prepare(
        `SELECT device AS name, COUNT(*) AS views
      FROM page_views WHERE day BETWEEN ? AND ? GROUP BY device
      ORDER BY views DESC, device`,
      )
      .all(start, today);
    const startedAt = db
      .prepare("SELECT value FROM metadata WHERE key = 'started_at'")
      .get();
    return {
      days,
      start,
      end: today,
      generatedAt: new Date(now).toISOString(),
      startedAt: startedAt?.value ?? null,
      views: Number(totals.views),
      sessions: Number(totals.sessions),
      archiveViews: Number(totals.archiveViews),
      daily,
      pages,
      referrers,
      devices,
    };
  }

  private db() {
    if (!this.database) {
      const path =
        this.config.get<string>('ANALYTICS_DB_PATH') ??
        resolve(process.cwd(), 'data', 'analytics.sqlite');
      if (path !== ':memory:')
        mkdirSync(dirname(resolve(path)), { recursive: true });
      this.database = new DatabaseSync(path);
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS page_views (
          id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, day TEXT NOT NULL,
          path TEXT NOT NULL, title TEXT NOT NULL, session TEXT NOT NULL,
          referrer TEXT NOT NULL, device TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS views_day ON page_views(day);
        CREATE INDEX IF NOT EXISTS views_path_time ON page_views(path, occurred_at DESC);
        CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      `);
    }
    return this.database;
  }

  private cleanup(now: number) {
    const today = analyticsDay(now);
    if (this.lastCleanupDay === today) return;
    this.db()
      .prepare('DELETE FROM page_views WHERE day < ?')
      .run(analyticsDay(now - 89 * DAY_MS));
    this.db().prepare('DELETE FROM rate_limits WHERE until < ?').run(now);
    this.lastCleanupDay = today;
  }

  private limit(key: string, maximum: number, windowMs: number) {
    const now = Date.now();
    const row = this.db()
      .prepare(
        `INSERT INTO rate_limits (key, count, until) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN until <= ? THEN 1 ELSE count + 1 END,
        until = CASE WHEN until <= ? THEN excluded.until ELSE until END
      RETURNING count`,
      )
      .get(key, now + windowMs, now, now)!;
    if (Number(row.count) > maximum)
      throw new HttpException('Too many requests', 429);
  }

  private clientKey(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      throw new BadRequestException('Invalid client key');
    }
    return value;
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Invalid request');
    }
    return value as Record<string, unknown>;
  }

  private equal(a: string, b: string) {
    return timingSafeEqual(
      createHash('sha256').update(a).digest(),
      createHash('sha256').update(b).digest(),
    );
  }
}
