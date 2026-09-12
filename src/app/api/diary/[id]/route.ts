import { NextRequest, NextResponse } from "next/server";
import {
  clearDiarySchedule,
  scheduleDiaryJob,
} from "@/lib/jobs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      clear?: boolean;
      start?: string | null;
      end?: string | null;
      durationMinutes?: number | null;
      force?: boolean;
      replaceJobId?: string | null;
      reminderOffsets?: number[];
    };

    if (body.clear) {
      const job = await clearDiarySchedule(id);
      return NextResponse.json({ ok: true, job });
    }

    const result = await scheduleDiaryJob(id, {
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
      const message = "error" in result ? result.error : "Failed";
      const status =
        message === "Job not found"
          ? 404
          : message === "Job is not in the diary"
            ? 400
            : 400;
      return NextResponse.json({ ok: false, error: message }, { status });
    }

    return NextResponse.json({
      ok: true,
      job: result.job,
      replacedJob: result.replacedJob ?? null,
    });
  } catch (error) {
    console.error("Patch diary error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update diary job";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
