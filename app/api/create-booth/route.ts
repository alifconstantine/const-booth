import { NextResponse } from 'next/server';
import { saveBoothState } from '../temp-store';

export async function POST(req: Request) {
  let outputMode = 'strip';
  try {
    const body = await req.json();
    if (body?.outputMode) {
      outputMode = body.outputMode;
    }
  } catch (_e) {}

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let boothId = '';
  for (let i = 0; i < 6; i++) {
    boothId += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  saveBoothState(boothId, { outputMode });

  return NextResponse.json({ boothId, exists: true, outputMode });
}

export async function GET() {
  return NextResponse.json({ exists: true });
}
