import { NextResponse } from "next/server";
import { listConversations } from "@/lib/conversations";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const conversations = await listConversations();
    const supabase = createAdminClient();
    const conversationIds = conversations.map((conversation) => conversation.id);

    const openJobsByConversation = new Map<string, number>();
    if (conversationIds.length > 0) {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, conversation_id")
        .in("conversation_id", conversationIds)
        .in("status", ["intake", "ready", "notified"]);

      for (const job of jobs ?? []) {
        if (!job.conversation_id) continue;
        openJobsByConversation.set(
          job.conversation_id,
          (openJobsByConversation.get(job.conversation_id) ?? 0) + 1,
        );
      }
    }

    const withBadges = conversations.map((conversation) => {
      const hasIntakeDraft = Boolean(
        conversation.draft_problem ||
          conversation.draft_address ||
          conversation.draft_availability ||
          (conversation.draft_photo_count ?? 0) > 0,
      );

      return {
        ...conversation,
        pinned_at: conversation.pinned_at ?? null,
        openJobCount: openJobsByConversation.get(conversation.id) ?? 0,
        hasIntakeDraft,
        aiPaused: Boolean(conversation.ai_paused),
      };
    });

    return NextResponse.json({ ok: true, conversations: withBadges });
  } catch (error) {
    console.error("List conversations error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list conversations" },
      { status: 500 },
    );
  }
}
