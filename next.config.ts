import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      // ZIP uploads: MAX_REPO_SIZE_BYTES (100 MB) + multipart overhead.
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
