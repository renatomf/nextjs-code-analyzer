import { expect, test } from "@playwright/test";

test.describe("landing smoke", () => {
  test("home page shows product name and auth CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /AI Codebase\s*Auditor/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    // Base UI Button rendered as <Link> keeps role="button".
    const getStarted = page.getByRole("button", { name: "Get started" });
    await expect(getStarted).toBeVisible();
    await expect(getStarted).toHaveAttribute("href", "/register");
  });

  test("login page is reachable", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Welcome\s*back/i }),
    ).toBeVisible();
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });
});
