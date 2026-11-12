import { useEffect, useMemo, useState, type CSSProperties } from "react";

type DiagramNode = { id: string; label: string; x: number; y: number };
type DiagramEdge = { label: string };
type SceneDiagram = { nodes: DiagramNode[]; edges: DiagramEdge[]; accentColor?: string };
type SceneLayer = { id: string; type: "image" | "video" | "text" | "code" | "diagram"; name: string; x: number; y: number; width: number; height: number; zIndex: number; opacity: number; visible: boolean; content?: string; assetId?: string };
type Scene = { id: string; title: string; kind: string; duration: number; narration?: string; assetId?: string; voiceAssetId?: string; diagram?: SceneDiagram; layers?: SceneLayer[] };
type Project = { id: string; title: string; document: { schemaVersion: number; scenes: Scene[]; [key: string]: unknown } };
type Asset = { id: string; name: string; mime_type: string; size_bytes: number; created_at: string };
type Voice = { id: string; name: string; language: string; quality: string; installed: boolean };
type CapabilityReport = { ffmpeg_available: boolean; ffprobe_available: boolean; libx264_encoder: boolean; subtitles_filter: boolean };
const API = "http://127.0.0.1:8000/api/v1";
const starterScenes: Scene[] = [
  { id: "scene-01", title: "Hook — The hidden cost of coupling", kind: "عنوان و شروع", duration: 12 },
  { id: "scene-02", title: "Why architecture matters", kind: "مفهوم", duration: 28 },
  { id: "scene-03", title: "A modular monolith", kind: "دیاگرام معماری", duration: 35 },
  { id: "scene-04", title: "Module boundaries in code", kind: "نمایش کد", duration: 42 },
  { id: "scene-05", title: "Trade-offs and recap", kind: "جمع‌بندی", duration: 25 },
];
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const getSuggestedDiagramLabels = (scene?: Scene): string[] => {
  if (!scene) return ["CLIENT", "API", "DATA"];
  const kind = scene.kind.toLowerCase();
  const text = [scene.title, scene.narration ?? "", scene.kind].join(" ").toLowerCase();
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
const makeDefaultDiagram = (scene?: Scene): SceneDiagram => {
  const labels = getSuggestedDiagramLabels(scene);
  return {
    nodes: labels.map((label, index) => ({ id: `node-${index + 1}`, label, x: Math.round(12 + index * (76 / Math.max(1, labels.length - 1))), y: 48 })),
    edges: labels.slice(1).map((_, index) => ({ label: ["REQUEST", "ROUTE", "PERSIST"][index % 3] })),
    accentColor: "#7187ff",
  };
};
const sceneSuggestsDiagram = (scene?: Scene): boolean => {
  if (!scene) return false;
  const kind = scene.kind.toLowerCase();
  if (kind.includes("code") || kind.includes("کد") || kind.includes("comparison") || kind.includes("مقایسه")) return false;
  const text = [scene.title, scene.narration ?? "", scene.kind].join(" ").toLowerCase();
  if (/trade.?off|tradeoff| versus | vs |در مقابل|مزیت و عیب/.test(text)) return false;
  return /معماری|دیاگرام|architecture|diagram|service|سرویس|module|ماژول|event.?driven|kafka|rabbitmq|gateway|گیت|مونولیت|microservice|میکروسرویس|database|postgres|دیتابیس|پایگاه داده|authentication|oauth|احراز هویت/.test(text);
};
let startupRequest: Promise<{ projects: Project[]; current: Project }> | null = null;
function loadStartupProject(): Promise<{ projects: Project[]; current: Project }> {
  if (!startupRequest) {
    startupRequest = (async () => {
      const response = await fetch(`${API}/projects`);
      if (!response.ok) throw new Error("Backend is not reachable. Start the API server first.");
      let projects: Project[] = await response.json();
      if (!projects.length) {
        const created = await fetch(`${API}/projects`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Lesson 08 — Modular Monolith in Practice",
            document: { schemaVersion: 1, profile: { aspectRatio: "16:9", width: 1920, height: 1080, fps: 30 }, language: "fa", scenes: starterScenes, audioTracks: [], captionTracks: [] },
          }),
        });
        if (!created.ok) throw new Error("Could not create the starter project.");
        projects = [await created.json()];
      }
      return { projects, current: projects[0] };
    })().catch((error: unknown) => {
      startupRequest = null;
      throw error;
    });
  }
  return startupRequest;
}


export default function App() {
  const [active, setActive] = useState("scene-03");
  const [locale, setLocale] = useState<"fa" | "en">("fa");
  const [tab, setTab] = useState("design");
  const [scenes, setScenes] = useState<Scene[]>(starterScenes);
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [nav, setNav] = useState<"editor" | "projects">("editor");
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [renderProfile, setRenderProfile] = useState<"youtube-1080p" | "shorts-1080p">("youtube-1080p");
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderState, setRenderState] = useState("idle");
  const [renderMessage, setRenderMessage] = useState("");
  const [renderDownloadUrl, setRenderDownloadUrl] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [publishingPack, setPublishingPack] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceEngineAvailable, setVoiceEngineAvailable] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceProgress, setVoiceProgress] = useState("");
  const fa = locale === "fa";
  const selected = useMemo(() => scenes.find((scene) => scene.id === active) ?? scenes[0], [scenes, active]);
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const selectedAsset = assets.find(asset => asset.id === selected?.assetId);
  const selectedVoiceAsset = assets.find(asset => asset.id === selected?.voiceAssetId);
  const selectedDiagram = selected?.diagram ?? makeDefaultDiagram(selected);
  const previewDiagram = selected?.diagram ?? (sceneSuggestsDiagram(selected) ? makeDefaultDiagram(selected) : null);
  const capabilityWarning = capabilities && (!capabilities.ffmpeg_available || !capabilities.ffprobe_available || !capabilities.libx264_encoder || !capabilities.subtitles_filter)
    ? (fa ? "FFmpeg کامل پیدا نشد. رندر MP4 به ffmpeg، ffprobe، رمزگذار libx264 و فیلتر subtitles روی PATH نیاز دارد." : "FFmpeg is incomplete. MP4 render needs ffmpeg, ffprobe, libx264, and the subtitles filter on PATH.")
    : "";

  useEffect(() => {
    let alive = true;
    loadStartupProject()
      .then(({ projects: loaded, current }) => {
        if (!alive) return;
        const restored = Array.isArray(current.document?.scenes) && current.document.scenes.length ? current.document.scenes : starterScenes;
        setProjects(loaded);
        setProject(current);
        setScenes(restored);
        setActive(restored[0].id);
        setStatus("saved");
        setHydrated(true);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "Unknown API error");
        setStatus("offline");
      });
    fetch(`${API}/system/capabilities`)
      .then(async (response) => { if (!response.ok) throw new Error("capabilities"); return response.json() as Promise<CapabilityReport>; })
      .then((report) => { if (alive) setCapabilities(report); })
      .catch(() => { if (alive) setCapabilities(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !project) return;
    const controller = new AbortController();
    const projectId = project.id;
    const document = project.document;
    const snapshot = scenes;
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API}/projects/${projectId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ document: { ...document, scenes: snapshot } }),
        });
        if (!response.ok) throw new Error("Autosave failed");
        setProject((current) => current && current.id === projectId ? { ...current, document: { ...current.document, scenes: snapshot } } : current);
        setStatus("saved");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setStatus("error");
      }
    }, 650);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [scenes, hydrated, project?.id]);


  useEffect(() => {
    if (!project) return;
    let alive = true;
    fetch(`${API}/projects/${project.id}/assets`)
      .then(async response => { if (!response.ok) throw new Error("Could not load media library"); return response.json() as Promise<Asset[]>; })
      .then(items => { if (alive) setAssets(items); })
      .catch(reason => { if (alive) setAssetError(reason instanceof Error ? reason.message : "Media library error"); });
    return () => { alive = false; };
  }, [project?.id]);

  useEffect(() => {
    fetch(`${API}/system/voices`)
      .then(async response => { if (!response.ok) throw new Error("Could not load local voices"); return response.json(); })
      .then(result => { setVoices(result.voices ?? []); setVoiceEngineAvailable(Boolean(result.available)); if (result.voices?.length) setVoiceId(result.voices[0].id); })
      .catch(reason => setVoiceError(reason instanceof Error ? reason.message : "Voice catalog unavailable"));
  }, []);

  const generateVoiceovers = async () => {
    if (!project || !voiceId || !voiceEngineAvailable || voiceBusy) return;
    setVoiceBusy(true); setVoiceError(""); setVoiceProgress(""); setRenderMessage(""); setRenderDownloadUrl("");
    try {
      let workingScenes = scenes;
      if (scriptText.trim()) {
        const storyboardResponse = await fetch(`${API}/storyboard/from-script`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: project.title, script: scriptText, language: locale, words_per_minute: 130 }),
        });
        const storyboard = await storyboardResponse.json();
        if (!storyboardResponse.ok) throw new Error(storyboard.detail ?? "Storyboard generation failed");
        workingScenes = storyboard.scenes.map((scene: Scene) => ({
          id: scene.id, title: scene.title, kind: scene.kind, duration: scene.duration, narration: scene.narration,
        }));
        setScenes(workingScenes);
        if (workingScenes.length) setActive(workingScenes[0].id);
      }
      // Persist the exact storyboard before requesting TTS. React autosave is debounced,
      // so without this explicit write the backend may still read the previous scene list.
      const storyboardSave = await fetch(`${API}/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { ...project.document, scenes: workingScenes } }),
      });
      if (!storyboardSave.ok) throw new Error("Could not save the storyboard before voice generation.");
      setProject(current => current ? {
        ...current, document: { ...current.document, scenes: workingScenes },
      } : current);

      const eligible = workingScenes.filter(scene => scene.narration?.trim());
      if (!eligible.length) throw new Error(fa ? "ابتدا متن سناریو یا متن گویندگی صحنه‌ها را وارد کن." : "Enter a script or scene narration first.");
      const mapping = new Map<string, string>();
      const batches = Math.ceil(eligible.length / 30);
      for (let batch = 0; batch < batches; batch++) {
        setVoiceProgress(fa ? `تولید صدا: بخش ${batch + 1} از ${batches}` : `Generating voice batch ${batch + 1} of ${batches}`);
        const batchScenes = eligible.slice(batch * 30, (batch + 1) * 30);
        const voiceResponse = await fetch(`${API}/projects/${project.id}/voiceovers`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: voiceId, scene_ids: batchScenes.map(scene => scene.id) }),
        });
        const voiceResult = await voiceResponse.json();
        if (!voiceResponse.ok) throw new Error(voiceResult.detail ?? "Voice generation failed");
        for (const item of voiceResult.generated as {scene_id:string;asset:{id:string}}[]) mapping.set(item.scene_id, item.asset.id);
      }
      const finalScenes = workingScenes.map(scene => mapping.has(scene.id) ? { ...scene, voiceAssetId: mapping.get(scene.id) } : scene);
      setScenes(finalScenes);
      const saveResponse = await fetch(`${API}/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { ...project.document, scenes: finalScenes } }),
      });
      if (!saveResponse.ok) throw new Error("Could not save generated narration to the project.");
      const refreshed = await fetch(`${API}/projects/${project.id}/assets`);
      if (refreshed.ok) setAssets(await refreshed.json());
      setScriptText("");
      setRenderState("queued");
      const renderResponse = await fetch(`${API}/projects/${project.id}/renders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: renderProfile, fps: 30 }),
      });
      const renderResult = await renderResponse.json();
      if (!renderResponse.ok) throw new Error(renderResult.detail ?? "Final MP4 render could not start.");
      setRenderJobId(renderResult.job_id);
    } catch (reason) {
      setRenderState("failed");
      setVoiceError(reason instanceof Error ? reason.message : "Automatic video production failed");
    } finally { setVoiceBusy(false); setVoiceProgress(""); }
  };

  const uploadAsset = async (file?: File) => {
    if (!project || !file) return;
    setAssetBusy(true); setAssetError("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`${API}/projects/${project.id}/assets`, { method: "POST", body: form });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail ?? "Upload failed"); }
      const item = await response.json(); setAssets(current => [item, ...current]);
    } catch (reason) { setAssetError(reason instanceof Error ? reason.message : "Upload failed"); }
    finally { setAssetBusy(false); }
  };

  const removeAsset = async (assetId: string) => {
    if (!project) return;
    try {
      const response = await fetch(`${API}/projects/${project.id}/assets/${assetId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete asset");
      setAssets(current => current.filter(asset => asset.id !== assetId));
      setScenes(current => current.map(scene => scene.assetId === assetId || scene.voiceAssetId === assetId ? { ...scene, assetId: scene.assetId === assetId ? undefined : scene.assetId, voiceAssetId: scene.voiceAssetId === assetId ? undefined : scene.voiceAssetId } : scene));
    } catch (reason) { setAssetError(reason instanceof Error ? reason.message : "Delete failed"); }
  };
  const assetUrl = (assetId: string) => `${API}/projects/${project?.id}/assets/${assetId}/file`;
  const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const addScene = () => {
    const next: Scene = { id: `scene-${crypto.randomUUID()}`, title: fa ? "صحنه جدید" : "New scene", kind: fa ? "مفهوم" : "Concept", duration: 20 };
    setScenes((items) => [...items, next]);
    setActive(next.id);
  };
  const removeScene = (id: string) => {
    const next = scenes.filter((scene) => scene.id !== id);
    if (!next.length || next.length === scenes.length) return;
    setScenes(next);
    if (id === active) setActive(next[0].id);
  };
  const openProject = async (next: Project) => {
    if (project && project.id !== next.id) {
      const saved = await fetch(`${API}/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { ...project.document, scenes } }),
      });
      if (!saved.ok) {
        setError(fa ? "قبل از عوض کردن پروژه، ذخیرهٔ صحنهٔ فعلی ناموفق بود." : "Could not save the current project before switching.");
        setStatus("error");
        return;
      }
    }
    const restored = Array.isArray(next.document?.scenes) && next.document.scenes.length ? next.document.scenes : starterScenes;
    setProject(next);
    setScenes(restored);
    setActive(restored[0].id);
    setStatus("saved");
    setHydrated(true);
    setNav("editor");
    setError("");
    setPublishingPack("");
    setRenderJobId(null);
    setRenderState("idle");
    setRenderMessage("");
    setRenderDownloadUrl("");
  };
  const renameProject = async (title: string) => {
    if (!project) return;
    const next = title.trim().slice(0, 160);
    const previous = projects.find((item) => item.id === project.id)?.title ?? project.title;
    if (!next) {
      setProject((current) => current ? { ...current, title: previous } : current);
      return;
    }
    if (next === previous) return;
    try {
      const response = await fetch(`${API}/projects/${project.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!response.ok) throw new Error(fa ? "تغییر نام پروژه ذخیره نشد." : "Could not rename the project.");
      setProject((current) => current ? { ...current, title: next } : current);
      setProjects((list) => list.map((item) => item.id === project.id ? { ...item, title: next } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rename the project.");
    }
  };
  const focusPanel = (id: string) => {
    setNav("editor");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const updateSelected = (patch: Partial<Scene>) => setScenes((items) => items.map((scene) => scene.id === active ? { ...scene, ...patch } : scene));
  const updateDiagram = (patch: Partial<SceneDiagram>) => updateSelected({ diagram: { ...selectedDiagram, ...patch } });
  const updateDiagramNode = (index: number, patch: Partial<DiagramNode>) => updateDiagram({ nodes: selectedDiagram.nodes.map((node, nodeIndex) => nodeIndex === index ? { ...node, ...patch } : node) });
  const updateDiagramEdge = (index: number, label: string) => updateDiagram({ edges: selectedDiagram.edges.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, label } : edge) });
  const resetDiagram = () => updateSelected({ diagram: makeDefaultDiagram(selected) });
  const addLayer = (type: SceneLayer["type"]) => {
    if (!selected) return;
    const count = (selected.layers ?? []).length;
    const layer: SceneLayer = {
      id: `layer-${crypto.randomUUID()}`, type,
      name: type === "image" ? "Image layer" : type === "video" ? "Video layer" : type === "code" ? "Code layer" : type === "diagram" ? "Diagram layer" : "Text layer",
      x: 12 + (count % 3) * 8, y: 16 + (count % 3) * 8, width: 42, height: 28,
      zIndex: count + 1, opacity: 1, visible: true,
      content: type === "code" ? "public void handle() {\n  // your code\n}" : type === "diagram" ? "CLIENT → API → DATA" : type === "text" ? "Your text" : undefined,
    };
    updateSelected({ layers: [...(selected.layers ?? []), layer] });
  };
  const updateLayer = (id: string, patch: Partial<SceneLayer>) => {
    if (!selected) return;
    updateSelected({ layers: (selected.layers ?? []).map(layer => {
      if (layer.id !== id) return layer;
      const updated = { ...layer, ...patch };
      updated.x = Math.max(0, Math.min(99, updated.x));
      updated.y = Math.max(0, Math.min(99, updated.y));
      updated.width = Math.max(1, Math.min(100 - updated.x, updated.width));
      updated.height = Math.max(1, Math.min(100 - updated.y, updated.height));
      return updated;
    }) });
  };
  const moveLayer = (id: string, direction: -1 | 1) => {
    if (!selected) return;
    const ordered = [...(selected.layers ?? [])].sort((a,b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex(layer => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    updateSelected({ layers: ordered.map((layer, order) => ({ ...layer, zIndex: order + 1 })) });
  };
  const deleteLayer = (id: string) => updateSelected({ layers: (selected?.layers ?? []).filter(layer => layer.id !== id) });
  const addDiagramNode = () => {
    const index = selectedDiagram.nodes.length;
    const nodes = [...selectedDiagram.nodes, { id: `node-${crypto.randomUUID()}`, label: `NODE ${index + 1}`, x: 12 + (index % 4) * 25, y: 48 + Math.floor(index / 4) * 22 }];
    updateDiagram({ nodes, edges: [...selectedDiagram.edges, { label: "CONNECTS" }] });
  };
  const removeDiagramNode = (index: number) => {
    const nodes = selectedDiagram.nodes.filter((_, nodeIndex) => nodeIndex !== index);
    updateDiagram({ nodes, edges: nodes.slice(1).map((_, edgeIndex) => selectedDiagram.edges[edgeIndex] ?? { label: "CONNECTS" }) });
  };
  const generateStoryboard = async () => {
    if (!project || !scriptText.trim()) return;
    setScriptBusy(true);
    try {
      const response = await fetch(`${API}/storyboard/from-script`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: project.title, script: scriptText, language: locale, words_per_minute: 130 }),
      });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Storyboard generation failed");
      const result = await response.json();
      setScenes(result.scenes.map((scene: Scene) => ({ id: scene.id, title: scene.title, kind: scene.kind, duration: scene.duration, narration: scene.narration })));
      if (result.scenes.length) setActive(result.scenes[0].id);
      setScriptText("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Storyboard generation failed"); }
    finally { setScriptBusy(false); }
  };

  const generatePublishingPack = async () => {
    if (!project) return;
    try {
      const response = await fetch(`${API}/projects/${project.id}/publishing-pack`, { method: "POST" });
      if (!response.ok) throw new Error("Publishing pack generation failed");
      setPublishingPack(JSON.stringify(await response.json(), null, 2));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publishing pack failed"); }
  };

  const startRender = async () => {
    if (!project || renderState === "queued" || renderState === "running") return;
    setRenderState("queued"); setRenderMessage("");
    try {
      const response = await fetch(`${API}/projects/${project.id}/renders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: renderProfile, fps: 30 }) });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Render request failed");
      const result = await response.json(); setRenderJobId(result.job_id);
    } catch (reason) { setRenderState("failed"); setRenderMessage(reason instanceof Error ? reason.message : "Render failed"); }
  };

  useEffect(() => {
    if (!renderJobId) return;
    const poll = async () => {
      try {
        const response = await fetch(`${API}/jobs/${renderJobId}`);
        if (!response.ok) throw new Error("Could not read render job status");
        const job = await response.json(); setRenderState(job.status);
        if (job.status === "completed") { setRenderMessage(`${job.width}×${job.height}`); setRenderDownloadUrl(`${API}/jobs/${renderJobId}/download`); setRenderJobId(null); }
        if (job.status === "failed") { setRenderMessage(job.error ?? "Render failed"); setRenderJobId(null); }
      } catch (reason) { setRenderState("failed"); setRenderMessage(reason instanceof Error ? reason.message : "Render status error"); setRenderJobId(null); }
    };
    const timer = window.setInterval(poll, 1500); void poll();
    return () => window.clearInterval(timer);
  }, [renderJobId]);

  const statusLabel = status === "saved" ? (fa ? "ذخیره شد" : "Saved") : status === "saving" ? (fa ? "در حال ذخیره" : "Saving") : status === "loading" ? (fa ? "در حال بارگذاری" : "Loading") : (fa ? "اتصال/ذخیره ناموفق" : "Offline / save error");

  return <div className={fa ? "app rtl" : "app ltr"} dir={fa ? "rtl" : "ltr"}>
    <header className="topbar">
      <div className="brand"><span className="logo">▣</span><div><b>FrameLab</b><small>VIDEO PRODUCTION STUDIO</small></div></div>
      <div className="project"><i/> <input className="project-title" aria-label={fa ? "نام پروژه" : "Project title"} value={project?.title ?? ""} placeholder={fa ? "در حال بارگذاری پروژه..." : "Loading project..."} disabled={!project} onChange={(event) => setProject((current) => current ? { ...current, title: event.target.value } : current)} onBlur={(event) => { void renameProject(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> <small className="save-status">{statusLabel}</small></div>
      <div className="actions"><button onClick={() => setLocale(fa ? "en" : "fa")}>{fa ? "EN" : "فا"}</button><button onClick={generatePublishingPack}>{fa ? "بسته انتشار" : "YT pack"}</button><button onClick={() => setRenderProfile(renderProfile === "youtube-1080p" ? "shorts-1080p" : "youtube-1080p")}>{renderProfile === "youtube-1080p" ? "16:9" : "9:16"}</button><button className="primary" onClick={startRender} disabled={!project || renderState === "queued" || renderState === "running"}>{renderState === "queued" || renderState === "running" ? (fa ? "در حال رندر..." : "Rendering...") : (fa ? "رندر MP4" : "Render MP4")}</button></div>
    </header>
    <aside className="sidebar">
      <label>{fa ? "فضای تولید" : "WORKSPACE"}</label>
      <button type="button" className={nav === "editor" ? "nav-button active" : "nav-button"} onClick={() => setNav("editor")}>▣　{fa ? "ویرایشگر ویدیو" : "Video editor"}</button>
      <button type="button" className={nav === "projects" ? "nav-button active" : "nav-button"} onClick={() => setNav("projects")}>▤　{fa ? "پروژه‌ها" : "Projects"}</button>
      <button type="button" className="nav-button" disabled title={fa ? "به‌زودی" : "Coming soon"}>▧　{fa ? "قالب‌ها و برند" : "Templates & brand"}</button>
      <button type="button" className="nav-button" onClick={() => focusPanel("media-library")}>▣　{fa ? "کتابخانه رسانه" : "Media library"}</button>
      <hr/><label>{fa ? "مراحل تولید" : "PRODUCTION"}</label>
      <button type="button" className="nav-button" onClick={() => focusPanel("script-input")}>✎　{fa ? "سناریو و استوری‌بورد" : "Script & storyboard"}</button>
      <button type="button" className="nav-button" onClick={() => focusPanel("voice-panel")}>♫　{fa ? "گویندگی و صدا" : "Voice & audio"}</button>
      <button type="button" className="nav-button" disabled title={fa ? "زیرنویس هنگام رندر از روی گویندگی ساخته می‌شود." : "Captions are generated from narration during render."}>▤　{fa ? "زیرنویس" : "Subtitles"}</button>
      <button type="button" className="nav-button" onClick={() => void generatePublishingPack()}>✧　{fa ? "بسته انتشار" : "Publishing pack"}</button>
      {nav === "projects" && <div className="project-switch">{projects.map((item) => <button type="button" key={item.id} className={item.id === project?.id ? "active" : ""} onClick={() => void openProject(item)}>{item.title}</button>)}</div>}
      <div className="local">● {fa ? "پردازش محلی · بدون فضای ابری" : "Local processing · No cloud"}</div>
    </aside>
    <main className="main">
      <section className="scenes">
        <div className="heading"><div><small>STORYBOARD</small><h2>{fa ? "صحنه‌های ویدیو" : "Video scenes"} <em>{String(scenes.length).padStart(2,"0")}</em></h2></div><button onClick={addScene}>＋</button></div>
        <textarea id="script-input" className="script-input" value={scriptText} onChange={event=>setScriptText(event.target.value)} placeholder={fa ? "سناریوی درس را اینجا وارد کن؛ هر پاراگراف یک صحنه می‌شود..." : "Paste your lesson script. Each paragraph becomes a scene..."} />
        <button className="add script-button" onClick={generateStoryboard} disabled={scriptBusy || !scriptText.trim()}>{scriptBusy ? (fa ? "در حال ساخت..." : "Generating...") : (fa ? "تبدیل سناریو به استوری‌بورد" : "Generate storyboard from script")}</button>
        <div id="voice-panel" className="voice-panel">
          <div className="media-heading"><b>{fa ? "گویندگی خودکار با صدای محلی" : "Local AI voice-over"}</b><span>{voices.length} {fa ? "صدا" : "voices"}</span></div>
          <select className="field edit-field" value={voiceId} onChange={event=>setVoiceId(event.target.value)} disabled={!voices.length || voiceBusy}>
            {voices.length ? voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name}{voice.language ? " · "+voice.language : ""}</option>) : <option value="">{fa ? "صدای محلی نصب نشده" : "No local voices installed"}</option>}
          </select>
          <button className="add voice-button" onClick={()=>void generateVoiceovers()} disabled={!voiceId || !voiceEngineAvailable || voiceBusy || renderState === "queued" || renderState === "running" || (!scriptText.trim() && !scenes.some(scene=>scene.narration?.trim()))}>{voiceBusy ? (fa ? "در حال تولید صدا و رندر ویدیو..." : "Generating voice and rendering video...") : (fa ? "تولید خودکار ویدیو تا MP4 نهایی" : "Produce video automatically to final MP4")}</button>
          {voiceProgress && <small className="media-limit">{voiceProgress}</small>}{voiceError && <div className="media-error">{voiceError}</div>}
          {(!voices.length || !voiceEngineAvailable) && <small className="media-limit">{!voiceEngineAvailable ? (fa ? "موتور Piper نصب یا در PATH پیدا نشده است؛ راهنمای نصب را ببین." : "Piper is not installed or not available on PATH; see setup guide.") : (fa ? "مدل صدای محلی نصب نشده است؛ راهنمای نصب را ببین." : "No local voice models installed; see setup guide.")}</small>}
        </div>
        <div id="media-library" className="media-library">
          <div className="media-heading"><b>{fa ? "کتابخانه رسانه" : "Media library"}</b><span>{assets.length}</span></div>
          <label className="upload-control">{assetBusy ? (fa ? "در حال بارگذاری..." : "Uploading...") : (fa ? "＋ افزودن تصویر / ویدیو / صدا" : "＋ Add image / video / audio")}
            <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg" disabled={assetBusy} onChange={event => { void uploadAsset(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
          </label>
          <small className="media-limit">{fa ? "حداکثر حجم هر فایل: ۲۵۰ مگابایت · ذخیره محلی پروژه" : "250 MB max per file · stored with this local project"}</small>
          {assetError && <div className="media-error">{assetError}</div>}
          {assets.length === 0 ? <p className="media-empty">{fa ? "هنوز رسانه‌ای اضافه نشده است." : "No media uploaded yet."}</p> : <div className="asset-list">{assets.map(asset => <div className="asset-item" key={asset.id}>
            <div className="asset-preview">{asset.mime_type.startsWith("image/") ? <img src={assetUrl(asset.id)} alt={asset.name}/> : asset.mime_type.startsWith("video/") ? "▶" : "♫"}</div>
            <div className="asset-meta"><b title={asset.name}>{asset.name}</b><small>{asset.mime_type} · {formatBytes(asset.size_bytes)}</small></div>
            <button title={fa ? "حذف فایل" : "Delete file"} onClick={() => void removeAsset(asset.id)}>×</button>
          </div>)}</div>}
        </div>
        {scenes.map((scene,i)=><div key={scene.id} role="button" tabIndex={0} onClick={()=>setActive(scene.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(scene.id); } }} className={active===scene.id?"scene selected":"scene"}><span className="thumb">{String(i+1).padStart(2,"0")}<b>{["✧","▤","⌘","{ }","✓"][i%5]}</b></span><span className="scene-text"><strong>{scene.title}</strong><small>{scene.kind}</small><small>{formatTime(scene.duration)}</small></span><button type="button" className="scene-delete" disabled={scenes.length<=1} title={fa ? "حذف صحنه" : "Delete scene"} onClick={(event) => { event.stopPropagation(); removeScene(scene.id); }}>×</button></div>)}
        <button className="add" onClick={addScene}>＋　{fa ? "افزودن صحنه" : "Add scene"}</button>
        <div className="hint">✧ {fa ? "تغییرات استوری‌بورد به‌صورت خودکار در پایگاه داده محلی ذخیره می‌شود." : "Storyboard changes are autosaved to your local database."}</div>
      </section>
      <section className="editor">
        <div className="editor-head"><div><small>SCENE PREVIEW</small><b>{selected?.title}</b></div><span>{renderProfile === "shorts-1080p" ? "9:16" : "16:9"}　　100%</span></div>
        <div className="stage"><div className="canvas-stage" style={renderProfile === "shorts-1080p" ? { aspectRatio: "9 / 16", width: "auto", height: "min(620px, 70vh)" } : { aspectRatio: "16 / 9" }}>
          {selectedAsset && (selectedAsset.mime_type.startsWith("image/") || selectedAsset.mime_type.startsWith("video/")) ? <div className="canvas-base-media">{selectedAsset.mime_type.startsWith("image/") ? <img src={assetUrl(selectedAsset.id)} alt={selectedAsset.name}/> : <video src={assetUrl(selectedAsset.id)} controls preload="metadata"/>}</div> : <div className="slide">
            <div className="slide-meta"><span>{(selected?.kind ?? "CONCEPT").toUpperCase()}</span><span>{String(scenes.findIndex(s=>s.id===active)+1).padStart(2,"0")} — {String(scenes.length).padStart(2,"0")}</span></div>
            <div className="hero"><small>{fa ? "پیش‌نمایش قالب صحنه" : "SCENE TEMPLATE PREVIEW"}</small><h1>{selected?.title ?? (fa ? "صحنه جدید" : "New scene")}</h1><p>{selected?.narration ?? (fa ? "متن گویندگی این صحنه در این قسمت نمایش داده می‌شود." : "Scene narration will appear here.")}</p></div>
            {previewDiagram && <div className="diagram editor-diagram" style={{"--diagram-accent":previewDiagram.accentColor ?? "#7187ff"} as CSSProperties}>{previewDiagram.nodes.map((node,index)=><div key={node.id} className={index===1?"focus":""} style={{left:`${node.x}%`,top:`${node.y}%`}}>{node.label}<small>{selected?.kind ?? "Concept"}</small></div>)}</div>}
            <div className="slide-meta footer"><span>LOCAL VIDEO STUDIO</span><span>STATIC · NO AUTO MOTION</span></div>
          </div>}
          {(selected?.layers ?? []).filter(layer=>layer.visible).sort((a,b)=>a.zIndex-b.zIndex).map(layer => {
            const layerAsset = layer.assetId ? assets.find(asset=>asset.id===layer.assetId) : undefined;
            return <div key={layer.id} className={`canvas-layer layer-${layer.type}`} style={{left:`${layer.x}%`,top:`${layer.y}%`,width:`${layer.width}%`,height:`${layer.height}%`,opacity:layer.opacity,zIndex:layer.zIndex}}>
              {(layer.type==="image" || layer.type==="video") && layerAsset ? (layer.type==="image" ? <img src={assetUrl(layerAsset.id)} alt={layer.name}/> : <video src={assetUrl(layerAsset.id)} muted playsInline/>) : null}
              {layer.type==="text" && <span>{layer.content}</span>}
              {layer.type==="code" && <pre>{layer.content}</pre>}
              {layer.type==="diagram" && <span className="layer-diagram">{layer.content}</span>}
            </div>;
          })}
        </div></div>
        <div className="playback"><button disabled>▶</button><span>{formatTime(selected?.duration ?? 0)}</span><div className="bar"><i/></div><span>{formatTime(totalSeconds)}</span><small>{fa ? "پیش‌نمایش ثابت · بدون حرکت خودکار" : "Static preview · no auto motion"}</small></div>
        <div className="timeline-head"><div><small>SCENE SEQUENCE</small><b>{fa ? "تایم‌لاین" : "Timeline"}</b></div><span>{formatTime(totalSeconds)}</span></div>
        <div className="timeline"><div className="ruler"><span>00:00</span><span>00:30</span><span>01:00</span><span>01:30</span><span>02:00</span></div><div className="clips">{scenes.map((scene)=><button key={scene.id} onClick={()=>setActive(scene.id)} className={active===scene.id?"clip on":"clip"}>{scene.title}</button>)}</div><div className="track"><b>♫　Voice-over</b><div className="wave">{scenes.map(scene=>scene.voiceAssetId ? <i key={scene.id} title={scene.title} style={{height: `${Math.max(5,Math.min(20,scene.duration/2))}px`}}/> : null)}{!scenes.some(scene=>scene.voiceAssetId) && <span className="empty-track">{fa ? "هنوز صدایی تولید نشده" : "No voice-over generated"}</span>}</div></div><div className="track"><b>▤　Captions</b><span className="empty-track">{fa ? "زیرنویس هنگام رندر از گویندگی ساخته می‌شود" : "Captions are generated from narration at render time"}</span></div></div>
        {error && <div className="error-banner">{error} — {fa ? "سرور محلی را طبق راهنمای README اجرا کن." : "Start the local API using the README instructions."}</div>}{capabilityWarning && <div className="error-banner">{capabilityWarning}</div>}{renderMessage && <div className={renderState === "failed" ? "error-banner" : "render-banner"}>{renderMessage}{renderDownloadUrl && <a className="download-link" href={renderDownloadUrl}>{fa ? "دانلود ویدیوی MP4" : "Download MP4"}</a>}</div>}{publishingPack && <pre className="publishing-pack">{publishingPack}</pre>}
      </section>
      <aside className="inspector">
        <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
        <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
        {tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><input className="field edit-field" value={selected?.title ?? ""} onChange={event=>updateSelected({title:event.target.value})}/><label>{fa?"نوع صحنه":"Scene type"}</label><input className="field edit-field" value={selected?.kind ?? ""} onChange={event=>updateSelected({kind:event.target.value})}/><label>{fa?"متن گویندگی":"Narration"}</label><textarea className="field edit-field narration-field" value={selected?.narration ?? ""} onChange={event=>updateSelected({narration:event.target.value})} placeholder={fa?"متن گویندگی این صحنه...":"Scene narration..."}/><h3>{fa?"گویندگی این صحنه":"Scene voice-over"}</h3>{selectedVoiceAsset ? <><audio className="voice-audio" controls src={assetUrl(selectedVoiceAsset.id)}/><small className="media-limit">{selectedVoiceAsset.name}</small></> : <p className="muted">{fa?"هنوز صدایی برای این صحنه تولید نشده است.":"No generated voice-over for this scene yet."}</p>}<h3>{fa?"رسانه متصل به صحنه":"Scene media"}</h3><select className="field edit-field" value={selected?.assetId ?? ""} onChange={event=>updateSelected({assetId:event.target.value || undefined})}><option value="">{fa?"بدون رسانه":"No media attached"}</option>{assets.filter(asset=>asset.mime_type.startsWith("image/") || asset.mime_type.startsWith("video/")).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{selectedAsset && <p className="muted">{fa?"این رسانه به صحنه انتخاب‌شده متصل و همراه پروژه ذخیره می‌شود.":"This asset reference is saved with the selected scene."}</p>}          <h3>{fa?"دیاگرام قابل ویرایش":"Editable diagram"}</h3>
          {!selected?.diagram && !sceneSuggestsDiagram(selected) ? <button className="diagram-add" type="button" onClick={resetDiagram}>{fa?"＋ افزودن دیاگرام":"＋ Add diagram"}</button> : <>
          <div className="diagram-tools"><label>{fa?"رنگ تأکیدی":"Accent color"}</label><input aria-label="Diagram accent color" type="color" value={selectedDiagram.accentColor ?? "#7187ff"} onChange={event=>updateDiagram({accentColor:event.target.value})}/><button type="button" onClick={resetDiagram}>{fa?"بازنشانی پیشنهاد":"Reset suggestion"}</button></div>
          {selectedDiagram.nodes.map((node,index)=><div className="diagram-node-editor" key={node.id}>
            <b>{fa?`گره ${index+1}`:`Node ${index+1}`}</b><button type="button" onClick={()=>removeDiagramNode(index)} disabled={selectedDiagram.nodes.length<=2}>×</button>
            <input className="field edit-field" aria-label={`Node ${index+1} label`} value={node.label} onChange={event=>updateDiagramNode(index,{label:event.target.value})}/>
            <div className="diagram-coordinates"><label>X % <input className="field edit-field" type="number" min="5" max="95" value={node.x} onChange={event=>updateDiagramNode(index,{x:Math.max(5,Math.min(95,Number(event.target.value)||5))})}/></label><label>Y % <input className="field edit-field" type="number" min="12" max="82" value={node.y} onChange={event=>updateDiagramNode(index,{y:Math.max(12,Math.min(82,Number(event.target.value)||12))})}/></label></div>
            {index<selectedDiagram.nodes.length-1 && <label>{fa?"برچسب ارتباط":"Connection label"}<input className="field edit-field" value={selectedDiagram.edges[index]?.label ?? ""} onChange={event=>updateDiagramEdge(index,event.target.value)}/></label>}
          </div>)}
          <button className="diagram-add" type="button" onClick={addDiagramNode}>{fa?"＋ افزودن گره":"＋ Add node"}</button></>}
          <h3>{fa?"بوم چندلایه":"Multi-layer canvas"}</h3>
          <div className="layer-add-grid">
            <button type="button" onClick={()=>addLayer("text")}>＋ {fa?"متن":"Text"}</button>
            <button type="button" onClick={()=>addLayer("code")}>＋ Code</button>
            <button type="button" onClick={()=>addLayer("diagram")}>＋ {fa?"دیاگرام":"Diagram"}</button>
            <button type="button" onClick={()=>addLayer("image")}>＋ {fa?"تصویر":"Image"}</button>
            <button type="button" onClick={()=>addLayer("video")}>＋ Video</button>
          </div>
          {(selected?.layers ?? []).slice().sort((a,b)=>b.zIndex-a.zIndex).map(layer=><div className="canvas-layer-editor" key={layer.id}>
            <div className="canvas-layer-heading"><b>{layer.name}</b><span>Z {layer.zIndex}</span><button type="button" onClick={()=>moveLayer(layer.id,1)} title="Move forward">↑</button><button type="button" onClick={()=>moveLayer(layer.id,-1)} title="Move backward">↓</button><button type="button" onClick={()=>updateLayer(layer.id,{visible:!layer.visible})}>{layer.visible?"◉":"○"}</button><button type="button" onClick={()=>deleteLayer(layer.id)}>×</button></div>
            {(layer.type==="text" || layer.type==="code" || layer.type==="diagram") && <textarea className="field edit-field layer-content" value={layer.content ?? ""} onChange={event=>updateLayer(layer.id,{content:event.target.value})}/>}
            {(layer.type==="image" || layer.type==="video") && <select className="field edit-field" value={layer.assetId ?? ""} onChange={event=>updateLayer(layer.id,{assetId:event.target.value || undefined})}><option value="">{fa?"انتخاب فایل رسانه":"Choose media asset"}</option>{assets.filter(asset=>layer.type==="image"?asset.mime_type.startsWith("image/"):asset.mime_type.startsWith("video/")).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>}
            <div className="layer-transform-grid">
              <label>X % <input className="field edit-field" type="number" min="0" max="100" value={layer.x} onChange={event=>updateLayer(layer.id,{x:Math.max(0,Math.min(100,Number(event.target.value)||0))})}/></label>
              <label>Y % <input className="field edit-field" type="number" min="0" max="100" value={layer.y} onChange={event=>updateLayer(layer.id,{y:Math.max(0,Math.min(100,Number(event.target.value)||0))})}/></label>
              <label>W % <input className="field edit-field" type="number" min="1" max="100" value={layer.width} onChange={event=>updateLayer(layer.id,{width:Math.max(1,Math.min(100,Number(event.target.value)||1))})}/></label>
              <label>H % <input className="field edit-field" type="number" min="1" max="100" value={layer.height} onChange={event=>updateLayer(layer.id,{height:Math.max(1,Math.min(100,Number(event.target.value)||1))})}/></label>
            </div>
            <label className="layer-opacity">Opacity · {Math.round(layer.opacity*100)}% <input type="range" min="0" max="100" value={Math.round(layer.opacity*100)} onChange={event=>updateLayer(layer.id,{opacity:Number(event.target.value)/100})}/></label>
          </div>)}</>:<><h3>{tab==="motion"?(fa?"کنترل حرکت":"Motion controls"):tab==="audio"?(fa?"تنظیمات گویندگی":"Voice-over settings"):(fa?"زمان‌بندی صحنه":"Scene timing")}</h3><p className="muted">{tab==="motion"?(fa?"به‌صورت پیش‌فرض انیمیشنی اعمال نمی‌شود. حرکت را فقط خودت انتخاب کن.":"No animation is applied by default. Choose a motion preset explicitly."):tab==="audio"?(fa?"صدای Piper را در پنل سناریو انتخاب کن و گویندگی صحنه‌ها را بساز.":"Choose a local Piper voice in the script panel and generate narration for every scene."):(fa?"مدت صحنه انتخاب‌شده را تنظیم کن.":"Set the duration of the selected scene.")}</p>{tab==="timing" && <><label>{fa?"مدت صحنه (ثانیه)":"Scene duration (seconds)"}</label><input className="field edit-field" type="number" min="1" max="3600" value={selected?.duration ?? 1} onChange={event=>updateSelected({duration:Math.max(1,Number(event.target.value)||1)})}/></>}</>}
        <div className="note">✧ {fa?"حرکت فقط با انتخاب شما اعمال می‌شود؛ محتوای ثابت بدون زوم و پن می‌ماند.":"Motion is opt-in. Static content never auto-zooms or pans."}</div>
      </aside>
    </main>
  </div>;
}
