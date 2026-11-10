export type LibraryErrorCode = "name_taken" | "archived" | "invalid_reference" | "not_found" | "too_many";

/** An expected failure the user can act on. Anything else is a bug and should surface as one. */
export class LibraryError extends Error {
  constructor(
    readonly code: LibraryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

export const ARCHIVED_PROJECT_MESSAGE = "That project is archived. Restore it before changing what it links to.";

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export const PG = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  OBJECT_NOT_IN_STATE: "55000",
} as const;
