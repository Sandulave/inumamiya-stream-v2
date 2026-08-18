import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HighlightStorageService } from './highlights/highlight-storage.service';

type Options = {
  dryRun: boolean;
  vodId?: string;
  maxVods?: number;
};

function parseOptions(argv: string[]): Options {
  const options: Options = { dryRun: argv.includes('--dry-run') };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--vod-id') {
      options.vodId = argv[index + 1];
    }

    if (argv[index] === '--max-vods') {
      const parsed = Number(argv[index + 1]);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.maxVods = parsed;
      }
    }
  }

  return options;
}

async function bootstrap() {
  const options = parseOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const storage = app.get(HighlightStorageService);
    const { valid, invalid } = await storage.collectLocalUploadCandidates();
    const filtered = valid
      .filter((candidate) => !options.vodId || candidate.vodId === options.vodId)
      .slice(0, options.maxVods);

    console.log('[Highlight Enrich]');
    console.log(`Mode        : ${options.dryRun ? 'dry-run' : 'not-implemented'}`);
    console.log(`Source      : ${storage.getLocalAnalysisDirectory()}`);
    console.log(`Candidates  : ${filtered.length}`);
    console.log(`Invalid JSON: ${invalid.length}`);

    for (const candidate of filtered) {
      console.log(`- ${candidate.vodId}`);
    }

    if (!options.dryRun) {
      throw new Error(
        'highlight:enrich currently supports only --dry-run. Thumbnail backfill download/generation is intentionally not enabled yet.',
      );
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('[Highlight Enrich] failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
