import { NextResponse } from "next/server";
import { listConversations } from "@/lib/conversations";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const conversations = await listConversations();
    const supabase = createAdminClient();

    const withBadges = await Promise.all(
      conversations.map(async (conversation) => {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("id, status, is_emergency")
          .eq("conversation_id", conversation.id)
          .neq("status", "closed");

        const openJobs = jobs ?? [];
        const hasEmergency = openJobs.some((job) => job.is_emergency);
        const hasIntakeDraft = Boolean(
          conversation.draft_problem ||
            conversation.draft_address ||
            conversation.draft_availability ||
            conversation.draft_is_emergency !== null,
        );

        return {
          ...conversation,
          openJobCount: openJobs.length,
          hasEmergency,
          hasIntakeDraft,
          aiPaused: Boolean(conversation.ai_paused),
        };
      }),
    );

    return NextResponse.json({ ok: true, conversations: withBadges });
  } catch (error) {
    console.error("List conversations error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list conversations" },
      { status: 500 },
    );
  }
}
