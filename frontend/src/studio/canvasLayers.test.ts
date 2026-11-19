import { describe, expect, it } from "vitest";

import { orderPreviewLayers } from "./canvasLayers";
import type { SceneLayer } from "./types";

const layer = (id: string, type: SceneLayer["type"], zIndex: number, visible = true): SceneLayer => ({
  id, type, name: id, x: 0, y: 0, width: 40, height: 30, zIndex, opacity: 1, visible,
});

describe("orderPreviewLayers", () => {
  it("matches FFmpeg media-first and overlay-last composition", () => {
    const ordered = orderPreviewLayers([
      layer("text-top", "text", 9),
      layer("image-bottom", "image", 1),
      layer("code-middle", "code", 5),
      layer("video-middle", "video", 4),
      layer("hidden-image", "image", 0, false),
      layer("diagram", "diagram", 7),
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      "image-bottom", "video-middle", "code-middle", "diagram", "text-top",
    ]);
    expect(ordered.map((item) => item.zIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the persisted layer records", () => {
    const original = [layer("media", "image", 12), layer("label", "text", 1)];
    const ordered = orderPreviewLayers(original);
    expect(original.map((item) => item.zIndex)).toEqual([12, 1]);
    expect(ordered.map((item) => item.zIndex)).toEqual([1, 2]);
  });
});
