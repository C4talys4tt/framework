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

// ---------------------------------------------------------------------------
// Direct database access, for arranging states the interface cannot (yet) create,
// such as a second member in a workspace. Never used to check results of UI actions.
// ---------------------------------------------------------------------------

function e2eDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://framework:framework@127.0.0.1:5432/framework_dev");
  url.pathname = `${url.pathname}_e2e`;
  return url.toString();
}

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Adds `account` to the workspace with the given slug as a plain member. */
export async function addMember(slug: string, account: Account): Promise<void> {
  await sql(
    `insert into public.workspace_members (workspace_id, user_id, role)
     select w.id, u.id, 'member' from public.workspaces w, public.auth_users u where w.slug = $1 and u.email = $2`,
    [slug, account.email],
  );
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type NewProject = {
  name: string;
  status?: string;
  category?: string;
  priority?: string;
  client?: string;
  startDate?: string;
  dueDate?: string;
  description?: string;
  tags?: string[];
  details?: { name: string; value: string }[];
};

export function projectsPath(page: Page): string {
  return `/w/${workspaceSlug(page)}/projects`;
}

/** Opens the project list and waits until it is interactive. */
export async function openProjects(page: Page, query = ""): Promise<void> {
  await page.goto(`${projectsPath(page)}${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await shellReady(page);
}

/** Creates a project through the dialog and returns its id once its page has opened. */
export async function createProject(page: Page, project: NewProject): Promise<string> {
  await openProjects(page);
  await page.getByRole("button", { name: /^(New project|Create your first project)$/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill(project.name);
  if (project.status) await dialog.getByLabel("Status").selectOption({ label: project.status });
  if (project.category) await dialog.getByLabel("Category").selectOption({ label: project.category });
  if (project.priority) await dialog.getByLabel("Priority").selectOption(project.priority);
  if (project.client) await dialog.getByLabel("Client").fill(project.client);
  if (project.startDate) await dialog.getByLabel("Start date").fill(project.startDate);
  if (project.dueDate) await dialog.getByLabel("Due date").fill(project.dueDate);
  if (project.description) await dialog.getByLabel("Description").fill(project.description);
  for (const tag of project.tags ?? []) {
    const input = dialog.getByLabel("Tags", { exact: true });
    await input.fill(tag);
    await input.press("Enter");
  }
  for (const [index, detail] of (project.details ?? []).entries()) {
    await dialog.getByRole("button", { name: "Add detail" }).click();
    await dialog.getByLabel(`Detail ${index + 1} name`).fill(detail.name);
    await dialog.getByLabel(`Detail ${index + 1} value`).fill(detail.value);
  }
  await dialog.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: project.name })).toBeVisible();
  await shellReady(page);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/** Local calendar date offset from today, as the date inputs expect it (YYYY-MM-DD). */
export function dateFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The names shown in the project list, in order. */
export async function listedProjectNames(page: Page): Promise<string[]> {
  const rows = page.getByRole("list", { name: "Projects" }).filter({ visible: true }).getByRole("link");
  return rows.evaluateAll((links) => links.map((link) => link.querySelector("span.truncate")?.textContent ?? ""));
}

export function activityItems(page: Page): Locator {
  return page.getByRole("list", { name: "Activity" }).filter({ visible: true }).getByRole("listitem");
}
