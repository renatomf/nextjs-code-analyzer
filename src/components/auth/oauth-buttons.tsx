"use client";

import { useFormStatus } from "react-dom";

import { GitHubIcon, GoogleIcon } from "@/components/auth/oauth-icons";
import { Button } from "@/components/ui/button";
import { loginWithGithub, loginWithGoogle } from "@/lib/actions/auth";

// Must live inside the <form> so useFormStatus sees that form's submission.
function OAuthButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending} className="w-full gap-2.5">
      {icon}
      {label}
    </Button>
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
