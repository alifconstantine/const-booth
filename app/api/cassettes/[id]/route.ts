import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CASSETTES_DIR = path.join(process.cwd(), 'public', 'uploads', 'cassettes');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const recordPath = path.join(CASSETTES_DIR, `${id}.json`);
    if (!fs.existsSync(recordPath)) {
      return NextResponse.json({ error: 'Cassette not found' }, { status: 404 });
    }

    const data = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Error fetching cassette:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
