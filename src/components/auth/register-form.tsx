"use client";

import Link from "next/link";
import { useActionState } from "react";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { PasswordField } from "@/components/auth/password-field";
import { registerWithEmail, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerWithEmail, initialState);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="k-title text-4xl">
          Create account
        </h2>
        <p className="k-lead mt-3 text-sm!">
          Enter your details to start auditing your code.
        </p>
      </div>

      <OAuthButtons />

      <div className="k-divider">
        <span>Or with email</span>
      </div>

      <form action={formAction} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <div className="space-y-2">
            <label htmlFor="firstName" className="k-field-label">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              placeholder="John"
              required
              maxLength={40}
              className="k-input"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className="k-field-label">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              placeholder="Doe"
              required
              maxLength={40}
              className="k-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="k-field-label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            required
            maxLength={254}
            className="k-input"
          />
        </div>

        <PasswordField
          autoComplete="new-password"
          placeholder="Create a password"
          hint="8–72 characters."
        />

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {state.error}
        </p>

        <button type="submit" disabled={pending} className="k-bar k-bar-green w-full justify-center!">
          {pending ? "Creating account…" : "Create account"}
        </button>

        <p className="pt-4 text-center text-[0.8125rem] text-(--k-muted)">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-bold text-(--k-ink) underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
