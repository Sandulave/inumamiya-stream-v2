import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('Analytics API access', () => {
  let app: INestApplication;
  const token = 'server-only-test-token-'.repeat(3);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ANALYTICS_API_TOKEN: token,
            ANALYTICS_DB_PATH: ':memory:',
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('does not expose summaries or writes to unauthenticated callers', async () => {
    await request(app.getHttpServer()).get('/analytics/summary').expect(401);
    await request(app.getHttpServer())
      .post('/analytics/pageview')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/analytics/login')
      .send({})
      .expect(401);
  });

  it('returns a non-cacheable summary only to the web server', async () => {
    const result = await request(app.getHttpServer())
      .get('/analytics/summary?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body).toMatchObject({ days: 7, views: 0, sessions: 0 });
    await request(app.getHttpServer())
      .get('/analytics/summary?days=999')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
