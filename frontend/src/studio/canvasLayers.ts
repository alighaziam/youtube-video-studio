import type { SceneLayer } from "./types";

/**
 * Mirrors the encoder's two-plane composition: media layers are composited
 * first, then shape/text/code/diagram ASS overlays are drawn above all media.
 */
export function orderPreviewLayers(layers: SceneLayer[]): SceneLayer[] {
  const visible = layers.filter((layer) => layer.visible);
  const media = visible
    .filter((layer) => layer.type === "image" || layer.type === "video")
    .sort((a, b) => a.zIndex - b.zIndex);
  const overlays = visible
    .filter((layer) => layer.type === "text" || layer.type === "code" || layer.type === "diagram" || layer.type === "shape")
    .sort((a, b) => a.zIndex - b.zIndex);
  return [...media, ...overlays].map((layer, index) => ({ ...layer, zIndex: index + 1 }));
}

export function transformCanvasLayer(
  layer: SceneLayer,
  dxPercent: number,
  dyPercent: number,
  mode: "move" | "resize",
): Pick<SceneLayer, "x" | "y" | "width" | "height"> {
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, value));
  if (mode === "move") {
    return {
      x: clamp(layer.x + dxPercent, 0, Math.max(0, 100 - layer.width)),
      y: clamp(layer.y + dyPercent, 0, Math.max(0, 100 - layer.height)),
      width: layer.width,
      height: layer.height,
    };
  }
  return {
    x: layer.x,
    y: layer.y,
    width: clamp(layer.width + dxPercent, 5, Math.max(5, 100 - layer.x)),
    height: clamp(layer.height + dyPercent, 5, Math.max(5, 100 - layer.y)),
  };
}
