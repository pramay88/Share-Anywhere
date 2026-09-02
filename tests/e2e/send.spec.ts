import { expect, test } from "@playwright/test";
import { createFile, testFiles } from "./fixtures/test-files";

const customCodePlaceholder = "Enter custom code (6+ characters)";
const textPlaceholder = "Paste or type your text, link, or code here...";

test.describe("Send page", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/send");
        await expect(
            page.getByRole("heading", { name: "Send Files & Text" }),
        ).toBeVisible();
    });

    test("renders the send page correctly", async ({ page }) => {
        await expect(page.getByText("Select Files", { exact: true })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Text", exact: true })).toBeVisible();
        await expect(page.getByText("Max 50MB per file")).toBeVisible();
        await expect(page.getByPlaceholder(customCodePlaceholder)).toBeVisible();
    });

    test("allows the user to select a valid file", async ({ page }) => {
        await page.locator('input[type="file"]').setInputFiles(testFiles.small);
        await expect(page.getByText("Uploading Files...")).toBeVisible();
    });

    test("supports selecting multiple files", async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toHaveAttribute("multiple", "");

        const secondFile = createFile("test-image.png", 1, "i");
        await fileInput.setInputFiles([testFiles.small, secondFile]);
        await expect(page.getByText("Uploading Files...")).toBeVisible();
    });

    test("normalizes a custom code to uppercase", async ({ page }) => {
        const codeInput = page.getByPlaceholder(customCodePlaceholder);
        await codeInput.fill("abc123");
        await expect(codeInput).toHaveValue("ABC123");
    });

    test("rejects a custom code shorter than the minimum length", async ({ page }) => {
        await page.getByPlaceholder(customCodePlaceholder).fill("ABC");
        await page.locator('input[type="file"]').setInputFiles(testFiles.small);

        await expect(
            page.getByText("Share code must be at least 6 characters long"),
        ).toBeVisible();
    });

    test("allows an empty custom code because it is optional", async ({ page }) => {
        await expect(page.getByPlaceholder(customCodePlaceholder)).toHaveValue("");
    });

    test("accepts a file below the 50 MB limit", async ({ page }) => {
        const file = createFile("49mb.txt", 49 * 1024 * 1024);
        await page.locator('input[type="file"]').setInputFiles(file);
        await expect(page.getByText("Uploading Files...")).toBeVisible();
    });

    test("accepts a file exactly at the 50 MB limit", async ({ page }) => {
        const file = createFile("50mb.txt", 50 * 1024 * 1024);
        await page.locator('input[type="file"]').setInputFiles(file);
        await expect(page.getByText("Uploading Files...")).toBeVisible();
    });

    test("rejects a file above the 50 MB limit", async ({ page }) => {
        const file = createFile("51mb.txt", 51 * 1024 * 1024);
        await page.locator('input[type="file"]').setInputFiles(file);

        await expect(
            page.getByText(/"51mb\.txt" is too large.*Maximum file size is 50MB/i),
        ).toBeVisible();
    });

    test("switches from file mode to text mode", async ({ page }) => {
        await page.getByRole("tab", { name: "Text", exact: true }).click();
        await expect(page.getByPlaceholder(textPlaceholder)).toBeVisible();
    });

    test("allows entering text to share", async ({ page }) => {
        await page.getByRole("tab", { name: "Text", exact: true }).click();
        const textInput = page.getByPlaceholder(textPlaceholder);
        const message = "This is a test message from Playwright.";

        await textInput.fill(message);
        await expect(textInput).toHaveValue(message);
    });

    test("starts uploading when a file is selected", async ({ page }) => {
        await page.locator('input[type="file"]').setInputFiles(testFiles.small);
        await expect(page.getByText("Uploading Files...")).toBeVisible();
    });
});
