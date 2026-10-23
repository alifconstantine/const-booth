import { NextResponse } from 'next/server';
import { saveBoothState } from '../temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://knowing-barracuda-495.convex.cloud';
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.boothId) {
      const state = {
        outputMode: body.outputMode || 'strip',
        stripStyle: body.stripStyle,
        template: body.template,
        cardLayout: body.cardLayout,
        photoCount: body.photoCount || (body.template?.slotsCount)
      };

      saveBoothState(body.boothId, state);

      if (convex) {
        try {
          await convex.mutation(api.booths.updateBoothState, {
            boothId: body.boothId,
            state
          });
        } catch (_e) {}
      }
    }
  } catch (_e) {}
  return NextResponse.json({ ok: true });
}
