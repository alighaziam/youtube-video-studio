import type { Scene } from "./types";

export function splitSceneAt(
  scene: Scene,
  splitSeconds: number,
  secondTitle: string,
): [Scene, Scene] | null {
  const split = Math.round(splitSeconds);
  if (!Number.isFinite(split) || split < 1 || split >= scene.duration) return null;

  const words = (scene.narration ?? "").trim().split(/\s+/).filter(Boolean);
  const wordSplit = words.length > 1
    ? Math.max(1, Math.min(words.length - 1, Math.round(words.length * split / scene.duration)))
    : words.length;
  const firstNarration = words.slice(0, wordSplit).join(" ");
  const secondNarration = words.slice(wordSplit).join(" ");

  const first: Scene = {
    ...scene,
    duration: split,
    narration: firstNarration,
    layers: scene.layers?.map((layer) => ({ ...layer })),
  };
  const second: Scene = {
    ...scene,
    id: `scene-${crypto.randomUUID()}`,
    title: secondTitle,
    duration: scene.duration - split,
    narration: secondNarration,
    layers: scene.layers?.map((layer) => ({ ...layer, id: `layer-${crypto.randomUUID()}` })),
    diagram: scene.diagram ? {
      ...scene.diagram,
      nodes: scene.diagram.nodes.map((node) => ({ ...node })),
      edges: scene.diagram.edges.map((edge) => ({ ...edge })),
    } : undefined,
  };

  if (scene.voiceAssetId) {
    const voiceDuration = Math.max(0.1, scene.voiceDuration ?? scene.duration);
    const trimStart = Math.max(0, scene.voiceTrimStart ?? 0);
    const trimEnd = Math.max(0, scene.voiceTrimEnd ?? 0);
    const available = Math.max(0, voiceDuration - trimStart - trimEnd);
    if (split < available) {
      first.voiceTrimEnd = trimEnd + available - split;
      first.voiceFadeOut = 0;
      second.voiceTrimStart = trimStart + split;
      second.voiceTrimEnd = trimEnd;
      second.voiceFadeIn = 0;
    } else {
      second.voiceAssetId = undefined;
      second.voiceDuration = undefined;
      second.voiceTrimStart = 0;
      second.voiceTrimEnd = 0;
      second.voiceGain = 1;
      second.voiceFadeIn = 0;
      second.voiceFadeOut = 0;
    }
  }
  return [first, second];
}

/** Return the neighboring scene id for keyboard timeline reordering. */
export function adjacentSceneId(scenes: Scene[], currentId: string, direction: -1 | 1): string | undefined {
  const index = scenes.findIndex((scene) => scene.id === currentId);
  if (index < 0) return undefined;
  return scenes[index + direction]?.id;
}
