// SPIKE (ADR-011) — throwaway, never merged.
import { notFound } from "next/navigation";

import { SpikeUploader } from "./spike-uploader";

export default function SpikeUploadPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "spike/neon-storage"
  ) {
    notFound();
  }
  return (
    <main className="ca-container py-10">
      <h1 className="ca-title text-2xl">Spike: Neon Object Storage</h1>
      <SpikeUploader />
    </main>
  );
}
