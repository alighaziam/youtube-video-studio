import { describe, expect, it } from "vitest";
import { formatTime, projectSrt, sceneSuggestsDiagram, suggestedDiagramLabels, wordCuesForScene } from "./timing";

describe("editor timing", () => {
  it("floors the timeline clock", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65.9)).toBe("01:05");
  });

  it("gives every Persian word a share of the scene and lands on the scene end", () => {
    const cues = wordCuesForScene({ id: "s", duration: 4, narration: "یک دو سه four" }, 10);
    expect(cues.map((cue) => cue.text)).toEqual(["یک", "دو", "سه", "four"]);
    expect(cues[0].start).toBe(10);
    expect(cues.at(-1)?.end).toBe(14);
    expect(cues.every((cue) => cue.end > cue.start)).toBe(true);
  });

  it("writes SRT lines of at most twelve words", () => {
    const narration = Array.from({ length: 13 }, (_, index) => `w${index + 1}`).join(" ");
    const srt = projectSrt([{ id: "s", duration: 13, narration }]);
    const lines = srt.split("\n").filter((line) => line.startsWith("w"));
    expect(lines).toHaveLength(2);
    expect(lines[0].split(" ")).toHaveLength(12);
    expect(lines[1]).toBe("w13");
    expect(srt).toContain("00:00:00,000 --> ");
  });

  it("returns no captions when the scene has no narration", () => {
    expect(projectSrt([{ id: "s", duration: 5, narration: "   " }])).toBe("");
    expect(wordCuesForScene({ id: "s", duration: 5 }, 0)).toEqual([]);
  });

  it("suggests an architecture diagram only when the scene is about structure", () => {
    expect(sceneSuggestsDiagram({ id: "s", duration: 8, kind: "نمایش کد", title: "Module" })).toBe(false);
    expect(sceneSuggestsDiagram({ id: "s", duration: 8, kind: "دیاگرام معماری", title: "مرز ماژول" })).toBe(true);
    expect(suggestedDiagramLabels({ id: "s", duration: 8, kind: "دیاگرام معماری", narration: "modular monolith" })).toEqual([
      "API", "ORDERS", "CATALOG", "SHARED DB",
    ]);
  });
});
