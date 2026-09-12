import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversation,
  getConversationThread,
  setAiPaused,
} from "@/lib/conversations";

type Params = {
  params: Promise<{ phone: string }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { phone: rawPhone } = await params;
    const phone = decodeURIComponent(rawPhone);

    const thread = await getConversationThread(phone);
    if (!thread) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { getSignedStorageUrl } = await import("@/lib/storage-signed-url");
    const supabase = createAdminClient();
    const mediaWithUrls = await Promise.all(
      (thread.media ?? []).map(async (item) => {
        const url = await getSignedStorageUrl(
          supabase,
          "job-photos",
          item.storage_path,
        );
        return { ...item, url };
      }),
    );

    return NextResponse.json({
      ok: true,
      ...thread,
      media: mediaWithUrls,
    });
  } catch (error) {
    console.error("Get conversation thread error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load conversation" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { phone: rawPhone } = await params;
    const phone = decodeURIComponent(rawPhone);
    const body = (await request.json()) as {
      aiPaused?: boolean;
      pinned?: boolean;
    };

    if (typeof body.pinned === "boolean") {
      const { setConversationPinned } = await import("@/lib/conversations");
      const result = await setConversationPinned(phone, body.pinned);
      if (!result.ok) {
        const status = result.code === "PIN_LIMIT" ? 409 : 400;
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status },
        );
      }
      return NextResponse.json({ ok: true, conversation: result.conversation });
    }

    if (typeof body.aiPaused !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "aiPaused or pinned is required" },
        { status: 400 },
      );
    }

    const conversation = await setAiPaused(phone, body.aiPaused);
    return NextResponse.json({ ok: true, conversation });
  } catch (error) {
    console.error("Patch conversation error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update conversation" },
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
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, phone: result.ok ? result.phone : phone });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete conversation" },
      { status: 500 },
    );
  }
}
