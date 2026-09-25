"use client";

import Link from "next/link";
import { useActionState } from "react";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerWithEmail, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerWithEmail, initialState);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="ca-title text-4xl">
          Create account
        </h2>
        <p className="ca-lead mt-3 text-sm!">
          Enter your details to start auditing your code.
        </p>
      </div>

      <OAuthButtons />

      <div className="ca-divider">
        <span>Or with email</span>
      </div>

      <form action={formAction} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">
              First name
            </Label>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              placeholder="John"
              required
              maxLength={40}

            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">
              Last name
            </Label>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              placeholder="Doe"
              required
              maxLength={40}

            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            required
            maxLength={254}

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

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <p className="pt-4 text-center text-[0.8125rem] text-(--ca-muted)">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-bold text-(--ca-ink) underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
