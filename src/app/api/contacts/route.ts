import { NextResponse } from "next/server";
import { listContacts } from "@/lib/conversations";

export async function GET() {
  try {
    const contacts = await listContacts();
    return NextResponse.json({ ok: true, contacts });
  } catch (error) {
    console.error("List contacts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list contacts" },
      { status: 500 },
    );
  }
}
