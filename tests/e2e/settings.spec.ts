import { expect, test } from "@playwright/test";
import { field, formAlert, openInWorkspace, signIn, signOut, signUp } from "./helpers";

test.describe("settings", () => {
  test("settings sections are reachable from the tab bar", async ({ page }) => {
    await signUp(page);
    await openInWorkspace(page, "settings");
    await expect(page).toHaveURL(/\/settings\/profile$/);

    const tabs = page.getByRole("navigation", { name: "Settings" });
    for (const [label, heading] of [
      ["Appearance", "Interface"],
      ["Workspace", "General"],
      ["Account", "Password"],
      ["Profile", "Profile"],
    ] as const) {
      await tabs.getByRole("link", { name: label }).click();
      await expect(tabs.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 2, name: heading }).filter({ visible: true })).toBeVisible();
    }
  });

  test("changing the display name updates the whole shell", async ({ page }) => {
    const account = await signUp(page);
    await openInWorkspace(page, "settings/profile");

    await expect(field(page, "Email")).toHaveValue(account.email);
    await expect(field(page, "Email")).toHaveAttribute("readonly", "");

    await field(page, "Display name").fill("Enzo M.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu for Enzo M." })).toBeVisible();

    await page.reload();
    await expect(field(page, "Display name")).toHaveValue("Enzo M.");
  });

  test("changing the password requires the current one and takes effect", async ({ page }) => {
    const account = await signUp(page);
    await openInWorkspace(page, "settings/account");
    const newPassword = "a much better passphrase";

    await field(page, "Current password").fill("not my password");
    await field(page, "New password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your current password is incorrect.")).toBeVisible();

    await field(page, "Current password").fill(account.password);
    await field(page, "New password").fill("short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

    await field(page, "New password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();
    await expect(field(page, "Current password")).toHaveValue("");

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL(/\/sign-in$/);

    await field(page, "Email").fill(account.email);
    await field(page, "Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toContainText("don't match");

    await signIn(page, { ...account, password: newPassword });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Enzo");
    await signOut(page, account.name);
  });
});
