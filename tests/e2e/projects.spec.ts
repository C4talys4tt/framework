import { expect, test, type Page } from "@playwright/test";
import {
  activityItems,
  addMember,
  createProject,
  dateFromToday,
  listedProjectNames,
  newAccount,
  openProjects,
  projectsPath,
  shellReady,
  signUp,
  sql,
  trackPageErrors,
  workspaceSlug,
} from "./helpers";

const NOT_FOUND = "This page is out of frame";

async function openTab(page: Page, name: "Overview" | "Notes" | "Activity") {
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name }).click();
}

test.describe("projects: create, read, edit", () => {
  test("a new workspace starts empty, with default statuses and categories ready", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    await openProjects(page);
    await expect(page.getByText("No projects yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create your first project" })).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Projects" }).click();
    const statuses = page.getByRole("list", { name: "Statuses" }).filter({ visible: true });
    await expect(statuses.getByRole("listitem")).toHaveCount(5);
    await expect(statuses).toContainText("Planning");
    await expect(statuses).toContainText("Delivered");
    await expect(page.getByRole("list", { name: "Categories" }).filter({ visible: true }).getByRole("listitem")).toHaveCount(5);
    expect(errors).toEqual([]);
  });

  test("creates a project with every field and shows it everywhere it belongs", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    const due = dateFromToday(10);
    await createProject(page, {
      name: "Northlight title sequence",
      status: "In progress",
      category: "Motion design",
      priority: "high",
      client: "Northlight Studio",
      startDate: dateFromToday(-2),
      dueDate: due,
      description: "30 second title sequence.\nDeliver ProRes 4444.",
      tags: ["festival", "Title Design"],
      details: [{ name: "Frame rate", value: "24 fps" }],
    });

    // Detail page
    await expect(page.getByRole("button", { name: /^Status: In progress/ })).toBeVisible();
    const header = page.locator("main");
    await expect(header).toContainText("Motion design");
    await expect(header).toContainText("High");
    await expect(header).toContainText("Northlight Studio");
    await expect(page.getByRole("list", { name: "Tags" }).filter({ visible: true })).toContainText("festival");
    await expect(page.getByRole("list", { name: "Tags" }).filter({ visible: true })).toContainText("Title Design");
    const description = page.getByRole("region", { name: "Description" }).filter({ visible: true });
    await expect(description).toContainText("30 second title sequence.");
    await expect(description).toContainText("Deliver ProRes 4444.");
    await expect(page.getByRole("term").filter({ hasText: "Frame rate" })).toBeVisible();
    await expect(page.getByText("24 fps")).toBeVisible();

    // List
    await openProjects(page);
    const row = page.getByRole("list", { name: "Projects" }).getByRole("link", { name: /Northlight title sequence/ });
    await expect(row).toContainText("Northlight Studio");
    await expect(row).toContainText("In progress");
    await expect(row).toContainText("#festival");
    await expect(page.getByText("1 project", { exact: true })).toBeVisible();

    // Overview: recent work
    await page.getByRole("link", { name: "Overview" }).first().click();
    await expect(page.getByRole("list", { name: "Recently updated projects" })).toContainText("Northlight title sequence");
    expect(errors).toEqual([]);
  });

  test("explains invalid input per field and focuses the first problem", async ({ page }) => {
    await signUp(page);
    await openProjects(page);
    await page.getByRole("button", { name: "Create your first project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();

    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog.getByText("Give the project a name.")).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();

    await dialog.getByLabel("Name", { exact: true }).fill("Dates");
    await dialog.getByLabel("Start date").fill("2026-06-10");
    await dialog.getByLabel("Due date").fill("2026-06-01");
    await dialog.getByRole("button", { name: "Add detail" }).click();
    await dialog.getByLabel("Detail 1 name").fill("Codec");
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog.getByText("The due date can’t be before the start date.")).toBeVisible();
    await expect(dialog.getByText("Every field needs a value.")).toBeVisible();
    await expect(dialog.getByLabel("Due date")).toBeFocused();
    await expect(page).toHaveURL(/\/projects$/);

    // Fixing the problems lets it through.
    await dialog.getByLabel("Due date").fill("2026-06-20");
    await dialog.getByLabel("Detail 1 value").fill("ProRes");
    await dialog.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  });

  test("edits a project and records each change in its activity", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Before", status: "Planning", tags: ["old"] });

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit project" });
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Before");
    await dialog.getByLabel("Name", { exact: true }).fill("After");
    await dialog.getByLabel("Priority").selectOption("urgent");
    await dialog.getByLabel("Client").fill("Acme");
    await dialog.getByLabel("Due date").fill("2026-12-24");
    await dialog.getByRole("button", { name: "Remove tag old" }).click();
    await dialog.getByLabel("Tags", { exact: true }).fill("new");
    await dialog.getByLabel("Tags", { exact: true }).press("Enter");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("heading", { level: 1, name: "After" })).toBeVisible();
    await expect(page.locator("main")).toContainText("Urgent");
    await expect(page.locator("main")).toContainText("Acme");
    await expect(page.getByRole("list", { name: "Tags" }).filter({ visible: true })).toContainText("new");
    await expect(page.getByRole("list", { name: "Tags" }).filter({ visible: true })).not.toContainText("old");

    await openTab(page, "Activity");
    const items = activityItems(page);
    await expect(items.filter({ hasText: "changed the name from “Before” to “After”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "changed the priority from normal to urgent" })).toHaveCount(1);
    await expect(items.filter({ hasText: "set the client to “Acme”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "set the due date to 24 Dec 2026" })).toHaveCount(1);
    await expect(items.filter({ hasText: "added the tag “new”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "removed the tag “old”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "created the project" })).toHaveCount(1);
    await expect(items.first()).toContainText("Enzo Marchetti");
  });

  test("saving without changes adds nothing to the activity", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Steady", tags: ["same"] });
    await openTab(page, "Activity");
    const before = await activityItems(page).count();

    await openTab(page, "Overview");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await openTab(page, "Activity");
    await expect(activityItems(page)).toHaveCount(before);
  });

  test("changes status from the header menu", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Moving" });
    await page.getByRole("button", { name: /^Status: Planning/ }).click();
    await page.getByRole("menuitem", { name: "In review" }).click();
    await expect(page.getByRole("button", { name: /^Status: In review/ })).toBeVisible();

    await openTab(page, "Activity");
    await expect(activityItems(page).first()).toContainText("changed the status from “Planning” to “In review”");
  });

  test("flags an overdue project, but not once it is finished", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Late one", dueDate: dateFromToday(-3) });
    await openProjects(page);
    const row = page.getByRole("list", { name: "Projects" }).getByRole("link", { name: /Late one/ });
    await expect(row.getByText("Overdue")).toBeVisible();

    await row.click();
    await page.getByRole("button", { name: /^Status:/ }).click();
    await page.getByRole("menuitem", { name: "Delivered" }).click();
    await expect(page.getByRole("button", { name: /^Status: Delivered/ })).toBeVisible();
    await openProjects(page);
    await expect(page.getByRole("list", { name: "Projects" }).getByRole("link", { name: /Late one/ }).getByText("Overdue")).toHaveCount(0);
  });
});

test.describe("projects: list, search and filters", () => {
  test("searches, filters, sorts, and keeps all of it in the URL", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Alpha reel", client: "Acme", category: "Editing", priority: "low", tags: ["reel"] });
    await createProject(page, { name: "Bravo spot", client: "Globex", category: "Film", status: "In progress", priority: "urgent", tags: ["reel", "spot"] });
    await createProject(page, { name: "Charlie 100% pass", description: "needle in here", dueDate: dateFromToday(30) });

    await openProjects(page);
    expect(await listedProjectNames(page)).toEqual(["Charlie 100% pass", "Bravo spot", "Alpha reel"]);

    // Search (debounced), reflected in the URL, case-insensitive.
    await page.getByRole("searchbox", { name: "Search projects" }).fill("GLOBEX");
    await expect(page).toHaveURL(/[?&]q=GLOBEX/);
    await expect.poll(() => listedProjectNames(page)).toEqual(["Bravo spot"]);
    await page.getByRole("searchbox", { name: "Search projects" }).fill("needle");
    await expect.poll(() => listedProjectNames(page)).toEqual(["Charlie 100% pass"]);
    await page.getByRole("searchbox", { name: "Search projects" }).fill("%");
    // The search is debounced: wait for it to reach the URL before relying on it (and before reloading).
    await expect(page).toHaveURL(/[?&]q=%25(&|$)/);
    await expect.poll(() => listedProjectNames(page)).toEqual(["Charlie 100% pass"]);

    // The filtered view survives a reload.
    await page.reload();
    await shellReady(page);
    await expect(page.getByRole("searchbox", { name: "Search projects" })).toHaveValue("%");
    expect(await listedProjectNames(page)).toEqual(["Charlie 100% pass"]);

    // Nothing matches: an explanation and a way out.
    await page.getByRole("searchbox", { name: "Search projects" }).fill("zzz-nothing");
    await expect(page.getByText("No projects match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("searchbox", { name: "Search projects" })).toHaveValue("");
    await expect.poll(() => listedProjectNames(page)).toHaveLength(3);

    // Select filters.
    await page.getByLabel("Status", { exact: true }).selectOption({ label: "In progress" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Bravo spot"]);
    await page.getByLabel("Status", { exact: true }).selectOption({ label: "All statuses" });
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "Editing" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Alpha reel"]);
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "No category" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Charlie 100% pass"]);
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "All categories" });
    await page.getByLabel("Tag", { exact: true }).selectOption({ label: "reel (2)" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Bravo spot", "Alpha reel"]);

    // Sorting.
    await page.getByLabel("Sort by").selectOption({ label: "Name" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Alpha reel", "Bravo spot"]);
    await page.getByLabel("Sort by").selectOption({ label: "Priority" });
    await expect.poll(() => listedProjectNames(page)).toEqual(["Bravo spot", "Alpha reel"]);
    await expect(page).toHaveURL(/sort=priority/);
  });

  test("tags on a project lead to a filtered list", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Tagged one", tags: ["grade"] });
    await createProject(page, { name: "Untagged" });
    await page.goto(`${projectsPath(page)}`);
    await page.getByRole("list", { name: "Projects" }).getByRole("link", { name: /Tagged one/ }).click();
    await page.getByRole("list", { name: "Tags" }).filter({ visible: true }).getByRole("link", { name: "grade" }).click();
    await expect(page).toHaveURL(/tag=grade/);
    await expect.poll(() => listedProjectNames(page)).toEqual(["Tagged one"]);
  });

  test("pages through a long list", async ({ page }) => {
    await signUp(page);
    const slug = workspaceSlug(page);
    await sql(
      `insert into public.projects (workspace_id, name, status_id, created_by)
       select w.id, 'Seeded ' || lpad(n::text, 2, '0'),
              (select s.id from public.project_statuses s where s.workspace_id = w.id order by s.position limit 1),
              w.created_by
       from public.workspaces w, generate_series(1, 27) n where w.slug = $1`,
      [slug],
    );
    await openProjects(page, "?sort=name");
    await expect(page.getByText("27 projects")).toBeVisible();
    expect(await listedProjectNames(page)).toHaveLength(25);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    expect(await listedProjectNames(page)).toEqual(["Seeded 26", "Seeded 27"]);

    // A page past the end lands on the last real one instead of an empty screen.
    await openProjects(page, "?sort=name&page=9");
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
  });
});

test.describe("projects: notes", () => {
  test("adds, pins, edits and deletes notes", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    await createProject(page, { name: "With notes" });
    await openTab(page, "Notes");
    await expect(page.getByText("No notes yet")).toBeVisible();

    const composer = page.getByRole("form", { name: "New note" });
    await composer.getByRole("button", { name: "Add note" }).click();
    await expect(composer.getByText("Write something first.")).toBeVisible();

    await composer.getByLabel("Title (optional)").fill("First thoughts");
    await composer.getByLabel("Note", { exact: true }).fill("Line one\nLine two <b>not bold</b>");
    await composer.getByRole("button", { name: "Add note" }).click();
    const first = page.getByRole("article", { name: "First thoughts" });
    await expect(first).toBeVisible();
    await expect(first).toContainText("Line two <b>not bold</b>");
    await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /Notes/ })).toContainText("1");
    // The composer is empty again, ready for the next one.
    await expect(composer.getByLabel("Note", { exact: true })).toHaveValue("");

    await composer.getByLabel("Note", { exact: true }).fill("Second, untitled");
    await composer.getByRole("button", { name: "Add note" }).click();
    const notes = page.getByRole("list", { name: "Notes" }).filter({ visible: true }).getByRole("article");
    await expect(notes).toHaveCount(2);
    await expect(notes.first()).toContainText("Second, untitled");

    // Pinning moves a note to the top.
    await first.getByRole("button", { name: "Pin note" }).click();
    await expect(notes.first()).toContainText("First thoughts");
    await expect(first.getByLabel("Pinned")).toBeVisible();

    // Editing.
    await first.getByRole("button", { name: "Edit note" }).click();
    const editor = page.getByRole("form", { name: "Edit note" });
    await editor.getByLabel("Note", { exact: true }).fill("Rewritten");
    await editor.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("article", { name: "First thoughts" })).toContainText("Rewritten");
    await expect(page.getByRole("article", { name: "First thoughts" })).toContainText("edited");

    // Cancelling an edit changes nothing.
    await page.getByRole("article", { name: "First thoughts" }).getByRole("button", { name: "Edit note" }).click();
    await page.getByRole("form", { name: "Edit note" }).getByLabel("Note", { exact: true }).fill("Discard me");
    await page.getByRole("form", { name: "Edit note" }).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("article", { name: "First thoughts" })).toContainText("Rewritten");

    // Deleting asks first.
    await page.getByRole("article", { name: "First thoughts" }).getByRole("button", { name: "Delete note" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this note?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(notes).toHaveCount(2);
    await page.getByRole("article", { name: "First thoughts" }).getByRole("button", { name: "Delete note" }).click();
    await confirm.getByRole("button", { name: "Delete note" }).click();
    await expect(notes).toHaveCount(1);

    await openTab(page, "Activity");
    const items = activityItems(page);
    await expect(items.filter({ hasText: "added a note “First thoughts”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "pinned a note “First thoughts”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "edited a note “First thoughts”" })).toHaveCount(1);
    await expect(items.filter({ hasText: "deleted a note “First thoughts”" })).toHaveCount(1);
    // Note text is not copied into history.
    await expect(page.getByText("Rewritten")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("notes belong to their project", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Project A" });
    await openTab(page, "Notes");
    const composer = page.getByRole("form", { name: "New note" });
    await composer.getByLabel("Note", { exact: true }).fill("Only on A");
    await composer.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Only on A")).toBeVisible();

    await createProject(page, { name: "Project B" });
    await openTab(page, "Notes");
    await expect(page.getByText("No notes yet")).toBeVisible();
    await expect(page.getByText("Only on A")).toHaveCount(0);
  });
});

test.describe("projects: archive and restore", () => {
  test("archived projects leave the active list, are read-only, and can be restored", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Keeper" });
    const keeperUrl = page.url();
    await openTab(page, "Notes");
    await page.getByRole("form", { name: "New note" }).getByLabel("Note", { exact: true }).fill("Existing note");
    await page.getByRole("form", { name: "New note" }).getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Existing note")).toBeVisible();
    await createProject(page, { name: "Archive me", tags: ["x"] });

    await page.getByRole("button", { name: "More project actions" }).click();
    await page.getByRole("menuitem", { name: "Archive project" }).click();
    const confirm = page.getByRole("dialog", { name: "Archive this project?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "More project actions" }).click();
    await page.getByRole("menuitem", { name: "Archive project" }).click();
    await confirm.getByRole("button", { name: "Archive project" }).click();

    // Read-only: banner, no edit, status is not a menu, notes cannot be added.
    await expect(page.getByRole("status").filter({ hasText: "This project was archived" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Change status/ })).toHaveCount(0);
    await openTab(page, "Notes");
    await expect(page.getByText("Notes are read-only while the project is archived.")).toBeVisible();
    await expect(page.getByRole("form", { name: "New note" })).toHaveCount(0);

    // Out of the active list; in the archived one.
    await openProjects(page);
    expect(await listedProjectNames(page)).toEqual(["Keeper"]);
    await page.getByRole("radio", { name: "Archived" }).click();
    await expect(page).toHaveURL(/view=archived/);
    await expect.poll(() => listedProjectNames(page)).toEqual(["Archive me"]);
    await expect(page.getByRole("list", { name: "Projects" }).getByText("Archived", { exact: true })).toBeVisible();

    // Restore.
    await page.getByRole("list", { name: "Projects" }).getByRole("link", { name: /Archive me/ }).click();
    await page.getByRole("button", { name: "Restore project" }).click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "This project was archived" })).toHaveCount(0);
    await openTab(page, "Activity");
    await expect(activityItems(page).first()).toContainText("restored the project");
    await expect(activityItems(page).filter({ hasText: "archived the project" })).toHaveCount(1);

    await openProjects(page);
    await expect.poll(() => listedProjectNames(page)).toHaveLength(2);
    await page.goto(keeperUrl);
    await expect(page.getByRole("heading", { level: 1, name: "Keeper" })).toBeVisible();
  });
});

test.describe("projects: workspace isolation", () => {
  test("another user cannot see, open or discover a project", async ({ page, browser }) => {
    await signUp(page, newAccount("Alice Archer"));
    const aliceSlug = workspaceSlug(page);
    const projectId = await createProject(page, { name: "Alice’s secret", client: "Hidden Co", tags: ["confidential"] });
    await openTab(page, "Notes");
    await page.getByRole("form", { name: "New note" }).getByLabel("Note", { exact: true }).fill("Private note text");
    await page.getByRole("form", { name: "New note" }).getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Private note text")).toBeVisible();

    const other = await browser.newContext();
    const bob = await other.newPage();
    await signUp(bob, newAccount("Bob Baker"));
    const bobSlug = workspaceSlug(bob);

    // Alice's workspace URLs, with and without the project id.
    for (const path of ["projects", `projects/${projectId}`, `projects/${projectId}/notes`, `projects/${projectId}/activity`, "settings/projects"]) {
      await bob.goto(`/w/${aliceSlug}/${path}`);
      await expect(bob.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    }
    // The project id under Bob's own workspace is also not found.
    for (const path of ["", "/notes", "/activity"]) {
      await bob.goto(`/w/${bobSlug}/projects/${projectId}${path}`);
      await expect(bob.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    }
    // Nonsense ids behave the same.
    await bob.goto(`/w/${bobSlug}/projects/not-a-uuid`);
    await expect(bob.getByRole("heading", { name: NOT_FOUND })).toBeVisible();

    // Bob's own list is empty and leaks nothing.
    await openProjects(bob);
    await expect(bob.getByText("No projects yet")).toBeVisible();
    await expect(bob.getByText("Alice’s secret")).toHaveCount(0);
    await bob.goto(`/w/${bobSlug}/projects?q=secret&view=all`);
    await expect(bob.getByText("Alice’s secret")).toHaveCount(0);
    await bob.goto(`/w/${bobSlug}/projects?tag=confidential&view=all`);
    await expect(bob.getByText("Alice’s secret")).toHaveCount(0);
    await bob.goto(`/w/${bobSlug}/overview`);
    await expect(bob.getByText("Alice’s secret")).toHaveCount(0);

    // Alice still has everything, untouched.
    await openProjects(page);
    expect(await listedProjectNames(page)).toEqual(["Alice’s secret"]);
    await other.close();
  });

  test("a user's other workspace does not show this workspace's projects", async ({ page }) => {
    await signUp(page);
    const firstSlug = workspaceSlug(page);
    const projectId = await createProject(page, { name: "In the first studio" });

    await page.getByRole("button", { name: /^Workspace: Enzo’s Studio/ }).click();
    await page.getByRole("menuitem", { name: "New workspace…" }).click();
    await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill("Second Unit");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/second-unit-[a-z0-9]{5}\/overview$/);
    await shellReady(page);
    const secondSlug = workspaceSlug(page);

    await openProjects(page);
    await expect(page.getByText("No projects yet")).toBeVisible();
    // The same user, the same project id, but the wrong workspace in the URL.
    await page.goto(`/w/${secondSlug}/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    await page.goto(`/w/${firstSlug}/projects/${projectId}`);
    await expect(page.getByRole("heading", { level: 1, name: "In the first studio" })).toBeVisible();
  });

  test("a member of a shared workspace can work on projects but not manage statuses or categories", async ({ page, browser }) => {
    await signUp(page, newAccount("Alice Archer"));
    const slug = workspaceSlug(page);
    const projectId = await createProject(page, { name: "Shared project" });
    await openTab(page, "Notes");
    await page.getByRole("form", { name: "New note" }).getByLabel("Note", { exact: true }).fill("Alice’s note");
    await page.getByRole("form", { name: "New note" }).getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Alice’s note")).toBeVisible();

    const other = await browser.newContext();
    const bob = await other.newPage();
    const bobAccount = await signUp(bob, newAccount("Bob Baker"));
    await addMember(slug, bobAccount);

    await bob.goto(`/w/${slug}/projects/${projectId}`);
    await expect(bob.getByRole("heading", { level: 1, name: "Shared project" })).toBeVisible();
    await shellReady(bob);
    await expect(bob.getByText("by Alice Archer")).toBeVisible();

    // Members edit projects…
    await bob.getByRole("button", { name: "Edit", exact: true }).click();
    await bob.getByRole("dialog", { name: "Edit project" }).getByLabel("Client").fill("Added by Bob");
    await bob.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save changes" }).click();
    await expect(bob.getByRole("dialog")).toBeHidden();
    await expect(bob.locator("main")).toContainText("Added by Bob");

    // …write their own notes, but cannot change Alice's.
    await openTab(bob, "Notes");
    const alicesNote = bob.getByRole("article", { name: "Untitled note" }).filter({ hasText: "Alice’s note" });
    await expect(alicesNote).toBeVisible();
    await expect(alicesNote.getByRole("button", { name: "Edit note" })).toHaveCount(0);
    await expect(alicesNote.getByRole("button", { name: "Delete note" })).toHaveCount(0);
    await bob.getByRole("form", { name: "New note" }).getByLabel("Note", { exact: true }).fill("Bob’s note");
    await bob.getByRole("form", { name: "New note" }).getByRole("button", { name: "Add note" }).click();
    const bobsNote = bob.getByRole("article", { name: "Untitled note" }).filter({ hasText: "Bob’s note" });
    await expect(bobsNote.getByRole("button", { name: "Edit note" })).toBeVisible();

    // Alice, as owner, can moderate Bob's note and sees who did what.
    await page.goto(`/w/${slug}/projects/${projectId}/notes`);
    await shellReady(page);
    const bobsNoteForAlice = page.getByRole("article", { name: "Untitled note" }).filter({ hasText: "Bob’s note" });
    await expect(bobsNoteForAlice.getByRole("button", { name: "Delete note" })).toBeVisible();
    await openTab(page, "Activity");
    await expect(activityItems(page).filter({ hasText: "Bob Baker set the client to “Added by Bob”" })).toHaveCount(1);

    // Statuses and categories are read-only for the member.
    await bob.goto(`/w/${slug}/settings/projects`);
    await expect(bob.getByRole("list", { name: "Statuses" }).filter({ visible: true }).getByRole("listitem")).toHaveCount(5);
    await expect(bob.getByText("Only an owner can change statuses.")).toBeVisible();
    await expect(bob.getByText("Only an owner can change categories.")).toBeVisible();
    await expect(bob.getByRole("button", { name: /^(Add|Edit|Delete|Move)/ })).toHaveCount(0);
    await other.close();
  });
});

test.describe("project settings: statuses and categories", () => {
  test("an owner manages statuses", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "Uses Planning" });
    await page.goto(`/w/${workspaceSlug(page)}/settings/projects`);
    await shellReady(page);
    const statuses = page.getByRole("list", { name: "Statuses" }).filter({ visible: true });

    // Add.
    await page.getByRole("button", { name: "Add status" }).click();
    const dialog = page.getByRole("dialog", { name: "Add status" });
    await expect(dialog.getByLabel("Name")).toBeFocused();
    await dialog.getByRole("button", { name: "Save status" }).click();
    await expect(dialog.getByText("Give it a name.")).toBeVisible();
    await dialog.getByLabel("Name").fill("planning");
    await dialog.getByRole("button", { name: "Save status" }).click();
    await expect(dialog.getByText("A status with that name already exists.")).toBeVisible();
    await dialog.getByLabel("Name").fill("Client review");
    await dialog.getByLabel("Type").selectOption({ label: "Paused" });
    await dialog.getByRole("radio", { name: "Pink" }).click();
    await dialog.getByRole("button", { name: "Save status" }).click();
    await expect(dialog).toBeHidden();
    await expect(statuses.getByRole("listitem")).toHaveCount(6);
    await expect(statuses.getByRole("listitem").last()).toContainText("Client review");
    await expect(statuses.getByRole("listitem").last()).toContainText("Paused · 0 projects");

    // Rename.
    await page.getByRole("button", { name: "Edit status Client review" }).click();
    await page.getByRole("dialog", { name: "Edit status" }).getByLabel("Name").fill("Client feedback");
    await page.getByRole("dialog", { name: "Edit status" }).getByRole("button", { name: "Save status" }).click();
    await expect(statuses.getByRole("listitem").last()).toContainText("Client feedback");

    // Reorder: it becomes available in the same order in the project form.
    await page.getByRole("button", { name: "Move Client feedback up" }).click();
    await expect(statuses.getByRole("listitem").nth(4)).toContainText("Client feedback");
    await expect(statuses.getByRole("listitem").last()).toContainText("Delivered");

    // A status in use cannot be deleted.
    await page.getByRole("button", { name: "Delete status Planning" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete “Planning”?" });
    await confirm.getByRole("button", { name: "Delete status" }).click();
    await expect(confirm.getByRole("alert")).toContainText("1 project uses this status");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(statuses.getByRole("listitem")).toHaveCount(6);

    // An unused one can.
    await page.getByRole("button", { name: "Delete status Client feedback" }).click();
    await page.getByRole("dialog", { name: "Delete “Client feedback”?" }).getByRole("button", { name: "Delete status" }).click();
    await expect(statuses.getByRole("listitem")).toHaveCount(5);

    // The new status order shows up wherever statuses are chosen.
    await openProjects(page);
    await page.getByLabel("Status", { exact: true }).selectOption({ label: "On hold" });
    await expect(page.getByText("No projects match")).toBeVisible();
  });

  test("an owner manages categories, and deleting one keeps its projects", async ({ page }) => {
    await signUp(page);
    const id = await createProject(page, { name: "Categorised", category: "VFX" });
    await page.goto(`/w/${workspaceSlug(page)}/settings/projects`);
    await shellReady(page);
    const categories = page.getByRole("list", { name: "Categories" }).filter({ visible: true });
    await expect(categories.getByRole("listitem").filter({ hasText: "VFX" })).toContainText("1 project");

    await page.getByRole("button", { name: "Add category" }).click();
    const dialog = page.getByRole("dialog", { name: "Add category" });
    await dialog.getByLabel("Name").fill("Titles");
    await dialog.getByRole("button", { name: "Save category" }).click();
    await expect(categories.getByRole("listitem").filter({ hasText: "Titles" })).toBeVisible();

    await page.getByRole("button", { name: "Edit category Titles" }).click();
    await page.getByRole("dialog", { name: "Edit category" }).getByLabel("Name").fill("Title design");
    await page.getByRole("dialog", { name: "Edit category" }).getByRole("button", { name: "Save category" }).click();
    await expect(categories.getByRole("listitem").filter({ hasText: "Title design" })).toBeVisible();

    await page.getByRole("button", { name: "Delete category VFX" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete “VFX”?" });
    await expect(confirm).toContainText("1 project is in this category");
    await confirm.getByRole("button", { name: "Delete category" }).click();
    // The dialog only closes once the server has confirmed the delete. Waiting on the list alone could pass
    // while it is briefly absent during the refresh, and navigating away would then abort the request.
    await expect(confirm).toBeHidden();
    await expect(categories.getByRole("listitem").filter({ hasText: "VFX" })).toHaveCount(0);
    await expect(categories.getByRole("listitem")).toHaveCount(5);

    await page.goto(`/w/${workspaceSlug(page)}/projects/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Categorised" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("VFX");
    await openTab(page, "Activity");
    await expect(activityItems(page).first()).toContainText("cleared the category (was “VFX”)");
  });
});

test.describe("projects: navigation and responsiveness", () => {
  test("the sidebar, command palette and shortcut reach projects", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Projects", exact: true })).toBeVisible();

    await page.keyboard.press("g");
    await page.keyboard.press("p");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Projects", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.getByRole("link", { name: "Overview" }).first().click();
    await expect(page).toHaveURL(/\/overview$/);
    await shellReady(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("new project");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();
    // The parameter that opened it is dropped from the URL, so reloading does not reopen it.
    await expect(page).toHaveURL(/\/projects$/);
    await page.reload();
    await shellReady(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the dialog traps focus, closes with Escape and returns focus", async ({ page }) => {
    await signUp(page);
    await openProjects(page);
    const trigger = page.getByRole("button", { name: "Create your first project" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 30; index += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("tag input supports keyboard entry, pasted lists and removal", async ({ page }) => {
    await signUp(page);
    await openProjects(page);
    await page.getByRole("button", { name: "Create your first project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    const tags = dialog.getByLabel("Tags", { exact: true });
    await tags.fill("grade, sound mix, Grade");
    await expect(dialog.getByRole("list", { name: "Selected tags" }).getByRole("listitem")).toHaveText(["grade", "sound mix"]);
    await tags.press("Backspace");
    await expect(dialog.getByRole("list", { name: "Selected tags" }).getByRole("listitem")).toHaveText(["grade"]);
    await tags.fill("x".repeat(31));
    await tags.press("Enter");
    await dialog.getByLabel("Name", { exact: true }).fill("Long tag");
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog.getByText("Keep each tag under 30 characters.")).toBeVisible();
  });

  test("works on a phone: no sideways scrolling, dialog fits", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "A rather long project name that has to wrap on a small screen without breaking the layout", client: "Client with a long name Ltd", tags: ["one", "two"] });
    await page.setViewportSize({ width: 375, height: 800 });

    const noSidewaysScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    for (const path of ["", "/notes", "/activity"]) {
      await page.goto(`${page.url().replace(/\/(notes|activity)$/, "")}${path}`);
      await shellReady(page);
      expect(await noSidewaysScroll(), `project page ${path || "overview"}`).toBe(true);
    }
    await openProjects(page);
    await expect(page.getByRole("list", { name: "Projects" })).toBeVisible();
    expect(await noSidewaysScroll(), "list").toBe(true);

    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
    expect(await noSidewaysScroll(), "dialog open").toBe(true);

    await page.keyboard.press("Escape");
    await page.goto(`/w/${workspaceSlug(page)}/settings/projects`);
    await shellReady(page);
    expect(await noSidewaysScroll(), "settings").toBe(true);
  });

  test("activity pages back through a long history", async ({ page }) => {
    await signUp(page);
    await createProject(page, { name: "History 0" });
    for (let index = 1; index <= 33; index += 1) {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("dialog", { name: "Edit project" }).getByLabel("Name", { exact: true }).fill(`History ${index}`);
      await page.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("heading", { level: 1, name: `History ${index}` })).toBeVisible();
    }
    await openTab(page, "Activity");
    await expect(activityItems(page)).toHaveCount(30);
    await page.getByRole("button", { name: "Show older activity" }).click();
    await expect(activityItems(page)).toHaveCount(34);
    await expect(page.getByRole("button", { name: "Show older activity" })).toHaveCount(0);
    await expect(activityItems(page).last()).toContainText("created the project");
    await expect(activityItems(page).first()).toContainText("“History 32” to “History 33”");
  });
});
