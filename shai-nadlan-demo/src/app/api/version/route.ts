import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The deployed commit — FreshnessGuard polls this to detect a new deploy. */
export async function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
