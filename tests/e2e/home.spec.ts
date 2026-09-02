import { expect, test } from "@playwright/test";

test.describe("ShareAnywhere home page", () => {
  test("renders the public landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/ShareAnywhere/);

    await expect(
      page.getByRole("heading", { name: "Share Files & Text" }),
    ).toBeVisible();

    await expect(
      page.getByText(
        "Transfer files or share text snippets with just a code or QR scan.",
      ),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Send Files" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Receive", exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "P2P", exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Sign In" }),
    ).toBeVisible();
  });

  test("navigates to the send flow", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Send Files" }).click();

    await expect(page).toHaveURL(/\/send$/);
  });

  test("navigates to the receive flow", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Receive", exact: true }).click();

    await expect(page).toHaveURL(/\/receive$/);
  });

  test("navigates to the P2P flow", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "P2P", exact: true }).click();

    await expect(page).toHaveURL(/\/p2p$/);
  });

  test("navigates to authentication", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/auth$/);
  });
});