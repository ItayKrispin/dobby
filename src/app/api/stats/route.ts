import { NextRequest, NextResponse } from "next/server";
import { getOwnerStats, resolveStatsRange } from "@/lib/stats";

export async function GET(request: NextRequest) {
  try {
    const preset = request.nextUrl.searchParams.get("preset");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const range = resolveStatsRange({ preset, from, to });
    const stats = await getOwnerStats(range);
    return NextResponse.json({
      ok: true,
      preset: range.preset,
      stats,
    });
  } catch (error) {
    console.error("Stats error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load stats";
    const status = /invalid/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
