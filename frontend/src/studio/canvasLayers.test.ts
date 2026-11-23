import { describe, expect, it } from "vitest";

import { orderPreviewLayers, transformCanvasLayer } from "./canvasLayers";
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
      layer("shape", "shape", 6),
      layer("diagram", "diagram", 7),
    ]);
    expect(ordered.map((item) => item.id)).toEqual([
      "image-bottom", "video-middle", "code-middle", "shape", "diagram", "text-top",
    ]);
    expect(ordered.map((item) => item.zIndex)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not mutate the persisted layer records", () => {
    const original = [layer("media", "image", 12), layer("label", "text", 1)];
    const ordered = orderPreviewLayers(original);
    expect(original.map((item) => item.zIndex)).toEqual([12, 1]);
    expect(ordered.map((item) => item.zIndex)).toEqual([1, 2]);
  });
});


describe("transformCanvasLayer", () => {
  it("keeps moved layers inside the canvas", () => {
    const moved = transformCanvasLayer(layer("media", "image", 1), -40, 100, "move");
    expect(moved).toEqual({ x: 0, y: 70, width: 40, height: 30 });
  });

  it("keeps resized layers inside the canvas and enforces a minimum size", () => {
    const original = { ...layer("media", "image", 1), x: 20, y: 25, width: 70, height: 60 };
    const resized = transformCanvasLayer(original, 50, -100, "resize");
    expect(resized).toEqual({ x: 20, y: 25, width: 80, height: 5 });
  });
});
