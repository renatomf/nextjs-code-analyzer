import type { Metadata } from "next";
import { Inter, Intel_One_Mono, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const intelOneMono = Intel_One_Mono({
  variable: "--font-intel-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "AI Code Auditor",
  description:
    "An AI Senior developer that understands your codebase - health reports, issues, and chat grounded in your real code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <html
        className={`${inter.variable} ${intelOneMono.variable} ${syne.variable}`}
        lang="en"
        suppressHydrationWarning
      >
        <head />
        <body>{children}</body>
      </html>
    </>
  );
}
