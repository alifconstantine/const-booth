import { NextResponse } from 'next/server';
import { getBoothState } from '../../temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://knowing-barracuda-495.convex.cloud';
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let booth: any = null;

  if (convex) {
    try {
      booth = await convex.query(api.booths.getBooth, { boothId: id });
    } catch (_e) {}
  }

  if (!booth) {
    booth = getBoothState(id);
  }

  const outputMode = booth?.outputMode || 'strip';
  const cardLayout = booth?.cardLayout || (outputMode === 'card' ? 'single' : undefined);

  return NextResponse.json({
    exists: true,
    full: false,
    expired: false,
    boothId: id,
    outputMode,
    cardLayout,
    stripStyle: booth?.stripStyle,
    template: booth?.template,
    photoCount: booth?.photoCount || booth?.template?.slotsCount || 3
  });
}
