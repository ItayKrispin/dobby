import { NextResponse } from "next/server";
import { getGoogleCalendarStatus } from "@/lib/google/auth";
import { createCalendarEvent } from "@/lib/google/calendar";
import { getJobById, setJobGoogleEventId } from "@/lib/jobs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const job = await getJobById(id);
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job not found" },
        { status: 404 },
      );
    }
    if (!job.inDiary) {
      return NextResponse.json(
        { ok: false, error: "Job is not in the diary" },
        { status: 400 },
      );
    }
    if (!job.scheduledStart) {
      return NextResponse.json(
        { ok: false, error: "Job has no scheduled time" },
        { status: 400 },
      );
    }
    if (job.googleEventId) {
      return NextResponse.json(
        { ok: false, error: "Job already has a Google Calendar event" },
        { status: 409 },
      );
    }

    const status = await getGoogleCalendarStatus();
    if (!status.connected) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Google Calendar אינו מחובר. חברו אותו בהגדרות העסק.",
        },
        { status: 400 },
      );
    }

    const customer = job.customerName?.trim() || job.phone;
    const titleParts = [customer];
    if (job.jobType?.trim()) titleParts.push(job.jobType.trim());
    else if (job.problem?.trim()) titleParts.push(job.problem.trim().slice(0, 40));

    const description = [
      job.problem ? `בעיה: ${job.problem}` : null,
      `טלפון: ${job.phone}`,
      job.customerAvailability
        ? `זמינות לקוח: ${job.customerAvailability}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const start = new Date(job.scheduledStart);
    const end = job.scheduledEnd
      ? new Date(job.scheduledEnd)
      : new Date(start.getTime() + 60 * 60_000);

    const event = await createCalendarEvent({
      summary: titleParts.join(" · "),
      description,
      location: job.addressText ?? undefined,
      start,
      end,
    });

    if (!event.id) {
      return NextResponse.json(
        { ok: false, error: "Google did not return an event id" },
        { status: 502 },
      );
    }

    const updated = await setJobGoogleEventId(id, event.id);
    return NextResponse.json({ ok: true, job: updated, eventId: event.id });
  } catch (error) {
    console.error("Diary calendar error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create calendar event";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
