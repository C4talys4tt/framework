import { expect, test } from "@playwright/test";
import { andSaved, shellReady, sidebar, signUp, workspaceSlug } from "./helpers";

const PLANNED = ["Visual Library", "Production", "Assets", "Effects Lab", "Journal", "Archive"];

test.describe("workspace shell", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("the sidebar marks the current page", async ({ page }) => {
    await expect(sidebar(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(sidebar(page).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Settings");
  });

  test("modules that are not built yet are visibly and semantically unavailable", async ({ page }) => {
    const url = page.url();
    for (const label of PLANNED) {
      const item = sidebar(page).getByRole("link", { name: new RegExp(`^${label} is not available yet`) });
      await expect(item).toBeVisible();
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).not.toHaveAttribute("href");
      await item.click({ force: true });
    }
    await expect(page).toHaveURL(url);

    // Their routes do not exist either.
    await page.goto(`/w/${workspaceSlug(page)}/library`);
    await expect(page.getByRole("heading", { name: "This page is out of frame" })).toBeVisible();
  });

  test("the sidebar collapses, keeps working, and remembers its state", async ({ page }) => {
    const rail = page.locator("aside");
    await expect(rail).toHaveAttribute("data-collapsed", "false");

    await andSaved(page, () => page.getByRole("button", { name: "Collapse sidebar" }).click());
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect(sidebar(page).getByRole("link", { name: "Overview" })).toBeVisible();

    await page.reload();
    await shellReady(page);
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");

    await andSaved(page, () => page.keyboard.press("Control+b"));
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
    await page.reload();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  });

  test("the command palette navigates by keyboard alone", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.type("appear");
    await expect(palette.getByRole("option", { name: "Settings / Appearance" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });

  test("the command palette lists unfinished modules as disabled", async ({ page }) => {
    await page.getByRole("button", { name: "Search and commands" }).click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await page.keyboard.type("library");
    const option = palette.getByRole("option", { name: /Visual Library/ });
    await expect(option).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(palette).toBeVisible();
    await expect(page).toHaveURL(/\/overview$/);

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("an empty search explains itself", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("zzzz-nothing");
    await expect(page.getByText("No commands match your search.")).toBeVisible();
  });

  test("go-to shortcuts navigate, but not while typing", async ({ page }) => {
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await expect(page).toHaveURL(/\/settings\/profile$/);

    const name = page.getByLabel("Display name").filter({ visible: true });
    await name.click();
    await page.keyboard.type("go");
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(name).toHaveValue(/go$/);

    await page.getByRole("heading", { name: "Settings", level: 1 }).click();
    await page.keyboard.press("g");
    await page.keyboard.press("o");
    await expect(page).toHaveURL(/\/overview$/);
  });

  test("keyboard users can skip to the content", async ({ page }) => {
    await page.reload();
    await shellReady(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("on a phone the navigation lives in a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("aside")).toBeHidden();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(drawer).toBeHidden();
  });
});
