import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "../../src/infrastructure/db/user-scope";
import type { UserScopedDb } from "../../src/infrastructure/db/user-scope";
import { LibraryError } from "../../src/modules/library/domain/errors";
import type { BoardElement, LayoutSave } from "../../src/modules/library/domain/moodboard";
import { DEFAULT_FILTERS, decodeCursor, type LibraryFilters } from "../../src/modules/library/domain/reference";
import {
  addToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeFromCollection,
  setCollectionCover,
} from "../../src/modules/library/server/collection-repository";
import {
  createMoodboard,
  deleteMoodboard,
  duplicateMoodboard,
  getMoodboard,
  listMoodboards,
  saveLayout,
  updateMoodboard,
} from "../../src/modules/library/server/moodboard-repository";
import {
  deleteReference,
  findDuplicate,
  getReference,
  getReferenceUsage,
  insertReference,
  linkReferencesToProject,
  listLibraryTags,
  listReferences,
  setFavorite,
  setReferenceTags,
  unlinkReferenceFromProject,
  updateReference,
} from "../../src/modules/library/server/reference-repository";
import { listActivity } from "../../src/modules/projects/server/activity-repository";
import { createProject, setProjectArchived } from "../../src/modules/projects/server/project-repository";
import { listStatuses } from "../../src/modules/projects/server/taxonomy-repository";
import { createWorkspace, ensurePersonalWorkspace } from "../../src/modules/workspaces/server/repository";
import { createMigratedDatabase, insertUser, type TestDatabase } from "./test-database";

const PERMISSION_DENIED = "42501";
const FOREIGN_KEY_VIOLATION = "23503";

describe("visual library (integration)", () => {
  let database: TestDatabase;
  let alice: string;
  let bob: string;
  let aliceWs: string;
  let bobWs: string;

  const as = <T>(userId: string, fn: (db: UserScopedDb) => Promise<T>) => runAsUser(database.pool, userId, fn);
  const filters = (overrides: Partial<LibraryFilters> = {}): LibraryFilters => ({ ...DEFAULT_FILTERS, ...overrides });

  async function newReference(user: string, workspace: string, title = "Sodium streetlight", overrides: { sha?: string } = {}) {
    return as(user, (db) =>
      insertReference(db, {
        workspaceId: workspace,
        createdBy: user,
        title,
        storageKey: `ws/${workspace}/${randomUUID()}`,
        originalFilename: `${title}.jpg`,
        mimeType: "image/jpeg",
        byteSize: 1024,
        width: 1600,
        height: 900,
        sha256: overrides.sha ?? randomBytes(32).toString("hex"),
        dominantColor: "#203040",
        metadata: { format: "jpeg", camera: "Test Camera" },
      }),
    );
  }

  async function newProject(user: string, workspace: string, name = "Northlight") {
    const statuses = await as(user, (db) => listStatuses(db, workspace));
    return as(user, (db) =>
      createProject(db, workspace, user, {
        name,
        description: "",
        statusId: statuses[0]!.id,
        categoryId: null,
        client: "",
        priority: "normal",
        startDate: null,
        dueDate: null,
        customFields: [],
        tags: [],
      }),
    );
  }

  beforeAll(async () => {
    database = await createMigratedDatabase();
    alice = await insertUser(database.pool, "Alice");
    bob = await insertUser(database.pool, "Bob");
    aliceWs = (await as(alice, (db) => ensurePersonalWorkspace(db, alice, "Alice’s Studio")))[0]!.id;
    bobWs = (await as(bob, (db) => ensurePersonalWorkspace(db, bob, "Bob’s Studio")))[0]!.id;
  });

  afterAll(async () => {
    await database?.drop();
  });

  describe("isolation", () => {
    it("hides another workspace's references, collections and moodboards", async () => {
      const reference = await newReference(alice, aliceWs, "Private frame");
      const collection = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Private set", description: "" }));
      const board = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Private board", description: "", projectId: null }));

      expect(await as(bob, (db) => getReference(db, reference.id))).toBeNull();
      expect(await as(bob, (db) => getCollection(db, collection))).toBeNull();
      expect(await as(bob, (db) => getMoodboard(db, board))).toBeNull();
      // Asking for Alice's workspace by id returns nothing either.
      expect((await as(bob, (db) => listReferences(db, aliceWs, filters()))).items).toEqual([]);
      expect(await as(bob, (db) => listCollections(db, aliceWs))).toEqual([]);
      expect(await as(bob, (db) => listMoodboards(db, aliceWs))).toEqual([]);
    });

    it("refuses every write into another workspace, even with guessed ids", async () => {
      const reference = await newReference(alice, aliceWs, "Guarded");
      const collection = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Guarded set", description: "" }));
      const board = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Guarded board", description: "", projectId: null }));

      await expect(newReference(bob, aliceWs, "Intruder")).rejects.toMatchObject({ code: PERMISSION_DENIED });
      expect(await as(bob, (db) => updateReference(db, reference.id, { title: "Hacked", description: "", sourceUrl: null }))).toBe(false);
      expect(await as(bob, (db) => deleteReference(db, reference.id))).toBeNull();
      expect(await as(bob, (db) => setReferenceTags(db, reference.id, ["x"]))).toBe(false);
      expect(await as(bob, (db) => setFavorite(db, bob, reference.id, true))).toBe(false);
      expect(await as(bob, (db) => addToCollection(db, collection, [reference.id]))).toBeNull();
      expect(await as(bob, (db) => deleteCollection(db, collection))).toBe(false);
      expect(await as(bob, (db) => saveLayout(db, board, { baseVersion: 1, background: "#000000", elements: [] }))).toEqual({
        status: "not_found",
      });
      expect(await as(bob, (db) => deleteMoodboard(db, board))).toBe(false);
      expect((await as(alice, (db) => getReference(db, reference.id)))!.title).toBe("Guarded");
    });

    it("cannot link across workspaces, whatever ids are sent", async () => {
      const aliceRef = await newReference(alice, aliceWs, "Alice ref");
      const bobRef = await newReference(bob, bobWs, "Bob ref");
      const bobCollection = await as(bob, (db) => createCollection(db, bobWs, bob, { name: "Bob set", description: "" }));
      const bobProject = await newProject(bob, bobWs);

      // The repository joins on workspace, so the foreign reference is simply not added…
      expect(await as(bob, (db) => addToCollection(db, bobCollection, [aliceRef.id, bobRef.id]))).toBe(1);
      expect(await as(bob, (db) => linkReferencesToProject(db, bobProject, [aliceRef.id]))).toBe(0);
      // …and a hand-written insert hits the composite foreign key.
      await expect(
        as(bob, (db) =>
          db.query(
            "insert into public.library_collection_items (collection_id, reference_id, workspace_id) values ($1, $2, $3)",
            [bobCollection, aliceRef.id, bobWs],
          ),
        ),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

      const bobBoard = await as(bob, (db) => createMoodboard(db, bobWs, bob, { name: "Bob board", description: "", projectId: null }));
      const element: BoardElement = { id: randomUUID(), kind: "image", referenceId: aliceRef.id, x: 0, y: 0, width: 100, height: 100, z: 1 };
      const result = await as(bob, (db) => saveLayout(db, bobBoard, { baseVersion: 1, background: "#000000", elements: [element] }));
      // Alice's reference is invisible to Bob, so the element is dropped rather than stored.
      expect(result).toMatchObject({ status: "saved", dropped: [element.id] });
      expect((await as(bob, (db) => getMoodboard(db, bobBoard)))!.document.elements).toEqual([]);
    });

    it("keeps file facts write-once and history out of the app's reach", async () => {
      const reference = await newReference(alice, aliceWs, "Immutable");
      await expect(
        as(alice, (db) => db.query("update public.library_references set storage_key = 'ws/other' where id = $1", [reference.id])),
      ).rejects.toMatchObject({ code: PERMISSION_DENIED });
      await expect(
        as(alice, (db) => db.query("update public.library_references set byte_size = 1 where id = $1", [reference.id])),
      ).rejects.toMatchObject({ code: PERMISSION_DENIED });
      await expect(
        as(alice, (db) => db.query("update public.library_references set created_by = $2 where id = $1", [reference.id, bob])),
      ).rejects.toMatchObject({ code: PERMISSION_DENIED });
    });

    it("lets members edit, but only the uploader or an owner delete", async () => {
      const shared = (await as(alice, (db) => ensurePersonalWorkspace(db, alice, "unused")))[0]!.id;
      await database.pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [
        shared,
        bob,
      ]);
      const reference = await newReference(alice, shared, "Owner's frame");
      expect(await as(bob, (db) => updateReference(db, reference.id, { title: "Renamed by Bob", description: "", sourceUrl: null }))).toBe(true);
      expect(await as(bob, (db) => deleteReference(db, reference.id))).toBeNull();
      expect((await as(bob, (db) => getReference(db, reference.id)))!.canDelete).toBe(false);

      const bobs = await newReference(bob, shared, "Bob's frame");
      expect((await as(bob, (db) => getReference(db, bobs.id)))!.canDelete).toBe(true);
      // The owner can delete anything in their workspace.
      expect(await as(alice, (db) => deleteReference(db, bobs.id))).not.toBeNull();
      await database.pool.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [shared, bob]);
    });
  });

  describe("favorites", () => {
    it("are personal to each member", async () => {
      const shared = (await as(alice, (db) => ensurePersonalWorkspace(db, alice, "unused")))[0]!.id;
      await database.pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [
        shared,
        bob,
      ]);
      const reference = await newReference(alice, shared, "Favorite of Alice");
      expect(await as(alice, (db) => setFavorite(db, alice, reference.id, true))).toBe(true);
      expect(await as(alice, (db) => setFavorite(db, alice, reference.id, true))).toBe(true);

      const aliceView = await as(alice, (db) => listReferences(db, shared, filters({ view: "favorites" })));
      const bobView = await as(bob, (db) => listReferences(db, shared, filters({ view: "favorites" })));
      expect(aliceView.items.map((item) => item.id)).toContain(reference.id);
      expect(bobView.items.map((item) => item.id)).not.toContain(reference.id);
      // Bob cannot plant a favorite for Alice.
      await expect(
        as(bob, (db) =>
          db.query("insert into public.library_favorites (user_id, reference_id, workspace_id) values ($1, $2, $3)", [alice, reference.id, shared]),
        ),
      ).rejects.toMatchObject({ code: PERMISSION_DENIED });

      expect(await as(alice, (db) => setFavorite(db, alice, reference.id, false))).toBe(true);
      expect((await as(alice, (db) => getReference(db, reference.id)))!.favorite).toBe(false);
      await database.pool.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [shared, bob]);
    });
  });

  describe("tags, search and paging", () => {
    let ws: string;
    let carol: string;

    beforeAll(async () => {
      carol = await insertUser(database.pool, "Carol");
      ws = (await as(carol, (db) => ensurePersonalWorkspace(db, carol, "Carol’s Studio")))[0]!.id;
    });

    it("reuses tags case-insensitively and filters by every selected tag", async () => {
      const neon = await newReference(carol, ws, "Neon alley");
      const rain = await newReference(carol, ws, "Rain on glass");
      const both = await newReference(carol, ws, "Wet neon");
      await as(carol, (db) => setReferenceTags(db, neon.id, ["Neon", "night"]));
      await as(carol, (db) => setReferenceTags(db, rain.id, ["rain", "NIGHT"]));
      await as(carol, (db) => setReferenceTags(db, both.id, ["neon", "Rain", "neon"]));

      const tags = await as(carol, (db) => listLibraryTags(db, ws));
      expect(tags.map((tag) => [tag.name, tag.count])).toEqual([
        ["Neon", 2],
        ["night", 2],
        ["rain", 2],
      ]);

      const neonAndRain = await as(carol, (db) => listReferences(db, ws, filters({ tags: ["neon", "rain"] })));
      expect(neonAndRain.items.map((item) => item.title)).toEqual(["Wet neon"]);
      expect(neonAndRain.total).toBe(1);

      // Removing a tag from one reference leaves the others alone.
      await as(carol, (db) => setReferenceTags(db, both.id, ["rain"]));
      expect((await as(carol, (db) => getReference(db, both.id)))!.tags).toEqual(["rain"]);
      expect((await as(carol, (db) => getReference(db, neon.id)))!.tags).toEqual(["Neon", "night"]);
    });

    it("searches title, description and filename as plain text", async () => {
      const percent = await newReference(carol, ws, "100% grain");
      await as(carol, (db) => updateReference(db, percent.id, { title: "100% grain", description: "Kodak 5219 under_exposed", sourceUrl: null }));
      expect((await as(carol, (db) => listReferences(db, ws, filters({ q: "100%" })))).items.map((item) => item.id)).toEqual([percent.id]);
      expect((await as(carol, (db) => listReferences(db, ws, filters({ q: "under_exposed" })))).items.map((item) => item.id)).toEqual([percent.id]);
      expect((await as(carol, (db) => listReferences(db, ws, filters({ q: "%" })))).items.map((item) => item.id)).toEqual([percent.id]);
    });

    it("pages with keyset cursors without gaps or repeats, in every sort", async () => {
      const workspace = (await as(carol, (db) => createWorkspace(db, "Paging")))!.id;
      const titles = ["delta", "Alpha", "charlie", "bravo", "echo", "Foxtrot", "golf"];
      for (const title of titles) await newReference(carol, workspace, title);

      for (const sort of ["newest", "oldest", "title", "title_desc"] as const) {
        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const page: Awaited<ReturnType<typeof listReferences>> = await as(carol, (db) =>
            listReferences(db, workspace, filters({ sort }), { cursor: decodeCursor(cursor), limit: 3 }),
          );
          if (pages === 0) expect(page.total).toBe(titles.length);
          seen.push(...page.items.map((item) => item.title));
          cursor = page.nextCursor;
          pages += 1;
        } while (cursor && pages < 10);
        expect(seen).toHaveLength(titles.length);
        expect(new Set(seen).size).toBe(titles.length);
        if (sort === "title") expect(seen).toEqual(["Alpha", "bravo", "charlie", "delta", "echo", "Foxtrot", "golf"]);
        if (sort === "title_desc") expect(seen).toEqual(["golf", "Foxtrot", "echo", "delta", "charlie", "bravo", "Alpha"]);
        if (sort === "oldest") expect(seen).toEqual(titles);
      }
    });

    it("finds duplicates by content hash within the workspace only", async () => {
      const sha = randomBytes(32).toString("hex");
      const original = await newReference(carol, ws, "Original", { sha });
      expect(await as(carol, (db) => findDuplicate(db, ws, sha))).toEqual({ id: original.id, title: "Original" });
      expect(await as(bob, (db) => findDuplicate(db, ws, sha))).toBeNull();
    });
  });

  describe("collections", () => {
    it("reuses one reference across collections and keeps references when a collection is deleted", async () => {
      const reference = await newReference(alice, aliceWs, "Shared frame");
      const first = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Warm", description: "Tungsten" }));
      const second = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Night", description: "" }));
      expect(await as(alice, (db) => addToCollection(db, first, [reference.id]))).toBe(1);
      expect(await as(alice, (db) => addToCollection(db, first, [reference.id]))).toBe(0);
      expect(await as(alice, (db) => addToCollection(db, second, [reference.id]))).toBe(1);

      const detail = await as(alice, (db) => getReference(db, reference.id));
      expect(detail!.collections.map((collection) => collection.name)).toEqual(["Night", "Warm"]);
      const references = await database.pool.query("select count(*)::int as count from public.library_references where id = $1", [reference.id]);
      expect(references.rows[0].count).toBe(1);

      expect(await as(alice, (db) => deleteCollection(db, first))).toBe(true);
      expect(await as(alice, (db) => getReference(db, reference.id))).not.toBeNull();
    });

    it("rejects duplicate names and manages covers", async () => {
      const collection = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Covers", description: "" }));
      await expect(as(alice, (db) => createCollection(db, aliceWs, alice, { name: "covers", description: "" }))).rejects.toBeInstanceOf(LibraryError);

      const a = await newReference(alice, aliceWs, "Cover A");
      const b = await newReference(alice, aliceWs, "Cover B");
      await as(alice, (db) => addToCollection(db, collection, [a.id]));
      await as(alice, (db) => addToCollection(db, collection, [b.id]));
      // Automatic cover: the most recently added.
      let summary = await as(alice, (db) => getCollection(db, collection));
      expect(summary!.cover!.id).toBe(b.id);
      expect(summary!.count).toBe(2);

      expect(await as(alice, (db) => setCollectionCover(db, collection, a.id))).toBe(true);
      summary = await as(alice, (db) => getCollection(db, collection));
      expect(summary).toMatchObject({ cover: { id: a.id }, coverIsExplicit: true });
      expect(summary!.previews.map((preview) => preview.id)).toEqual([b.id]);

      // A reference outside the collection cannot become its cover.
      const outsider = await newReference(alice, aliceWs, "Outsider");
      expect(await as(alice, (db) => setCollectionCover(db, collection, outsider.id))).toBe(false);

      // Removing the cover from the collection falls back to automatic.
      await as(alice, (db) => removeFromCollection(db, collection, a.id));
      summary = await as(alice, (db) => getCollection(db, collection));
      expect(summary).toMatchObject({ cover: { id: b.id }, coverIsExplicit: false });
    });
  });

  describe("projects", () => {
    it("links one reference to several projects and records it in each project's history", async () => {
      const reference = await newReference(alice, aliceWs, "Key art");
      const first = await newProject(alice, aliceWs, "Title sequence");
      const second = await newProject(alice, aliceWs, "Promo");
      expect(await as(alice, (db) => linkReferencesToProject(db, first, [reference.id]))).toBe(1);
      expect(await as(alice, (db) => linkReferencesToProject(db, second, [reference.id]))).toBe(1);

      const linked = await as(alice, (db) => listReferences(db, aliceWs, filters(), { projectId: first }));
      expect(linked.items.map((item) => item.id)).toEqual([reference.id]);
      expect((await as(alice, (db) => getReference(db, reference.id)))!.projects.map((project) => project.name)).toEqual(["Promo", "Title sequence"]);

      const activity = await as(alice, (db) => listActivity(db, aliceWs, first));
      expect(activity.entries[0]).toMatchObject({ kind: "reference_added", data: { title: "Key art" } });

      expect(await as(alice, (db) => unlinkReferenceFromProject(db, first, reference.id))).toBe(true);
      const after = await as(alice, (db) => listActivity(db, aliceWs, first));
      expect(after.entries[0]).toMatchObject({ kind: "reference_removed", data: { title: "Key art" } });
    });

    it("does not change an archived project's links, but deleting the reference still works", async () => {
      const reference = await newReference(alice, aliceWs, "Archived link");
      const project = await newProject(alice, aliceWs, "Old job");
      await as(alice, (db) => linkReferencesToProject(db, project, [reference.id]));
      await as(alice, (db) => setProjectArchived(db, project, true));

      const another = await newReference(alice, aliceWs, "Late addition");
      await expect(as(alice, (db) => linkReferencesToProject(db, project, [another.id]))).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => unlinkReferenceFromProject(db, project, reference.id))).rejects.toMatchObject({ code: "archived" });

      expect(await as(alice, (db) => deleteReference(db, reference.id))).not.toBeNull();
      const activity = await as(alice, (db) => listActivity(db, aliceWs, project));
      expect(activity.entries[0]).toMatchObject({ kind: "reference_removed", data: { title: "Archived link", deleted: true } });
    });

    it("reports what a deletion will remove, then cascades", async () => {
      const reference = await newReference(alice, aliceWs, "Everywhere");
      const project = await newProject(alice, aliceWs, "Cascade");
      const collection = await as(alice, (db) => createCollection(db, aliceWs, alice, { name: "Cascade set", description: "" }));
      const board = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Cascade board", description: "", projectId: null }));
      await as(alice, (db) => linkReferencesToProject(db, project, [reference.id]));
      await as(alice, (db) => addToCollection(db, collection, [reference.id]));
      const elements: BoardElement[] = [
        { id: randomUUID(), kind: "image", referenceId: reference.id, x: 0, y: 0, width: 100, height: 60, z: 1 },
        { id: randomUUID(), kind: "image", referenceId: reference.id, x: 200, y: 0, width: 100, height: 60, z: 2 },
      ];
      await as(alice, (db) => saveLayout(db, board, { baseVersion: 1, background: "#000000", elements }));

      expect(await as(alice, (db) => getReferenceUsage(db, reference.id))).toEqual({ collections: 1, projects: 1, moodboards: 1, placements: 2 });
      const key = await as(alice, (db) => deleteReference(db, reference.id));
      expect(key).toMatch(/^ws\//);
      expect((await as(alice, (db) => getMoodboard(db, board)))!.document.elements).toEqual([]);
      expect((await as(alice, (db) => getCollection(db, collection)))!.count).toBe(0);
    });
  });

  describe("moodboards", () => {
    const text = (overrides: Partial<BoardElement> = {}): BoardElement =>
      ({
        id: randomUUID(),
        kind: "text",
        text: "Warm practicals, cool fill",
        style: { fontSize: 24, color: "#e9ebee", align: "left", weight: "medium" },
        x: 10.5,
        y: -20.25,
        width: 320,
        height: 64,
        z: 3,
        ...overrides,
      }) as BoardElement;

    it("saves and reopens the exact layout, and rejects saves from a stale version", async () => {
      const reference = await newReference(alice, aliceWs, "Board image");
      const board = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Look", description: "", projectId: null }));
      const image: BoardElement = { id: randomUUID(), kind: "image", referenceId: reference.id, x: 100.125, y: 200, width: 480, height: 270, z: 1 };
      const note = text();
      const save: LayoutSave = { baseVersion: 1, background: "#f3f1ec", elements: [image, note] };

      expect(await as(alice, (db) => saveLayout(db, board, save))).toEqual({ status: "saved", version: 2, dropped: [] });
      const loaded = await as(alice, (db) => getMoodboard(db, board));
      expect(loaded!.version).toBe(2);
      expect(loaded!.document).toEqual({ background: "#f3f1ec", elements: [image, note] });
      expect(loaded!.images[reference.id]).toMatchObject({ width: 1600, height: 900 });

      // A second tab still at version 1 is told, not allowed to overwrite.
      expect(await as(alice, (db) => saveLayout(db, board, { ...save, elements: [] }))).toEqual({ status: "conflict", version: 2 });
      expect((await as(alice, (db) => getMoodboard(db, board)))!.document.elements).toHaveLength(2);

      // Moving one element and removing another.
      const moved = { ...image, x: -50, z: 4 };
      expect(await as(alice, (db) => saveLayout(db, board, { baseVersion: 2, background: "#f3f1ec", elements: [moved] }))).toMatchObject({
        status: "saved",
        version: 3,
      });
      expect((await as(alice, (db) => getMoodboard(db, board)))!.document.elements).toEqual([moved]);
    });

    it("never lets a save take over another board's element", async () => {
      const first = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "First", description: "", projectId: null }));
      const second = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Second", description: "", projectId: null }));
      const note = text();
      await as(alice, (db) => saveLayout(db, first, { baseVersion: 1, background: "#000000", elements: [note] }));
      await expect(
        as(alice, (db) => saveLayout(db, second, { baseVersion: 1, background: "#000000", elements: [{ ...note, x: 999 }] })),
      ).rejects.toBeInstanceOf(LibraryError);
      expect((await as(alice, (db) => getMoodboard(db, first)))!.document.elements[0]).toMatchObject({ x: note.x });
    });

    it("duplicates a board with all its elements", async () => {
      const board = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Original board", description: "Notes", projectId: null }));
      await as(alice, (db) => saveLayout(db, board, { baseVersion: 1, background: "#15181c", elements: [text(), text({ z: 5 })] }));
      const copy = await as(alice, (db) => duplicateMoodboard(db, board, alice));
      const loaded = await as(alice, (db) => getMoodboard(db, copy!));
      expect(loaded).toMatchObject({ name: "Copy of Original board", description: "Notes", background: "#15181c", elementCount: 2 });
    });

    it("belongs to projects (several per project) and respects archiving", async () => {
      const project = await newProject(alice, aliceWs, "Boards project");
      const a = await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Board A", description: "", projectId: project }));
      await as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Board B", description: "", projectId: project }));
      expect((await as(alice, (db) => listMoodboards(db, aliceWs, { projectId: project }))).map((board) => board.name).sort()).toEqual([
        "Board A",
        "Board B",
      ]);
      const activity = await as(alice, (db) => listActivity(db, aliceWs, project));
      expect(activity.entries.filter((entry) => entry.kind === "moodboard_added")).toHaveLength(2);

      // Another workspace's project cannot be assigned.
      const bobProject = await newProject(bob, bobWs, "Bob's project");
      await expect(
        as(alice, (db) => updateMoodboard(db, a, { name: "Board A", description: "", projectId: bobProject })),
      ).rejects.toMatchObject({ code: "invalid_reference" });

      await as(alice, (db) => setProjectArchived(db, project, true));
      await expect(
        as(alice, (db) => createMoodboard(db, aliceWs, alice, { name: "Board C", description: "", projectId: project })),
      ).rejects.toMatchObject({ code: "archived" });
      await expect(as(alice, (db) => updateMoodboard(db, a, { name: "Board A", description: "", projectId: null }))).rejects.toMatchObject({
        code: "archived",
      });
      // Renaming without moving is fine.
      expect(await as(alice, (db) => updateMoodboard(db, a, { name: "Board A (final)", description: "", projectId: project }))).toBe(true);
      // A copy of a board in an archived project is not put in that project.
      const copy = await as(alice, (db) => duplicateMoodboard(db, a, alice));
      expect((await as(alice, (db) => getMoodboard(db, copy!)))!.project).toBeNull();
    });
  });
});
