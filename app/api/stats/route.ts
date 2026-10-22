import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    totalPhotos: 2489200,
    totalUsers: 1120400,
    totalBooths: 630100,
    activeUsers: 254
  });
}
