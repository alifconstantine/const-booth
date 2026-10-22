import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CASSETTES_DIR = path.join(process.cwd(), 'public', 'uploads', 'cassettes');

function ensureDir() {
  if (!fs.existsSync(CASSETTES_DIR)) {
    fs.mkdirSync(CASSETTES_DIR, { recursive: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const formData = await req.formData();
    const metaRaw = formData.get('meta') as string | null;
    const audioFile = formData.get('audio') as File | null;
    const photoFile = formData.get('photo') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'Missing audio' }, { status: 400 });
    }

    let meta: { design?: string; message?: string; date?: string; duration?: number } = {};
    if (metaRaw) {
      try {
        meta = JSON.parse(metaRaw);
      } catch (_e) {}
    }

    // Generate 32-hex character ID (required by cassette-editor regex: /^[a-f0-9]{32}$/)
    const id = crypto.randomBytes(16).toString('hex');

    // Save audio
    const audioExt = audioFile.name.split('.').pop() || 'webm';
    const audioFilename = `${id}.${audioExt}`;
    const audioPath = path.join(CASSETTES_DIR, audioFilename);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    fs.writeFileSync(audioPath, audioBuffer);

    // Save photo if present
    let photoUrl: string | null = null;
    if (photoFile && photoFile.size > 0) {
      const photoExt = photoFile.name.split('.').pop() || 'jpg';
      const photoFilename = `${id}_photo.${photoExt}`;
      const photoPath = path.join(CASSETTES_DIR, photoFilename);
      const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
      fs.writeFileSync(photoPath, photoBuffer);
      photoUrl = `/uploads/cassettes/${photoFilename}`;
    }

    const cassetteRecord = {
      id,
      design: meta.design || 'blue-side-a',
      message: meta.message || '',
      date: meta.date || '',
      duration: meta.duration || 0,
      audio: {
        url: `/uploads/cassettes/${audioFilename}`
      },
      photo: photoUrl ? { url: photoUrl } : null,
      createdAt: Date.now()
    };

    const recordPath = path.join(CASSETTES_DIR, `${id}.json`);
    fs.writeFileSync(recordPath, JSON.stringify(cassetteRecord, null, 2), 'utf8');

    return NextResponse.json({ id, success: true });
  } catch (err: any) {
    console.error('Error creating cassette:', err);
    return NextResponse.json({ error: 'Failed to create cassette' }, { status: 500 });
  }
}
