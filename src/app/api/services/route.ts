import { NextRequest, NextResponse } from "next/server";
import { createService, listServices } from "@/lib/services";

export async function GET() {
  try {
    const services = await listServices();
    return NextResponse.json({ ok: true, services });
  } catch (error) {
    console.error("List services error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list services" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      durationMinutes?: number;
      price?: number;
      sortOrder?: number;
    };

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 },
      );
    }
    if (
      typeof body.durationMinutes !== "number" ||
      !Number.isInteger(body.durationMinutes) ||
      body.durationMinutes <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "durationMinutes must be a positive integer" },
        { status: 400 },
      );
    }
    if (typeof body.price !== "number" || body.price < 0) {
      return NextResponse.json(
        { ok: false, error: "price must be a non-negative number" },
        { status: 400 },
      );
    }

    const service = await createService({
      name: body.name,
      durationMinutes: body.durationMinutes,
      price: body.price,
      sortOrder:
        typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    });

    return NextResponse.json({ ok: true, service });
  } catch (error) {
    console.error("Create service error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create service";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
