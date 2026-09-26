import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: [
    "tree-sitter",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
  poweredByHeader: false,
  // Baseline security headers. A full Content-Security-Policy (scripts,
  // styles, images) is tracked in docs/technical-debt.md (TD-34).
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: the app is never embedded in an iframe.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
