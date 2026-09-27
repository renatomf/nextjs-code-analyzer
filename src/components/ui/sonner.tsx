"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "rounded-none! border-(--ca-line)! bg-(--ca-paper)! text-(--ca-ink)! shadow-lg!",
          description: "text-(--ca-muted)!",
          success:
            "border-l-2! border-l-(--ca-green-deep)! [&_[data-icon]]:text-(--ca-green-deep)!",
          error:
            "border-l-2! border-l-(--destructive)! [&_[data-icon]]:text-(--destructive)!",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
