"use client";

import { memo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { BoardElement, BoardImage } from "../../domain/moodboard";
import { fileUrl } from "../../domain/reference";

const WEIGHT = { regular: 400, medium: 500, bold: 700 } as const;

/**
 * One element, positioned in world units inside the transformed world layer.
 * Memoised: during a drag only the elements that moved re-render.
 */
export const ElementView = memo(function ElementView({
  element,
  image,
  zoom,
  hidden,
  interactive,
}: {
  element: BoardElement;
  image: BoardImage | undefined;
  zoom: number;
  /** Hidden while its text is being edited (the editor draws it instead). */
  hidden: boolean;
  interactive: boolean;
}) {
  return (
    <div
      data-element-id={element.id}
      className={cn("absolute select-none", interactive && "cursor-move", hidden && "invisible")}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.z }}
    >
      {element.kind === "image" ? (
        <BoardImageView element={element} image={image} zoom={zoom} />
      ) : (
        <div
          className={cn("size-full overflow-hidden whitespace-pre-wrap break-words leading-[1.3]", !element.text && "opacity-40")}
          style={{
            fontSize: element.style.fontSize,
            color: element.style.color,
            textAlign: element.style.align,
            fontWeight: WEIGHT[element.style.weight],
          }}
        >
          {element.text || "Text"}
        </div>
      )}
    </div>
  );
});

export function textStyle(style: { fontSize: number; color: string; align: "left" | "center" | "right"; weight: "regular" | "medium" | "bold" }) {
  return { fontSize: style.fontSize, color: style.color, textAlign: style.align, fontWeight: WEIGHT[style.weight] } as const;
}

/**
 * The thumbnail is enough until an image is shown large; then the 2048px
 * preview is loaded once and kept, so zooming back out never flickers.
 */
function BoardImageView({ element, image, zoom }: { element: Extract<BoardElement, { kind: "image" }>; image: BoardImage | undefined; zoom: number }) {
  const large = element.width * zoom * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1) > 640;
  const [wantPreview, setWantPreview] = useState(large);
  if (large && !wantPreview) setWantPreview(true);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="relative size-full overflow-hidden rounded-[2px] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.65),0_0_0_1px_rgb(0_0_0/0.08)]"
      style={{ backgroundColor: image?.dominantColor ?? "#1a1d22" }}
    >
      {failed ? (
        <span className="absolute inset-0 grid place-items-center p-2 text-center text-[11px] text-white/60">Image unavailable</span>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, pre-sized derivative */}
          <img
            src={fileUrl(element.referenceId, "thumb")}
            alt={image?.title ?? ""}
            draggable={false}
            decoding="async"
            onError={() => setFailed(true)}
            className={cn("absolute inset-0 size-full object-cover", previewLoaded && "invisible")}
          />
          {wantPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated, pre-sized derivative
            <img
              src={fileUrl(element.referenceId, "preview")}
              alt=""
              draggable={false}
              decoding="async"
              onLoad={() => setPreviewLoaded(true)}
              className={cn("absolute inset-0 size-full object-cover", previewLoaded ? "opacity-100" : "opacity-0")}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
