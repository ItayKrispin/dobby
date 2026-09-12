"use client";

import Link from "next/link";
import { useState } from "react";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { CallButton } from "@/components/dashboard/call-button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { formatJobSchedule } from "@/components/dashboard/diary-dialogs";
import {
  RowActions,
  type RowActionItem,
} from "@/components/dashboard/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { isTerminalJobStatus } from "@/types/database";

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPayment(amount: number, includesVat: boolean | null) {
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(amount);
  if (includesVat == null) return formatted;
  return `${formatted} (${includesVat ? "כולל מע״מ" : "ללא מע״מ"})`;
}

function statusBadge(status: Job["status"]) {
  if (status === "completed") {
    return <Badge variant="secondary">בוצע</Badge>;
  }
  if (status === "cancelled") {
    return <Badge variant="destructive">בוטל</Badge>;
  }
  return null;
}

export type CompleteJobPayload = {
  paymentAmount: number | null;
  paymentIncludesVat: boolean;
};

type JobCardProps = {
  job: Job;
  busy?: boolean;
  selected?: boolean;
  onSelect?: (job: Job) => void;
  onComplete?: (id: string, payload: CompleteJobPayload) => void | Promise<void>;
  onCancel?: (id: string) => void | Promise<void>;
  onRestore?: (id: string) => void;
  onSchedule?: (job: Job) => void;
  onReminders?: (job: Job) => void;
  onAddToGoogle?: (job: Job) => void;
  gcalConnected?: boolean;
  showCustomerLink?: boolean;
  compactSchedule?: boolean;
};

export function JobCard({
  job,
  busy = false,
  selected = false,
  onSelect,
  onComplete,
  onCancel,
  onRestore,
  onSchedule,
  onReminders,
  onAddToGoogle,
  gcalConnected = false,
  showCustomerLink = true,
  compactSchedule = false,
}: JobCardProps) {
  const label = job.customerName?.trim() || job.phone;
  const caseLabel = job.jobType?.trim() || job.problem || "—";
  const summaryTime =
    job.inDiary && job.scheduledStart
      ? formatTime(job.scheduledStart)
      : formatTime(job.createdAt);
  const conversationHref = `/dashboard/${encodeURIComponent(job.phone)}`;
  const terminal = isTerminalJobStatus(job.status);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState("");
  const [includesVat, setIncludesVat] = useState(true);
  const photos = job.photos ?? [];
  const leftover = Math.max(0, (job.photoCount ?? 0) - photos.length);

  const menuItems: RowActionItem[] = [
    ...(onSchedule
      ? [
          {
            label: job.scheduledStart ? "שנה שעה" : "קבע ביומן",
            onSelect: () => onSchedule(job),
            disabled: busy,
          },
        ]
      : []),
    ...(onReminders && job.scheduledStart
      ? [
          {
            label: "תזכורות",
            onSelect: () => onReminders(job),
            disabled: busy,
          },
        ]
      : []),
    ...(onAddToGoogle
      ? [
          {
            label: "הוסף ליומן Google",
            onSelect: () => onAddToGoogle(job),
            disabled:
              busy ||
              !job.scheduledStart ||
              Boolean(job.googleEventId) ||
              !gcalConnected,
          },
        ]
      : []),
    ...(onRestore && terminal
      ? [
          {
            label: "שחזר בקשה",
            onSelect: () => onRestore(job.id),
            disabled: busy,
            separatorBefore: true,
          },
        ]
      : []),
  ];

  function openDetails() {
    onSelect?.(job);
    setDetailOpen(true);
  }

  function openCompleteDialog() {
    setPaymentDraft(
      job.paymentAmount != null ? String(job.paymentAmount) : "",
    );
    setIncludesVat(job.paymentIncludesVat !== false);
    setCompleteOpen(true);
  }

  async function confirmComplete() {
    if (!onComplete) return;
    const trimmed = paymentDraft.trim();
    let paymentAmount: number | null = null;
    if (trimmed) {
      const parsed = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return;
      }
      paymentAmount = parsed;
    }
    await onComplete(job.id, {
      paymentAmount,
      paymentIncludesVat: paymentAmount == null ? true : includesVat,
    });
    setCompleteOpen(false);
  }

  function ActionRow() {
    return (
      <div className="flex flex-row flex-wrap items-stretch gap-2">
        {!terminal && onComplete ? (
          <Button
            type="button"
            className="min-h-11 min-w-0 flex-1 px-3"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              openCompleteDialog();
            }}
          >
            בוצע
          </Button>
        ) : null}
        {!terminal && onCancel ? (
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 min-w-0 flex-1 px-3"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              setCancelOpen(true);
            }}
          >
            בוטל
          </Button>
        ) : null}
        {showCustomerLink ? (
          <Link
            href={conversationHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 min-w-0 flex-1 px-3",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            עבור לשיחה
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <article
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm",
          selected ? "border-primary ring-2 ring-primary/20" : "border-border",
          job.isEmergency && "border-destructive/40",
        )}
      >
        {job.isEmergency ? (
          <span
            className="absolute inset-y-0 start-0 w-1.5 bg-destructive"
            aria-hidden
          />
        ) : (
          <span
            className="absolute inset-y-0 start-0 w-1 bg-primary/40"
            aria-hidden
          />
        )}

        <div className="flex items-start gap-3 ps-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-3 text-right"
            onClick={openDetails}
            aria-label="פתח פרטי בקשה"
          >
            <AvatarInitials name={label} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold">{label}</p>
                  {statusBadge(job.status)}
                </div>
                {job.customerName?.trim() && (
                  <p
                    className="text-sm tracking-wide text-muted-foreground"
                    dir="ltr"
                  >
                    {job.phone}
                  </p>
                )}
              </div>

              <p className="text-base font-medium leading-snug">{caseLabel}</p>

              {job.addressText && (
                <p className="text-base">
                  <span className="text-muted-foreground">כתובת: </span>
                  {job.addressText}
                </p>
              )}

              {job.status === "completed" && job.paymentAmount != null && (
                <p className="text-base">
                  <span className="text-muted-foreground">תשלום: </span>
                  {formatPayment(job.paymentAmount, job.paymentIncludesVat)}
                </p>
              )}

              <p className="text-sm text-muted-foreground">{summaryTime}</p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-0.5">
            <CallButton phone={job.phone} />
            {menuItems.length > 0 ? <RowActions items={menuItems} /> : null}
          </div>
        </div>

        <div className="ps-2 pt-3">
          <ActionRow />
        </div>
      </article>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
          dir="rtl"
        >
          <SheetHeader>
            <SheetTitle>בקשת עבודה</SheetTitle>
            <SheetDescription className="sr-only">{label}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="space-y-1.5 text-base">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{label}</p>
                    {statusBadge(job.status)}
                  </div>
                  {job.customerName?.trim() && (
                    <p className="tracking-wide text-muted-foreground" dir="ltr">
                      {job.phone}
                    </p>
                  )}
                </div>
                <CallButton phone={job.phone} />
              </div>
            </div>

            <p className="text-base">
              <span className="text-muted-foreground">תיאור מקרה: </span>
              {caseLabel}
            </p>

            {job.addressText && (
              <p className="text-base">
                <span className="text-muted-foreground">כתובת: </span>
                {job.addressText}
              </p>
            )}

            {job.inDiary && (
              <p className="text-base">
                <span className="text-muted-foreground">ביומן: </span>
                {formatJobSchedule(job)}
                {!job.scheduledStart && compactSchedule ? " · ללא שעה" : ""}
              </p>
            )}

            {job.status === "completed" && (
              <p className="text-base">
                <span className="text-muted-foreground">תשלום: </span>
                {job.paymentAmount != null
                  ? formatPayment(job.paymentAmount, job.paymentIncludesVat)
                  : "לא נרשם"}
              </p>
            )}

            {job.jobType?.trim() && job.problem?.trim() && (
              <p className="text-base">
                <span className="text-muted-foreground">פרטים: </span>
                {job.problem}
              </p>
            )}

            {photos.length > 0 && (
              <div className="space-y-2">
                <p className="text-base font-medium">תמונות</p>
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo) =>
                    photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={photo.url}
                        alt="תמונת בקשה"
                        className="size-20 rounded-lg object-cover"
                        onClick={() => setLightboxUrl(photo.url)}
                      />
                    ) : (
                      <div
                        key={photo.id}
                        className="flex size-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground"
                      >
                        —
                      </div>
                    ),
                  )}
                  {leftover > 0 && (
                    <div className="flex size-20 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
                      +{leftover}
                    </div>
                  )}
                </div>
              </div>
            )}

            <ActionRow />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl" showCloseButton={false}>
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg">סימון כבוצע</DialogTitle>
            <DialogDescription className="text-base">
              אפשר לרשום כמה שולם על העבודה (אופציונלי).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`payment-${job.id}`}>סכום התשלום (₪)</Label>
              <Input
                id={`payment-${job.id}`}
                inputMode="decimal"
                placeholder="לדוגמה 350"
                value={paymentDraft}
                onChange={(event) => setPaymentDraft(event.target.value)}
                disabled={busy}
              />
            </div>
            <label className="flex items-center gap-3 text-base">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={includesVat}
                onChange={(event) => setIncludesVat(event.target.checked)}
                disabled={busy || !paymentDraft.trim()}
              />
              הסכום כולל מע״מ
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button disabled={busy} onClick={() => void confirmComplete()}>
              {busy ? "מבצע..." : "אשר בוצע"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCompleteOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="ביטול בקשה"
        description="לסמן את הבקשה כבוטל?"
        confirmLabel="בוטל"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!onCancel) return;
          await onCancel(job.id);
          setCancelOpen(false);
        }}
      />

      {lightboxUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxUrl(null)}
          aria-label="סגור תמונה"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="תמונת בקשה"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </button>
      ) : null}
    </>
  );
}
