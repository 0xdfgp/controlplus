import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures',
);

/** ADR-024's device-side bound. Beyond it the token cost stops being comparable. */
const MAX_IMAGE_LONG_EDGE = 1568;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface TextFixture {
  readonly id: string;
  readonly kind: 'text';
  readonly label: string;
  readonly question: string;
}

export interface ImageFixture {
  readonly id: string;
  readonly kind: 'image';
  readonly label: string;
  readonly question: string;
  readonly attachment: string;
}

export interface VoiceFixture {
  readonly id: string;
  readonly kind: 'voice';
  readonly label: string;
  readonly audio: string;
  readonly script: string;
}

export interface FollowUpFixture {
  readonly id: string;
  readonly kind: 'follow-up';
  readonly label: string;
  readonly question: string;
  readonly dependsOn: string;
}

export type Fixture = TextFixture | ImageFixture | VoiceFixture | FollowUpFixture;

export interface FixtureSet {
  readonly version: string;
  readonly fixtures: readonly Fixture[];
}

export function loadFixtures(): FixtureSet {
  const raw = readFileSync(path.join(FIXTURES_DIR, 'questions.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('fixtures' in parsed) ||
    !Array.isArray((parsed as FixtureSet).fixtures)
  ) {
    throw new Error('fixtures/questions.json is not a fixture set.');
  }
  return parsed as FixtureSet;
}

export function fixturePath(relative: string): string {
  return path.join(FIXTURES_DIR, relative);
}

export interface LoadedImage {
  readonly data: string;
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/**
 * Reads the screenshot and refuses it if it is outside what the product would
 * ever send.
 *
 * The harness enforces ADR-024's bounds rather than performing the resize,
 * because the resize happens on the device and re-implementing it here would
 * measure the harness's resampler rather than the provider. A fixture already
 * inside the bounds is sent as captured, and the results file records its
 * dimensions and byte size so the input tokens are attributable to something.
 */
export function loadImage(relative: string): LoadedImage {
  const file = fixturePath(relative);
  const bytes = readFileSync(file);
  const { width, height } = pngDimensions(bytes, file);

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `${relative} is ${bytes.byteLength} bytes, over the ${MAX_IMAGE_BYTES} byte limit in ADR-024.`,
    );
  }
  if (Math.max(width, height) > MAX_IMAGE_LONG_EDGE) {
    throw new Error(
      `${relative} is ${width}x${height}. ADR-024 resizes to ${MAX_IMAGE_LONG_EDGE}px on the long edge before upload, ` +
        'so a larger fixture would not cost what the product costs. Resize it and re-run.',
    );
  }

  return {
    data: bytes.toString('base64'),
    mediaType: 'image/png',
    width,
    height,
    bytes: bytes.byteLength,
  };
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

function pngDimensions(bytes: Buffer, file: string): {
  readonly width: number;
  readonly height: number;
} {
  if (bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error(
      `${file} is not a PNG. The harness reads dimensions from the PNG header so it can enforce ADR-024's bound; ` +
        'convert the fixture to PNG rather than skipping the check.',
    );
  }
  // IHDR is always the first chunk: 8 byte signature, 4 byte length, 4 byte
  // type, then width and height as big-endian 32 bit integers.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export interface LoadedAudio {
  readonly data: string;
  readonly mediaType: string;
  readonly fileName: string;
  readonly seconds: number;
  readonly bytes: number;
}

/**
 * Reads the recording and measures its duration from the WAV header.
 *
 * Duration is measured here rather than taken from the provider, because it is
 * a property of the file we supplied and transcription is billed by the minute
 * (ADR-011). A ledger line computed from the provider's own report of what it
 * charged us for would not be an independent check of anything.
 */
export function loadAudio(relative: string): LoadedAudio {
  const file = fixturePath(relative);
  const bytes = readFileSync(file);
  return {
    data: bytes.toString('base64'),
    mediaType: 'audio/wav',
    fileName: path.basename(file),
    seconds: wavSeconds(bytes, file),
    bytes: bytes.byteLength,
  };
}

function wavSeconds(bytes: Buffer, file: string): number {
  if (
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    throw new Error(`${file} is not a RIFF/WAVE file.`);
  }

  // Walk the chunks rather than assuming a 44 byte header: writers are free to
  // insert LIST or fact chunks, and an assumed offset would silently mis-read
  // the sample rate and hand the cost ledger a wrong number of seconds.
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = bytes.subarray(offset, offset + 4).toString('ascii');
    const declared = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      byteRate = bytes.readUInt32LE(offset + 16);
    }
    if (id === 'data' && byteRate > 0) {
      // A streamed writer does not know the length when it writes the header,
      // so it puts a placeholder there. OpenAI's speech endpoint emits
      // 0xFFFFFFFF, and taking it at face value produced 89,478 seconds of
      // audio from a 21 second file and a transcription bill three orders of
      // magnitude too large. Trust the bytes actually present over the bytes
      // the header claims.
      const remaining = bytes.byteLength - (offset + 8);
      const actual = declared > remaining ? remaining : declared;
      return actual / byteRate;
    }
    if (declared > bytes.byteLength) {
      break;
    }
    offset += 8 + declared + (declared % 2);
  }
  throw new Error(`${file} has no readable fmt/data chunk pair.`);
}
