import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, setCustomerName } from "@/lib/conversations";

type Params = {
  params: Promise<{ phone: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { phone: rawPhone } = await params;
    const phone = decodeURIComponent(rawPhone);
    const body = (await request.json()) as { customerName?: string | null };
    const customerName =
      body.customerName === undefined
        ? undefined
        : body.customerName === null || String(body.customerName).trim() === ""
          ? null
          : String(body.customerName).trim();

    if (customerName === undefined) {
      return NextResponse.json(
        { ok: false, error: "customerName is required (string or null)" },
        { status: 400 },
      );
    }

    const conversation = await setCustomerName(phone, customerName);
    return NextResponse.json({
      ok: true,
      contact: {
        id: conversation.id,
        phone: conversation.phone,
        customer_name: conversation.customer_name,
      },
    });
  } catch (error) {
    console.error("Update contact name error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update contact name" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { phone: rawPhone } = await params;
    const phone = decodeURIComponent(rawPhone);
    const result = await deleteConversation(phone);

    if (!result.ok && "notFound" in result && result.notFound) {
      return NextResponse.json(
        { ok: false, error: "Contact not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      phone: result.ok ? result.phone : phone,
    });
  } catch (error) {
    console.error("Delete contact error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete contact" },
      { status: 500 },
    );
  }
}
