import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LETTERS_DIR = path.join(process.cwd(), 'data', 'letters-data');
const memoryCache = new Map<string, any>();

function ensureDir() {
  if (!fs.existsSync(LETTERS_DIR)) {
    fs.mkdirSync(LETTERS_DIR, { recursive: true });
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
    ensureDir();

    const letterData = {
      id,
      paper: paper || 'cream',
      pages,
      createdAt: Date.now()
    };

    memoryCache.set(id, letterData);

    const filePath = path.join(LETTERS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(letterData), 'utf8');

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

  if (memoryCache.has(id)) {
    return NextResponse.json(memoryCache.get(id));
  }

  ensureDir();
  const filePath = path.join(LETTERS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    // Check old directory if exists
    const oldPath = path.join(process.cwd(), '.next', 'letters-data', `${id}.json`);
    if (fs.existsSync(oldPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
        memoryCache.set(id, oldData);
        fs.writeFileSync(filePath, JSON.stringify(oldData), 'utf8');
        return NextResponse.json(oldData);
      } catch (_e) {}
    }
    return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    memoryCache.set(id, data);
    return NextResponse.json(data);
  } catch (_e) {
    return NextResponse.json({ error: 'Failed to read letter' }, { status: 500 });
  }
}
