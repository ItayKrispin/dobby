"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRef, type KeyboardEvent } from "react";

type OtpInputProps = {
  length?: number;
  error?: string;
};

export function OtpInput({ length = 6, error }: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !inputs.current[index]?.value && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handleInput(index: number) {
    const value = inputs.current[index]?.value;
    if (value && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
    updateHiddenInput();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    pasted.split("").forEach((char, i) => {
      if (inputs.current[i]) {
        inputs.current[i]!.value = char;
      }
    });
    const nextEmpty = Math.min(pasted.length, length - 1);
    inputs.current[nextEmpty]?.focus();
    updateHiddenInput();
  }

  function updateHiddenInput() {
    const token = inputs.current.map((el) => el?.value ?? "").join("");
    const hidden = document.getElementById("token") as HTMLInputElement | null;
    if (hidden) hidden.value = token;
  }

  return (
    <div className="space-y-2">
      <Label>קוד אימות</Label>
      <div className="flex gap-2 justify-center" dir="ltr">
        {Array.from({ length }).map((_, i) => (
          <Input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className="w-12 h-12 text-center text-lg font-mono"
            onInput={() => handleInput(i)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            autoFocus={i === 0}
            autoComplete={i === 0 ? "one-time-code" : "off"}
          />
        ))}
      </div>
      <input type="hidden" id="token" name="token" />
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
    </div>
  );
}
