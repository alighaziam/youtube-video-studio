import type { SceneLayer } from "./types";

/**
 * Mirrors the encoder's two-plane composition: media layers are composited
 * first, then text/code/diagram ASS overlays are drawn above all media.
 */
export function orderPreviewLayers(layers: SceneLayer[]): SceneLayer[] {
  const visible = layers.filter((layer) => layer.visible);
  const media = visible
    .filter((layer) => layer.type === "image" || layer.type === "video")
    .sort((a, b) => a.zIndex - b.zIndex);
  const overlays = visible
    .filter((layer) => layer.type === "text" || layer.type === "code" || layer.type === "diagram")
    .sort((a, b) => a.zIndex - b.zIndex);
  return [...media, ...overlays].map((layer, index) => ({ ...layer, zIndex: index + 1 }));
}
