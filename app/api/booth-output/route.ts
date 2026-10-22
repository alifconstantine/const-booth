import { NextResponse } from 'next/server';
import { saveBoothState } from '../temp-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.boothId && body?.outputMode) {
      saveBoothState(body.boothId, { outputMode: body.outputMode });
    }
  } catch (_e) {}
  return NextResponse.json({ ok: true });
}
