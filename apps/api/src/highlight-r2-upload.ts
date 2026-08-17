import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HighlightStorageService } from './highlights/highlight-storage.service';

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const storage = app.get(HighlightStorageService);
    const dryRun = parseDryRun(process.argv.slice(2));
    const { valid, invalid } = await storage.collectLocalUploadCandidates();

    console.log('[Highlight R2 Upload]');
    console.log(`Mode        : ${dryRun ? 'dry-run' : 'upload'}`);
    console.log(`Source      : ${storage.getLocalAnalysisDirectory()}`);
    console.log(`Valid files : ${valid.length}`);
    console.log(`Invalid     : ${invalid.length}`);

    if (valid.length > 0) {
      console.log('Upload targets:');
      for (const candidate of valid) {
        console.log(
          `- ${candidate.vodId} -> ${storage.getAnalysisObjectKey(candidate.vodId)}`,
        );
      }
    }

    if (invalid.length > 0) {
      console.log('Invalid/skipped files:');
      for (const file of invalid) {
        console.log(`- ${file.filePath}`);
        console.log(`  ${file.reason}`);
      }
    }

    if (dryRun) {
      console.log('Dry run: no R2 writes will be performed.');
      return;
    }

    if (!storage.isR2Enabled()) {
      throw new Error(
        'R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.',
      );
    }

    for (const candidate of valid) {
      const key = await storage.putAnalysisJsonToR2(
        candidate.vodId,
        candidate.raw,
      );
      console.log(`Uploaded: ${key}`);
    }

    console.log('Highlight R2 upload completed.');
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('[Highlight R2 Upload] failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
