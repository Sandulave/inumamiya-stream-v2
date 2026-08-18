import {
  normalizeChapterNodes,
  parseTwitchDownloaderChapters,
} from './highlight-chapters.service';

describe('highlight chapters', () => {
  it('parses TwitchDownloader Raw chapter metadata', () => {
    const raw = [
      '[STATUS] - Fetching Video Info [1/1]',
      JSON.stringify({
        data: {
          video: {
            id: '2845984263',
            moments: {
              edges: [
                {
                  node: {
                    durationMilliseconds: 10740000,
                    positionMilliseconds: 0,
                    type: 'GAME_CHANGE',
                    description: 'Star Fox',
                    details: {
                      game: {
                        id: '123',
                        displayName: 'Star Fox',
                        boxArtURL: 'https://example.com/star-fox.jpg',
                      },
                    },
                  },
                },
                {
                  node: {
                    durationMilliseconds: 14134000,
                    positionMilliseconds: 10740000,
                    type: 'GAME_CHANGE',
                    description: 'Splatoon 3',
                    details: {
                      game: {
                        id: '456',
                        displayName: 'Splatoon 3',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    ].join('\n');

    expect(parseTwitchDownloaderChapters(raw, 24874)).toEqual([
      {
        startSeconds: 0,
        endSeconds: 10740,
        durationSeconds: 10740,
        categoryName: 'Star Fox',
        gameName: 'Star Fox',
        gameId: '123',
        type: 'GAME_CHANGE',
        title: 'Star Fox',
        thumbnailUrl: 'https://example.com/star-fox.jpg',
      },
      {
        startSeconds: 10740,
        endSeconds: 24874,
        durationSeconds: 14134,
        categoryName: 'Splatoon 3',
        gameName: 'Splatoon 3',
        gameId: '456',
        type: 'GAME_CHANGE',
        title: 'Splatoon 3',
      },
    ]);
  });

  it('fills the final chapter end from archive duration', () => {
    expect(
      normalizeChapterNodes(
        [
          {
            positionMilliseconds: 10000000,
            description: 'Late category',
            type: 'GAME_CHANGE',
          },
        ],
        15000,
      ),
    ).toEqual([
      {
        startSeconds: 10000,
        endSeconds: 15000,
        durationSeconds: 5000,
        categoryName: 'Late category',
        type: 'GAME_CHANGE',
        title: 'Late category',
      },
    ]);
  });

  it('clamps chapter end to archive duration', () => {
    expect(
      normalizeChapterNodes(
        [
          {
            positionMilliseconds: 0,
            durationMilliseconds: 20000000,
            description: 'Long category',
          },
        ],
        15000,
      ),
    ).toEqual([
      {
        startSeconds: 0,
        endSeconds: 15000,
        durationSeconds: 15000,
        categoryName: 'Long category',
        title: 'Long category',
      },
    ]);
  });

  it('returns an empty list for invalid metadata', () => {
    expect(
      normalizeChapterNodes(
        [
          {
            positionMilliseconds: 'bad',
            description: 'Broken category',
          },
          {
            positionMilliseconds: 1000,
            description: '',
          },
        ],
        100,
      ),
    ).toEqual([]);
  });

  it('merges adjacent chapters for the same category', () => {
    expect(
      normalizeChapterNodes(
        [
          {
            positionMilliseconds: 0,
            durationMilliseconds: 10000,
            description: 'Just Chatting',
            type: 'GAME_CHANGE',
          },
          {
            positionMilliseconds: 10000,
            durationMilliseconds: 10000,
            description: 'Just Chatting',
            type: 'GAME_CHANGE',
          },
        ],
        20,
      ),
    ).toEqual([
      {
        startSeconds: 0,
        endSeconds: 20,
        durationSeconds: 20,
        categoryName: 'Just Chatting',
        type: 'GAME_CHANGE',
        title: 'Just Chatting',
      },
    ]);
  });
});
