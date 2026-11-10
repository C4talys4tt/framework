import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "../../src/infrastructure/db/user-scope";
import { DEFAULT_PREFERENCES } from "../../src/modules/preferences/domain/appearance";
import { getPreferences, savePreferences } from "../../src/modules/preferences/server/repository";
import {
  createWorkspace,
  ensurePersonalWorkspace,
  findWorkspaceBySlug,
  listWorkspaces,
  renameWorkspace,
} from "../../src/modules/workspaces/server/repository";
import { createMigratedDatabase, insertUser, type TestDatabase } from "./test-database";

const PERMISSION_DENIED = "42501";

describe("workspace isolation (row-level security)", () => {
  let database: TestDatabase;
  let alice: string;
  let bob: string;
  let aliceSlug: string;
  let aliceWorkspaceId: string;
  let bobSlug: string;
  let bobWorkspaceId: string;

  const as = <T>(userId: string, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(database.pool, userId, fn);

  beforeAll(async () => {
    database = await createMigratedDatabase();
    alice = await insertUser(database.pool, "Alice");
    bob = await insertUser(database.pool, "Bob");

    const [aliceWorkspace] = await as(alice, (db) => ensurePersonalWorkspace(db, alice, "Alice’s Studio"));
    const [bobWorkspace] = await as(bob, (db) => ensurePersonalWorkspace(db, bob, "Bob’s Studio"));
    aliceSlug = aliceWorkspace!.slug;
    aliceWorkspaceId = aliceWorkspace!.id;
    bobSlug = bobWorkspace!.slug;
    bobWorkspaceId = bobWorkspace!.id;
  });

  afterAll(async () => {
    await database?.drop();
  });

  it("gives each user an owned personal workspace", async () => {
    const workspaces = await as(alice, listWorkspaces);
    expect(workspaces).toEqual([{ id: aliceWorkspaceId, name: "Alice’s Studio", slug: aliceSlug, role: "owner" }]);
  });

  it("lists only the workspaces a user belongs to", async () => {
    const forAlice = await as(alice, listWorkspaces);
    const forBob = await as(bob, listWorkspaces);
    expect(forAlice.map((workspace) => workspace.id)).toEqual([aliceWorkspaceId]);
    expect(forBob.map((workspace) => workspace.id)).toEqual([bobWorkspaceId]);
  });

  it("hides another user's workspace even when its slug is known", async () => {
    expect(await as(alice, (db) => findWorkspaceBySlug(db, bobSlug))).toBeNull();
    expect(await as(bob, (db) => findWorkspaceBySlug(db, bobSlug))).toMatchObject({ id: bobWorkspaceId, memberCount: 1 });
  });

  it("hides another workspace's member list", async () => {
    const { rows } = await as(alice, (db) => db.query("select workspace_id from public.workspace_members"));
    expect(rows).toEqual([{ workspace_id: aliceWorkspaceId }]);
  });

  it("does not let a user rename a workspace they do not belong to", async () => {
    expect(await as(alice, (db) => renameWorkspace(db, bobWorkspaceId, "Taken over"))).toBe(false);
    const { rows } = await database.pool.query("select name from public.workspaces where id = $1", [bobWorkspaceId]);
    expect(rows[0].name).toBe("Bob’s Studio");
  });

  it("lets an owner rename their own workspace", async () => {
    expect(await as(bob, (db) => renameWorkspace(db, bobWorkspaceId, "Bob Post"))).toBe(true);
    expect(await as(bob, (db) => findWorkspaceBySlug(db, bobSlug))).toMatchObject({ name: "Bob Post", slug: bobSlug });
  });

  it("lets a member see a shared workspace but not rename it", async () => {
    const shared = await as(alice, (db) => createWorkspace(db, "Shared Edit"));
    // Memberships can only be created by privileged code, never by framework_app.
    await database.pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')", [
      shared.id,
      bob,
    ]);

    expect(await as(bob, (db) => findWorkspaceBySlug(db, shared.slug))).toMatchObject({ role: "member", memberCount: 2 });
    expect(await as(bob, (db) => renameWorkspace(db, shared.id, "Bob was here"))).toBe(false);
    expect(await as(alice, (db) => findWorkspaceBySlug(db, shared.slug))).toMatchObject({ name: "Shared Edit", role: "owner" });
  });

  it("forbids adding yourself to someone else's workspace", async () => {
    await expect(
      as(alice, (db) =>
        db.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')", [
          bobWorkspaceId,
          alice,
        ]),
      ),
    ).rejects.toMatchObject({ code: PERMISSION_DENIED });
  });

  it("forbids inserting or deleting workspaces directly", async () => {
    await expect(
      as(alice, (db) => db.query("insert into public.workspaces (name, slug, created_by) values ('X', 'xxx-xxxxx', $1)", [alice])),
    ).rejects.toMatchObject({ code: PERMISSION_DENIED });
    await expect(as(alice, (db) => db.query("delete from public.workspaces"))).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  });

  it("forbids changing a workspace's slug or ownership columns", async () => {
    await expect(
      as(alice, (db) => db.query("update public.workspaces set slug = 'hijacked-slug' where id = $1", [aliceWorkspaceId])),
    ).rejects.toMatchObject({ code: PERMISSION_DENIED });
    await expect(
      as(alice, (db) => db.query("update public.workspaces set created_by = $1", [alice])),
    ).rejects.toMatchObject({ code: PERMISSION_DENIED });
  });

  it.each(["auth_users", "auth_sessions", "auth_accounts", "auth_verifications", "auth_rate_limits"])(
    "denies the application role any access to %s",
    async (table) => {
      await expect(as(alice, (db) => db.query(`select * from public.${table}`))).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    },
  );

  it("returns nothing when no user is set on the transaction", async () => {
    const client = await database.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role framework_app");
      const workspaces = await client.query("select id from public.workspaces");
      const members = await client.query("select user_id from public.workspace_members");
      const preferences = await client.query("select user_id from public.user_preferences");
      expect([workspaces.rowCount, members.rowCount, preferences.rowCount]).toEqual([0, 0, 0]);
      await expect(client.query("select app.create_workspace('Ghost', 'ghost-aaaaa')")).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("does not leak the acting user or role to the next query on the same connection", async () => {
    const client = await database.pool.connect();
    const backend = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    client.release();

    // With a single idle connection the pool hands the same backend back.
    await as(alice, (db) => db.query("select 1"));
    const { rows } = await database.pool.query<{ pid: number; role: string; acting: string | null }>(
      "select pg_backend_pid() as pid, current_user as role, nullif(current_setting('app.user_id', true), '') as acting",
    );
    expect(rows[0]!.pid).toBe(backend.rows[0]!.pid);
    expect(rows[0]!.role).not.toBe("framework_app");
    expect(rows[0]!.acting).toBeNull();
  });

  it("rolls back and resets the connection when the callback throws", async () => {
    await expect(
      as(alice, async (db) => {
        await renameWorkspace(db, aliceWorkspaceId, "Should not persist");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await as(alice, (db) => findWorkspaceBySlug(db, aliceSlug))).toMatchObject({ name: "Alice’s Studio" });
  });

  it("rejects ids that are not uuids before touching the database", async () => {
    await expect(runAsUser(database.pool, "1; drop table workspaces", async () => 1)).rejects.toThrow(/valid user id/);
  });

  it("creates exactly one personal workspace under concurrent first requests", async () => {
    const carol = await insertUser(database.pool, "Carol");
    const results = await Promise.all(
      Array.from({ length: 4 }, () => as(carol, (db) => ensurePersonalWorkspace(db, carol, "Carol’s Studio"))),
    );
    const ids = new Set(results.flat().map((workspace) => workspace.id));
    expect(ids.size).toBe(1);
    expect(await as(carol, listWorkspaces)).toHaveLength(1);
  });

  describe("preferences", () => {
    it("returns defaults before anything is saved", async () => {
      expect(await as(alice, getPreferences)).toEqual(DEFAULT_PREFERENCES);
    });

    it("saves and merges partial updates per user", async () => {
      await as(alice, (db) => savePreferences(db, alice, { theme: "light", density: "compact" }));
      await as(alice, (db) => savePreferences(db, alice, { sidebarCollapsed: true }));
      expect(await as(alice, getPreferences)).toEqual({
        theme: "light",
        density: "compact",
        reduceMotion: false,
        sidebarCollapsed: true,
      });
      expect(await as(bob, getPreferences)).toEqual(DEFAULT_PREFERENCES);
    });

    it("does not let a user write another user's preferences", async () => {
      await expect(as(bob, (db) => savePreferences(db, alice, { theme: "dark" }))).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      expect((await as(alice, getPreferences)).theme).toBe("light");
    });

    it("rejects values outside the allowed set at the database", async () => {
      await expect(
        as(alice, (db) => db.query("update public.user_preferences set theme = 'neon' where user_id = $1", [alice])),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});
