import { NextRequest, NextResponse } from 'next/server';
import { getCassettePhoto } from '../../../cassette-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const photo = await getCassettePhoto(id);
    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(photo.buffer), {
      status: 200,
      headers: {
        'Content-Type': photo.contentType || 'image/jpeg',
        'Content-Length': String(photo.buffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    console.error('Error fetching cassette photo:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
