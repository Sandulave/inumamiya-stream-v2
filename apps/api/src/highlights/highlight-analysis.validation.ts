import { InternalServerErrorException } from '@nestjs/common';
import { HighlightAnalysis, MomentCandidate } from './highlight-analysis.types';

export function parseHighlightAnalysisJson(
  raw: string,
  source: string,
  expectedVodId?: string,
): HighlightAnalysis {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new InternalServerErrorException(
      `Highlight analysis JSON is invalid: ${source}`,
      { cause: error },
    );
  }

  return validateHighlightAnalysis(parsed, source, expectedVodId);
}

export function validateHighlightAnalysis(
  value: unknown,
  source: string,
  expectedVodId?: string,
): HighlightAnalysis {
  if (!isRecord(value)) {
    throw new InternalServerErrorException(
      `Highlight analysis JSON root must be an object: ${source}`,
    );
  }

  if (typeof value.vodId !== 'string' || value.vodId.length === 0) {
    throw new InternalServerErrorException(
      `Highlight analysis JSON must contain string vodId: ${source}`,
    );
  }

  if (expectedVodId !== undefined && value.vodId !== expectedVodId) {
    throw new InternalServerErrorException(
      `Highlight analysis JSON vodId mismatch: expected=${expectedVodId}`,
    );
  }

  if (!Array.isArray(value.momentCandidates)) {
    throw new InternalServerErrorException(
      `Highlight analysis JSON must contain momentCandidates array: ${source}`,
    );
  }

  const candidates = value.momentCandidates.map((candidate, index) =>
    validateMomentCandidate(candidate, source, index),
  );

  return {
    ...value,
    vodId: value.vodId,
    momentCandidates: candidates,
  };
}

function validateMomentCandidate(
  value: unknown,
  source: string,
  index: number,
): MomentCandidate {
  if (!isRecord(value)) {
    throw new InternalServerErrorException(
      `momentCandidates[${index}] must be an object: ${source}`,
    );
  }

  for (const field of ['timestampSeconds', 'audioScore', 'chatScore']) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      throw new InternalServerErrorException(
        `momentCandidates[${index}].${field} must be a finite number: ${source}`,
      );
    }
  }

  return value as MomentCandidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
