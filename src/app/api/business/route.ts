import { NextRequest, NextResponse } from "next/server";
import {
  getBusinessProfile,
  updateBusinessProfile,
  type HoursPolicy,
  type PhotoPolicy,
  type WeekdayHours,
} from "@/lib/business";

export async function GET() {
  try {
    const profile = await getBusinessProfile();
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("Get business profile error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load business profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      trade?: string;
      persona?: string;
      serviceArea?: string;
      ownerNotifyPhone?: string;
      photoPolicy?: PhotoPolicy;
      assistantIntro?: string;
      hoursPolicy?: HoursPolicy;
      hours?: WeekdayHours[];
    };

    if (
      body.name === undefined &&
      body.trade === undefined &&
      body.persona === undefined &&
      body.serviceArea === undefined &&
      body.ownerNotifyPhone === undefined &&
      body.photoPolicy === undefined &&
      body.assistantIntro === undefined &&
      body.hoursPolicy === undefined &&
      body.hours === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    const profile = await updateBusinessProfile({
      name: body.name,
      trade: body.trade,
      persona: body.persona,
      serviceArea: body.serviceArea,
      ownerNotifyPhone: body.ownerNotifyPhone,
      photoPolicy: body.photoPolicy,
      assistantIntro: body.assistantIntro,
      hoursPolicy: body.hoursPolicy,
      hours: body.hours,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("Update business profile error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update business profile";
    const status =
      message.includes("must") ||
      message.includes("required") ||
      message.includes("duplicate")
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
