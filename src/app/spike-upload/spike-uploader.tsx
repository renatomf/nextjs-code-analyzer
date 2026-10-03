"use client";
// SPIKE (ADR-011) — throwaway, never merged.
import { useState } from "react";

async function call(body: object) {
  const response = await fetch("/api/spike/storage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

export function SpikeUploader() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [...lines, line]);

  async function upload(file: File) {
    const { json } = await call({ action: "upload-url" });
    if (!json.url) return add(`upload-url failed: ${JSON.stringify(json)}`);
    const form = new FormData();
    for (const [key, value] of Object.entries(json.fields as Record<string, string>)) {
      form.append(key, value);
    }
    form.append("file", file); // must be the last field
    try {
      const response = await fetch(json.url, { method: "POST", body: form });
      const text = (await response.text()).slice(0, 300);
      add(`browser POST ${file.size} bytes (limit ${json.maxBytes}): HTTP ${response.status} ${text}`);
      if (response.ok) {
        const check = await call({ action: "check", key: json.key });
        add(`server read + delete: ${JSON.stringify(check.json)}`);
      }
    } catch (error) {
      add(`browser POST failed (CORS?): ${String(error)}`);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <button className="border px-3 py-2" onClick={async () => add(`cors: ${JSON.stringify((await call({ action: "cors" })).json)}`)}>
          1. Apply CORS
        </button>
        <button className="border px-3 py-2" onClick={async () => add(`isolation: ${JSON.stringify((await call({ action: "isolation" })).json)}`)}>
          4. Isolation (preview credential → main)
        </button>
      </div>
      <label className="block">
        2/3. Upload a .zip (≤ 2 MB should pass, &gt; 2 MB should be refused):
        <input
          type="file"
          accept=".zip,application/zip"
          className="mt-2 block"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      <pre className="ca-panel whitespace-pre-wrap p-4 text-xs">{log.join("\n") || "No results yet."}</pre>
    </div>
  );
}
