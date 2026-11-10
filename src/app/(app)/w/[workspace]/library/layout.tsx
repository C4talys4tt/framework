import type { ReactNode } from "react";
import { UploadProvider } from "@/modules/library/components/upload/upload-provider";

// Holds the upload queue, so uploads keep going while you move around the library.
// It reads no request data, so this layout stays part of the static shell.
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return <UploadProvider>{children}</UploadProvider>;
}
