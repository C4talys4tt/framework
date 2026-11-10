import { expect, test } from "@playwright/test";
import { field, newAccount, openInWorkspace, shellReady, signUp, workspaceSlug } from "./helpers";

test.describe("workspaces", () => {
  test("one user cannot open or discover another user's workspace", async ({ page, browser }) => {
    await signUp(page, newAccount("Alice Archer"));
    const aliceSlug = workspaceSlug(page);

    const other = await browser.newContext();
    const bobPage = await other.newPage();
    await signUp(bobPage, newAccount("Bob Baker"));
    const bobSlug = workspaceSlug(bobPage);
    expect(bobSlug).not.toBe(aliceSlug);

    for (const path of ["overview", "settings/workspace", "settings/profile", ""]) {
      await bobPage.goto(`/w/${aliceSlug}/${path}`);
      await expect(bobPage.getByRole("heading", { name: "This page is out of frame" })).toBeVisible();
      await expect(bobPage.getByText("Alice")).toHaveCount(0);
    }

    await bobPage.goto(`/w/${bobSlug}/overview`);
    await bobPage.getByRole("button", { name: /^Workspace: Bob’s Studio/ }).click();
    await expect(bobPage.getByRole("menuitem")).toHaveText(["BSBob’s Studio", "New workspace…"]);
    await other.close();
  });

  test("a workspace that does not exist looks the same as one you cannot access", async ({ page }) => {
    await signUp(page);
    await page.goto("/w/no-such-workspace-zzzzz/overview");
    await expect(page.getByRole("heading", { name: "This page is out of frame" })).toBeVisible();
    await page.goto("/w/Not%20A%20Slug!/overview");
    await expect(page.getByRole("heading", { name: "This page is out of frame" })).toBeVisible();
  });

  test("creating a second workspace and switching between them", async ({ page }) => {
    await signUp(page);
    const firstSlug = workspaceSlug(page);

    await page.getByRole("button", { name: /^Workspace: Enzo’s Studio/ }).click();
    await page.getByRole("menuitem", { name: "New workspace…" }).click();
    const dialog = page.getByRole("dialog", { name: "New workspace" });
    await expect(field(page, "Name")).toBeFocused();

    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(dialog.getByText("Give the workspace a name.")).toBeVisible();

    await field(page, "Name").fill("Northlight Post");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/northlight-post-[a-z0-9]{5}\/overview$/);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^Workspace: Northlight Post/ })).toBeVisible();
    await expect(page.getByRole("definition").first()).toHaveText("Northlight Post");
    await shellReady(page);

    await page.keyboard.press("Control+k");
    await page.keyboard.type("switch enzo");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/w/${firstSlug}/overview$`));
    await expect(page.getByRole("button", { name: /^Workspace: Enzo’s Studio/ })).toBeVisible();

    // The home route opens the user's first workspace.
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`/w/${firstSlug}/overview$`));
  });

  test("preferences stay consistent when moving between workspaces", async ({ page }) => {
    await signUp(page);
    const firstSlug = workspaceSlug(page);

    await page.keyboard.press("Control+k");
    await page.keyboard.type("new workspace");
    await page.keyboard.press("Enter");
    await field(page, "Name").fill("Second Unit");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/second-unit-[a-z0-9]{5}\/overview$/);
    await shellReady(page);

    // Change preferences while in the second workspace...
    await page.keyboard.press("Control+k");
    await page.keyboard.type("theme light");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+b");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // ...then return to the first, which Next.js kept mounted in the background.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/w/${firstSlug}/overview$`));
    await shellReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("aside").filter({ visible: true })).toHaveAttribute("data-collapsed", "true");
  });

  test("an owner can rename their workspace", async ({ page }) => {
    await signUp(page);
    const slug = workspaceSlug(page);
    await openInWorkspace(page, "settings/workspace");

    const save = page.getByRole("button", { name: "Save workspace" });
    await expect(save).toBeDisabled();
    await field(page, "Workspace name").fill("   ");
    await save.click();
    await expect(page.getByText("Give the workspace a name.")).toBeVisible();

    await field(page, "Workspace name").fill("Marchetti Motion");
    await save.click();
    await expect(page.getByText("Workspace saved")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Workspace: Marchetti Motion/ })).toBeVisible();
    // Renaming never changes the address.
    await expect(page.getByText(`/w/${slug}`, { exact: true })).toBeVisible();

    await page.reload();
    await expect(field(page, "Workspace name")).toHaveValue("Marchetti Motion");
  });
});
