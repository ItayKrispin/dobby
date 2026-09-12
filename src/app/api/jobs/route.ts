import { NextRequest, NextResponse } from "next/server";
import {
  cancelJob,
  completeJob,
  listJobs,
  restoreJob,
  updateJobStatus,
} from "@/lib/jobs";
import type { JobStatus } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status");
    const archiveOnly = status === "archive" || status === "closed";
    const inProgressOnly = status === "owner_handling";
    const openOnly =
      !archiveOnly &&
      !inProgressOnly &&
      request.nextUrl.searchParams.get("open") !== "0";
    const jobs = await listJobs({ openOnly, archiveOnly, inProgressOnly });
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
    const body = (await request.json()) as {
      id?: string;
      status?: JobStatus;
      action?: "restore" | "complete" | "cancel";
      paymentAmount?: number | null;
      paymentIncludesVat?: boolean;
    };
    if (!body.id) {
      return NextResponse.json(
        { ok: false, error: "id is required" },
        { status: 400 },
      );
    }

    if (body.action === "restore") {
      const job = await restoreJob(body.id);
      return NextResponse.json({ ok: true, job });
    }

    if (body.action === "complete" || body.status === "completed") {
      const job = await completeJob(body.id, {
        paymentAmount: body.paymentAmount,
        paymentIncludesVat: body.paymentIncludesVat,
      });
      return NextResponse.json({ ok: true, job });
    }

    if (body.action === "cancel" || body.status === "cancelled") {
      const job = await cancelJob(body.id);
      return NextResponse.json({ ok: true, job });
    }

    if (!body.status) {
      return NextResponse.json(
        { ok: false, error: "id and status are required" },
        { status: 400 },
      );
    }
    const job = await updateJobStatus(body.id, body.status);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("Update job error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update job";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
