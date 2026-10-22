import { NextResponse } from 'next/server';

export async function POST() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let boothId = '';
  for (let i = 0; i < 6; i++) {
    boothId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return NextResponse.json({ boothId, exists: true });
}

export async function GET() {
  return NextResponse.json({ exists: true });
}
