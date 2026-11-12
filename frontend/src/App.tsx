import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { readingDirection } from "./textDirection";
import { formatTime, projectSrt, sceneSuggestsDiagram, suggestedDiagramLabels, wordCuesForScene, type CaptionCue } from "./timing";

type DiagramNode = { id: string; label: string; x: number; y: number };
type DiagramEdge = { label: string };
type SceneDiagram = { nodes: DiagramNode[]; edges: DiagramEdge[]; accentColor?: string };
type SceneLayer = { id: string; type: "image" | "video" | "text" | "code" | "diagram"; name: string; x: number; y: number; width: number; height: number; zIndex: number; opacity: number; visible: boolean; content?: string; assetId?: string };
type SceneMotion = "static" | "fade";
type Scene = { id: string; title: string; kind: string; duration: number; narration?: string; assetId?: string; voiceAssetId?: string; diagram?: SceneDiagram; layers?: SceneLayer[]; motion?: SceneMotion };
type Project = { id: string; title: string; document: { schemaVersion: number; scenes: Scene[]; [key: string]: unknown } };
type Asset = { id: string; name: string; mime_type: string; size_bytes: number; created_at: string };
type Voice = { id: string; name: string; language: string; quality: string; installed: boolean };
type CapabilityReport = { ffmpeg_available: boolean; ffprobe_available: boolean; libx264_encoder: boolean; subtitles_filter: boolean };
type RenderJob = { id: string; project_id?: string; status: string; error?: string | null; width?: number | null; height?: number | null; created_at?: string; duration_seconds?: number | null; progress?: number | null };
type PublishingPack = { title_options: string[]; description: string; chapters: string[]; tags: string[]; thumbnail_brief: string; disclaimer: string };
type Workspace = "editor" | "projects" | "templates" | "captions";
const API = "http://127.0.0.1:8000/api/v1";
const starterScenes: Scene[] = [
  { id: "scene-01", title: "Hook — The hidden cost of coupling", kind: "عنوان و شروع", duration: 12, narration: "Coupling hides the real cost until the next change." },
  { id: "scene-02", title: "Why architecture matters", kind: "مفهوم", duration: 28, narration: "Architecture decides which changes stay cheap." },
  { id: "scene-03", title: "A modular monolith", kind: "دیاگرام معماری", duration: 35, narration: "A modular monolith keeps one deployment and firm module boundaries." },
  { id: "scene-04", title: "Module boundaries in code", kind: "نمایش کد", duration: 42, narration: "The code should make an illegal dependency hard to write." },
  { id: "scene-05", title: "Trade-offs and recap", kind: "جمع‌بندی", duration: 25, narration: "Choose the boundary you can defend six months from now." },
];
const makeDefaultDiagram = (scene?: Scene): SceneDiagram => {
  const labels = suggestedDiagramLabels(scene);
  return {
    nodes: labels.map((label, index) => ({ id: `node-${index + 1}`, label, x: Math.round(12 + index * (76 / Math.max(1, labels.length - 1))), y: 48 })),
    edges: labels.slice(1).map((_, index) => ({ label: ["REQUEST", "ROUTE", "PERSIST"][index % 3] })),
    accentColor: "#7187ff",
  };
};
const sceneTemplates: { id: string; mark: string; faTitle: string; enTitle: string; faKind: string; enKind: string; duration: number; faNarration: string; enNarration: string; motion?: SceneMotion }[] = [
  { id: "title", mark: "01", faTitle: "عنوان و شروع", enTitle: "Title and hook", faKind: "عنوان و شروع", enKind: "Title", duration: 10, faNarration: "در چند ثانیه بگو این درس کدام مسئله را حل می‌کند.", enNarration: "State the problem this lesson solves in one breath." },
  { id: "concept", mark: "02", faTitle: "توضیح مفهوم", enTitle: "Concept", faKind: "مفهوم", enKind: "Concept", duration: 24, faNarration: "مفهوم را با یک مثال کوتاه و قابل تصور توضیح بده.", enNarration: "Explain the idea with one concrete example." },
  { id: "compare", mark: "03", faTitle: "مقایسه دو راه", enTitle: "Comparison", faKind: "مقایسه", enKind: "Comparison", duration: 28, faNarration: "دو گزینه را کنار هم بگذار و بگو هر کدام چه هزینه‌ای دارد.", enNarration: "Put two options side by side and name the cost of each." },
  { id: "code", mark: "04", faTitle: "نمایش کد", enTitle: "Code walkthrough", faKind: "نمایش کد", enKind: "Code", duration: 32, faNarration: "فقط همان خطوطی را نشان بده که تصمیم را عوض می‌کنند.", enNarration: "Show only the lines that change the decision." },
  { id: "architecture", mark: "05", faTitle: "دیاگرام معماری", enTitle: "Architecture diagram", faKind: "دیاگرام معماری", enKind: "Architecture", duration: 30, faNarration: "مرز بین بخش‌ها را ثابت و قابل دفاع نشان بده.", enNarration: "Show the boundary between parts and why it stays put." },
  { id: "recap", mark: "06", faTitle: "جمع‌بندی", enTitle: "Recap", faKind: "جمع‌بندی", enKind: "Recap", duration: 16, faNarration: "یک جمله بگو که بیننده بتواند فردا به کار ببرد.", enNarration: "Leave the viewer with one decision they can use tomorrow.", motion: "fade" },
];
const sceneKinds = {
  fa: ["عنوان و شروع", "مفهوم", "مقایسه", "نمایش کد", "دیاگرام معماری", "جمع‌بندی"],
  en: ["Title", "Concept", "Comparison", "Code", "Architecture", "Recap"],
};
function outputProfile(document: Project["document"] | undefined): "youtube-1080p" | "shorts-1080p" {
  const profile = document?.profile as { aspectRatio?: string } | undefined;
  return profile?.aspectRatio === "9:16" ? "shorts-1080p" : "youtube-1080p";
}
function profileDocument(profile: "youtube-1080p" | "shorts-1080p") {
  return profile === "shorts-1080p"
    ? { aspectRatio: "9:16", width: 1080, height: 1920, fps: 30 }
    : { aspectRatio: "16:9", width: 1920, height: 1080, fps: 30 };
}
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
  const [nav, setNav] = useState<Workspace>("editor");
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [renderProfile, setRenderProfile] = useState<"youtube-1080p" | "shorts-1080p">("youtube-1080p");
  const profileRef = useRef(renderProfile);
  profileRef.current = renderProfile;
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderState, setRenderState] = useState("idle");
  const [renderMessage, setRenderMessage] = useState("");
  const [renderDownloadUrl, setRenderDownloadUrl] = useState("");
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dragSceneId = useRef("");
  const [scriptText, setScriptText] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [publishingPack, setPublishingPack] = useState<PublishingPack | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [safeArea, setSafeArea] = useState(true);
  const historyRef = useRef<Scene[][]>([]);
  const futureRef = useRef<Scene[][]>([]);
  const historySnapshot = useRef<Scene[] | null>(null);
  const historyTimer = useRef(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
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
  useEffect(() => {
    document.documentElement.lang = fa ? "fa" : "en";
    document.documentElement.dir = fa ? "rtl" : "ltr";
  }, [fa]);
  const selected = useMemo(() => scenes.find((scene) => scene.id === active) ?? scenes[0], [scenes, active]);
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const pixelsPerSecond = 14;
  const sceneStarts = useMemo(() => {
    const starts = new Map<string, number>();
    let cursor = 0;
    for (const scene of scenes) {
      starts.set(scene.id, cursor);
      cursor += scene.duration;
    }
    return starts;
  }, [scenes]);
  const captionCues = useMemo(() => scenes.flatMap((scene) => wordCuesForScene(scene, sceneStarts.get(scene.id) ?? 0)), [scenes, sceneStarts]);
  const activeWordIndex = captionCues.findIndex((cue) => playhead >= cue.start && playhead < cue.end);
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
        setRenderProfile(outputProfile(current.document));
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
          body: JSON.stringify({ document: { ...document, profile: profileDocument(profileRef.current), scenes: snapshot } }),
        });
        if (!response.ok) throw new Error("Autosave failed");
        setProject((current) => current && current.id === projectId ? { ...current, document: { ...current.document, profile: profileDocument(profileRef.current), scenes: snapshot } } : current);
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

  const syncHistoryCounts = () => {
    setUndoCount(historyRef.current.length);
    setRedoCount(futureRef.current.length);
  };
  const rememberEdits = () => {
    if (!historySnapshot.current) {
      historySnapshot.current = scenesRef.current;
      setUndoCount(historyRef.current.length + 1);
      setRedoCount(0);
    }
    window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => {
      if (!historySnapshot.current) return;
      historyRef.current = [...historyRef.current.slice(-59), historySnapshot.current];
      historySnapshot.current = null;
      futureRef.current = [];
      syncHistoryCounts();
    }, 350);
  };
  const undo = () => {
    window.clearTimeout(historyTimer.current);
    const previous = historySnapshot.current ?? historyRef.current.pop();
    historySnapshot.current = null;
    if (!previous) return;
    futureRef.current.push(scenesRef.current);
    setScenes(previous);
    setUndoCount(historyRef.current.length);
    setRedoCount(futureRef.current.length);
  };
  const redo = () => {
    window.clearTimeout(historyTimer.current);
    if (historySnapshot.current) {
      historyRef.current.push(historySnapshot.current);
      historySnapshot.current = null;
    }
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(scenesRef.current);
    setScenes(next);
    setUndoCount(historyRef.current.length);
    setRedoCount(futureRef.current.length);
  };
  undoRef.current = undo;
  redoRef.current = redo;
  const addScene = () => {
    rememberEdits();
    const next: Scene = { id: `scene-${crypto.randomUUID()}`, title: fa ? "صحنه جدید" : "New scene", kind: fa ? "مفهوم" : "Concept", duration: 20 };
    setScenes((items) => [...items, next]);
    setActive(next.id);
  };
  const removeScene = (id: string) => {
    rememberEdits();
    const next = scenes.filter((scene) => scene.id !== id);
    if (!next.length || next.length === scenes.length) return;
    setScenes(next);
    if (id === active) setActive(next[0].id);
  };
  const duplicateScene = (scene: Scene) => {
    rememberEdits();
    const copy: Scene = {
      ...scene,
      id: `scene-${crypto.randomUUID()}`,
      title: `${scene.title} (${fa ? "کپی" : "copy"})`.slice(0, 160),
      layers: scene.layers?.map((layer) => ({ ...layer, id: `layer-${crypto.randomUUID()}` })),
    };
    setScenes((items) => {
      const index = items.findIndex((item) => item.id === scene.id);
      const next = [...items];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActive(copy.id);
  };
  const openProject = async (next: Project, skipSave = false) => {
    if (!skipSave && project && project.id !== next.id) {
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
    setRenderProfile(outputProfile(next.document));
    setStatus("saved");
    setHydrated(true);
    setNav("editor");
    setError("");
    setPublishingPack(null);
    historyRef.current = [];
    futureRef.current = [];
    historySnapshot.current = null;
    syncHistoryCounts();
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
  const updateSelected = (patch: Partial<Scene>) => {
    rememberEdits();
    setScenes((items) => items.map((scene) => scene.id === active ? { ...scene, ...patch } : scene));
  };
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
      const clamp = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(high, value)) * 10) / 10;
      updated.x = clamp(updated.x, 0, 99);
      updated.y = clamp(updated.y, 0, 99);
      updated.width = clamp(updated.width, 1, 100 - updated.x);
      updated.height = clamp(updated.height, 1, 100 - updated.y);
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
    rememberEdits();
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
      setPublishingPack(await response.json() as PublishingPack);
      setNav("editor");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publishing pack failed"); }
  };

  const startRender = async () => {
    if (!project || renderState === "queued" || renderState === "running") return;
    setRenderState("queued"); setRenderMessage("");
    try {
      const response = await fetch(`${API}/projects/${project.id}/renders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: renderProfile, fps: 30 }) });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Render request failed");
      const result = await response.json(); setRenderJobId(result.job_id);
      const listed = await fetch(`${API}/projects/${project.id}/renders`);
      if (listed.ok) setRenderJobs(await listed.json());
    } catch (reason) { setRenderState("failed"); setRenderMessage(reason instanceof Error ? reason.message : "Render failed"); }
  };

  useEffect(() => {
    if (!renderJobId) return;
    const poll = async () => {
      try {
        const response = await fetch(`${API}/jobs/${renderJobId}`);
        if (!response.ok) throw new Error("Could not read render job status");
        const job = await response.json(); setRenderState(job.status);
        setRenderJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: job.status, progress: job.progress, error: job.error, width: job.width, height: job.height } : item));
        if (job.status === "completed") { setRenderMessage(`${job.width}×${job.height}`); setRenderDownloadUrl(`${API}/jobs/${renderJobId}/download`); setRenderJobId(null); }
        if (job.status === "failed") { setRenderMessage(job.error ?? "Render failed"); setRenderJobId(null); }
        if (project && (job.status === "completed" || job.status === "failed" || job.status === "running")) {
          const listed = await fetch(`${API}/projects/${project.id}/renders`);
          if (listed.ok) setRenderJobs(await listed.json());
        }
      } catch (reason) { setRenderState("failed"); setRenderMessage(reason instanceof Error ? reason.message : "Render status error"); setRenderJobId(null); }
    };
    const timer = window.setInterval(poll, 1500); void poll();
    return () => window.clearInterval(timer);
  }, [renderJobId, project?.id]);

  useEffect(() => {
    if (!project) return;
    let alive = true;
    fetch(`${API}/projects/${project.id}/renders`)
      .then(async (response) => { if (!response.ok) throw new Error("queue"); return response.json() as Promise<RenderJob[]>; })
      .then((jobs) => {
        if (!alive) return;
        setRenderJobs(jobs);
        const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running");
        if (activeJob) setRenderJobId(activeJob.id);
      })
      .catch(() => { if (alive) setRenderJobs([]); });
    return () => { alive = false; };
  }, [project?.id]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      setPlayhead((current) => {
        const next = current + delta;
        if (next >= totalSeconds) {
          setPlaying(false);
          return totalSeconds;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, totalSeconds]);

  useEffect(() => {
    if (!playing) return;
    const match = scenes.findIndex((scene, index) => {
      const start = sceneStarts.get(scene.id) ?? 0;
      return playhead < start + scene.duration || index === scenes.length - 1;
    });
    const next = scenes[match];
    if (next && next.id !== active) setActive(next.id);
  }, [playhead, playing, scenes, sceneStarts, active]);

  const selectScene = (id: string) => {
    setActive(id);
    setPlayhead(sceneStarts.get(id) ?? 0);
  };
  const moveScene = (fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return;
    rememberEdits();
    setScenes((items) => {
      const next = [...items];
      const from = next.findIndex((scene) => scene.id === fromId);
      const to = next.findIndex((scene) => scene.id === toId);
      if (from < 0 || to < 0) return items;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const beginResize = (event: ReactPointerEvent<HTMLElement>, scene: Scene) => {
    event.preventDefault();
    event.stopPropagation();
    rememberEdits();
    const originX = event.clientX;
    const origin = scene.duration;
    const move = (ev: PointerEvent) => {
      const next = Math.max(1, Math.min(3600, Math.round(origin + (ev.clientX - originX) / pixelsPerSecond)));
      setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, duration: next } : item));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const seekTimeline = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, event.clientX - bounds.left + event.currentTarget.scrollLeft);
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(totalSeconds, x / pixelsPerSecond)));
  };

  const statusLabel = status === "saved" ? (fa ? "ذخیره شد" : "Saved") : status === "saving" ? (fa ? "در حال ذخیره" : "Saving") : status === "loading" ? (fa ? "در حال بارگذاری" : "Loading") : (fa ? "اتصال/ذخیره ناموفق" : "Offline / save error");
  const createProject = async () => {
    const title = fa ? "پروژه تازه" : "New project";
    const first: Scene = { id: `scene-${crypto.randomUUID()}`, title: fa ? "صحنه اول" : "Opening scene", kind: fa ? "عنوان و شروع" : "Title", duration: 12, narration: fa ? "مسئله را در یک جمله بگو." : "Name the problem in one sentence.", motion: "static" };
    const response = await fetch(`${API}/projects`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        document: { schemaVersion: 1, profile: { aspectRatio: renderProfile === "shorts-1080p" ? "9:16" : "16:9", width: renderProfile === "shorts-1080p" ? 1080 : 1920, height: renderProfile === "shorts-1080p" ? 1920 : 1080, fps: 30 }, language: locale, scenes: [first], audioTracks: [], captionTracks: [] },
      }),
    });
    if (!response.ok) {
      setError(fa ? "ساخت پروژه تازه ناموفق بود." : "Could not create a project.");
      return;
    }
    const created = await response.json() as Project;
    setProjects((list) => [created, ...list.filter((item) => item.id !== created.id)]);
    await openProject(created, true);
  };
  const deleteProject = async (id: string) => {
    const target = projects.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(fa ? `«${target.title}» حذف شود؟` : `Delete “${target.title}”?`)) return;
    const response = await fetch(`${API}/projects/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(fa ? "حذف پروژه ناموفق بود." : "Could not delete the project.");
      return;
    }
    const remaining = projects.filter((item) => item.id !== id);
    setProjects(remaining);
    if (project?.id === id) {
      if (remaining[0]) await openProject(remaining[0], true);
      else await createProject();
    }
  };
  const duplicateProject = async (id: string) => {
    if (project?.id === id) {
      const saved = await fetch(`${API}/projects/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: { ...project.document, scenes } }),
      });
      if (!saved.ok) {
        setError(fa ? "قبل از کپی، ذخیرهٔ پروژه ناموفق بود." : "Could not save the project before copying it.");
        return;
      }
    }
    const response = await fetch(`${API}/projects/${id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      setError(fa ? "کپی پروژه ناموفق بود." : "Could not duplicate the project.");
      return;
    }
    const created = await response.json() as Project;
    setProjects((list) => [created, ...list.filter((item) => item.id !== created.id)]);
    await openProject(created, true);
  };
  const exportProject = (item: Project) => {
    const payload = item.id === project?.id ? { title: item.title, document: { ...project?.document, scenes } } : { title: item.title, document: item.document };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${item.title.replace(/[^\w\u0600-\u06FF-]+/g, "-") || "project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { title?: string; document?: Project["document"] };
      const title = String(parsed.title || file.name.replace(/\.json$/i, "") || (fa ? "پروژه واردشده" : "Imported project")).slice(0, 160);
      const document = parsed.document && typeof parsed.document === "object" ? parsed.document : { schemaVersion: 1, scenes: [] };
      const response = await fetch(`${API}/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, document }),
      });
      if (!response.ok) throw new Error(fa ? "ورود پروژه ناموفق بود." : "Could not import the project.");
      const created = await response.json() as Project;
      setProjects((list) => [created, ...list.filter((item) => item.id !== created.id)]);
      await openProject(created, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (fa ? "فایل پروژه قابل خواندن نیست." : "That project file could not be read."));
    }
  };
  const insertTemplate = (template: (typeof sceneTemplates)[number]) => {
    rememberEdits();
    const next: Scene = {
      id: `scene-${crypto.randomUUID()}`,
      title: fa ? template.faTitle : template.enTitle,
      kind: fa ? template.faKind : template.enKind,
      duration: template.duration,
      narration: fa ? template.faNarration : template.enNarration,
      motion: template.motion ?? "static",
    };
    setScenes((items) => [...items, next]);
    setActive(next.id);
    setNav("editor");
  };
  const downloadText = (filename: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadSrt = () => {
    const text = projectSrt(scenes);
    if (!text) return;
    downloadText(`${(project?.title || "captions").replace(/[^\w\u0600-\u06FF-]+/g, "-")}.srt`, text, "application/x-subrip");
  };
  const downloadPublishingPack = () => {
    if (!publishingPack) return;
    const text = [
      `# ${publishingPack.title_options[0] ?? project?.title ?? "FrameLab"}`,
      "",
      publishingPack.disclaimer,
      "",
      fa ? "## عنوان‌ها" : "## Titles",
      ...publishingPack.title_options.map((title) => `- ${title}`),
      "",
      fa ? "## توضیحات" : "## Description",
      publishingPack.description,
      "",
      fa ? "## فصل‌ها" : "## Chapters",
      ...publishingPack.chapters.map((chapter) => `- ${chapter}`),
      "",
      fa ? "## برچسب‌ها" : "## Tags",
      publishingPack.tags.join(", "),
      "",
      fa ? "## بندانگشتی" : "## Thumbnail",
      publishingPack.thumbnail_brief,
      "",
    ].join("\n");
    downloadText(`${(project?.title || "publishing-pack").replace(/[^\w\u0600-\u06FF-]+/g, "-")}.md`, text, "text/markdown");
  };
  const assignVoice = (assetId: string) => {
    if (!assetId) {
      updateSelected({ voiceAssetId: undefined });
      return;
    }
    const audio = new Audio(assetUrl(assetId));
    const apply = (duration?: number) => updateSelected({
      voiceAssetId: assetId,
      ...(duration && Number.isFinite(duration) ? { duration: Math.max(1, Math.min(3600, Math.ceil(duration))) } : {}),
    });
    audio.addEventListener("loadedmetadata", () => apply(audio.duration), { once: true });
    audio.addEventListener("error", () => apply(), { once: true });
  };
  const dragDiagramNode = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    rememberEdits();
    const move = (ev: PointerEvent) => {
      const x = Math.round(Math.max(5, Math.min(95, ((ev.clientX - box.left) / box.width) * 100)) * 10) / 10;
      const y = Math.round(Math.max(12, Math.min(82, ((ev.clientY - box.top) / box.height) * 100)) * 10) / 10;
      updateDiagramNode(index, { x, y });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const cancelRender = async (jobId: string) => {
    const response = await fetch(`${API}/jobs/${jobId}/cancel`, { method: "POST" });
    if (!response.ok) return;
    if (renderJobId === jobId) { setRenderState("cancelled"); setRenderJobId(null); }
    if (project) {
      const listed = await fetch(`${API}/projects/${project.id}/renders`);
      if (listed.ok) setRenderJobs(await listed.json());
    }
  };
  const retryRender = async (jobId: string) => {
    const response = await fetch(`${API}/jobs/${jobId}/retry`, { method: "POST" });
    if (!response.ok) return;
    const result = await response.json();
    setRenderJobId(result.job_id);
    setRenderState("queued");
  };
  const dragLayer = (event: ReactPointerEvent<HTMLElement>, layer: SceneLayer, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    rememberEdits();
    setSelectedLayerId(layer.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / bounds.width) * 100;
      const dy = ((ev.clientY - startY) / bounds.height) * 100;
      if (mode === "move") updateLayer(layer.id, { x: origin.x + dx, y: origin.y + dy });
      else updateLayer(layer.id, { width: origin.width + dx, height: origin.height + dy });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (!(event.ctrlKey || event.metaKey) || typing) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setOutputProfile = async (next: "youtube-1080p" | "shorts-1080p") => {
    setRenderProfile(next);
    if (!project) return;
    const document = { ...project.document, profile: profileDocument(next), scenes };
    setProject((current) => current ? { ...current, document } : current);
    const response = await fetch(`${API}/projects/${project.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    });
    if (!response.ok) setError(fa ? "نسبت تصویر ذخیره نشد." : "Could not save the aspect ratio.");
  };
  const jobStatus = (value: string) => {
    if (!fa) return value;
    const labels: Record<string, string> = { queued: "در صف", running: "در حال ساخت", completed: "آماده", failed: "ناموفق", cancelled: "لغو شده" };
    return labels[value] ?? value;
  };
  const kindChoices = sceneKinds[locale];
  const audioAssets = assets.filter((asset) => asset.mime_type.startsWith("audio/"));
  const voicePicker = <>
    <select className="field edit-field" aria-label={fa ? "صدای صحنه" : "Scene audio"} value={selected?.voiceAssetId ?? ""} onChange={(event) => assignVoice(event.target.value)}>
      <option value="">{fa ? "بدون صدا" : "No audio"}</option>
      {audioAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
    </select>
    {selectedVoiceAsset ? <><audio className="voice-audio" controls src={assetUrl(selectedVoiceAsset.id)} /><small className="media-limit">{selectedVoiceAsset.name}</small></> : <p className="muted">{fa ? "فایل صوتی را از کتابخانه انتخاب کن، یا با Piper برای همهٔ صحنه‌ها بساز." : "Choose an uploaded audio file, or generate narration with Piper."}</p>}
  </>;

  return <div className={fa ? "app rtl" : "app ltr"} dir={fa ? "rtl" : "ltr"}>
    <header className="topbar">
      <div className="brand"><span className="logo">▣</span><div><b>FrameLab</b><small>VIDEO PRODUCTION STUDIO</small></div></div>
      <div className="project"><i/> <input className="project-title" dir="auto" aria-label={fa ? "نام پروژه" : "Project title"} value={project?.title ?? ""} placeholder={fa ? "در حال بارگذاری پروژه..." : "Loading project..."} disabled={!project} onChange={(event) => setProject((current) => current ? { ...current, title: event.target.value } : current)} onBlur={(event) => { void renameProject(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> <small className="save-status">{statusLabel}</small></div>
      <div className="actions"><button type="button" onClick={undo} disabled={!undoCount}>{fa ? "بازگشت" : "Undo"}</button><button type="button" onClick={redo} disabled={!redoCount}>{fa ? "ازنو" : "Redo"}</button><button onClick={() => setLocale(fa ? "en" : "fa")}>{fa ? "EN" : "فا"}</button><button onClick={generatePublishingPack}>{fa ? "بسته انتشار" : "Publish"}</button><button type="button" onClick={() => void setOutputProfile(renderProfile === "youtube-1080p" ? "shorts-1080p" : "youtube-1080p")}>{renderProfile === "youtube-1080p" ? "16:9" : "9:16"}</button><button className="primary" onClick={startRender} disabled={!project || renderState === "queued" || renderState === "running"}>{renderState === "queued" || renderState === "running" ? (fa ? "در حال رندر..." : "Rendering...") : (fa ? "رندر MP4" : "Render MP4")}</button></div>
    </header>
    <aside className="sidebar">
      <label>{fa ? "فضای تولید" : "WORKSPACE"}</label>
      <button type="button" className={nav === "editor" ? "nav-button active" : "nav-button"} onClick={() => setNav("editor")}>▣　{fa ? "ویرایشگر ویدیو" : "Video editor"}</button>
      <button type="button" className={nav === "projects" ? "nav-button active" : "nav-button"} onClick={() => setNav("projects")}>▤　{fa ? "پروژه‌ها" : "Projects"}</button>
      <button type="button" className={nav === "templates" ? "nav-button active" : "nav-button"} onClick={() => setNav("templates")}>▧　{fa ? "قالب صحنه" : "Scene templates"}</button>
      <button type="button" className="nav-button" onClick={() => focusPanel("media-library")}>▣　{fa ? "کتابخانه رسانه" : "Media library"}</button>
      <hr/><label>{fa ? "مراحل تولید" : "PRODUCTION"}</label>
      <button type="button" className="nav-button" onClick={() => focusPanel("script-input")}>✎　{fa ? "سناریو و استوری‌بورد" : "Script & storyboard"}</button>
      <button type="button" className="nav-button" onClick={() => focusPanel("voice-panel")}>♫　{fa ? "گویندگی و صدا" : "Voice & audio"}</button>
      <button type="button" className={nav === "captions" ? "nav-button active" : "nav-button"} onClick={() => setNav("captions")}>▤　{fa ? "زیرنویس" : "Subtitles"}</button>
      <button type="button" className="nav-button" onClick={() => void generatePublishingPack()}>✧　{fa ? "بسته انتشار" : "Publishing pack"}</button>
      <div className="local">● {fa ? "پردازش محلی · بدون فضای ابری" : "Local processing · No cloud"}</div>
    </aside>
    <main className={nav === "editor" ? "main" : "main workspace"}>
      {nav === "projects" && <section className="workspace-page">
        <div className="workspace-head"><div><small>PROJECTS</small><h2>{fa ? "پروژه‌های محلی" : "Local projects"}</h2></div><div className="card-actions"><label className="upload-control">{fa ? "ورود JSON" : "Import JSON"}<input type="file" accept="application/json,.json" onChange={(event) => { void importProject(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="primary" type="button" onClick={() => void createProject()}>{fa ? "پروژه تازه" : "New project"}</button></div></div>
        <p className="lede">{fa ? "هر پروژه، رسانه‌اش و رندرهایش روی همین رایانه می‌ماند. کپی، فایل‌ها را هم برمی‌دارد. خروجی JSON فقط سند صحنه است." : "Each project, its media, and its renders stay on this computer. Duplicate keeps the files. JSON export is the scene document only."}</p>
        <div className="card-grid">{projects.map((item) => {
          const cardScenes = item.id === project?.id ? scenes : (Array.isArray(item.document?.scenes) ? item.document.scenes : []);
          const seconds = cardScenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
          const ratio = outputProfile(item.id === project?.id ? project?.document : item.document) === "shorts-1080p" ? "9:16" : "16:9";
          return <article className={item.id === project?.id ? "studio-card current" : "studio-card"} key={item.id}><b>{item.title}</b><small className="meta">{cardScenes.length} {fa ? "صحنه" : "scenes"} · {formatTime(seconds)} · {ratio}</small><div className="card-actions"><button type="button" onClick={() => void openProject(item)}>{fa ? "باز کردن" : "Open"}</button><button type="button" onClick={() => void duplicateProject(item.id)}>{fa ? "کپی" : "Duplicate"}</button><button type="button" onClick={() => exportProject(item)}>{fa ? "خروجی" : "Export"}</button><button type="button" className="danger" onClick={() => void deleteProject(item.id)}>{fa ? "حذف" : "Delete"}</button></div></article>;
        })}</div>
      </section>}
      {nav === "templates" && <section className="workspace-page">
        <div className="workspace-head"><div><small>TEMPLATES</small><h2>{fa ? "قالب صحنه" : "Scene templates"}</h2></div></div>
        <p className="lede">{fa ? "یک قالب را به انتهای استوری‌بورد اضافه کن. تصویر پیش‌فرض ثابت است و فقط جمع‌بندی محو شدن دارد." : "Add a template to the end of the storyboard. Pictures stay still unless the recap fade is chosen."}</p>
        <div className="card-grid">{sceneTemplates.map((template) => <button type="button" className="studio-card template-card" key={template.id} onClick={() => insertTemplate(template)}><span>{template.mark}</span><b>{fa ? template.faTitle : template.enTitle}</b><small>{fa ? template.faKind : template.enKind} · {formatTime(template.duration)}</small><p>{fa ? template.faNarration : template.enNarration}</p></button>)}</div>
      </section>}
      {nav === "captions" && <section className="workspace-page">
        <div className="workspace-head"><div><small>CAPTIONS</small><h2>{fa ? "زیرنویس قابل ویرایش" : "Editable captions"}</h2></div><button className="primary" type="button" onClick={downloadSrt} disabled={!projectSrt(scenes)}>{fa ? "دانلود SRT" : "Download SRT"}</button></div>
        <p className="lede">{fa ? "هر خط حداکثر دوازده کلمه است و زمانش از مدت صحنه می‌آید. با ویرایش متن، تایم‌لاین و خروجی رندر عوض می‌شود." : "Each line holds at most twelve words and takes its time from the scene duration. Editing the text updates the timeline and the rendered captions."}</p>
        <div className="caption-list">{scenes.map((scene) => <article className="studio-card" key={scene.id}><header><b dir={readingDirection(scene.title)}>{scene.title}</b><small>{formatTime(scene.duration)}</small></header><textarea className="field edit-field narration-field" dir="auto" value={scene.narration ?? ""} onChange={(event) => { const value = event.target.value; rememberEdits(); setActive(scene.id); setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, narration: value } : item)); }} />{scene.narration?.trim() ? <div className="caption-preview" dir={readingDirection(scene.narration ?? "")}>{scene.narration.trim().split(/\s+/).slice(0, 18).map((word, index) => <em key={`${scene.id}-${index}`}>{word}</em>)}</div> : <p className="muted">{fa ? "برای این صحنه متنی نیست." : "This scene has no narration yet."}</p>}</article>)}</div>
      </section>}
      {nav === "editor" && <section className="scenes">
        <div className="heading"><div><small>STORYBOARD</small><h2>{fa ? "صحنه‌های ویدیو" : "Video scenes"} <em>{String(scenes.length).padStart(2,"0")}</em></h2></div><button onClick={addScene}>＋</button></div>
        <textarea id="script-input" className="script-input" dir="auto" value={scriptText} onChange={event=>setScriptText(event.target.value)} placeholder={fa ? "سناریوی درس را اینجا وارد کن؛ هر پاراگراف یک صحنه می‌شود..." : "Paste your lesson script. Each paragraph becomes a scene..."} />
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
        {scenes.map((scene,i)=><div key={scene.id} role="button" tabIndex={0} onClick={()=>selectScene(scene.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectScene(scene.id); } }} className={active===scene.id?"scene selected":"scene"}><span className="thumb">{String(i+1).padStart(2,"0")}<b>{["✧","▤","⌘","{ }","✓"][i%5]}</b></span><span className="scene-text"><strong dir={readingDirection(scene.title)}>{scene.title}</strong><small>{scene.kind}</small><small>{formatTime(scene.duration)}</small></span><button type="button" className="scene-copy" aria-label={fa ? "کپی صحنه" : "Duplicate scene"} title={fa ? "کپی صحنه" : "Duplicate scene"} onClick={(event) => { event.stopPropagation(); duplicateScene(scene); }}>⧉</button><button type="button" className="scene-delete" disabled={scenes.length<=1} title={fa ? "حذف صحنه" : "Delete scene"} onClick={(event) => { event.stopPropagation(); removeScene(scene.id); }}>×</button></div>)}
        <button className="add" onClick={addScene}>＋　{fa ? "افزودن صحنه" : "Add scene"}</button>
        <div className="hint">✧ {fa ? "تغییرات استوری‌بورد به‌صورت خودکار در پایگاه داده محلی ذخیره می‌شود." : "Storyboard changes are autosaved to your local database."}</div>
      </section>}
      {nav === "editor" && <section className="editor">
        <div className="editor-head"><div><small>SCENE PREVIEW</small><b>{selected?.title}</b><small className="lesson-meta">{scenes.length} {fa ? "صحنه" : "scenes"} · {formatTime(totalSeconds)} · {renderProfile === "shorts-1080p" ? "9:16" : "16:9"}</small></div><span><button type="button" className={safeArea ? "chip on" : "chip"} onClick={() => setSafeArea((value) => !value)}>{fa ? "حاشیه امن" : "Safe area"}</button>{renderProfile === "shorts-1080p" ? "9:16" : "16:9"}</span></div>
        <div className="stage"><div ref={canvasRef} className={selected?.motion === "fade" && playing ? "canvas-stage is-fade" : "canvas-stage"} style={renderProfile === "shorts-1080p" ? { aspectRatio: "9 / 16", width: "auto", height: "min(620px, 70vh)" } : { aspectRatio: "16 / 9" }}>
          {selectedAsset && (selectedAsset.mime_type.startsWith("image/") || selectedAsset.mime_type.startsWith("video/")) ? <div className="canvas-base-media">{selectedAsset.mime_type.startsWith("image/") ? <img src={assetUrl(selectedAsset.id)} alt={selectedAsset.name}/> : <video src={assetUrl(selectedAsset.id)} controls preload="metadata"/>}</div> : <div className="slide">
            <div className="slide-meta"><span>{(selected?.kind ?? "CONCEPT").toUpperCase()}</span><span>{String(scenes.findIndex(s=>s.id===active)+1).padStart(2,"0")} — {String(scenes.length).padStart(2,"0")}</span></div>
            <div className="hero"><small>{fa ? "پیش‌نمایش قالب صحنه" : "SCENE TEMPLATE PREVIEW"}</small><h1 dir={readingDirection(selected?.title ?? "")}>{selected?.title ?? (fa ? "صحنه جدید" : "New scene")}</h1><p dir={readingDirection(selected?.narration ?? "")}>{selected?.narration ?? (fa ? "متن گویندگی این صحنه در این قسمت نمایش داده می‌شود." : "Scene narration will appear here.")}</p></div>
            {previewDiagram && <div className="diagram editor-diagram" style={{"--diagram-accent":previewDiagram.accentColor ?? "#7187ff"} as CSSProperties}>{previewDiagram.nodes.map((node,index)=><div key={node.id} role="button" aria-label={node.label} tabIndex={0} className={index===1?"focus":""} style={{left:`${node.x}%`,top:`${node.y}%`}} onPointerDown={(event) => dragDiagramNode(event, index)}>{node.label}<small>{selected?.kind ?? "Concept"}</small></div>)}</div>}
            <div className="slide-meta footer"><span>LOCAL VIDEO STUDIO</span><span>{selected?.motion === "fade" ? "FADE" : "STATIC"}</span></div>
          </div>}
          {activeWordIndex >= 0 && <div className="live-caption" dir={readingDirection(captionCues[activeWordIndex]?.text ?? " ")}>{captionCues.slice(Math.max(0, activeWordIndex - 2), activeWordIndex + 4).map((cue) => <em key={cue.id} className={cue.id === captionCues[activeWordIndex].id ? "on" : ""}>{cue.text}</em>)}</div>}
          {safeArea && <div className="safe-area" />}
          {(selected?.layers ?? []).filter(layer=>layer.visible).sort((a,b)=>a.zIndex-b.zIndex).map(layer => {
            const layerAsset = layer.assetId ? assets.find(asset=>asset.id===layer.assetId) : undefined;
            return <div key={layer.id} className={layer.id === selectedLayerId ? `canvas-layer layer-${layer.type} selected` : `canvas-layer layer-${layer.type}`} style={{left:`${layer.x}%`,top:`${layer.y}%`,width:`${layer.width}%`,height:`${layer.height}%`,opacity:layer.opacity,zIndex:layer.zIndex}} onPointerDown={(event) => dragLayer(event, layer, "move")}>
              {(layer.type==="image" || layer.type==="video") && layerAsset ? (layer.type==="image" ? <img src={assetUrl(layerAsset.id)} alt={layer.name}/> : <video src={assetUrl(layerAsset.id)} muted playsInline/>) : null}
              {layer.type==="text" && <span>{layer.content}</span>}
              {layer.type==="code" && <pre>{layer.content}</pre>}
              {layer.type==="diagram" && <span className="layer-diagram">{layer.content}</span>}
              <i className="layer-resize" onPointerDown={(event) => dragLayer(event, layer, "resize")} />
            </div>;
          })}
        </div></div>
        <div className="playback"><button type="button" onClick={() => { if (playhead >= totalSeconds) setPlayhead(0); setPlaying((value) => !value); }}>{playing ? "❚❚" : "▶"}</button><span>{formatTime(playhead)}</span><div className="bar"><i style={{ width: `${totalSeconds ? Math.min(100, (playhead / totalSeconds) * 100) : 0}%` }}/></div><span>{formatTime(totalSeconds)}</span><small>{fa ? "تایم‌لاین قابل پخش · تصویر ثابت" : "Playable timeline · static picture"}</small></div>
        <div className="timeline-head"><div><small>SCENE SEQUENCE</small><b>{fa ? "تایم‌لاین" : "Timeline"}</b></div><span>{formatTime(totalSeconds)}</span></div>
        <div className="timeline" dir="ltr">
          <div className="timeline-scroll" onClick={seekTimeline}>
            <div className="timeline-canvas" style={{ width: Math.max(640, totalSeconds * pixelsPerSecond) }}>
              <div className="ruler">{Array.from({ length: Math.floor(totalSeconds / 10) + 1 }, (_, index) => <span key={index} style={{ left: index * 10 * pixelsPerSecond }}>{formatTime(index * 10)}</span>)}</div>
              <div className="clips timeline-lane">{scenes.map((scene) => <div key={scene.id} draggable onDragStart={() => { dragSceneId.current = scene.id; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveScene(dragSceneId.current, scene.id); }} onClick={(event) => { event.stopPropagation(); selectScene(scene.id); }} className={active===scene.id?"clip on":"clip"} style={{ left: (sceneStarts.get(scene.id) ?? 0) * pixelsPerSecond, width: Math.max(36, scene.duration * pixelsPerSecond) }}>{scene.title}<i className="clip-resize" onPointerDown={(event) => beginResize(event, scene)} /></div>)}</div>
              <div className="track timeline-lane"><b>♫　Voice</b><div className="lane-body">{scenes.map((scene) => scene.voiceAssetId ? <i key={scene.id} className="voice-block" style={{ left: (sceneStarts.get(scene.id) ?? 0) * pixelsPerSecond, width: Math.max(8, scene.duration * pixelsPerSecond) }} /> : null)}{!scenes.some((scene) => scene.voiceAssetId) && <span className="empty-track">{fa ? "هنوز صدایی به صحنه وصل نشده" : "No scene audio yet"}</span>}</div></div>
              <div className="track timeline-lane"><b>▤　Words</b><div className="lane-body">{captionCues.map((cue) => <span key={cue.id} className={activeWordIndex >= 0 && captionCues[activeWordIndex].id === cue.id ? "caption-word on" : "caption-word"} style={{ left: cue.start * pixelsPerSecond, width: Math.max(10, (cue.end - cue.start) * pixelsPerSecond) }}>{cue.text}</span>)}{captionCues.length === 0 && <span className="empty-track">{fa ? "با متن گویندگی، هر کلمه زمان خودش را می‌گیرد" : "Narration gives each word its own time"}</span>}</div></div>
              <div className="playhead" style={{ left: playhead * pixelsPerSecond }} />
            </div>
          </div>
        </div>
        {error && <div className="error-banner">{error} — {fa ? "سرور محلی را طبق راهنمای README اجرا کن." : "Start the local API using the README instructions."}</div>}{capabilityWarning && <div className="error-banner">{capabilityWarning}</div>}{renderMessage && <div className={renderState === "failed" || renderState === "cancelled" ? "error-banner" : "render-banner"}>{renderMessage}{renderDownloadUrl && <a className="download-link" href={renderDownloadUrl}>{fa ? "دانلود ویدیوی MP4" : "Download MP4"}</a>}</div>}{renderJobs.length > 0 && <div className="render-queue"><b>{fa ? "صف رندر" : "Render queue"}</b>{renderJobs.slice(0, 6).map((job) => <div key={job.id}><span className={`status-pill ${job.status}`}>{jobStatus(job.status)}</span><div className="job-progress"><i style={{ width: `${Math.max(0, Math.min(100, job.progress ?? (job.status === "completed" ? 100 : 0)))}%` }} /></div>{job.width && job.height ? <small>{job.width}×{job.height}</small> : null}{job.status === "completed" && <a href={`${API}/jobs/${job.id}/download`}>{fa ? "دانلود" : "Download"}</a>}{(job.status === "queued" || job.status === "running") && <button type="button" onClick={() => void cancelRender(job.id)}>{fa ? "لغو" : "Cancel"}</button>}{(job.status === "failed" || job.status === "cancelled") && <button type="button" onClick={() => void retryRender(job.id)}>{fa ? "تلاش دوباره" : "Retry"}</button>}{job.error && <small>{job.error}</small>}</div>)}</div>}{publishingPack && <section className="publish-sheet"><header><b>{fa ? "بسته انتشار" : "Publishing pack"}</b><button type="button" onClick={downloadPublishingPack}>{fa ? "دانلود Markdown" : "Download Markdown"}</button><small>{publishingPack.disclaimer}</small></header><div className="title-options">{publishingPack.title_options.map((title) => <button type="button" dir={readingDirection(title)} key={title} onClick={() => void navigator.clipboard.writeText(title)}>{title}</button>)}</div><p dir={readingDirection(publishingPack.description)}>{publishingPack.description}</p><div className="tag-row">{publishingPack.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><ol>{publishingPack.chapters.map((chapter) => <li dir={readingDirection(chapter)} key={chapter}>{chapter}</li>)}</ol><p className="muted" dir={readingDirection(publishingPack.thumbnail_brief)}>{publishingPack.thumbnail_brief}</p></section>}
      </section>}
      {nav === "editor" && <aside className="inspector">
        <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
        <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
        {nav === "editor" && tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><input className="field edit-field" dir="auto" value={selected?.title ?? ""} onChange={event=>updateSelected({title:event.target.value})}/><label>{fa?"نوع صحنه":"Scene type"}</label><select className="field edit-field" aria-label={fa ? "نوع صحنه" : "Scene type"} value={selected?.kind ?? kindChoices[0]} onChange={event=>updateSelected({kind:event.target.value})}>{[...(selected?.kind && !kindChoices.includes(selected.kind) ? [selected.kind] : []), ...kindChoices].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select><label>{fa?"متن گویندگی":"Narration"}</label><textarea className="field edit-field narration-field" dir="auto" value={selected?.narration ?? ""} onChange={event=>updateSelected({narration:event.target.value})} placeholder={fa?"متن گویندگی این صحنه...":"Scene narration..."}/><h3>{fa?"گویندگی این صحنه":"Scene voice-over"}</h3>{voicePicker}<h3>{fa?"رسانه متصل به صحنه":"Scene media"}</h3><select className="field edit-field" value={selected?.assetId ?? ""} onChange={event=>updateSelected({assetId:event.target.value || undefined})}><option value="">{fa?"بدون رسانه":"No media attached"}</option>{assets.filter(asset=>asset.mime_type.startsWith("image/") || asset.mime_type.startsWith("video/")).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{selectedAsset && <p className="muted">{fa?"این رسانه به صحنه انتخاب‌شده متصل و همراه پروژه ذخیره می‌شود.":"This asset reference is saved with the selected scene."}</p>}          <h3>{fa?"دیاگرام قابل ویرایش":"Editable diagram"}</h3>
          {!selected?.diagram && !sceneSuggestsDiagram(selected) ? <button className="diagram-add" type="button" onClick={resetDiagram}>{fa?"＋ افزودن دیاگرام":"＋ Add diagram"}</button> : <>
          <div className="diagram-tools"><label>{fa?"رنگ تأکیدی":"Accent color"}</label><input aria-label="Diagram accent color" type="color" value={selectedDiagram.accentColor ?? "#7187ff"} onChange={event=>updateDiagram({accentColor:event.target.value})}/><button type="button" onClick={resetDiagram}>{fa?"بازنشانی پیشنهاد":"Reset suggestion"}</button></div>
          {selectedDiagram.nodes.map((node,index)=><div className="diagram-node-editor" key={node.id}>
            <b>{fa?`گره ${index+1}`:`Node ${index+1}`}</b><button type="button" onClick={()=>removeDiagramNode(index)} disabled={selectedDiagram.nodes.length<=2}>×</button>
            <input className="field edit-field" dir="auto" aria-label={`Node ${index+1} label`} value={node.label} onChange={event=>updateDiagramNode(index,{label:event.target.value})}/>
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
            {(layer.type==="text" || layer.type==="code" || layer.type==="diagram") && <textarea className="field edit-field layer-content" dir="auto" value={layer.content ?? ""} onChange={event=>updateLayer(layer.id,{content:event.target.value})}/>}
            {(layer.type==="image" || layer.type==="video") && <select className="field edit-field" value={layer.assetId ?? ""} onChange={event=>updateLayer(layer.id,{assetId:event.target.value || undefined})}><option value="">{fa?"انتخاب فایل رسانه":"Choose media asset"}</option>{assets.filter(asset=>layer.type==="image"?asset.mime_type.startsWith("image/"):asset.mime_type.startsWith("video/")).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>}
            <div className="layer-transform-grid">
              <label>X % <input className="field edit-field" type="number" min="0" max="100" value={layer.x} onChange={event=>updateLayer(layer.id,{x:Math.max(0,Math.min(100,Number(event.target.value)||0))})}/></label>
              <label>Y % <input className="field edit-field" type="number" min="0" max="100" value={layer.y} onChange={event=>updateLayer(layer.id,{y:Math.max(0,Math.min(100,Number(event.target.value)||0))})}/></label>
              <label>W % <input className="field edit-field" type="number" min="1" max="100" value={layer.width} onChange={event=>updateLayer(layer.id,{width:Math.max(1,Math.min(100,Number(event.target.value)||1))})}/></label>
              <label>H % <input className="field edit-field" type="number" min="1" max="100" value={layer.height} onChange={event=>updateLayer(layer.id,{height:Math.max(1,Math.min(100,Number(event.target.value)||1))})}/></label>
            </div>
            <label className="layer-opacity">Opacity · {Math.round(layer.opacity*100)}% <input type="range" min="0" max="100" value={Math.round(layer.opacity*100)} onChange={event=>updateLayer(layer.id,{opacity:Number(event.target.value)/100})}/></label>
          </div>)}</> : tab === "motion" ? <><h3>{fa ? "کنترل حرکت" : "Motion controls"}</h3><div className="choice-row"><button type="button" className={(selected?.motion ?? "static") === "static" ? "chosen" : ""} onClick={() => updateSelected({ motion: "static" })}>{fa ? "ثابت" : "Static"}</button><button type="button" className={selected?.motion === "fade" ? "chosen" : ""} onClick={() => updateSelected({ motion: "fade" })}>{fa ? "محو شدن" : "Fade"}</button></div><p className="muted">{fa ? "ثابت هیچ حرکتی به تصویر نمی‌دهد. محو شدن فقط ورود و خروج همین صحنه را، هم در پیش‌نمایش و هم در MP4، اعمال می‌کند." : "Static keeps the picture still. Fade only fades this scene in and out, both in the preview and in the MP4."}</p></> : tab === "audio" ? <><h3>{fa ? "صدای همین صحنه" : "This scene's audio"}</h3><p className="muted">{fa ? "فایل wav، mp3 یا صدای ساخته‌شده با Piper روی همین صحنه می‌نشیند و در MP4 مخلوط می‌شود. اگر طول فایل معلوم باشد، مدت صحنه تا پایان صدا کش می‌آید." : "A wav, mp3, or Piper file is mixed into the MP4 for this scene. When the file length is known, the scene stretches to cover it."}</p>{voicePicker}</> : <><h3>{fa ? "زمان‌بندی صحنه" : "Scene timing"}</h3><label>{fa ? "مدت صحنه (ثانیه)" : "Scene duration (seconds)"}</label><input className="field edit-field" type="number" min="1" max="3600" value={selected?.duration ?? 1} onChange={event => updateSelected({ duration: Math.max(1, Number(event.target.value) || 1) })} /><p className="muted">{fa ? "لبهٔ کلیپ در تایم‌لاین را هم می‌توانی بکشی." : "You can also drag the clip edge on the timeline."}</p></>}
        <div className="note">✧ {fa?"حرکت فقط با انتخاب شما اعمال می‌شود؛ محتوای ثابت بدون زوم و پن می‌ماند.":"Motion is opt-in. Static content never auto-zooms or pans."}</div>
      </aside>}
    </main>
  </div>;
}
