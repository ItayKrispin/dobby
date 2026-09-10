import { NextRequest, NextResponse } from "next/server";
import { deleteService, updateService } from "@/lib/services";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      durationMinutes?: number;
      price?: number;
      isActive?: boolean;
      sortOrder?: number;
    };

    const patch: {
      name?: string;
      durationMinutes?: number;
      price?: number;
      isActive?: boolean;
      sortOrder?: number;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { ok: false, error: "name must be a non-empty string" },
          { status: 400 },
        );
      }
      patch.name = body.name;
    }
    if (body.durationMinutes !== undefined) {
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
      patch.durationMinutes = body.durationMinutes;
    }
    if (body.price !== undefined) {
      if (typeof body.price !== "number" || body.price < 0) {
        return NextResponse.json(
          { ok: false, error: "price must be a non-negative number" },
          { status: 400 },
        );
      }
      patch.price = body.price;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { ok: false, error: "isActive must be a boolean" },
          { status: 400 },
        );
      }
      patch.isActive = body.isActive;
    }
    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder)) {
        return NextResponse.json(
          { ok: false, error: "sortOrder must be an integer" },
          { status: 400 },
        );
      }
      patch.sortOrder = body.sortOrder;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 },
      );
    }

    const service = await updateService(id, patch);
    return NextResponse.json({ ok: true, service });
  } catch (error) {
    console.error("Update service error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update service";
    const status = message.includes("not found")
      ? 404
      : message.includes("already exists")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const service = await deleteService(id);
    return NextResponse.json({ ok: true, service });
  } catch (error) {
    console.error("Delete service error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete service";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
