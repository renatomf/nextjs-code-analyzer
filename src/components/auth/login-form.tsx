"use client";

import Link from "next/link";
import { useActionState } from "react";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithEmail, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginWithEmail, initialState);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="ca-title text-4xl">
          Sign in
        </h2>
        <p className="ca-lead mt-3 text-sm!">
          Enter your credentials to access your workspace.
        </p>
      </div>

      <OAuthButtons />

      <div className="ca-divider">
        <span>Or with email</span>
      </div>

      <form action={formAction} className="space-y-5">
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

        <PasswordField autoComplete="current-password" placeholder="Enter your password" />

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {state.error}
        </p>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <p className="pt-4 text-center text-[0.8125rem] text-(--ca-muted)">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-bold text-(--ca-ink) underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
