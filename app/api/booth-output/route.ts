import { NextResponse } from 'next/server';
import { saveBoothState } from '../temp-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.boothId) {
      saveBoothState(body.boothId, {
        outputMode: body.outputMode || 'strip',
        stripStyle: body.stripStyle,
        template: body.template,
        cardLayout: body.cardLayout,
        photoCount: body.photoCount || (body.template?.slotsCount)
      });
    }
  } catch (_e) {}
  return NextResponse.json({ ok: true });
}
