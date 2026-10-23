import { NextRequest, NextResponse } from 'next/server';
import { getCassette } from '../../cassette-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const record = await getCassette(id);
    if (!record) {
      return NextResponse.json({ error: 'Cassette not found' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (err: any) {
    console.error('Error fetching cassette:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
