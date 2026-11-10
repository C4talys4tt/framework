export type NoteItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  /** Set only when the title or text was changed; pinning does not count. */
  editedAt: Date | null;
  authorId: string;
  /** Null when the author has since left the workspace. */
  authorName: string | null;
};
