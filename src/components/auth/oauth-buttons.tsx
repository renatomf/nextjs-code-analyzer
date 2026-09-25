"use client";

import { useFormStatus } from "react-dom";

import { GitHubIcon, GoogleIcon } from "@/components/auth/oauth-icons";
import { loginWithGithub, loginWithGoogle } from "@/lib/actions/auth";

// Must live inside the <form> so useFormStatus sees that form's submission.
function OAuthButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="k-bar k-bar-light w-full justify-center!">
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
    </button>
  );
}

export function OAuthButtons() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <form action={loginWithGoogle}>
        <OAuthButton icon={<GoogleIcon />} label="Google" />
      </form>
      <form action={loginWithGithub}>
        <OAuthButton icon={<GitHubIcon />} label="GitHub" />
      </form>
    </div>
  );
}
