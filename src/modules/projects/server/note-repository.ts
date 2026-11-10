import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { PG, pgCode, rethrowArchived } from "../domain/errors";
import type { NoteItem } from "../domain/notes";

type NoteRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: Date;
  edited_at: Date | null;
  author_name: string | null;
  created_by: string;
};

/** Pinned first, then newest first. */
export async function listNotes(db: UserScopedDb, workspaceId: string, projectId: string): Promise<NoteItem[]> {
  const { rows } = await db.query<NoteRow>(
    `select n.id, n.title, n.body, n.pinned, n.created_at, n.edited_at, n.created_by, m.name as author_name
     from public.project_notes n
     left join app.workspace_member_names($1) m on m.user_id = n.created_by
     where n.project_id = $2 and n.workspace_id = $1
     order by n.pinned desc, n.created_at desc, n.id`,
    [workspaceId, projectId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    authorId: row.created_by,
    authorName: row.author_name,
  }));
}

/** Returns the new note's id, or null when the project is not visible to the user. */
export async function createNote(
  db: UserScopedDb,
  projectId: string,
  userId: string,
  input: { title: string; body: string },
): Promise<string | null> {
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.project_notes (workspace_id, project_id, title, body, created_by)
       select p.workspace_id, p.id, $2, $3, $4 from public.projects p where p.id = $1
       returning id`,
      [projectId, input.title, input.body, userId],
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    if (pgCode(error) === PG.OBJECT_NOT_IN_STATE) rethrowArchived(error);
    throw error;
  }
}

/** False when the note is not visible or the user may not change it (not its author or an owner). */
export async function updateNote(db: UserScopedDb, noteId: string, input: { title: string; body: string }): Promise<boolean> {
  try {
    const result = await db.query("update public.project_notes set title = $2, body = $3 where id = $1", [
      noteId,
      input.title,
      input.body,
    ]);
    return result.rowCount === 1;
  } catch (error) {
    return rethrowArchived(error);
  }
}

export async function setNotePinned(db: UserScopedDb, noteId: string, pinned: boolean): Promise<boolean> {
  try {
    const result = await db.query("update public.project_notes set pinned = $2 where id = $1", [noteId, pinned]);
    return result.rowCount === 1;
  } catch (error) {
    return rethrowArchived(error);
  }
}

export async function deleteNote(db: UserScopedDb, noteId: string): Promise<boolean> {
  try {
    const result = await db.query("delete from public.project_notes where id = $1", [noteId]);
    return result.rowCount === 1;
  } catch (error) {
    return rethrowArchived(error);
  }
}
