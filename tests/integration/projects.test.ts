import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/infrastructure/db/migrator";
import { runAsUser } from "../../src/infrastructure/db/user-scope";
import { ProjectsError } from "../../src/modules/projects/domain/errors";
import { DEFAULT_FILTERS, PAGE_SIZE, type ProjectFilters, type ProjectInput } from "../../src/modules/projects/domain/project";
import { listActivity } from "../../src/modules/projects/server/activity-repository";
import { createNote, deleteNote, listNotes, setNotePinned, updateNote } from "../../src/modules/projects/server/note-repository";
import {
  createProject,
  getProject,
  listProjects,
  listTags,
  setProjectArchived,
  setProjectStatus,
  updateProject,
} from "../../src/modules/projects/server/project-repository";
import {
  createCategory,
  createStatus,
  deleteCategory,
  deleteStatus,
  listCategories,
  listCategoriesWithUsage,
  listStatuses,
  listStatusesWithUsage,
  moveStatus,
  updateCategory,
  updateStatus,
} from "../../src/modules/projects/server/taxonomy-repository";
import { createWorkspace, ensurePersonalWorkspace } from "../../src/modules/workspaces/server/repository";
import { MIGRATIONS_DIR, createEmptyDatabase, createMigratedDatabase, insertUser, type TestDatabase } from "./test-database";

const PERMISSION_DENIED = "42501";
const RLS_VIOLATION = "42501";
const CHECK_VIOLATION = "23514";

describe("projects (integration)", () => {
  let database: TestDatabase;
  let alice: string;
  let bob: string;
  let aliceWs: string;
  let bobWs: string;
  let aliceStatuses: Awaited<ReturnType<typeof listStatuses>>;
  let bobStatuses: Awaited<ReturnType<typeof listStatuses>>;

  const as = <T>(userId: string, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(database.pool, userId, fn);
  const statusNamed = (list: typeof aliceStatuses, name: string) => list.find((status) => status.name === name)!;

  function input(overrides: Partial<ProjectInput> = {}): ProjectInput {
    return {
      name: "Northlight title sequence",
      description: "",
      statusId: statusNamed(aliceStatuses, "Planning").id,
      categoryId: null,
      client: "",
      priority: "normal",
      startDate: null,
      dueDate: null,
      customFields: [],
      tags: [],
      ...overrides,
    };
  }

  const filters = (overrides: Partial<ProjectFilters> = {}): ProjectFilters => ({ ...DEFAULT_FILTERS, ...overrides });
  const newProject = (overrides: Partial<ProjectInput> = {}, user = alice, workspace = aliceWs) =>
    as(user, (db) => createProject(db, workspace, user, input(overrides)));
  const sqlOf = (user: string, text: string, values: unknown[] = []) => as(user, (db) => db.query(text, values));

  beforeAll(async () => {
    database = await createMigratedDatabase();
    alice = await insertUser(database.pool, "Alice");
    bob = await insertUser(database.pool, "Bob");
    aliceWs = (await as(alice, (db) => ensurePersonalWorkspace(db, alice, "Alice’s Studio")))[0]!.id;
    bobWs = (await as(bob, (db) => ensurePersonalWorkspace(db, bob, "Bob’s Studio")))[0]!.id;
    aliceStatuses = await as(alice, (db) => listStatuses(db, aliceWs));
    bobStatuses = await as(bob, (db) => listStatuses(db, bobWs));
  });

  afterAll(async () => {
    await database?.drop();
  });

  describe("defaults", () => {
    it("seeds statuses and categories for every new workspace", async () => {
      expect(aliceStatuses.map((status) => [status.name, status.kind])).toEqual([
        ["Planning", "planned"],
        ["In progress", "active"],
        ["In review", "active"],
        ["On hold", "paused"],
        ["Delivered", "done"],
      ]);
      expect(aliceStatuses.map((status) => status.position)).toEqual([0, 1, 2, 3, 4]);
      const categories = await as(alice, (db) => listCategories(db, aliceWs));
      expect(categories.map((category) => category.name)).toEqual(["Editing", "Film", "Motion design", "Personal", "VFX"]);
    });

    it("seeds a workspace created later, with its own rows", async () => {
      const second = await as(alice, (db) => createWorkspace(db, "Second"));
      const statuses = await as(alice, (db) => listStatuses(db, second.id));
      expect(statuses).toHaveLength(5);
      expect(statuses.every((status) => !aliceStatuses.some((existing) => existing.id === status.id))).toBe(true);
    });

    it("backfills workspaces that existed before the migration", async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "framework-m1-"));
      const legacy = await createEmptyDatabase();
      try {
        for (const name of (await readdir(MIGRATIONS_DIR)).filter((file) => file.startsWith("0001_"))) {
          await cp(path.join(MIGRATIONS_DIR, name), path.join(directory, name));
        }
        await migrate(legacy.url, directory);
        const owner = await insertUser(legacy.pool, "Legacy");
        const [workspace] = await runAsUser(legacy.pool, owner, (db) => ensurePersonalWorkspace(db, owner, "Legacy Studio"));
        await cp(MIGRATIONS_DIR, directory, { recursive: true });
        await migrate(legacy.url, directory);
        const statuses = await runAsUser(legacy.pool, owner, (db) => listStatuses(db, workspace!.id));
        expect(statuses.map((status) => status.name)).toEqual(["Planning", "In progress", "In review", "On hold", "Delivered"]);
      } finally {
        await legacy.drop();
        await rm(directory, { recursive: true, force: true });
      }
    });
  });

  describe("creating, reading and editing", () => {
    it("persists every field", async () => {
      const category = (await as(alice, (db) => listCategories(db, aliceWs))).find((item) => item.name === "VFX")!;
      const id = await newProject({
        name: "Orbital",
        description: "Hero shot\nwith a second line",
        statusId: statusNamed(aliceStatuses, "In progress").id,
        categoryId: category.id,
        client: "Acme",
        priority: "high",
        startDate: "2026-03-01",
        dueDate: "2026-04-15",
        customFields: [{ key: "Frame rate", value: "24 fps" }],
        tags: ["Hero", "4K"],
      });
      const project = (await as(alice, (db) => getProject(db, id)))!;
      expect(project).toMatchObject({
        name: "Orbital",
        description: "Hero shot\nwith a second line",
        client: "Acme",
        priority: "high",
        startDate: "2026-03-01",
        dueDate: "2026-04-15",
        customFields: [{ key: "Frame rate", value: "24 fps" }],
        tags: ["4K", "Hero"],
        status: { name: "In progress", kind: "active" },
        category: { name: "VFX" },
        archivedAt: null,
        workspaceId: aliceWs,
        createdByName: "Alice",
        noteCount: 0,
      });
    });

    it("updates fields, tags and returns false for unknown ids", async () => {
      const id = await newProject({ name: "Before", tags: ["a", "b"] });
      expect(await as(alice, (db) => updateProject(db, id, input({ name: "After", client: "Zed", tags: ["b", "c"], priority: "urgent" })))).toBe(true);
      const project = (await as(alice, (db) => getProject(db, id)))!;
      expect(project).toMatchObject({ name: "After", client: "Zed", priority: "urgent", tags: ["b", "c"] });
      expect(await as(alice, (db) => updateProject(db, "00000000-0000-4000-8000-000000000000", input()))).toBe(false);
    });

    it("changes status quickly", async () => {
      const id = await newProject();
      expect(await as(alice, (db) => setProjectStatus(db, id, statusNamed(aliceStatuses, "In review").id))).toBe(true);
      expect((await as(alice, (db) => getProject(db, id)))!.status.name).toBe("In review");
    });
  });

  describe("workspace isolation", () => {
    let secretId: string;

    beforeAll(async () => {
      secretId = await newProject({ name: "Alice secret", tags: ["confidential"], client: "Hidden Co" });
      await as(alice, (db) => createNote(db, secretId, alice, { title: "Private", body: "Do not share" }));
    });

    it("hides projects, notes, tags and activity from other users", async () => {
      expect(await as(bob, (db) => getProject(db, secretId))).toBeNull();
      expect((await as(bob, (db) => listProjects(db, aliceWs, filters({ view: "all" })))).items).toEqual([]);
      expect(await as(bob, (db) => listNotes(db, aliceWs, secretId))).toEqual([]);
      expect(await as(bob, (db) => listTags(db, aliceWs))).toEqual([]);
      expect((await as(bob, (db) => listActivity(db, aliceWs, secretId))).entries).toEqual([]);
      expect(await as(bob, (db) => listStatuses(db, aliceWs))).toEqual([]);
      expect(await as(bob, (db) => listCategories(db, aliceWs))).toEqual([]);
    });

    it("hides them even from raw queries without any workspace filter", async () => {
      for (const table of [
        "projects",
        "project_notes",
        "project_tags",
        "project_tag_links",
        "project_activity",
        "project_statuses",
        "project_categories",
      ]) {
        const { rows } = await sqlOf(bob, `select workspace_id from public.${table}`);
        expect(rows.every((row) => row.workspace_id === bobWs), `${table} leaked`).toBe(true);
      }
    });

    it("lets a user list only the workspace they ask for", async () => {
      await as(alice, (db) => createProject(db, aliceWs, alice, input({ name: "Only in the first workspace" })));
      const second = await as(alice, (db) => createWorkspace(db, "Alice second"));
      const secondStatuses = await as(alice, (db) => listStatuses(db, second.id));
      await as(alice, (db) => createProject(db, second.id, alice, input({ name: "Only in the second", statusId: secondStatuses[0]!.id })));
      const names = (await as(alice, (db) => listProjects(db, second.id, filters({ view: "all" })))).items.map((item) => item.name);
      expect(names).toEqual(["Only in the second"]);
    });

    it("does not let another user change or archive a project", async () => {
      expect(await as(bob, (db) => updateProject(db, secretId, input({ name: "Hijacked", statusId: statusNamed(bobStatuses, "Planning").id })))).toBe(false);
      expect(await as(bob, (db) => setProjectArchived(db, secretId, true))).toBe(false);
      expect(await as(bob, (db) => setProjectStatus(db, secretId, statusNamed(bobStatuses, "Planning").id))).toBe(false);
      const { rows } = await database.pool.query("select name, archived_at from public.projects where id = $1", [secretId]);
      expect(rows[0]).toMatchObject({ name: "Alice secret", archived_at: null });
    });

    it("does not let another user add notes, or change or delete existing ones", async () => {
      expect(await as(bob, (db) => createNote(db, secretId, bob, { title: "", body: "intruder" }))).toBeNull();
      const [note] = await as(alice, (db) => listNotes(db, aliceWs, secretId));
      expect(await as(bob, (db) => updateNote(db, note!.id, { title: "", body: "x" }))).toBe(false);
      expect(await as(bob, (db) => setNotePinned(db, note!.id, true))).toBe(false);
      expect(await as(bob, (db) => deleteNote(db, note!.id))).toBe(false);
    });

    it("rejects inserting a project into someone else's workspace", async () => {
      await expect(
        as(bob, (db) => createProject(db, aliceWs, bob, input())),
      ).rejects.toMatchObject({ code: RLS_VIOLATION });
    });

    it("rejects forging created_by", async () => {
      await expect(
        as(bob, (db) =>
          db.query(
            "insert into public.projects (workspace_id, name, status_id, created_by) values ($1, 'Forged', $2, $3)",
            [bobWs, statusNamed(bobStatuses, "Planning").id, alice],
          ),
        ),
      ).rejects.toMatchObject({ code: RLS_VIOLATION });
    });

    it("rejects referencing another workspace's status, category or tag", async () => {
      // Bob's status in Bob's own project is fine; Alice's status in Bob's workspace is not.
      await expect(
        as(bob, (db) => createProject(db, bobWs, bob, input({ statusId: statusNamed(aliceStatuses, "Planning").id }))),
      ).rejects.toMatchObject({ code: "invalid_reference" });

      const aliceCategory = (await as(alice, (db) => listCategories(db, aliceWs)))[0]!;
      await expect(
        as(bob, (db) =>
          createProject(db, bobWs, bob, input({ statusId: statusNamed(bobStatuses, "Planning").id, categoryId: aliceCategory.id })),
        ),
      ).rejects.toMatchObject({ code: "invalid_reference" });
    });

    it("keeps references inside one workspace even for a user who belongs to both", async () => {
      const other = await as(alice, (db) => createWorkspace(db, "Cross check"));
      const otherStatuses = await as(alice, (db) => listStatuses(db, other.id));
      await expect(
        as(alice, (db) => createProject(db, aliceWs, alice, input({ statusId: otherStatuses[0]!.id }))),
      ).rejects.toMatchObject({ code: "invalid_reference" });

      const id = await newProject();
      await expect(
        as(alice, (db) =>
          db.query("insert into public.project_tag_links (project_id, tag_id, workspace_id) select $1, t.id, $2 from public.project_tags t limit 1", [
            id,
            other.id,
          ]),
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });

    it("lets Bob's and Alice's data coexist under the same names", async () => {
      await as(bob, (db) => createProject(db, bobWs, bob, input({ name: "Alice secret", statusId: statusNamed(bobStatuses, "Planning").id, tags: ["confidential"] })));
      expect((await as(bob, (db) => listTags(db, bobWs))).map((tag) => tag.name)).toEqual(["confidential"]);
      expect((await as(alice, (db) => listTags(db, aliceWs))).some((tag) => tag.name === "confidential")).toBe(true);
    });

    it("returns nothing without an acting user", async () => {
      const client = await database.pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role framework_app");
        for (const table of ["projects", "project_notes", "project_activity", "project_statuses", "project_tags"]) {
          const { rowCount } = await client.query(`select 1 from public.${table}`);
          expect(rowCount, table).toBe(0);
        }
      } finally {
        await client.query("rollback");
        client.release();
      }
    });

    it("exposes member names only to members", async () => {
      const asMember = await sqlOf(alice, "select name from app.workspace_member_names($1)", [aliceWs]);
      expect(asMember.rows).toEqual([{ name: "Alice" }]);
      const asOutsider = await sqlOf(bob, "select name from app.workspace_member_names($1)", [aliceWs]);
      expect(asOutsider.rows).toEqual([]);
    });
  });

  describe("privileges", () => {
    it("forbids deleting projects, moving them between workspaces, or forging archived_by", async () => {
      const id = await newProject();
      await expect(sqlOf(alice, "delete from public.projects where id = $1", [id])).rejects.toMatchObject({ code: PERMISSION_DENIED });
      await expect(sqlOf(alice, "update public.projects set workspace_id = $2 where id = $1", [id, bobWs])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      await expect(sqlOf(alice, "update public.projects set archived_by = $2 where id = $1", [id, bob])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      await expect(sqlOf(alice, "update public.projects set created_by = $2 where id = $1", [id, bob])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    });

    it("forbids calling the trigger and seeding functions directly", async () => {
      await expect(sqlOf(alice, "select app.log_project_activity($1, $2, 'archived')", [aliceWs, "00000000-0000-4000-8000-000000000000"])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      await expect(sqlOf(alice, "select app.seed_project_defaults($1)", [aliceWs])).rejects.toMatchObject({ code: PERMISSION_DENIED });
    });
  });

  describe("database constraints", () => {
    it("re-checks date order, enums, lengths and field shape", async () => {
      const status = statusNamed(aliceStatuses, "Planning").id;
      const insert = (columns: string, values: unknown[]) =>
        sqlOf(alice, `insert into public.projects (workspace_id, status_id, created_by, ${columns}) values ($1, $2, $3, ${values.map((_, i) => `$${i + 4}`).join(", ")})`, [
          aliceWs,
          status,
          alice,
          ...values,
        ]);
      await expect(insert("name, start_date, due_date", ["Backwards", "2026-05-10", "2026-05-01"])).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insert("name, priority", ["Odd", "whenever"])).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insert("name", [""])).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insert("name", ["x".repeat(121)])).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insert("name", [" padded "])).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insert("name, custom_fields", ["Shape", '{"a":1}'])).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });

  describe("statuses and categories", () => {
    let shared: string;
    let sharedStatuses: Awaited<ReturnType<typeof listStatuses>>;

    beforeAll(async () => {
      // Alice owns a workspace that Bob is a plain member of.
      const workspace = await as(alice, (db) => createWorkspace(db, "Shared edit bay"));
      shared = workspace.id;
      await database.pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [shared, bob]);
      sharedStatuses = await as(alice, (db) => listStatuses(db, shared));
    });

    it("lets owners add, rename and recolour statuses", async () => {
      const created = await as(alice, (db) => createStatus(db, aliceWs, { name: "Client review", kind: "active", color: "pink" }));
      expect(created).toMatchObject({ name: "Client review", position: 5 });
      expect(await as(alice, (db) => updateStatus(db, created!.id, { name: "Client feedback", kind: "paused", color: "teal" }))).toBe(true);
      const list = await as(alice, (db) => listStatuses(db, aliceWs));
      expect(list.find((status) => status.id === created!.id)).toMatchObject({ name: "Client feedback", kind: "paused", color: "teal" });
    });

    it("rejects duplicate names case-insensitively", async () => {
      await expect(as(alice, (db) => createStatus(db, aliceWs, { name: "planning", kind: "planned", color: "gray" }))).rejects.toMatchObject({
        code: "name_taken",
      });
      await expect(as(alice, (db) => createCategory(db, aliceWs, { name: "vfx", color: "gray" }))).rejects.toMatchObject({ code: "name_taken" });
    });

    it("lets members read but not change statuses or categories", async () => {
      expect(await as(bob, (db) => listStatuses(db, shared))).toHaveLength(5);
      expect(await as(bob, (db) => createStatus(db, shared, { name: "Mine", kind: "active", color: "red" }))).toBeNull();
      expect(await as(bob, (db) => updateStatus(db, sharedStatuses[0]!.id, { name: "Hacked", kind: "done", color: "red" }))).toBe(false);
      expect(await as(bob, (db) => moveStatus(db, sharedStatuses[1]!.id, "up"))).toBe(false);
      expect(await as(bob, (db) => createCategory(db, shared, { name: "Mine", color: "red" }))).toBeNull();
      const categories = await as(bob, (db) => listCategories(db, shared));
      expect(await as(bob, (db) => updateCategory(db, categories[0]!.id, { name: "Hacked", color: "red" }))).toBe(false);
      expect(await as(bob, (db) => deleteCategory(db, categories[0]!.id))).toBe(false);
      expect(await as(bob, (db) => deleteStatus(db, sharedStatuses[4]!.id))).toBe(false);
      expect((await as(alice, (db) => listStatuses(db, shared))).map((status) => status.name)).toEqual(sharedStatuses.map((status) => status.name));
    });

    it("lets a member create and edit projects in a shared workspace", async () => {
      const id = await as(bob, (db) => createProject(db, shared, bob, input({ name: "By Bob", statusId: sharedStatuses[0]!.id })));
      expect(await as(alice, (db) => updateProject(db, id, input({ name: "By Bob, edited by Alice", statusId: sharedStatuses[0]!.id })))).toBe(true);
      const project = (await as(alice, (db) => getProject(db, id)))!;
      expect(project.createdByName).toBe("Bob");
      const names = (await as(alice, (db) => listActivity(db, shared, id))).entries.map((entry) => [entry.kind, entry.actorName]);
      expect(names).toEqual([
        ["renamed", "Alice"],
        ["project_created", "Bob"],
      ]);
    });

    it("moves statuses up and down", async () => {
      const before = (await as(alice, (db) => listStatuses(db, aliceWs))).map((status) => status.name);
      expect(await as(alice, (db) => moveStatus(db, statusNamed(aliceStatuses, "In review").id, "up"))).toBe(true);
      const after = await as(alice, (db) => listStatuses(db, aliceWs));
      expect(after.map((status) => status.name).slice(0, 3)).toEqual([before[0], "In review", "In progress"]);
      expect(after.map((status) => status.position)).toEqual(after.map((_, index) => index));
      // Moving past either end changes nothing.
      expect(await as(alice, (db) => moveStatus(db, after[0]!.id, "up"))).toBe(true);
      expect((await as(alice, (db) => listStatuses(db, aliceWs))).map((status) => status.name)).toEqual(after.map((status) => status.name));
    });

    it("refuses to delete a status that projects use, and reports how many", async () => {
      const inUse = statusNamed(aliceStatuses, "Planning");
      await newProject({ statusId: inUse.id });
      const error = await as(alice, (db) => deleteStatus(db, inUse.id)).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ProjectsError);
      expect(error).toMatchObject({ code: "status_in_use" });
      const usage = await as(alice, (db) => listStatusesWithUsage(db, aliceWs));
      expect(usage.find((status) => status.id === inUse.id)!.projectCount).toBeGreaterThan(0);
    });

    it("deletes an unused status but never the last one", async () => {
      const spare = await as(alice, (db) => createStatus(db, aliceWs, { name: "Spare", kind: "paused", color: "gray" }));
      expect(await as(alice, (db) => deleteStatus(db, spare!.id))).toBe(true);

      const lonely = await as(alice, (db) => createWorkspace(db, "One status"));
      const statuses = await as(alice, (db) => listStatuses(db, lonely.id));
      for (const status of statuses.slice(1)) await as(alice, (db) => deleteStatus(db, status.id));
      await expect(as(alice, (db) => deleteStatus(db, statuses[0]!.id))).rejects.toMatchObject({ code: "last_status" });
    });

    it("uncategorises projects when their category is deleted, archived ones included", async () => {
      const category = await as(alice, (db) => createCategory(db, aliceWs, { name: "Temporary", color: "red" }));
      const live = await newProject({ name: "Live in category", categoryId: category!.id });
      const archived = await newProject({ name: "Archived in category", categoryId: category!.id });
      await as(alice, (db) => setProjectArchived(db, archived, true));

      const usage = await as(alice, (db) => listCategoriesWithUsage(db, aliceWs));
      expect(usage.find((item) => item.id === category!.id)!.projectCount).toBe(2);

      expect(await as(alice, (db) => deleteCategory(db, category!.id))).toBe(true);
      expect((await as(alice, (db) => getProject(db, live)))!.category).toBeNull();
      expect((await as(alice, (db) => getProject(db, archived)))!.category).toBeNull();
      // The history keeps the deleted category's name, exactly once, for live and archived projects alike.
      for (const id of [live, archived]) {
        const changes = (await as(alice, (db) => listActivity(db, aliceWs, id))).entries.filter((entry) => entry.kind === "category_changed");
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ data: { from: "Temporary", to: null }, actorName: "Alice" });
      }
    });
  });

  describe("tags", () => {
    it("reuses existing tags regardless of case and keeps the first spelling", async () => {
      await newProject({ name: "Tagged A", tags: ["Colour Grade"] });
      await newProject({ name: "Tagged B", tags: ["colour grade", "Sound"] });
      const tags = await as(alice, (db) => listTags(db, aliceWs));
      expect(tags.find((tag) => tag.name.toLowerCase() === "colour grade")).toEqual({ name: "Colour Grade", count: 2 });
      const { rows } = await database.pool.query("select count(*)::int as n from public.project_tags where workspace_id = $1 and lower(name) = 'colour grade'", [aliceWs]);
      expect(rows[0].n).toBe(1);
    });

    it("removes links when a tag is dropped from a project and stops listing unused tags", async () => {
      const id = await newProject({ name: "Tag drop", tags: ["only-here"] });
      expect((await as(alice, (db) => listTags(db, aliceWs))).some((tag) => tag.name === "only-here")).toBe(true);
      await as(alice, (db) => updateProject(db, id, input({ name: "Tag drop", tags: [] })));
      expect((await as(alice, (db) => listTags(db, aliceWs))).some((tag) => tag.name === "only-here")).toBe(false);
      expect((await as(alice, (db) => getProject(db, id)))!.tags).toEqual([]);
    });

    it("rejects tags with commas or newlines at the database", async () => {
      await expect(sqlOf(alice, "insert into public.project_tags (workspace_id, name) values ($1, 'a,b')", [aliceWs])).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    });
  });

  describe("list, search, filter, sort and paging", () => {
    let ws: string;
    let statuses: Awaited<ReturnType<typeof listStatuses>>;
    let categories: Awaited<ReturnType<typeof listCategories>>;
    const create = (overrides: Partial<ProjectInput>) =>
      as(alice, (db) => createProject(db, ws, alice, { ...input(), statusId: statuses[0]!.id, ...overrides }));
    const names = async (f: Partial<ProjectFilters> = {}) =>
      (await as(alice, (db) => listProjects(db, ws, filters(f)))).items.map((item) => item.name);

    beforeAll(async () => {
      ws = (await as(alice, (db) => createWorkspace(db, "Listing"))).id;
      statuses = await as(alice, (db) => listStatuses(db, ws));
      categories = await as(alice, (db) => listCategories(db, ws));
      const film = categories.find((category) => category.name === "Film")!;
      await create({ name: "Alpha 100% done", client: "Acme", priority: "low", dueDate: "2026-06-01", tags: ["promo"] });
      await create({ name: "bravo_under", client: "Globex", priority: "urgent", dueDate: "2026-05-01", categoryId: film.id, statusId: statuses[1]!.id, tags: ["Promo", "4K"] });
      await create({ name: "Charlie", description: "Contains the word NEEDLE somewhere", priority: "high" });
      const archived = await create({ name: "Delta archived", dueDate: "2026-01-01" });
      await as(alice, (db) => setProjectArchived(db, archived, true));
    });

    it("hides archived projects by default and shows them on request", async () => {
      expect(await names({ sort: "name" })).toEqual(["Alpha 100% done", "bravo_under", "Charlie"]);
      expect(await names({ view: "archived" })).toEqual(["Delta archived"]);
      expect(await names({ view: "all", sort: "name" })).toEqual(["Alpha 100% done", "bravo_under", "Charlie", "Delta archived"]);
    });

    it("searches name, client and description case-insensitively and treats wildcards literally", async () => {
      expect(await names({ q: "ALPHA" })).toEqual(["Alpha 100% done"]);
      expect(await names({ q: "globex" })).toEqual(["bravo_under"]);
      expect(await names({ q: "needle" })).toEqual(["Charlie"]);
      expect(await names({ q: "%" })).toEqual(["Alpha 100% done"]);
      expect(await names({ q: "_" })).toEqual(["bravo_under"]);
      expect(await names({ q: "nothing like this" })).toEqual([]);
    });

    it("filters by status, category (including none) and tag", async () => {
      expect(await names({ status: statuses[1]!.id })).toEqual(["bravo_under"]);
      expect(await names({ category: categories.find((category) => category.name === "Film")!.id })).toEqual(["bravo_under"]);
      expect((await names({ category: "none", sort: "name" }))).toEqual(["Alpha 100% done", "Charlie"]);
      expect(await names({ tag: "promo", sort: "name" })).toEqual(["Alpha 100% done", "bravo_under"]);
      expect(await names({ tag: "4k" })).toEqual(["bravo_under"]);
      expect(await names({ tag: "promo", q: "alpha", status: statuses[0]!.id })).toEqual(["Alpha 100% done"]);
    });

    it("sorts by name, due date (undated last), priority and recency", async () => {
      expect(await names({ sort: "name" })).toEqual(["Alpha 100% done", "bravo_under", "Charlie"]);
      expect(await names({ sort: "due" })).toEqual(["bravo_under", "Alpha 100% done", "Charlie"]);
      expect(await names({ sort: "priority" })).toEqual(["bravo_under", "Charlie", "Alpha 100% done"]);
      expect(await names({ sort: "updated" })).toEqual(["Charlie", "bravo_under", "Alpha 100% done"]);
      expect(await names({ sort: "created" })).toEqual(["Charlie", "bravo_under", "Alpha 100% done"]);
    });

    it("reports tags, notes and totals on each row", async () => {
      const page = await as(alice, (db) => listProjects(db, ws, filters({ sort: "name" })));
      expect(page.total).toBe(3);
      expect(page.items[1]).toMatchObject({ tags: ["4K", "promo"], status: { name: "In progress" }, category: { name: "Film" }, dueDate: "2026-05-01" });
    });

    it("pages results and handles pages past the end", async () => {
      const paged = (await as(alice, (db) => createWorkspace(db, "Paging"))).id;
      const [status] = await as(alice, (db) => listStatuses(db, paged));
      for (let index = 0; index < PAGE_SIZE + 5; index += 1) {
        await as(alice, (db) => createProject(db, paged, alice, { ...input(), name: `Project ${String(index).padStart(2, "0")}`, statusId: status!.id }));
      }
      const first = await as(alice, (db) => listProjects(db, paged, filters({ sort: "name" })));
      const second = await as(alice, (db) => listProjects(db, paged, filters({ sort: "name", page: 2 })));
      expect(first.items).toHaveLength(PAGE_SIZE);
      expect(second.items).toHaveLength(5);
      expect(first.total).toBe(PAGE_SIZE + 5);
      expect(second.items[0]!.name).toBe(`Project ${PAGE_SIZE}`);
      const beyond = await as(alice, (db) => listProjects(db, paged, filters({ page: 9 })));
      expect(beyond).toEqual({ items: [], total: PAGE_SIZE + 5 });
    });
  });

  describe("archiving", () => {
    it("archives, stamps who did it, and restores", async () => {
      const id = await newProject({ name: "To archive" });
      expect(await as(alice, (db) => setProjectArchived(db, id, true))).toBe(true);
      const archived = (await as(alice, (db) => getProject(db, id)))!;
      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect(archived.archivedByName).toBe("Alice");

      // Archiving twice keeps the original timestamp.
      await as(alice, (db) => setProjectArchived(db, id, true));
      expect((await as(alice, (db) => getProject(db, id)))!.archivedAt).toEqual(archived.archivedAt);

      expect(await as(alice, (db) => setProjectArchived(db, id, false))).toBe(true);
      const restored = (await as(alice, (db) => getProject(db, id)))!;
      expect(restored.archivedAt).toBeNull();
      expect(restored.archivedByName).toBeNull();
    });

    it("is read-only while archived: details, status, tags and notes", async () => {
      const id = await newProject({ name: "Frozen", tags: ["keep"] });
      await as(alice, (db) => createNote(db, id, alice, { title: "", body: "existing note" }));
      await as(alice, (db) => setProjectArchived(db, id, true));
      const [note] = await as(alice, (db) => listNotes(db, aliceWs, id));

      await expect(as(alice, (db) => updateProject(db, id, input({ name: "Changed" })))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => updateProject(db, id, input({ name: "Frozen", tags: ["keep", "new"] })))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => setProjectStatus(db, id, statusNamed(aliceStatuses, "Delivered").id))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => createNote(db, id, alice, { title: "", body: "late" }))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => updateNote(db, note!.id, { title: "", body: "edited" }))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => deleteNote(db, note!.id))).rejects.toMatchObject({ code: "archived" });
      await expect(sqlOf(alice, "update public.projects set client = 'sneaky' where id = $1", [id])).rejects.toMatchObject({ code: "55000" });

      const project = (await as(alice, (db) => getProject(db, id)))!;
      expect(project).toMatchObject({ name: "Frozen", tags: ["keep"], noteCount: 1 });

      await as(alice, (db) => setProjectArchived(db, id, false));
      expect(await as(alice, (db) => updateProject(db, id, input({ name: "Thawed" })))).toBe(true);
    });
  });

  describe("notes", () => {
    let projectId: string;

    beforeAll(async () => {
      projectId = await newProject({ name: "Notes host" });
    });

    it("creates, orders (pinned first, then newest), edits, pins and deletes", async () => {
      const first = (await as(alice, (db) => createNote(db, projectId, alice, { title: "First", body: "one" })))!;
      const second = (await as(alice, (db) => createNote(db, projectId, alice, { title: "", body: "two" })))!;
      let notes = await as(alice, (db) => listNotes(db, aliceWs, projectId));
      expect(notes.map((note) => note.body)).toEqual(["two", "one"]);
      expect(notes[0]!.authorName).toBe("Alice");

      expect(notes.every((note) => note.editedAt === null)).toBe(true);

      expect(await as(alice, (db) => setNotePinned(db, first, true))).toBe(true);
      notes = await as(alice, (db) => listNotes(db, aliceWs, projectId));
      expect(notes.map((note) => note.body)).toEqual(["one", "two"]);
      // Pinning is not an edit.
      expect(notes.find((note) => note.id === first)!.editedAt).toBeNull();

      expect(await as(alice, (db) => updateNote(db, second, { title: "Retitled", body: "two, revised" }))).toBe(true);
      notes = await as(alice, (db) => listNotes(db, aliceWs, projectId));
      expect(notes.find((note) => note.id === second)).toMatchObject({ title: "Retitled", body: "two, revised" });
      expect(notes.find((note) => note.id === second)!.editedAt).toBeInstanceOf(Date);
      expect(notes.find((note) => note.id === first)!.editedAt).toBeNull();

      expect(await as(alice, (db) => deleteNote(db, second))).toBe(true);
      expect((await as(alice, (db) => listNotes(db, aliceWs, projectId))).map((note) => note.id)).toEqual([first]);
      expect((await as(alice, (db) => getProject(db, projectId)))!.noteCount).toBe(1);
    });

    it("only lets the author or an owner change a note", async () => {
      const workspace = await as(alice, (db) => createWorkspace(db, "Notes room"));
      await database.pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [workspace.id, bob]);
      const [status] = await as(alice, (db) => listStatuses(db, workspace.id));
      const id = await as(alice, (db) => createProject(db, workspace.id, alice, { ...input(), statusId: status!.id }));

      const byBob = (await as(bob, (db) => createNote(db, id, bob, { title: "", body: "Bob wrote this" })))!;
      const byAlice = (await as(alice, (db) => createNote(db, id, alice, { title: "", body: "Alice wrote this" })))!;

      // A member cannot touch the owner's note…
      expect(await as(bob, (db) => updateNote(db, byAlice, { title: "", body: "tampered" }))).toBe(false);
      expect(await as(bob, (db) => deleteNote(db, byAlice))).toBe(false);
      // …but can edit their own, and an owner can edit anyone's.
      expect(await as(bob, (db) => updateNote(db, byBob, { title: "", body: "Bob edited" }))).toBe(true);
      expect(await as(alice, (db) => updateNote(db, byBob, { title: "", body: "Alice moderated" }))).toBe(true);
      expect(await as(alice, (db) => deleteNote(db, byBob))).toBe(true);
    });

    it("cannot be authored as someone else", async () => {
      await expect(as(bob, (db) => sqlOf(bob, "select 1").then(() => db.query("insert into public.project_notes (workspace_id, project_id, body, created_by) values ($1, $2, 'x', $3)", [bobWs, projectId, alice])))).rejects.toBeTruthy();
      await expect(
        sqlOf(alice, "insert into public.project_notes (workspace_id, project_id, body, created_by) values ($1, $2, 'x', $3)", [aliceWs, projectId, bob]),
      ).rejects.toMatchObject({ code: RLS_VIOLATION });
    });

    it("does not let the application role set edited_at or created_by directly", async () => {
      const [note] = await as(alice, (db) => listNotes(db, aliceWs, projectId));
      await expect(sqlOf(alice, "update public.project_notes set edited_at = null where id = $1", [note!.id])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    });

    it("enforces body length at the database", async () => {
      await expect(sqlOf(alice, "insert into public.project_notes (workspace_id, project_id, body, created_by) values ($1, $2, '', $3)", [aliceWs, projectId, alice])).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    });
  });

  describe("activity", () => {
    it("records creation and each kind of change with the actor and the values", async () => {
      const category = (await as(alice, (db) => listCategories(db, aliceWs))).find((item) => item.name === "Film")!;
      const id = await newProject({ name: "History", customFields: [{ key: "Codec", value: "ProRes" }, { key: "Gone", value: "x" }] });
      await as(alice, (db) =>
        updateProject(
          db,
          id,
          input({
            name: "History v2",
            description: "Now with a brief",
            statusId: statusNamed(aliceStatuses, "In progress").id,
            categoryId: category.id,
            client: "Acme",
            priority: "urgent",
            startDate: "2026-03-01",
            dueDate: "2026-04-01",
            customFields: [{ key: "Codec", value: "DNxHR" }, { key: "New", value: "y" }],
            tags: ["alpha"],
          }),
        ),
      );
      const note = (await as(alice, (db) => createNote(db, id, alice, { title: "Kickoff", body: "notes" })))!;
      await as(alice, (db) => setNotePinned(db, note, true));
      await as(alice, (db) => updateNote(db, note, { title: "Kickoff", body: "notes, edited" }));
      await as(alice, (db) => deleteNote(db, note));
      await as(alice, (db) => setProjectArchived(db, id, true));
      await as(alice, (db) => setProjectArchived(db, id, false));

      const { entries } = await as(alice, (db) => listActivity(db, aliceWs, id));
      const chronological = [...entries].reverse();
      expect(chronological.map((entry) => entry.kind)).toEqual([
        "project_created",
        "renamed",
        "status_changed",
        "category_changed",
        "priority_changed",
        "client_changed",
        "start_date_changed",
        "due_date_changed",
        "description_changed",
        "fields_changed",
        "tag_added",
        "note_added",
        "note_pinned",
        "note_edited",
        "note_deleted",
        "archived",
        "restored",
      ]);
      expect(entries.every((entry) => entry.actorName === "Alice")).toBe(true);

      const by = (kind: string) => chronological.find((entry) => entry.kind === kind)!.data;
      expect(by("renamed")).toEqual({ from: "History", to: "History v2" });
      expect(by("status_changed")).toEqual({ from: "Planning", to: "In progress" });
      expect(by("category_changed")).toEqual({ from: null, to: "Film" });
      expect(by("priority_changed")).toEqual({ from: "normal", to: "urgent" });
      expect(by("due_date_changed")).toEqual({ from: null, to: "2026-04-01" });
      expect(by("fields_changed")).toEqual({ added: ["New"], removed: ["Gone"], changed: ["Codec"] });
      expect(by("tag_added")).toEqual({ tag: "alpha" });
      expect(by("note_added")).toMatchObject({ title: "Kickoff" });
      // Contents of descriptions and notes are not copied into history.
      expect(JSON.stringify(entries.map((entry) => entry.data))).not.toContain("Now with a brief");
    });

    it("does not record saves that change nothing, or reordered custom fields", async () => {
      const id = await newProject({ name: "Quiet", tags: ["x"], customFields: [{ key: "A", value: "1" }, { key: "B", value: "2" }] });
      await as(alice, (db) => updateProject(db, id, input({ name: "Quiet", tags: ["x"], customFields: [{ key: "A", value: "1" }, { key: "B", value: "2" }] })));
      await as(alice, (db) => updateProject(db, id, input({ name: "Quiet", tags: ["X"], customFields: [{ key: "B", value: "2" }, { key: "A", value: "1" }] })));
      const kinds = (await as(alice, (db) => listActivity(db, aliceWs, id))).entries.map((entry) => entry.kind);
      expect(kinds).toEqual(["tag_added", "project_created"]);
    });

    it("records removed tags", async () => {
      const id = await newProject({ name: "Untagged", tags: ["gone"] });
      await as(alice, (db) => updateProject(db, id, input({ name: "Untagged", tags: [] })));
      const [latest] = (await as(alice, (db) => listActivity(db, aliceWs, id))).entries;
      expect(latest).toMatchObject({ kind: "tag_removed", data: { tag: "gone" } });
    });

    it("pages from newest to oldest", async () => {
      const id = await newProject({ name: "Busy" });
      for (let index = 0; index < 6; index += 1) {
        await as(alice, (db) => updateProject(db, id, input({ name: `Busy ${index}` })));
      }
      const first = await as(alice, (db) => listActivity(db, aliceWs, id, { limit: 4 }));
      expect(first.entries).toHaveLength(4);
      expect(first.hasMore).toBe(true);
      const second = await as(alice, (db) => listActivity(db, aliceWs, id, { limit: 4, before: first.entries.at(-1)!.id }));
      expect(second.entries).toHaveLength(3);
      expect(second.hasMore).toBe(false);
      const ids = [...first.entries, ...second.entries].map((entry) => entry.id);
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
      expect(new Set(ids).size).toBe(7);
    });

    it("cannot be written, altered or erased by the application role", async () => {
      const id = await newProject({ name: "Tamper-proof" });
      await expect(
        sqlOf(alice, "insert into public.project_activity (workspace_id, project_id, actor_id, kind) values ($1, $2, $3, 'archived')", [aliceWs, id, alice]),
      ).rejects.toMatchObject({ code: PERMISSION_DENIED });
      await expect(sqlOf(alice, "update public.project_activity set kind = 'restored' where project_id = $1", [id])).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      await expect(sqlOf(alice, "delete from public.project_activity where project_id = $1", [id])).rejects.toMatchObject({ code: PERMISSION_DENIED });
      expect((await as(alice, (db) => listActivity(db, aliceWs, id))).entries).toHaveLength(1);
    });
  });
});
