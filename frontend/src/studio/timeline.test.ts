import { describe, expect, it } from "vitest";

import { adjacentSceneId, splitSceneAt } from "./timeline";
import type { Scene } from "./types";

const scene: Scene = {
  id: "scene-original",
  title: "Architecture",
  kind: "Concept",
  duration: 10,
  narration: "First explain the problem then show the decision and its trade offs",
  layers: [{
    id: "layer-original",
    type: "text",
    name: "Heading",
    x: 10,
    y: 10,
    width: 40,
    height: 10,
    zIndex: 1,
    opacity: 1,
    visible: true,
    content: "Architecture",
  }],
};

describe("splitSceneAt", () => {
  it("splits duration, narration, and clones layer identities", () => {
    const result = splitSceneAt(scene, 4, "Architecture — part 2");
    expect(result).not.toBeNull();
    const [first, second] = result!;
    expect(first.duration).toBe(4);
    expect(second.duration).toBe(6);
    expect(first.narration).toBe("First explain the problem then");
    expect(second.narration).toBe("show the decision and its trade offs");
    expect(first.id).toBe("scene-original");
    expect(second.id).not.toBe(first.id);
    expect(first.layers?.[0].id).toBe("layer-original");
    expect(second.layers?.[0].id).not.toBe(first.layers?.[0].id);
  });

  it("remaps audio trim windows across the split", () => {
    const withVoice: Scene = {
      ...scene,
      voiceAssetId: "voice-1",
      voiceDuration: 12,
      voiceTrimStart: 1,
      voiceTrimEnd: 1,
      voiceGain: 0.7,
      voiceFadeIn: 0.4,
      voiceFadeOut: 0.6,
    };
    const result = splitSceneAt(withVoice, 4, "Part 2");
    expect(result).not.toBeNull();
    const [first, second] = result!;
    expect(first.voiceTrimStart).toBe(1);
    expect(first.voiceTrimEnd).toBe(7);
    expect(first.voiceFadeOut).toBe(0);
    expect(second.voiceTrimStart).toBe(5);
    expect(second.voiceTrimEnd).toBe(1);
    expect(second.voiceFadeIn).toBe(0);
    expect(second.voiceGain).toBe(0.7);
  });

  it("does not assign audio to a second scene after the voice track ends", () => {
    const withVoice: Scene = { ...scene, voiceAssetId: "voice-1", voiceDuration: 4 };
    const result = splitSceneAt(withVoice, 6, "Part 2");
    expect(result).not.toBeNull();
    expect(result![1].voiceAssetId).toBeUndefined();
  });

  it("rejects split points at or outside scene boundaries", () => {
    expect(splitSceneAt(scene, 0, "Part 2")).toBeNull();
    expect(splitSceneAt(scene, 10, "Part 2")).toBeNull();
    expect(splitSceneAt(scene, 12, "Part 2")).toBeNull();
  });
});


describe("adjacentSceneId", () => {
  const scenes: Scene[] = [
    { ...scene, id: "first" },
    { ...scene, id: "middle" },
    { ...scene, id: "last" },
  ];

  it("returns the previous or next scene for keyboard reordering", () => {
    expect(adjacentSceneId(scenes, "middle", -1)).toBe("first");
    expect(adjacentSceneId(scenes, "middle", 1)).toBe("last");
  });

  it("does not move beyond either end or for an unknown scene", () => {
    expect(adjacentSceneId(scenes, "first", -1)).toBeUndefined();
    expect(adjacentSceneId(scenes, "last", 1)).toBeUndefined();
    expect(adjacentSceneId(scenes, "missing", 1)).toBeUndefined();
  });
});
