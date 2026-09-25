"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type PasswordFieldProps = {
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  hint?: string;
};

// Client limits mirror passwordSchema for UX only; the server re-validates.
export function PasswordField({ autoComplete, placeholder, hint }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div className="space-y-2">
      <label htmlFor="password" className="k-field-label">
        Password
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          minLength={8}
          maxLength={72}
          aria-describedby={hint ? hintId : undefined}
          className="k-input pe-11!"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-(--k-muted) transition-colors hover:text-(--k-ink)"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="k-mono text-[0.7rem] text-(--k-soft)">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
