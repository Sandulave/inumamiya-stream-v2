import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwitchService } from './twitch.service';

describe('TwitchService', () => {
  let service: TwitchService;
  const fetchMock = jest.fn();

  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'TWITCH_CLIENT_ID') return 'client-id';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitchService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<TwitchService>(TwitchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  function mockUserAndToken() {
    jest.spyOn(service, 'getUserByLogin').mockResolvedValue({
      id: 'user-id',
      login: 'inumamiya',
      display_name: 'いぬまみや',
      broadcaster_type: '',
      description: '',
      profile_image_url: '',
      offline_image_url: '',
      created_at: '',
    });
    jest.spyOn(service, 'getAppAccessToken').mockResolvedValue('token');
  }

  it('should request view-sorted clips with first and return an opaque next cursor', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'clip1', view_count: 30 },
          { id: 'clip2', view_count: 20 },
        ],
        pagination: { cursor: 'next-clips' },
      }),
    });

    const result = await service.getClipsByLogin(
      'inumamiya',
      6,
      undefined,
      'views',
    );
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(requestedUrl.searchParams.get('first')).toBe('6');
    expect(requestedUrl.searchParams.get('after')).toBeNull();
    expect(result.data).toEqual([
      { id: 'clip1', view_count: 30 },
      { id: 'clip2', view_count: 20 },
    ]);
    expect(result.pagination.cursor).toBeDefined();
    expect(result.hasMore).toBe(true);
    expect(result.sort).toBe('views');
  });

  it('should pass the decoded Twitch cursor for view-sorted clips continuation', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'clip1' }],
        pagination: { cursor: 'raw-next' },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'clip2' }],
        pagination: { cursor: 'raw-third' },
      }),
    });

    const firstPage = await service.getClipsByLogin(
      'inumamiya',
      6,
      undefined,
      'views',
    );
    await service.getClipsByLogin(
      'inumamiya',
      6,
      firstPage.pagination.cursor,
      'views',
    );
    const requestedUrl = new URL(fetchMock.mock.calls[1][0] as string);

    expect(requestedUrl.searchParams.get('after')).toBe('raw-next');
  });

  it('should return latest clips sorted by created_at without older window requests once six are found', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'clip3', created_at: '2026-08-10T00:00:00Z' },
          { id: 'clip1', created_at: '2026-08-12T00:00:00Z' },
          { id: 'clip6', created_at: '2026-08-07T00:00:00Z' },
          { id: 'clip2', created_at: '2026-08-11T00:00:00Z' },
          { id: 'clip5', created_at: '2026-08-08T00:00:00Z' },
          { id: 'clip4', created_at: '2026-08-09T00:00:00Z' },
          { id: 'clip7', created_at: '2026-08-06T00:00:00Z' },
        ],
        pagination: {},
      }),
    });

    const result = await service.getClipsByLogin('inumamiya', 6);
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(requestedUrl.searchParams.get('first')).toBe('100');
    expect(requestedUrl.searchParams.get('started_at')).toBeTruthy();
    expect(requestedUrl.searchParams.get('ended_at')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data.map((clip) => clip.id)).toEqual([
      'clip1',
      'clip2',
      'clip3',
      'clip4',
      'clip5',
      'clip6',
    ]);
    expect(result.pagination.cursor).toBeDefined();
    expect(result.hasMore).toBe(true);
    expect(result.sort).toBe('latest');
  });

  it('should page through a latest window before sorting that window', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'clip1', created_at: '2026-08-10T00:00:00Z' }],
        pagination: { cursor: 'window-next' },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'clip2', created_at: '2026-08-11T00:00:00Z' }],
        pagination: {},
      }),
    });

    const result = await service.getClipsByLogin('inumamiya', 2);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);

    expect(secondUrl.searchParams.get('after')).toBe('window-next');
    expect(result.data.map((clip) => clip.id)).toEqual(['clip2', 'clip1']);
  });

  it('should continue latest clips from the oldest returned clip timestamp', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'clip1', created_at: '2026-08-12T00:00:00Z' },
          { id: 'clip2', created_at: '2026-08-11T00:00:00Z' },
        ],
        pagination: {},
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'clip2', created_at: '2026-08-11T00:00:00Z' },
          { id: 'clip3', created_at: '2026-08-10T00:00:00Z' },
        ],
        pagination: {},
      }),
    });

    const firstPage = await service.getClipsByLogin('inumamiya', 2);
    const secondPage = await service.getClipsByLogin(
      'inumamiya',
      1,
      firstPage.pagination.cursor,
      'latest',
    );

    expect(secondPage.data.map((clip) => clip.id)).toEqual(['clip3']);
  });

  it('should reject invalid clip continuation cursors', async () => {
    mockUserAndToken();

    await expect(
      service.getClipsByLogin('inumamiya', 6, 'not-a-cursor', 'latest'),
    ).rejects.toThrow('Invalid clip cursor');
  });

  it('should reject clip continuation cursors for another sort mode', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'clip1' }],
        pagination: { cursor: 'raw-next' },
      }),
    });

    const viewsPage = await service.getClipsByLogin(
      'inumamiya',
      6,
      undefined,
      'views',
    );

    await expect(
      service.getClipsByLogin(
        'inumamiya',
        6,
        viewsPage.pagination.cursor,
        'latest',
      ),
    ).rejects.toThrow('Invalid clip cursor');
  });

  it('should pass first and after to Twitch videos request and return pagination', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'video1' }],
        pagination: { cursor: 'next-videos' },
      }),
    });

    const result = await service.getVideosByLogin('inumamiya', 6, 'after-videos');
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(requestedUrl.searchParams.get('first')).toBe('6');
    expect(requestedUrl.searchParams.get('after')).toBe('after-videos');
    expect(requestedUrl.searchParams.get('type')).toBe('archive');
    expect(requestedUrl.searchParams.get('sort')).toBe('time');
    expect(result).toEqual({
      data: [{ id: 'video1' }],
      pagination: { cursor: 'next-videos' },
      hasMore: true,
      sort: 'latest',
    });
  });

  it('should request videos sorted by views when requested', async () => {
    mockUserAndToken();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'video1', view_count: 100 }],
        pagination: { cursor: 'next-videos' },
      }),
    });

    const result = await service.getVideosByLogin(
      'inumamiya',
      6,
      undefined,
      'views',
    );
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);

    expect(requestedUrl.searchParams.get('sort')).toBe('views');
    expect(result.sort).toBe('views');
    expect(result.pagination.cursor).toBe('next-videos');
  });
});
