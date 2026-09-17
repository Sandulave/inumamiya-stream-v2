import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnalyticsService, analyticsDay } from './analytics.service';

const token = 'test-token-'.repeat(4);
const password = 'test-admin-password-123';
const client = 'a'.repeat(64);

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  beforeEach(() => {
    service = new AnalyticsService(
      new ConfigService({
        ANALYTICS_API_TOKEN: token,
        ANALYTICS_ADMIN_PASSWORD: password,
        ANALYTICS_DB_PATH: ':memory:',
      }),
    );
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
  });
  const event = (extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    path: '/',
    title: 'Home',
    referrer: '',
    device: 'desktop',
    client,
    ...extra,
  });

  it('requires the server credential and fails closed without configuration', () => {
    expect(() => service.assertAccess(undefined)).toThrow('Unauthorized');
    expect(() => service.assertAccess('Bearer incorrect')).toThrow(
      'Unauthorized',
    );
    expect(() => service.assertAccess(`Bearer ${token}`)).not.toThrow();
    const disabled = new AnalyticsService(new ConfigService());
    expect(() => disabled.assertAccess('Bearer ')).toThrow('not configured');
    expect(() => disabled.authenticate({ password })).toThrow('not configured');
  });

  it('authenticates the admin and rate limits failed attempts', () => {
    expect(service.authenticate({ password, client })).toEqual({
      authenticated: true,
    });
    for (let i = 0; i < 5; i++) {
      expect(() => service.authenticate({ password: 'wrong', client })).toThrow(
        'Unauthorized',
      );
    }
    expect(() => service.authenticate({ password, client })).toThrow(
      'Too many requests',
    );
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    expect(service.authenticate({ password, client })).toEqual({
      authenticated: true,
    });
  });

  it('deduplicates events, counts visits, and strips referrer paths and secrets', () => {
    const sessionId = randomUUID();
    const first = event({
      sessionId,
      referrer: 'https://discord.com/channels/private?secret=hidden',
    });
    service.recordPageView(first);
    service.recordPageView(first);
    service.recordPageView(
      event({ sessionId, path: '/archives/123', title: 'Archive' }),
    );
    service.recordPageView(
      event({ path: '/archives/123', title: 'Archive', device: 'mobile' }),
    );
    const summary = service.summary('7');
    expect(summary).toMatchObject({ views: 3, sessions: 2, archiveViews: 2 });
    expect(summary.pages[0]).toMatchObject({
      path: '/archives/123',
      views: 2,
      sessions: 2,
    });
    expect(summary.referrers).toContainEqual(
      expect.objectContaining({ name: 'discord.com', views: 1 }),
    );
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.reduce((sum, day) => sum + day.views, 0)).toBe(3);
  });

  it('uses Japan time at midnight and excludes data outside the selected range', () => {
    expect(analyticsDay(Date.parse('2026-09-16T15:00:00Z'))).toBe('2026-09-17');
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(Date.parse('2026-09-16T14:59:59Z'));
    service.recordPageView(event());
    now.mockReturnValue(Date.parse('2026-09-16T15:00:01Z'));
    service.recordPageView(event());
    expect(service.summary('1')).toMatchObject({
      start: '2026-09-17',
      views: 1,
    });
    expect(service.summary('7').views).toBe(2);
  });

  it('retains only the last 90 Japan calendar days', () => {
    const now = jest.spyOn(Date, 'now');
    const start = Date.parse('2026-01-01T03:00:00Z');
    now.mockReturnValue(start);
    service.recordPageView(event());
    now.mockReturnValue(start + 90 * 86_400_000);
    service.recordPageView(event());
    expect(service.summary('90').views).toBe(1);
  });

  it('rejects admin paths, arbitrary paths, invalid bodies and unsupported periods', () => {
    for (const path of [
      '/admin/analytics',
      '//evil.example',
      '/?password=secret',
      '/archives/../../admin',
    ]) {
      expect(() => service.recordPageView(event({ path }))).toThrow(
        'Invalid page view',
      );
    }
    expect(() => service.recordPageView(null)).toThrow('Invalid request');
    expect(() =>
      service.recordPageView(event({ referrer: 'javascript:alert(1)' })),
    ).toThrow('Invalid referrer');
    expect(() => service.summary('99999')).toThrow('days must be');
    expect(service.summary('7').views).toBe(0);
  });

  it('survives reopening a persistent database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'portal-analytics-test-'));
    const config = new ConfigService({
      ANALYTICS_DB_PATH: join(directory, 'events.sqlite'),
      ANALYTICS_API_TOKEN: token,
    });
    const first = new AnalyticsService(config);
    const second = new AnalyticsService(config);
    try {
      first.recordPageView(event());
      first.onModuleDestroy();
      expect(second.summary('7').views).toBe(1);
    } finally {
      first.onModuleDestroy();
      second.onModuleDestroy();
      expect(
        directory.startsWith(join(tmpdir(), 'portal-analytics-test-')),
      ).toBe(true);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
