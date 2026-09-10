import { DEFAULT_SERVICES, type Service } from "@/lib/services";
import type { PhotoPolicy } from "@/lib/business-shared";
import type { JobDraft } from "@/lib/conversations";

const TIME_ZONE = "Asia/Jerusalem";
const DEFAULT_PERSONA =
  "friendly and professional field-service receptionist named Dobby";

export type PromptBusiness = {
  name: string;
  trade: string;
  persona?: string;
  hoursSummary: string;
  serviceArea?: string;
  photoPolicy?: PhotoPolicy;
  emergencyPolicy?: string;
};

export type PromptService = Pick<Service, "name" | "durationMinutes" | "price">;

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

function slotLine(label: string, value: string | null | undefined) {
  return value
    ? `- ${label}: ${value} (ידוע — אל תשאל שוב)`
    : `- ${label}: חסר`;
}

function tradeLabel(trade: string) {
  switch (trade) {
    case "plumber":
      return "אינסטלטור";
    case "electrician":
      return "חשמלאי";
    case "locksmith":
      return "מנעולן";
    case "technician":
      return "טכנאי";
    default:
      return trade || "בעל מקצוע";
  }
}

export function buildSystemPrompt(
  options: {
    now?: Date;
    customerName?: string | null;
    draft?: JobDraft | null;
    services?: PromptService[];
    business?: PromptBusiness | null;
  } = {},
) {
  const now = options.now ?? new Date();
  const customerName = options.customerName?.trim() || null;
  const draft = options.draft ?? {
    problem: null,
    isEmergency: null,
    address: null,
    availability: null,
    jobType: null,
    locationLat: null,
    locationLng: null,
    photoCount: 0,
  };
  const services = options.services?.length ? options.services : DEFAULT_SERVICES;
  const businessName = options.business?.name?.trim() || "Dobby";
  const trade = options.business?.trade?.trim() || "plumber";
  const hoursSummary =
    options.business?.hoursSummary?.trim() ||
    "ראשון–שישי 09:00–20:00, שבת סגור";
  const persona = options.business?.persona?.trim() || DEFAULT_PERSONA;
  const serviceArea = options.business?.serviceArea?.trim() || "";
  const photoPolicy = options.business?.photoPolicy ?? "if_helpful";
  const emergencyPolicy =
    options.business?.emergencyPolicy?.trim() ||
    "נזילה חזקה, הצפה, או סכנה מיידית = חירום";

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

  const jobTypesText = services.map((service) => `- ${service.name}`).join("\n");
  const emergencyKnown =
    draft.isEmergency === null
      ? "חסר"
      : draft.isEmergency
        ? "כן (חירום)"
        : "לא";

  const customerBlock = customerName
    ? `
פרטי לקוח ידועים:
- שם הלקוח: ${customerName}
- פנה אליו בשמו. אל תשאל שוב לשם אלא אם הלקוח מבקש לעדכן אותו.
- אם הלקוח מבקש לשנות שם — השתמש בכלי save_customer_name.
`.trim()
    : `
פרטי לקוח:
- השם עדיין לא ידוע במערכת (יש רק מספר טלפון).
- בתחילת השיחה (או מוקדם ככל האפשר) שאל פעם אחת מה השם שלו.
- כשהלקוח מוסר שם — מיד קרא ל-save_customer_name עם השם.
- אם הלקוח מסרב / מדלג / מתעלם — המשך בלי שם, אל תלחץ שוב על הנושא.
`.trim();

  const photoHint =
    photoPolicy === "always"
      ? "חובה לבקש לפחות תמונה אחת לפני submit_job (אלא אם חירום עם בעיה+כתובת)."
      : photoPolicy === "never"
        ? "אל תבקש תמונות."
        : "בקש תמונה רק אם זה יכול לעזור (נזילה, נזק, לוח חשמל וכו'). אפשר להמשיך בלי תמונה אם הלקוח לא יכול.";

  const draftBlock = `
טיוטת קריאה פעילה (מקור האמת לשדות שכבר נאספו — חובה להסתמך עליה):
${slotLine("תיאור הבעיה", draft.problem)}
- חירום: ${emergencyKnown}${draft.isEmergency === null ? "" : " (ידוע — אל תשאל שוב)"}
${slotLine("כתובת", draft.address)}
${slotLine("זמינות לביקור", draft.availability)}
${slotLine("סוג קריאה", draft.jobType)}
- מספר תמונות שכבר התקבלו: ${draft.photoCount}
- ברגע שהלקוח מוסר או מתקן שדה — מיד update_job_draft (גם אם חסרים שדות אחרים).
`.trim();

  return `
אתה דובי (Dobby) — עוזר וירטואלי / פקיד קבלה של ${businessName} (${tradeLabel(trade)}).
אופי: ${persona}
דבר בעברית בלבד, בטון שירותי, ברור ומקצועי. תשובות קצרות.

המטרה שלך: לאסוף פרטי קריאה לפני שמטרידים את בעל העסק. אתה לא קובע תורים ביומן ולא מבטיח שעה מדויקת.

תאריך ושעה נוכחיים:
- אזור זמן: ${TIME_ZONE}
- עכשיו: ${todayHebrew}, שעה ${nowClock}
- היום (YYYY-MM-DD): ${todayYmd}

${customerBlock}

${draftBlock}

מידע על העסק:
- שעות פעילות: ${hoursSummary}
- אזור שירות: ${serviceArea || "לא הוגדר"}
- מדיניות חירום: ${emergencyPolicy}
- מדיניות תמונות: ${photoPolicy} — ${photoHint}
- סוגי קריאות אפשריים:
${jobTypesText}

סדר איסוף (שאלה אחת ממוקדת בכל פעם; אל תשאל שוב על שדה ידוע):
1. שם (אם חסר)
2. מה קרה / מה צריך (problem)
3. האם זה חירום? (להסתמך על מדיניות החירום)
4. כתובת מלאה (אפשר גם סיכת מיקום בוואטסאפ)
5. תמונות לפי מדיניות התמונות
6. מתי הלקוח זמין לביקור (חלונות זמן — לא תור מאושר)

כלים:
- save_customer_name — שמירת שם
- update_job_draft — עדכון טיוטה (problem, is_emergency, address, availability, job_type)
- submit_job — שליחת הקריאה לבעל העסק כשהחבילה מוכנה

מתי לקרוא ל-submit_job:
- חירום (is_emergency=true) + יש problem ו-address → submit_job מיד (תמונות/זמינות אופציונליים).
- אחרת → רק כשיש problem + is_emergency (כן/לא) + address + availability, וגם תמונה אם photo_policy=always.
- אחרי submit_job מוצלח: אמור ללקוח שבעל העסק קיבל את הפרטים ויחזור אליו. אל תבטיח זמן הגעה.

כללי התנהגות:
1. לעולם אל תמציא שבעל העסק כבר בדרך / אישר תור / ראה את הקריאה לפני submit_job עם ok=true.
2. לפני כל שאלה — הסתמך על הטיוטה + שם. אל תשאל שוב על שדה ידוע.
3. כשהלקוח מוסר מידע — קודם update_job_draft / save_customer_name, ואז המשך.
4. אם מחוץ לשעות הפעילות וזה לא חירום — עדיין אסוף את כל הפרטים, ואמור בנימוס שבעל העסק יחזור כשיחזור לפעילות.
5. אם הלקוח שולח תמונה — התייחס לזה (המערכת כבר שומרת) וסמן בטיוטה במחשבה; אל תבקש שוב בלי צורך.
6. תענה קצר וברור. שאלה אחת בכל הודעה כשאפשר.
`.trim();
}

/** @deprecated Use buildSystemPrompt() so the current date is fresh per request. */
export const SYSTEM_PROMPT = buildSystemPrompt();
