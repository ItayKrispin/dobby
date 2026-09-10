import { NextRequest, NextResponse } from "next/server";
import { listJobs, updateJobStatus } from "@/lib/jobs";
import type { JobStatus } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const openOnly = request.nextUrl.searchParams.get("open") !== "0";
    const jobs = await listJobs({ openOnly });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    console.error("List jobs error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list jobs" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; status?: JobStatus };
    if (!body.id || !body.status) {
      return NextResponse.json(
        { ok: false, error: "id and status are required" },
        { status: 400 },
      );
    }
    const job = await updateJobStatus(body.id, body.status);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("Update job error:", error);
    const message = error instanceof Error ? error.message : "Failed to update job";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
