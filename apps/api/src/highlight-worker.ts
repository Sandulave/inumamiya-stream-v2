import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  HighlightWorkerMode,
  HighlightWorkerService,
} from './highlights/highlight-worker.service';

function parseMaxVods(argv: string[]): number | undefined {
  const flagIndex = argv.indexOf('--max-vods');

  if (flagIndex === -1) {
    return undefined;
  }

  const value = argv[flagIndex + 1];
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('--max-vods must be a positive integer');
  }

  return parsed;
}

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

function parseMode(argv: string[]): HighlightWorkerMode {
  const equalsArg = argv.find((arg) => arg.startsWith('--mode='));
  const modeIndex = argv.indexOf('--mode');
  const rawMode =
    equalsArg?.replace('--mode=', '') ??
    (modeIndex === -1 ? undefined : argv[modeIndex + 1]);

  if (rawMode === undefined || rawMode === 'server') {
    return 'server-incremental';
  }

  if (
    rawMode === 'analyze-missing-all' ||
    rawMode === 'missing-all' ||
    rawMode === 'local-analyze-missing-all'
  ) {
    return 'local-analyze-missing-all';
  }

  if (rawMode === 'reanalyze-all' || rawMode === 'local-reanalyze-all') {
    return 'local-reanalyze-all';
  }

  throw new Error(
    '--mode must be server, analyze-missing-all, or reanalyze-all',
  );
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const worker = app.get(HighlightWorkerService);
    const argv = process.argv.slice(2);
    const summary = await worker.run({
      maxVods: parseMaxVods(argv),
      dryRun: parseDryRun(argv),
      mode: parseMode(argv),
    });

    if (summary.failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('[Highlight Worker] failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
