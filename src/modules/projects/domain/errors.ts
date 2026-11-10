export type ProjectsErrorCode =
  | "archived"
  | "name_taken"
  | "status_in_use"
  | "last_status"
  | "invalid_reference"
  | "not_found";

/** An expected failure the user can act on. Anything else is a bug and should surface as one. */
export class ProjectsError extends Error {
  constructor(
    readonly code: ProjectsErrorCode,
    message: string,
    readonly detail?: { count?: number },
  ) {
    super(message);
    this.name = "ProjectsError";
  }
}

export const ARCHIVED_MESSAGE = "This project is archived. Restore it to make changes.";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const OBJECT_NOT_IN_STATE = "55000";

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** Translates the database's archive guard into a ProjectsError; rethrows anything else. */
export function rethrowArchived(error: unknown): never {
  if (pgCode(error) === OBJECT_NOT_IN_STATE) throw new ProjectsError("archived", ARCHIVED_MESSAGE);
  throw error;
}

export const PG = { UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION, OBJECT_NOT_IN_STATE } as const;
