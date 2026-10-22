import { NextResponse } from 'next/server';
import { getBoothState } from '../../temp-store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const booth = getBoothState(id);
  const outputMode = booth?.outputMode || 'strip';
  const cardLayout = outputMode === 'card' ? 'single' : undefined;

  return NextResponse.json({
    exists: true,
    full: false,
    expired: false,
    boothId: id,
    outputMode,
    cardLayout
  });
}
