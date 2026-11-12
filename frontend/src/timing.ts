export type TimedScene = {
  id: string;
  title?: string;
  kind?: string;
  duration: number;
  narration?: string;
};

export type CaptionCue = { id: string; text: string; start: number; end: number };

export const formatTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
};

export const wordCuesForScene = (scene: TimedScene, start: number): CaptionCue[] => {
  const words = (scene.narration ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || scene.duration <= 0) return [];
  const weights = words.map((word) => Math.max(1, word.replace(/[^\p{L}\p{N}]+/gu, "").length || word.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = start;
  return words.map((word, index) => {
    const span = index === words.length - 1 ? start + scene.duration - cursor : scene.duration * weights[index] / total;
    const end = cursor + span;
    const cue = { id: `${scene.id}-${index}`, text: word, start: cursor, end };
    cursor = end;
    return cue;
  });
};

export const suggestedDiagramLabels = (scene?: TimedScene): string[] => {
  if (!scene) return ["CLIENT", "API", "DATA"];
  const kind = (scene.kind ?? "").toLowerCase();
  const text = [scene.title ?? "", scene.narration ?? "", scene.kind ?? ""].join(" ").toLowerCase();
  if (kind.includes("code") || kind.includes("کد")) return ["INPUT", "VALIDATE", "OUTPUT"];
  if (kind.includes("comparison") || kind.includes("مقایسه") || /trade.?off| versus | vs |در مقابل/.test(text)) return ["OPTION A", "OPTION B"];
  if (/event.?driven|kafka|rabbitmq|message broker|رویدادمحور|رویداد محور|بروکر/.test(text)) return ["PRODUCER", "BROKER", "CONSUMER"];
  if (/api gateway|gateway|گیت.?وی|درگاه api/.test(text)) return ["CLIENT", "API GATEWAY", "SERVICES", "DATA"];
  if (/modular monolith|ماژولار مونولیت|مونولیت ماژولار/.test(text)) return ["API", "ORDERS", "CATALOG", "SHARED DB"];
  if (/microservices|microservice|میکروسرویس|میکرو سرویس/.test(text)) return ["API GATEWAY", "ORDER SVC", "CATALOG SVC", "DATABASES"];
  if (/sequence diagram|request flow|authentication|oauth|login flow|احراز هویت|ورود کاربر/.test(text)) return ["CLIENT", "IDENTITY", "TOKEN", "API"];
  if (/database|postgres|mysql|دیتابیس|پایگاه داده/.test(text)) return ["CLIENT", "API", "DATABASE"];
  return ["CLIENT", "API", "DATA"];
};

const toSrtTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

export const projectSrt = (items: TimedScene[]) => {
  let cursor = 0;
  const blocks: string[] = [];
  for (const scene of items) {
    const words = (scene.narration ?? "").trim().split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (let offset = 0; offset < words.length; offset += 12) chunks.push(words.slice(offset, offset + 12).join(" "));
    const weights = chunks.map((chunk) => Math.max(1, chunk.split(/\s+/).length));
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let local = cursor;
    chunks.forEach((text, index) => {
      const span = index === chunks.length - 1 ? cursor + Math.max(1, scene.duration) - local : scene.duration * weights[index] / total;
      const end = local + span;
      blocks.push(`${blocks.length + 1}\n${toSrtTime(local)} --> ${toSrtTime(end)}\n${text}`);
      local = end;
    });
    cursor += scene.duration;
  }
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
};

export const sceneSuggestsDiagram = (scene?: TimedScene): boolean => {
  if (!scene) return false;
  const kind = (scene.kind ?? "").toLowerCase();
  if (kind.includes("code") || kind.includes("کد") || kind.includes("comparison") || kind.includes("مقایسه")) return false;
  const text = [scene.title ?? "", scene.narration ?? "", scene.kind ?? ""].join(" ").toLowerCase();
  if (/trade.?off|tradeoff| versus | vs |در مقابل|مزیت و عیب/.test(text)) return false;
  return /معماری|دیاگرام|architecture|diagram|service|سرویس|module|ماژول|event.?driven|kafka|rabbitmq|gateway|گیت|مونولیت|microservice|میکروسرویس|database|postgres|دیتابیس|پایگاه داده|authentication|oauth|احراز هویت/.test(text);
};
