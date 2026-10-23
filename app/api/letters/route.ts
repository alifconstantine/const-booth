import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface LetterRecord {
  id: string;
  paper: string;
  pages: string[];
  createdAt: number;
}

const DATA_LETTERS_DIR = path.join(process.cwd(), 'data', 'letters-data');
const LEGACY_LETTERS_DIR = path.join(process.cwd(), '.next', 'letters-data');
const TMP_LETTERS_DIR = path.join(os.tmpdir(), 'constbooth_letters');

const globalForLetters = globalThis as unknown as {
  _letterStore?: Map<string, LetterRecord>;
};

export const letterStore = globalForLetters._letterStore || new Map<string, LetterRecord>();

if (process.env.NODE_ENV !== 'production') {
  globalForLetters._letterStore = letterStore;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pages, paper } = body;

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'Invalid pages' }, { status: 400 });
    }

    const id = crypto.randomBytes(6).toString('base64url');
    const record: LetterRecord = {
      id,
      paper: paper || 'cream',
      pages,
      createdAt: Date.now()
    };

    // 1. Save in memory
    letterStore.set(id, record);

    // 2. Save in data/letters-data
    if (ensureDirSafe(DATA_LETTERS_DIR)) {
      try {
        fs.writeFileSync(path.join(DATA_LETTERS_DIR, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
      } catch (_e) {}
    }

    // 3. Save in /tmp (always writable in serverless / Vercel)
    if (ensureDirSafe(TMP_LETTERS_DIR)) {
      try {
        fs.writeFileSync(path.join(TMP_LETTERS_DIR, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
      } catch (_e) {}
    }

    return NextResponse.json({ id, success: true });
  } catch (err: any) {
    console.error('Error saving letter:', err);
    return NextResponse.json({ error: 'Failed to save letter' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  // 1. Check memory
  const fromMemory = letterStore.get(id);
  if (fromMemory) {
    return NextResponse.json(fromMemory);
  }

  // 2. Check data/letters-data
  try {
    const dataPath = path.join(DATA_LETTERS_DIR, `${id}.json`);
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      letterStore.set(id, data);
      return NextResponse.json(data);
    }
  } catch (_e) {}

  // 3. Check /tmp
  try {
    const tmpPath = path.join(TMP_LETTERS_DIR, `${id}.json`);
    if (fs.existsSync(tmpPath)) {
      const data = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
      letterStore.set(id, data);
      return NextResponse.json(data);
    }
  } catch (_e) {}

  // 4. Check legacy dir
  try {
    const legacyPath = path.join(LEGACY_LETTERS_DIR, `${id}.json`);
    if (fs.existsSync(legacyPath)) {
      const data = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      letterStore.set(id, data);
      return NextResponse.json(data);
    }
  } catch (_e) {}

  return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
}
