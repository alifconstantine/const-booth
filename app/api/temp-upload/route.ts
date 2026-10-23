import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { saveTempImage } from '../temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dataUrl = body?.image;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    }

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: 'Invalid data URL format' }, { status: 400 });
    }

    const contentType = matches[1] || 'image/png';
    const buffer = Buffer.from(matches[2], 'base64');
    const id = crypto.randomBytes(8).toString('hex');

    saveTempImage(id, buffer, contentType);

    if (convex) {
      try {
        const uploadUrl = await convex.mutation(api.booths.generateUploadUrl, {});
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: buffer
        });
        if (uploadRes.ok) {
          const { storageId } = await uploadRes.json();
          await convex.mutation(api.booths.saveTempImage, {
            imageId: id,
            storageId,
            contentType
          });
        }
      } catch (convexErr) {
        console.warn('[Convex Upload] Fallback to local:', convexErr);
      }
    }

    return NextResponse.json({
      id,
      url: `/api/temp-image/${id}`
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}
