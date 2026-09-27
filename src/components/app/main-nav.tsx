"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

// Projects covers the project pages too; Analyze owns /projects/new.
const LINKS = [
  {
    href: "/dashboard",
    label: "Projects",
    isActive: (path: string) =>
      path === "/dashboard" ||
      (path.startsWith("/projects/") && path !== "/projects/new"),
  },
  {
    href: "/projects/new",
    label: "Analyze",
    isActive: (path: string) => path === "/projects/new",
  }
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map((link) => (
        <Button
          key={link.href}
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={link.href} />}
          aria-current={link.isActive(pathname) ? "page" : undefined}
          className="hover:bg-transparent aria-[current=page]:text-(--ca-ink)"
        >
          {link.label}
        </Button>
      ))}
    </nav>
  );
}
