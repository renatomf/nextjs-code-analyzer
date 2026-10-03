import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reapStuckProjects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analysis/reaper", () => ({ reapStuckProjects }));

import { GET } from "./route";

const SECRET = "test-cron-secret-with-at-least-32-chars";

function call(authorization?: string) {
  return GET(
    new Request("http://localhost/api/cron/reap-stuck-projects", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  reapStuckProjects.mockReset().mockResolvedValue({ checked: 2, failed: 1, alive: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reap-stuck-projects", () => {
  it("never runs without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");

    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
    expect(reapStuckProjects).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer not-the-secret"],
    ["the secret without Bearer", SECRET],
  ])("refuses %s", async (_name, header) => {
    vi.stubEnv("CRON_SECRET", SECRET);

    expect((await call(header)).status).toBe(401);
    expect(reapStuckProjects).not.toHaveBeenCalled();
  });

  it("runs the reaper with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 2, failed: 1, alive: 1 });
  });

  it("hides a reaper failure behind a generic 500", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    reapStuckProjects.mockRejectedValue(new Error("connect ECONNREFUSED password=hunter2"));

    const response = await call(`Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
  });
});
