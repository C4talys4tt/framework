"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { Variant } from "../domain/files";
import { fileUrl } from "../domain/reference";

/**
 * An image from the library. Painted in its dominant colour first, so a grid
 * never flashes empty, then faded in once decoded. Files come from the
 * authenticated file route, already sized for the job, so next/image's
 * optimiser (which cannot forward the session) is not used.
 */
export function ReferenceImage({
  referenceId,
  variant = "thumb",
  alt,
  dominantColor,
  className,
  imgClassName,
  fit = "cover",
  eager = false,
  style,
}: {
  referenceId: string;
  variant?: Variant;
  alt: string;
  dominantColor: string;
  className?: string;
  imgClassName?: string;
  fit?: "cover" | "contain";
  eager?: boolean;
  style?: React.CSSProperties;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ backgroundColor: dominantColor, ...style }}>
      {state === "error" ? (
        <span className="absolute inset-0 grid place-items-center bg-surface/60 text-[0.6875rem] text-fg-faint">Image unavailable</span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, pre-sized derivatives; see above */}
      <img
        src={fileUrl(referenceId, variant)}
        alt={alt}
        draggable={false}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        // Cached images can finish before hydration attaches onLoad.
        ref={(element) => {
          if (element?.complete && element.naturalWidth > 0) setState("loaded");
        }}
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-300 ease-out-quint",
          fit === "cover" ? "object-cover" : "object-contain",
          state === "loaded" ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </span>
  );
}
