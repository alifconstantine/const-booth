import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CassetteRecord {
  id: string;
  design: string;
  message: string;
  date: string;
  duration: number;
  audio: {
    url: string;
  };
  photo: {
    url: string;
  } | null;
  createdAt: number;
}

export interface CassetteMedia {
  audioBuffer: Buffer;
  audioContentType: string;
  photoBuffer?: Buffer | null;
  photoContentType?: string | null;
}

const PUBLIC_CASSETTES_DIR = path.join(process.cwd(), 'public', 'uploads', 'cassettes');
const TMP_CASSETTES_DIR = path.join(os.tmpdir(), 'constbooth_cassettes');

const globalForCassettes = globalThis as unknown as {
  _cassetteStore?: Map<string, CassetteRecord>;
  _cassetteMediaStore?: Map<string, CassetteMedia>;
};

export const cassetteStore = globalForCassettes._cassetteStore || new Map<string, CassetteRecord>();
export const cassetteMediaStore = globalForCassettes._cassetteMediaStore || new Map<string, CassetteMedia>();

if (process.env.NODE_ENV !== 'production') {
  globalForCassettes._cassetteStore = cassetteStore;
  globalForCassettes._cassetteMediaStore = cassetteMediaStore;
}

function ensureDirSafe(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (_e) {
    return false;
  }
}

function getAudioContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'webm': return 'audio/webm';
    case 'm4a':
    case 'mp4': return 'audio/mp4';
    case 'ogg': return 'audio/ogg';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    default: return 'audio/webm';
  }
}

function getImageContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    default: return 'image/jpeg';
  }
}

export async function saveCassette(
  id: string,
  record: CassetteRecord,
  audioBuffer: Buffer,
  audioExt: string,
  photoBuffer?: Buffer | null,
  photoExt?: string | null
): Promise<void> {
  const normalizedId = id.toLowerCase();
  const audioContentType = getAudioContentType(`file.${audioExt}`);
  const photoContentType = photoBuffer && photoExt ? getImageContentType(`file.${photoExt}`) : null;

  // 1. Save in memory
  cassetteStore.set(normalizedId, record);
  cassetteMediaStore.set(normalizedId, {
    audioBuffer,
    audioContentType,
    photoBuffer: photoBuffer || null,
    photoContentType
  });

  // 2. Persist to tmp directory (always writable on serverless / Linux)
  if (ensureDirSafe(TMP_CASSETTES_DIR)) {
    try {
      fs.writeFileSync(path.join(TMP_CASSETTES_DIR, `${normalizedId}.json`), JSON.stringify(record, null, 2), 'utf8');
      fs.writeFileSync(path.join(TMP_CASSETTES_DIR, `${normalizedId}.${audioExt}`), audioBuffer);
      if (photoBuffer && photoExt) {
        fs.writeFileSync(path.join(TMP_CASSETTES_DIR, `${normalizedId}_photo.${photoExt}`), photoBuffer);
      }
    } catch (e) {
      console.warn('[CassetteStore] Failed to write to tmp dir:', e);
    }
  }

  // 3. Persist to public/uploads directory if writable (for local dev and standard servers)
  if (ensureDirSafe(PUBLIC_CASSETTES_DIR)) {
    try {
      fs.writeFileSync(path.join(PUBLIC_CASSETTES_DIR, `${normalizedId}.json`), JSON.stringify(record, null, 2), 'utf8');
      fs.writeFileSync(path.join(PUBLIC_CASSETTES_DIR, `${normalizedId}.${audioExt}`), audioBuffer);
      if (photoBuffer && photoExt) {
        fs.writeFileSync(path.join(PUBLIC_CASSETTES_DIR, `${normalizedId}_photo.${photoExt}`), photoBuffer);
      }
    } catch (_e) {
      // Ignored if read-only filesystem (e.g. Vercel)
    }
  }
}

export async function getCassette(id: string): Promise<CassetteRecord | null> {
  const normalizedId = id.toLowerCase();

  // 1. Check memory
  const fromMemory = cassetteStore.get(normalizedId);
  if (fromMemory) return fromMemory;

  // 2. Check public directory
  try {
    const publicPath = path.join(PUBLIC_CASSETTES_DIR, `${normalizedId}.json`);
    if (fs.existsSync(publicPath)) {
      const data = JSON.parse(fs.readFileSync(publicPath, 'utf8')) as CassetteRecord;
      cassetteStore.set(normalizedId, data);
      return data;
    }
  } catch (_e) {}

  // 3. Check tmp directory
  try {
    const tmpPath = path.join(TMP_CASSETTES_DIR, `${normalizedId}.json`);
    if (fs.existsSync(tmpPath)) {
      const data = JSON.parse(fs.readFileSync(tmpPath, 'utf8')) as CassetteRecord;
      cassetteStore.set(normalizedId, data);
      return data;
    }
  } catch (_e) {}

  return null;
}

export async function getCassetteAudio(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const normalizedId = id.toLowerCase();

  // 1. Check memory
  const media = cassetteMediaStore.get(normalizedId);
  if (media && media.audioBuffer) {
    return {
      buffer: media.audioBuffer,
      contentType: media.audioContentType
    };
  }

  // Helper to scan directory for matching id.* audio file
  const findAudioInDir = (dir: string): { buffer: Buffer; contentType: string } | null => {
    try {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.startsWith(`${normalizedId}.`) && !f.includes('_photo.'));
      if (match) {
        const filePath = path.join(dir, match);
        const buffer = fs.readFileSync(filePath);
        const contentType = getAudioContentType(match);
        return { buffer, contentType };
      }
    } catch (_e) {}
    return null;
  };

  // 2. Check public dir
  const fromPublic = findAudioInDir(PUBLIC_CASSETTES_DIR);
  if (fromPublic) {
    if (media) {
      media.audioBuffer = fromPublic.buffer;
      media.audioContentType = fromPublic.contentType;
    } else {
      cassetteMediaStore.set(normalizedId, {
        audioBuffer: fromPublic.buffer,
        audioContentType: fromPublic.contentType
      });
    }
    return fromPublic;
  }

  // 3. Check tmp dir
  const fromTmp = findAudioInDir(TMP_CASSETTES_DIR);
  if (fromTmp) {
    if (media) {
      media.audioBuffer = fromTmp.buffer;
      media.audioContentType = fromTmp.contentType;
    } else {
      cassetteMediaStore.set(normalizedId, {
        audioBuffer: fromTmp.buffer,
        audioContentType: fromTmp.contentType
      });
    }
    return fromTmp;
  }

  return null;
}

export async function getCassettePhoto(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const normalizedId = id.toLowerCase();

  // 1. Check memory
  const media = cassetteMediaStore.get(normalizedId);
  if (media && media.photoBuffer) {
    return {
      buffer: media.photoBuffer,
      contentType: media.photoContentType || 'image/jpeg'
    };
  }

  // Helper to scan directory for matching id_photo.* file
  const findPhotoInDir = (dir: string): { buffer: Buffer; contentType: string } | null => {
    try {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.startsWith(`${normalizedId}_photo.`));
      if (match) {
        const filePath = path.join(dir, match);
        const buffer = fs.readFileSync(filePath);
        const contentType = getImageContentType(match);
        return { buffer, contentType };
      }
    } catch (_e) {}
    return null;
  };

  const fromPublic = findPhotoInDir(PUBLIC_CASSETTES_DIR);
  if (fromPublic) return fromPublic;

  const fromTmp = findPhotoInDir(TMP_CASSETTES_DIR);
  if (fromTmp) return fromTmp;

  return null;
}
