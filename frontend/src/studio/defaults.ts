import { suggestedDiagramLabels } from "../timing";
import type { Scene, SceneDiagram, SceneMotion } from "./types";

export const API = "http://127.0.0.1:8000/api/v1";
export const starterScenes: Scene[] = [
  { id: "scene-01", title: "Hook — The hidden cost of coupling", kind: "عنوان و شروع", duration: 12, narration: "Coupling hides the real cost until the next change." },
  { id: "scene-02", title: "Why architecture matters", kind: "مفهوم", duration: 28, narration: "Architecture decides which changes stay cheap." },
  { id: "scene-03", title: "A modular monolith", kind: "دیاگرام معماری", duration: 35, narration: "A modular monolith keeps one deployment and firm module boundaries." },
  { id: "scene-04", title: "Module boundaries in code", kind: "نمایش کد", duration: 42, narration: "The code should make an illegal dependency hard to write." },
  { id: "scene-05", title: "Trade-offs and recap", kind: "جمع‌بندی", duration: 25, narration: "Choose the boundary you can defend six months from now." },
];
export const makeDefaultDiagram = (scene?: Scene): SceneDiagram => {
  const labels = suggestedDiagramLabels(scene);
  return {
    nodes: labels.map((label, index) => ({ id: `node-${index + 1}`, label, x: Math.round(12 + index * (76 / Math.max(1, labels.length - 1))), y: 48 })),
    edges: labels.slice(1).map((_, index) => ({ label: ["REQUEST", "ROUTE", "PERSIST"][index % 3] })),
    accentColor: "#7187ff",
  };
};
export const sceneTemplates: { id: string; mark: string; faTitle: string; enTitle: string; faKind: string; enKind: string; duration: number; faNarration: string; enNarration: string; motion?: SceneMotion }[] = [
  { id: "title", mark: "01", faTitle: "عنوان و شروع", enTitle: "Title and hook", faKind: "عنوان و شروع", enKind: "Title", duration: 10, faNarration: "در چند ثانیه بگو این درس کدام مسئله را حل می‌کند.", enNarration: "State the problem this lesson solves in one breath." },
  { id: "concept", mark: "02", faTitle: "توضیح مفهوم", enTitle: "Concept", faKind: "مفهوم", enKind: "Concept", duration: 24, faNarration: "مفهوم را با یک مثال کوتاه و قابل تصور توضیح بده.", enNarration: "Explain the idea with one concrete example." },
  { id: "compare", mark: "03", faTitle: "مقایسه دو راه", enTitle: "Comparison", faKind: "مقایسه", enKind: "Comparison", duration: 28, faNarration: "دو گزینه را کنار هم بگذار و بگو هر کدام چه هزینه‌ای دارد.", enNarration: "Put two options side by side and name the cost of each." },
  { id: "code", mark: "04", faTitle: "نمایش کد", enTitle: "Code walkthrough", faKind: "نمایش کد", enKind: "Code", duration: 32, faNarration: "فقط همان خطوطی را نشان بده که تصمیم را عوض می‌کنند.", enNarration: "Show only the lines that change the decision." },
  { id: "architecture", mark: "05", faTitle: "دیاگرام معماری", enTitle: "Architecture diagram", faKind: "دیاگرام معماری", enKind: "Architecture", duration: 30, faNarration: "مرز بین بخش‌ها را ثابت و قابل دفاع نشان بده.", enNarration: "Show the boundary between parts and why it stays put." },
  { id: "recap", mark: "06", faTitle: "جمع‌بندی", enTitle: "Recap", faKind: "جمع‌بندی", enKind: "Recap", duration: 16, faNarration: "یک جمله بگو که بیننده بتواند فردا به کار ببرد.", enNarration: "Leave the viewer with one decision they can use tomorrow.", motion: "fade" },
];
export const sceneKinds = {
  fa: ["عنوان و شروع", "مفهوم", "مقایسه", "نمایش کد", "دیاگرام معماری", "جمع‌بندی"],
  en: ["Title", "Concept", "Comparison", "Code", "Architecture", "Recap"],
};

