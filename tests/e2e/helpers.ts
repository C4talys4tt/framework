import { randomBytes } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery";

export type Account = { name: string; email: string; password: string };

export function newAccount(name = "Enzo Marchetti"): Account {
  return { name, email: `e2e.${randomBytes(6).toString("hex")}@example.com`, password: PASSWORD };
}

/**
 * Next.js keeps recently visited routes mounted but hidden, so label lookups
 * must be limited to what is actually on screen.
 */
export function field(page: Page, label: string | RegExp): Locator {
  return page.getByLabel(label, { exact: typeof label === "string" }).filter({ visible: true });
}

/** Resolves once the workspace shell has hydrated and responds to input. */
export async function shellReady(page: Page): Promise<void> {
  await expect(page.locator("[data-shell-ready]").filter({ visible: true })).toBeVisible();
}

/** Opens a path inside the current workspace and waits until it is interactive. */
export async function openInWorkspace(page: Page, path: string): Promise<void> {
  await page.goto(`/w/${workspaceSlug(page)}/${path}`);
  await shellReady(page);
}

/** The auth forms' error message (Next.js adds its own alert region for route changes). */
export function formAlert(page: Page): Locator {
  return page.getByRole("main").getByRole("alert");
}

/** Runs an interaction and waits for the server action it triggers to finish. */
export async function andSaved(page: Page, interaction: () => Promise<void>): Promise<void> {
  const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.ok());
  await interaction();
  await saved;
}

export async function signUp(page: Page, account: Account = newAccount()): Promise<Account> {
  await page.goto("/sign-up");
  await field(page, "Name").fill(account.name);
  await field(page, "Email").fill(account.email);
  await field(page, "Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/w\/[a-z0-9-]+\/overview$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Welcome, / })).toBeVisible();
  await shellReady(page);
  return account;
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto("/sign-in");
  await field(page, "Email").fill(account.email);
  await field(page, "Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/w\/[a-z0-9-]+\/overview$/);
  await shellReady(page);
}

export async function signOut(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Account menu for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in$/);
}

export function workspaceSlug(page: Page): string {
  const match = new URL(page.url()).pathname.match(/^\/w\/([^/]+)/);
  if (!match) throw new Error(`Not inside a workspace: ${page.url()}`);
  return match[1]!;
}

export function sidebar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Workspace" });
}

/** Fails the test if the page logs an error or throws. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
