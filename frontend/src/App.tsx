import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { readingDirection } from "./textDirection";
import { formatTime, projectSrt, sceneSuggestsDiagram, wordCuesForScene } from "./timing";
import type {
  DiagramNode, SceneDiagram, SceneLayer, Scene,
  Project, Asset, Voice, CapabilityReport, RenderJob, PublishingPack, Workspace,
} from "./studio/types";
import {
  API, starterScenes, makeDefaultDiagram, sceneTemplates,
} from "./studio/defaults";
import { loadStartupProject, outputProfile, profileDocument } from "./studio/api";
import { useSceneHistory } from "./studio/useSceneHistory";
import { CaptionPage, ProjectLibrary, TemplateLibrary } from "./studio/WorkspacePages";
import { TimelineBoard } from "./studio/TimelineBoard";
import { SceneInspector } from "./studio/SceneInspector";

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
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [safeArea, setSafeArea] = useState(true);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const {
    undoCount, redoCount, rememberEdits, undo, redo, undoRef, redoRef, clearHistory,
  } = useSceneHistory(scenes, setScenes);
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
    clearHistory();
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
      {nav === "projects" && <ProjectLibrary fa={fa} projects={projects} project={project} scenes={scenes} openProject={openProject} duplicateProject={duplicateProject} exportProject={exportProject} deleteProject={deleteProject} importProject={importProject} createProject={createProject} />}
      {nav === "templates" && <TemplateLibrary fa={fa} insertTemplate={insertTemplate} />}
      {nav === "captions" && <CaptionPage fa={fa} scenes={scenes} rememberEdits={rememberEdits} setActive={setActive} setScenes={setScenes} downloadSrt={downloadSrt} />}
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
        <TimelineBoard fa={fa} scenes={scenes} active={active} sceneStarts={sceneStarts} totalSeconds={totalSeconds} pixelsPerSecond={pixelsPerSecond} playhead={playhead} captionCues={captionCues} activeWordIndex={activeWordIndex} seekTimeline={seekTimeline} selectScene={selectScene} moveScene={moveScene} beginResize={beginResize} dragSceneId={dragSceneId} />
        {error && <div className="error-banner">{error} — {fa ? "سرور محلی را طبق راهنمای README اجرا کن." : "Start the local API using the README instructions."}</div>}{capabilityWarning && <div className="error-banner">{capabilityWarning}</div>}{renderMessage && <div className={renderState === "failed" || renderState === "cancelled" ? "error-banner" : "render-banner"}>{renderMessage}{renderDownloadUrl && <a className="download-link" href={renderDownloadUrl}>{fa ? "دانلود ویدیوی MP4" : "Download MP4"}</a>}</div>}{renderJobs.length > 0 && <div className="render-queue"><b>{fa ? "صف رندر" : "Render queue"}</b>{renderJobs.slice(0, 6).map((job) => <div key={job.id}><span className={`status-pill ${job.status}`}>{jobStatus(job.status)}</span><div className="job-progress"><i style={{ width: `${Math.max(0, Math.min(100, job.progress ?? (job.status === "completed" ? 100 : 0)))}%` }} /></div>{job.width && job.height ? <small>{job.width}×{job.height}</small> : null}{job.status === "completed" && <a href={`${API}/jobs/${job.id}/download`}>{fa ? "دانلود" : "Download"}</a>}{(job.status === "queued" || job.status === "running") && <button type="button" onClick={() => void cancelRender(job.id)}>{fa ? "لغو" : "Cancel"}</button>}{(job.status === "failed" || job.status === "cancelled") && <button type="button" onClick={() => void retryRender(job.id)}>{fa ? "تلاش دوباره" : "Retry"}</button>}{job.error && <small>{job.error}</small>}</div>)}</div>}{publishingPack && <section className="publish-sheet"><header><b>{fa ? "بسته انتشار" : "Publishing pack"}</b><button type="button" onClick={downloadPublishingPack}>{fa ? "دانلود Markdown" : "Download Markdown"}</button><small>{publishingPack.disclaimer}</small></header><div className="title-options">{publishingPack.title_options.map((title) => <button type="button" dir={readingDirection(title)} key={title} onClick={() => void navigator.clipboard.writeText(title)}>{title}</button>)}</div><p dir={readingDirection(publishingPack.description)}>{publishingPack.description}</p><div className="tag-row">{publishingPack.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><ol>{publishingPack.chapters.map((chapter) => <li dir={readingDirection(chapter)} key={chapter}>{chapter}</li>)}</ol><p className="muted" dir={readingDirection(publishingPack.thumbnail_brief)}>{publishingPack.thumbnail_brief}</p></section>}
      </section>}
      {nav === "editor" && <SceneInspector fa={fa} tab={tab} setTab={setTab} selected={selected} selectedAsset={selectedAsset} selectedDiagram={selectedDiagram} assets={assets} voicePicker={voicePicker} updateSelected={updateSelected} updateDiagram={updateDiagram} updateDiagramNode={updateDiagramNode} updateDiagramEdge={updateDiagramEdge} resetDiagram={resetDiagram} addLayer={addLayer} updateLayer={updateLayer} moveLayer={moveLayer} deleteLayer={deleteLayer} addDiagramNode={addDiagramNode} removeDiagramNode={removeDiagramNode} />}
    </main>
  </div>;
}
