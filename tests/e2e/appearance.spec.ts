import { expect, test } from "@playwright/test";
import { openInWorkspace, shellReady, signIn, signOut, signUp } from "./helpers";

const html = (page: import("@playwright/test").Page) => page.locator("html");
const canvasColor = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("appearance", () => {
  test("defaults to the dark charcoal theme", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    expect(await canvasColor(page)).toBe("rgb(10, 11, 13)");
  });

  test("theme changes apply immediately and survive a reload without flashing", async ({ page }) => {
    await signUp(page);
    await openInWorkspace(page, "settings/appearance");

    await page.getByRole("radio", { name: "Light" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await canvasColor(page)).toBe("rgb(243, 244, 246)");
    await expect(page.getByText("Saved to your account")).toBeVisible();

    // The attribute must already be correct when the document is first parsed,
    // before any application JavaScript has run.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await canvasColor(page)).toBe("rgb(243, 244, 246)");
    await page.unroute("**/_next/static/**/*.js");

    await page.reload();
    await shellReady(page);
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  test("preferences follow the account to a fresh browser", async ({ page, browser }) => {
    const account = await signUp(page);
    await openInWorkspace(page, "settings/appearance");
    await page.getByRole("radio", { name: "Light" }).click();
    await page.getByRole("radio", { name: "Compact" }).click();
    await page.getByRole("switch", { name: "Reduce motion" }).click();
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");
    await expect(page.getByText("Saved to your account")).toBeVisible();

    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto("/sign-in");
    await expect(html(freshPage)).toHaveAttribute("data-theme", "dark");
    await signIn(freshPage, account);
    await expect(html(freshPage)).toHaveAttribute("data-theme", "light");
    await expect(html(freshPage)).toHaveAttribute("data-density", "compact");
    await expect(html(freshPage)).toHaveAttribute("data-motion", "reduce");
    await fresh.close();
  });

  test("the system theme follows the operating system", async ({ page }) => {
    await signUp(page);
    await openInWorkspace(page, "settings/appearance");
    await page.getByRole("radio", { name: "System" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "system");

    await page.emulateMedia({ colorScheme: "light" });
    expect(await canvasColor(page)).toBe("rgb(243, 244, 246)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await canvasColor(page)).toBe("rgb(10, 11, 13)");
  });

  test("the theme can be changed from the command palette and the choice is kept after signing out", async ({ page }) => {
    const account = await signUp(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("theme light");
    await page.keyboard.press("Enter");
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    await signOut(page, account.name);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });

  test("the theme controls are operable with arrow keys", async ({ page }) => {
    await signUp(page);
    await openInWorkspace(page, "settings/appearance");
    await page.getByRole("radio", { name: "Dark" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});
