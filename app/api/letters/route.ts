import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LETTERS_DIR = path.join(process.cwd(), '.next', 'letters-data');

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

    const filePath = path.join(LETTERS_DIR, `${id}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        id,
        paper: paper || 'cream',
        pages,
        createdAt: Date.now()
      }),
      'utf8'
    );

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

  ensureDir();
  const filePath = path.join(LETTERS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return NextResponse.json(data);
  } catch (_e) {
    return NextResponse.json({ error: 'Failed to read letter' }, { status: 500 });
  }
}
