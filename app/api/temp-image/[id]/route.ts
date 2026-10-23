import { NextResponse } from 'next/server';
import { getTempImage } from '../../temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://knowing-barracuda-495.convex.cloud';
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let item = getTempImage(id);

  if (!item && convex) {
    try {
      const storageUrl = await convex.query(api.booths.getTempImageUrl, { imageId: id });
      if (storageUrl) {
        const fetchRes = await fetch(storageUrl);
        if (fetchRes.ok) {
          const arrayBuffer = await fetchRes.arrayBuffer();
          const contentType = fetchRes.headers.get('content-type') || 'image/png';
          item = {
            buffer: Buffer.from(arrayBuffer),
            contentType,
            expiresAt: Date.now() + 60000
          };
        }
      }
    } catch (_e) {}
  }

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
