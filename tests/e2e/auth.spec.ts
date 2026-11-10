import { expect, test } from "@playwright/test";
import { field, formAlert, newAccount, signOut, signUp, trackPageErrors, workspaceSlug } from "./helpers";

test.describe("authentication", () => {
  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a new account lands in its own workspace with no errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    const account = await signUp(page, newAccount("Enzo Marchetti"));

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Enzo");
    await expect(page.getByRole("button", { name: /^Workspace: Enzo’s Studio/ })).toBeVisible();
    await expect(page.getByRole("button", { name: `Account menu for ${account.name}` })).toContainText(account.email);
    await expect(page).toHaveTitle("Overview · FRAMEWORK");
    expect(errors).toEqual([]);
  });

  test("sign-up explains invalid input without contacting the server", async ({ page }) => {
    await page.goto("/sign-up");
    await field(page, "Email").fill("not-an-email");
    await field(page, "Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await expect(field(page, "Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test("an email address can only be registered once", async ({ page, browser }) => {
    const account = await signUp(page);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/sign-up");
    await field(otherPage, "Name").fill("Impostor");
    await field(otherPage, "Email").fill(account.email.toUpperCase());
    await field(otherPage, "Password").fill("another long password");
    await otherPage.getByRole("button", { name: "Create account" }).click();
    await expect(formAlert(otherPage)).toContainText("already exists");
    await other.close();
  });

  test("signing out ends the session and signing in restores it", async ({ page }) => {
    const account = await signUp(page);
    const slug = workspaceSlug(page);

    await signOut(page, account.name);
    await page.goto(`/w/${slug}/overview`);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Fw%2F${slug}$`));

    // Signing in returns to the workspace that was requested.
    await field(page, "Email").fill(account.email);
    await field(page, "Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/overview$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Enzo");
  });

  test("wrong credentials are rejected with a generic message", async ({ page }) => {
    const account = await signUp(page);
    await signOut(page, account.name);

    await field(page, "Email").fill(account.email);
    await field(page, "Password").fill("definitely the wrong one");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toHaveText("That email and password don't match an account.");

    await field(page, "Email").fill("nobody@example.com");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(formAlert(page)).toHaveText("That email and password don't match an account.");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the sign-in redirect cannot be pointed at another site", async ({ page }) => {
    const account = await signUp(page);
    await signOut(page, account.name);
    await page.goto("/sign-in?next=https://evil.example/");
    await field(page, "Email").fill(account.email);
    await field(page, "Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/w\/[a-z0-9-]+\/overview$/);
  });

  test("signed-in users skip the auth pages", async ({ page }) => {
    await signUp(page);
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/w\/[a-z0-9-]+\/overview$/);
  });

  test("the auth API enforces the same rules as the forms", async ({ request }) => {
    const attempt = (body: Record<string, string>) =>
      request.post("/api/auth/sign-up/email", { data: { name: "Direct Caller", password: "long enough password", ...body } });

    const longName = await attempt({ email: "direct.one@example.com", name: "x".repeat(61) });
    expect(longName.status()).toBe(400);
    expect((await longName.json()).code).toBe("INVALID_NAME");

    const blankName = await attempt({ email: "direct.two@example.com", name: "   " });
    expect(blankName.status()).toBe(400);

    const shortPassword = await attempt({ email: "direct.three@example.com", password: "short" });
    expect(shortPassword.status()).toBe(400);
    expect((await shortPassword.json()).code).toBe("PASSWORD_TOO_SHORT");
  });

  test("the session endpoint only describes the caller's own session", async ({ page, request }) => {
    const response = await request.get("/api/auth/get-session");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toBeNull();

    const account = await signUp(page);
    const session = await page.request.get("/api/auth/get-session");
    expect((await session.json()).user.email).toBe(account.email);
  });
});
