import { NextResponse } from "next/server";

// Keep the Supabase free-tier project from auto-pausing after 7 days of
// inactivity. Triggered daily by a Vercel Cron job (see vercel.json).
// A single lightweight read counts as DB activity — no data is mutated.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // If CRON_SECRET is configured, only allow Vercel's authenticated cron call.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }

  try {
    // Trivial read that reaches PostgREST -> Postgres, registering activity.
    // `groups` is anon-readable; the row count is irrelevant — the query
    // itself is what keeps the project from auto-pausing.
    const res = await fetch(`${url}/rest/v1/groups?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
