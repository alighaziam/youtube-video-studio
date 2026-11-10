import { useEffect, useMemo, useState } from "react";

type Scene = { id: string; title: string; kind: string; duration: number; narration?: string; assetId?: string };
type Project = { id: string; title: string; document: { schemaVersion: number; scenes: Scene[]; [key: string]: unknown } };
type Asset = { id: string; name: string; mime_type: string; size_bytes: number; created_at: string };
const API = "http://127.0.0.1:8000/api/v1";
const starterScenes: Scene[] = [
  { id: "scene-01", title: "Hook — The hidden cost of coupling", kind: "عنوان و شروع", duration: 12 },
  { id: "scene-02", title: "Why architecture matters", kind: "مفهوم", duration: 28 },
  { id: "scene-03", title: "A modular monolith", kind: "دیاگرام معماری", duration: 35 },
  { id: "scene-04", title: "Module boundaries in code", kind: "نمایش کد", duration: 42 },
  { id: "scene-05", title: "Trade-offs and recap", kind: "جمع‌بندی", duration: 25 },
];
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function App() {
  const [active, setActive] = useState("scene-03");
  const [locale, setLocale] = useState<"fa" | "en">("fa");
  const [tab, setTab] = useState("design");
  const [scenes, setScenes] = useState<Scene[]>(starterScenes);
  const [project, setProject] = useState<Project | null>(null);
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
  const fa = locale === "fa";
  const selected = useMemo(() => scenes.find((scene) => scene.id === active) ?? scenes[0], [scenes, active]);
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const selectedAsset = assets.find(asset => asset.id === selected?.assetId);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch(`${API}/projects`);
        if (!response.ok) throw new Error("Backend is not reachable. Start the API server first.");
        const projects: Project[] = await response.json();
        let current = projects[0];
        if (!current) {
          const created = await fetch(`${API}/projects`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "Lesson 08 — Modular Monolith in Practice",
              document: { schemaVersion: 1, profile: { aspectRatio: "16:9", width: 1920, height: 1080, fps: 30 }, language: "fa", scenes: starterScenes, audioTracks: [], captionTracks: [] },
            }),
          });
          if (!created.ok) throw new Error("Could not create the starter project.");
          current = await created.json();
        }
        if (!alive) return;
        const restored = Array.isArray(current.document?.scenes) && current.document.scenes.length ? current.document.scenes : starterScenes;
        setProject(current);
        setScenes(restored);
        setActive(restored[0].id);
        setStatus("saved");
        setHydrated(true);
      } catch (reason) {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "Unknown API error");
        setStatus("offline");
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !project) return;
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API}/projects/${project.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: { ...project.document, scenes } }),
        });
        if (!response.ok) throw new Error("Autosave failed");
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 650);
    return () => window.clearTimeout(timer);
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
    } catch (reason) { setAssetError(reason instanceof Error ? reason.message : "Delete failed"); }
  };
  const assetUrl = (assetId: string) => `${API}/projects/${project?.id}/assets/${assetId}/file`;
  const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const addScene = () => {
    const next: Scene = { id: `scene-${crypto.randomUUID()}`, title: fa ? "صحنه جدید" : "New scene", kind: fa ? "مفهوم" : "Concept", duration: 20 };
    setScenes((items) => [...items, next]);
    setActive(next.id);
  };
  const updateSelected = (patch: Partial<Scene>) => setScenes((items) => items.map((scene) => scene.id === active ? { ...scene, ...patch } : scene));
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
      <div className="project"><i/> {project?.title ?? (fa ? "در حال بارگذاری پروژه..." : "Loading project...")} <small className="save-status">{statusLabel}</small></div>
      <div className="actions"><button onClick={() => setLocale(fa ? "en" : "fa")}>{fa ? "EN" : "فا"}</button><button onClick={generatePublishingPack}>{fa ? "بسته انتشار" : "YT pack"}</button><button onClick={() => setRenderProfile(renderProfile === "youtube-1080p" ? "shorts-1080p" : "youtube-1080p")}>{renderProfile === "youtube-1080p" ? "16:9" : "9:16"}</button><button className="primary" onClick={startRender} disabled={!project || renderState === "queued" || renderState === "running"}>{renderState === "queued" || renderState === "running" ? (fa ? "در حال رندر..." : "Rendering...") : (fa ? "رندر MP4" : "Render MP4")}</button></div>
    </header>
    <aside className="sidebar">
      <label>{fa ? "فضای تولید" : "WORKSPACE"}</label>
      <a className="active">▣　{fa ? "ویرایشگر ویدیو" : "Video editor"}</a><a>▤　{fa ? "پروژه‌ها" : "Projects"}</a><a>▧　{fa ? "قالب‌ها و برند" : "Templates & brand"}</a><a>▣　{fa ? "کتابخانه رسانه" : "Media library"}</a>
      <hr/><label>{fa ? "مراحل تولید" : "PRODUCTION"}</label>
      <a>✎　{fa ? "سناریو و استوری‌بورد" : "Script & storyboard"}</a><a>♫　{fa ? "گویندگی و صدا" : "Voice & audio"}</a><a>▤　{fa ? "زیرنویس" : "Subtitles"}</a><a>✧　{fa ? "بسته انتشار" : "Publishing pack"}</a>
      <div className="local">● {fa ? "پردازش محلی · بدون فضای ابری" : "Local processing · No cloud"}</div>
    </aside>
    <main className="main">
      <section className="scenes">
        <div className="heading"><div><small>STORYBOARD</small><h2>{fa ? "صحنه‌های ویدیو" : "Video scenes"} <em>{String(scenes.length).padStart(2,"0")}</em></h2></div><button onClick={addScene}>＋</button></div>
        <textarea className="script-input" value={scriptText} onChange={event=>setScriptText(event.target.value)} placeholder={fa ? "سناریوی درس را اینجا وارد کن؛ هر پاراگراف یک صحنه می‌شود..." : "Paste your lesson script. Each paragraph becomes a scene..."} />
        <button className="add script-button" onClick={generateStoryboard} disabled={scriptBusy || !scriptText.trim()}>{scriptBusy ? (fa ? "در حال ساخت..." : "Generating...") : (fa ? "تبدیل سناریو به استوری‌بورد" : "Generate storyboard from script")}</button>
        <div className="media-library">
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
        {scenes.map((scene,i)=><button key={scene.id} onClick={()=>setActive(scene.id)} className={active===scene.id?"scene selected":"scene"}><span className="thumb">{String(i+1).padStart(2,"0")}<b>{["✧","▤","⌘","{ }","✓"][i%5]}</b></span><span className="scene-text"><strong>{scene.title}</strong><small>{scene.kind}</small><small>{formatTime(scene.duration)}</small></span><span className="dots">···</span></button>)}
        <button className="add" onClick={addScene}>＋　{fa ? "افزودن صحنه" : "Add scene"}</button>
        <div className="hint">✧ {fa ? "تغییرات استوری‌بورد به‌صورت خودکار در پایگاه داده محلی ذخیره می‌شود." : "Storyboard changes are autosaved to your local database."}</div>
      </section>
      <section className="editor">
        <div className="editor-head"><div><small>SCENE PREVIEW</small><b>{selected?.title}</b></div><span>16:9　　100%</span></div>
        <div className="stage">{selectedAsset && (selectedAsset.mime_type.startsWith("image/") || selectedAsset.mime_type.startsWith("video/")) ? <div className="attached-media">{selectedAsset.mime_type.startsWith("image/") ? <img src={assetUrl(selectedAsset.id)} alt={selectedAsset.name}/> : <video src={assetUrl(selectedAsset.id)} controls preload="metadata"/>}<small>{selectedAsset.name}</small></div> : <div className="slide">
          <div className="slide-meta"><span>SOFTWARE ARCHITECTURE / 08</span><span>{String(scenes.findIndex(s=>s.id===active)+1).padStart(2,"0")} — {String(scenes.length).padStart(2,"0")}</span></div>
          <div className="hero"><small>ARCHITECTURE PATTERN</small><h1>Modular<br/><i>Monolith</i></h1><p>One deployable unit.<br/>Clear boundaries. Independent modules.</p></div>
          <div className="diagram"><div>ORDER<small>Domain module</small></div><div className="focus">PAYMENT<small>Domain module</small></div><div>INVENTORY<small>Domain module</small></div></div>
          <div className="slide-meta footer"><span>ARCHITECTURE NOTES</span><span>DESIGN FOR CHANGE</span></div>
        </div>}</div>
        <div className="playback"><button disabled>▶</button><span>{formatTime(selected?.duration ?? 0)}</span><div className="bar"><i/></div><span>{formatTime(totalSeconds)}</span><small>{fa ? "پیش‌نمایش ثابت · بدون حرکت خودکار" : "Static preview · no auto motion"}</small></div>
        <div className="timeline-head"><div><small>SCENE SEQUENCE</small><b>{fa ? "تایم‌لاین" : "Timeline"}</b></div><span>{formatTime(totalSeconds)}</span></div>
        <div className="timeline"><div className="ruler"><span>00:00</span><span>00:30</span><span>01:00</span><span>01:30</span><span>02:00</span></div><div className="clips">{scenes.map((scene)=><button key={scene.id} onClick={()=>setActive(scene.id)} className={active===scene.id?"clip on":"clip"}>{scene.title}</button>)}</div><div className="track"><b>♫　Voice-over</b><span className="empty-track">{fa ? "هنوز فایلی اضافه نشده" : "No audio added yet"}</span></div><div className="track"><b>▤　Captions</b><span className="empty-track">{fa ? "هنوز زیرنویسی اضافه نشده" : "No captions added yet"}</span></div></div>
        {error && <div className="error-banner">{error} — {fa ? "سرور محلی را طبق راهنمای README اجرا کن." : "Start the local API using the README instructions."}</div>}{renderMessage && <div className={renderState === "failed" ? "error-banner" : "render-banner"}>{renderMessage}{renderDownloadUrl && <a className="download-link" href={renderDownloadUrl}>{fa ? "دانلود ویدیوی MP4" : "Download MP4"}</a>}</div>}{publishingPack && <pre className="publishing-pack">{publishingPack}</pre>}
      </section>
      <aside className="inspector">
        <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
        <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
        {tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><input className="field edit-field" value={selected?.title ?? ""} onChange={event=>updateSelected({title:event.target.value})}/><label>{fa?"نوع صحنه":"Scene type"}</label><input className="field edit-field" value={selected?.kind ?? ""} onChange={event=>updateSelected({kind:event.target.value})}/><label>{fa?"متن گویندگی":"Narration"}</label><textarea className="field edit-field narration-field" value={selected?.narration ?? ""} onChange={event=>updateSelected({narration:event.target.value})} placeholder={fa?"متن گویندگی این صحنه...":"Scene narration..."}/><h3>{fa?"رسانه متصل به صحنه":"Scene media"}</h3><select className="field edit-field" value={selected?.assetId ?? ""} onChange={event=>updateSelected({assetId:event.target.value || undefined})}><option value="">{fa?"بدون رسانه":"No media attached"}</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{selectedAsset && <p className="muted">{fa?"این رسانه به صحنه انتخاب‌شده متصل و همراه پروژه ذخیره می‌شود.":"This asset reference is saved with the selected scene."}</p>}<h3>{fa?"قالب بصری":"Visual style"}</h3><div className="swatches"><i/><i/><i/><i/></div><label>{fa?"پس‌زمینه":"Background"}</label><div className="field">#111827</div><h3>{fa?"لایه‌ها":"Layers"}</h3><div className="layer">▤　Headline <em>Visible</em></div><div className="layer">⌘　Architecture diagram <em>Visible</em></div><div className="layer">▤　Captions <em>Visible</em></div></>:<><h3>{tab==="motion"?"Motion controls":tab==="audio"?"Audio settings":"Scene timing"}</h3><p className="muted">{tab==="motion"?"No animation is applied by default. Choose a motion preset explicitly.":tab==="audio"?"Audio import and recording are scheduled for the audio milestone.":"Set the duration of the selected scene."}</p>{tab==="timing" && <><label>{fa?"مدت صحنه (ثانیه)":"Scene duration (seconds)"}</label><input className="field edit-field" type="number" min="1" max="3600" value={selected?.duration ?? 1} onChange={event=>updateSelected({duration:Math.max(1,Number(event.target.value)||1)})}/></>}</>}
        <div className="note">✧ {fa?"حرکت فقط با انتخاب شما اعمال می‌شود؛ محتوای ثابت بدون زوم و پن می‌ماند.":"Motion is opt-in. Static content never auto-zooms or pans."}</div>
      </aside>
    </main>
  </div>;
}
