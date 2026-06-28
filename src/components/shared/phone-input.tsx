"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forwardRef, type InputHTMLAttributes } from "react";

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name"> & {
  label?: string;
  error?: string;
};

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ label = "מספר טלפון", error, className, ...props }, ref) {
    return (
      <div className="space-y-2">
        <Label htmlFor="phone">{label}</Label>
        <div className="relative">
          <Input
            ref={ref}
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="052-773-2019"
            autoComplete="tel"
            className={`text-left ${className ?? ""}`}
            {...props}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);
