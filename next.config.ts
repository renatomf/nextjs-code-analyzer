import type { NextConfig } from "next";

const ONNX_LINUX_BINARIES =
  "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: [
    "tree-sitter",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
    // Reuse visited dynamic pages for 30s in the client cache, so switching
    // back and forth between project tabs is instant. Server Actions that
    // call revalidatePath still clear it right away.
    staleTimes: {
      dynamic: 30,
    },
  },
  // onnxruntime_binding.node loads libonnxruntime.so via dlopen, which file
  // tracing cannot see: ship the Linux x64 binaries with every function that
  // creates embeddings (analysis, chat, and project pages' server actions).
  outputFileTracingIncludes: {
    "/api/projects/\\[id\\]/analyze": [ONNX_LINUX_BINARIES],
    "/api/chat": [ONNX_LINUX_BINARIES],
    "/projects/**": [ONNX_LINUX_BINARIES],
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
