import { NextResponse } from 'next/server';
import { getTempImage } from '../../temp-store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = getTempImage(id);
  if (!item) {
    return new NextResponse('Image not found or expired', { status: 404 });
  }

  const url = new URL(request.url);
  const dl = url.searchParams.get('dl');
  const ext = item.contentType.includes('jpeg') ? 'jpg' : 'png';
  const filename = `constbooth-${id.slice(0, 6)}.${ext}`;

  const headers = new Headers();
  headers.set('Content-Type', item.contentType);
  headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  headers.set('Content-Length', String(item.buffer.length));

  if (dl === '1') {
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  } else {
    headers.set('Content-Disposition', `inline; filename="${filename}"`);
  }

  return new NextResponse(new Uint8Array(item.buffer), {
    status: 200,
    headers
  });
}
