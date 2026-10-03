// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createProjectFromZip = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/github", () => ({ createProjectFromZip }));
// Not under test; its billing buttons import server actions.
vi.mock("@/components/billing/limit-reached-notice", () => ({ LimitReachedNotice: () => null }));

import { ZipUploadForm } from "@/components/projects/zip-upload-form";

afterEach(() => {
  cleanup();
  createProjectFromZip.mockReset();
});

describe("ZipUploadForm", () => {
  // React resets the form after its action, emptying the file input: the
  // confirmation used to re-submit an empty form, and the browser asked for a
  // file again (seen in production, 2026-10-03).
  it("analyzes the same ZIP again after the already-analyzed prompt", async () => {
    const user = userEvent.setup();
    createProjectFromZip
      .mockResolvedValueOnce({ duplicate: { name: "demo" } })
      .mockResolvedValueOnce({});
    render(<ZipUploadForm />);
    const zip = new File(["PK"], "demo.zip", { type: "application/zip" });

    const input = screen.getByLabelText("ZIP file");
    await user.upload(input, zip);
    // jsdom's `required` check does not see files set by user-event: submit
    // the form directly (the browser's validation is not under test).
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(createProjectFromZip).toHaveBeenCalledOnce());
    await user.click(await screen.findByRole("button", { name: "Analyze again" }));

    // Before the fix the second submit never happened: the reset form, with
    // its required file input empty, was blocked.
    await waitFor(() => expect(createProjectFromZip).toHaveBeenCalledTimes(2));
    const first = createProjectFromZip.mock.calls[0][1] as FormData;
    const again = createProjectFromZip.mock.calls[1][1] as FormData;
    expect(again.get("confirmReanalyze")).toBe("1");
    // The same upload, not the reset form. (jsdom does not put user-event's
    // file into a form's FormData, so compare entries rather than file names.)
    expect(again.get("file")).toBe(first.get("file"));
    expect(first.get("confirmReanalyze")).toBeNull();
  });

  // Vercel refuses a function body over 4.5 MB before the app runs (TD-45):
  // the form is the only place that can tell the user why.
  it("stops a ZIP over 4 MB before sending it, and says why", async () => {
    const user = userEvent.setup();
    render(<ZipUploadForm />);
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.zip", {
      type: "application/zip",
    });
    const input = screen.getByLabelText("ZIP file");
    await user.upload(input, big);
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "ZIP uploads are limited to 4 MB. For a bigger project, import it from GitHub.",
    );
    expect(createProjectFromZip).not.toHaveBeenCalled();
  });
});
