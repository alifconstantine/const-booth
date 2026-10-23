import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { saveCassette, CassetteRecord } from '../cassette-store';

export async function POST(req: NextRequest) {
  try {
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
    const id = crypto.randomBytes(16).toString('hex').toLowerCase();

    // Prepare audio buffer and extension
    const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'webm';
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Prepare photo buffer and extension if present
    let photoBuffer: Buffer | null = null;
    let photoExt: string | null = null;
    if (photoFile && photoFile.size > 0) {
      photoExt = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      photoBuffer = Buffer.from(await photoFile.arrayBuffer());
    }

    const cassetteRecord: CassetteRecord = {
      id,
      design: meta.design || 'blue-side-a',
      message: meta.message || '',
      date: meta.date || '',
      duration: meta.duration || 0,
      audio: {
        url: `/api/cassettes/${id}/audio`
      },
      photo: photoBuffer ? { url: `/api/cassettes/${id}/photo` } : null,
      createdAt: Date.now()
    };

    await saveCassette(id, cassetteRecord, audioBuffer, audioExt, photoBuffer, photoExt);

    return NextResponse.json({ id, success: true });
  } catch (err: any) {
    console.error('Error creating cassette:', err);
    return NextResponse.json({ error: 'Failed to create cassette' }, { status: 500 });
  }
}
