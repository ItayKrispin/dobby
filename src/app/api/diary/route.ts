import { NextRequest, NextResponse } from "next/server";
import { addJobToDiary, listDiaryJobs } from "@/lib/jobs";

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get("scope") ?? "upcoming";
    const past = scope === "past";
    const jobs = await listDiaryJobs({ past });
    return NextResponse.json({ ok: true, jobs, scope: past ? "past" : "upcoming" });
  } catch (error) {
    console.error("List diary error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list diary jobs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      start?: string | null;
      end?: string | null;
      durationMinutes?: number | null;
      force?: boolean;
      replaceJobId?: string | null;
      reminderOffsets?: number[];
    };

    if (!body.jobId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "jobId is required" },
        { status: 400 },
      );
    }

    const result = await addJobToDiary(body.jobId.trim(), {
      start: body.start,
      end: body.end,
      durationMinutes: body.durationMinutes,
      force: Boolean(body.force),
      replaceJobId: body.replaceJobId,
      reminderOffsets: body.reminderOffsets as
        | import("@/types/database").ReminderOffsetMinutes[]
        | undefined,
    });

    if (!result.ok && "conflict" in result && result.conflict) {
      return NextResponse.json(
        { ok: false, conflict: true, conflicts: result.conflicts },
        { status: 409 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "error" in result ? result.error : "Failed" },
        {
          status:
            "error" in result && result.error === "Job not found" ? 404 : 400,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      job: result.job,
      replacedJob: result.replacedJob ?? null,
    });
  } catch (error) {
    console.error("Add diary error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to add job to diary" },
      { status: 500 },
    );
  }
}
