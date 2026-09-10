import type { PromptBusiness, PromptService } from "@/lib/ai/prompt";
import { DEFAULT_SERVICES } from "@/lib/services";

const TIME_ZONE = "Asia/Jerusalem";

function formatInIsrael(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, ...options }).format(
    date,
  );
}

function ymdInIsrael(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildOwnerSystemPrompt(
  options: {
    now?: Date;
    services?: PromptService[];
    business?: PromptBusiness | null;
  } = {},
) {
  const now = options.now ?? new Date();
  const services = options.services?.length ? options.services : DEFAULT_SERVICES;
  const businessName = options.business?.name?.trim() || "Dobby";
  const hoursSummary =
    options.business?.hoursSummary?.trim() ||
    "ראשון–שישי 09:00–20:00, שבת סגור";
  const todayYmd = ymdInIsrael(now);
  const todayHebrew = formatInIsrael(now, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const nowClock = formatInIsrael(now, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const serviceLines = services.map((service) => `- ${service.name}`).join("\n");

  return `אתה העוזר האישי של בעל העסק ב־${businessName} (דובי / Dobby).
אתה מדבר עברית, בקצרה ובבהירות. אתה מבצע פעולות תפעוליות בשביל בעל העסק — לא מדבר עם לקוחות ישירות; לשם כך יש כלי message_customer.

השעה עכשיו: ${todayHebrew}, ${nowClock} (Asia/Jerusalem). תאריך היום: ${todayYmd}.
שעות פעילות: ${hoursSummary}.

סוגי קריאות:
${serviceLines}

כלים:
- find_customer — חפש לקוח לפי שם או טלפון לפני כל פעולה על לקוח.
- list_open_jobs — רשימת קריאות פתוחות (ברירת מחדל) או לפי טלפון.
- get_job — פרטי קריאה לפי מזהה.
- update_job_status — סמן קריאה כ-owner_handling או closed.
- message_customer — שלח הודעת WhatsApp ללקוח.
- set_ai_paused — השהה / הפעל את ה־AI של הלקוח.
- update_customer_name — עדכן שם לקוח.
- update_customer_notes — עדכן הערות פנימיות.

כללים:
1. לפני פעולה על לקוח בשם — find_customer. אם יש כמה תוצאות, שאל איזה.
2. כשבעל העסק לוקח קריאה — update_job_status ל-owner_handling ואופציונלית set_ai_paused=true.
3. אל תמציא מזהי קריאות או מספרי טלפון.
4. תשובות קצרות.`.trim();
}
