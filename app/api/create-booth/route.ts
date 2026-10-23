import { NextResponse } from 'next/server';
import { saveBoothState } from '../temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(req: Request) {
  let outputMode = 'strip';
  try {
    const body = await req.json();
    if (body?.outputMode) {
      outputMode = body.outputMode;
    }
  } catch (_e) {}

  // Crockford Base32 alphabet: excludes 0, 1, I, O to prevent ambiguity & regex rejections
  const characters = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let boothId = '';
  for (let i = 0; i < 6; i++) {
    boothId += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  saveBoothState(boothId, { outputMode });

  if (convex) {
    try {
      await convex.mutation(api.booths.createBooth, {
        boothId,
        outputMode,
      });
    } catch (_e) {}
  }

  return NextResponse.json({ boothId, exists: true, outputMode });
}

export async function GET() {
  return NextResponse.json({ exists: true });
}
