import { NextResponse } from "next/server";

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  return NextResponse.json({ url, key }, { headers: { "Cache-Control": "public, max-age=300" } });
}
