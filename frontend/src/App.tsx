import { useEffect, useMemo, useState } from "react";

type Scene = { id: string; title: string; kind: string; duration: number; narration?: string };
type Project = { id: string; title: string; document: { schemaVersion: number; scenes: Scene[] } };
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
  const fa = locale === "fa";
  const selected = useMemo(() => scenes.find((scene) => scene.id === active) ?? scenes[0], [scenes, active]);
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration, 0);

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
        {scenes.map((scene,i)=><button key={scene.id} onClick={()=>setActive(scene.id)} className={active===scene.id?"scene selected":"scene"}><span className="thumb">{String(i+1).padStart(2,"0")}<b>{["✧","▤","⌘","{ }","✓"][i%5]}</b></span><span className="scene-text"><strong>{scene.title}</strong><small>{scene.kind}</small><small>{formatTime(scene.duration)}</small></span><span className="dots">···</span></button>)}
        <button className="add" onClick={addScene}>＋　{fa ? "افزودن صحنه" : "Add scene"}</button>
        <div className="hint">✧ {fa ? "تغییرات استوری‌بورد به‌صورت خودکار در پایگاه داده محلی ذخیره می‌شود." : "Storyboard changes are autosaved to your local database."}</div>
      </section>
      <section className="editor">
        <div className="editor-head"><div><small>SCENE PREVIEW</small><b>{selected?.title}</b></div><span>16:9　　100%</span></div>
        <div className="stage"><div className="slide">
          <div className="slide-meta"><span>SOFTWARE ARCHITECTURE / 08</span><span>{String(scenes.findIndex(s=>s.id===active)+1).padStart(2,"0")} — {String(scenes.length).padStart(2,"0")}</span></div>
          <div className="hero"><small>ARCHITECTURE PATTERN</small><h1>Modular<br/><i>Monolith</i></h1><p>One deployable unit.<br/>Clear boundaries. Independent modules.</p></div>
          <div className="diagram"><div>ORDER<small>Domain module</small></div><div className="focus">PAYMENT<small>Domain module</small></div><div>INVENTORY<small>Domain module</small></div></div>
          <div className="slide-meta footer"><span>ARCHITECTURE NOTES</span><span>DESIGN FOR CHANGE</span></div>
        </div></div>
        <div className="playback"><button disabled>▶</button><span>{formatTime(selected?.duration ?? 0)}</span><div className="bar"><i/></div><span>{formatTime(totalSeconds)}</span><small>{fa ? "پیش‌نمایش ثابت · بدون حرکت خودکار" : "Static preview · no auto motion"}</small></div>
        <div className="timeline-head"><div><small>SCENE SEQUENCE</small><b>{fa ? "تایم‌لاین" : "Timeline"}</b></div><span>{formatTime(totalSeconds)}</span></div>
        <div className="timeline"><div className="ruler"><span>00:00</span><span>00:30</span><span>01:00</span><span>01:30</span><span>02:00</span></div><div className="clips">{scenes.map((scene)=><button key={scene.id} onClick={()=>setActive(scene.id)} className={active===scene.id?"clip on":"clip"}>{scene.title}</button>)}</div><div className="track"><b>♫　Voice-over</b><span className="empty-track">{fa ? "هنوز فایلی اضافه نشده" : "No audio added yet"}</span></div><div className="track"><b>▤　Captions</b><span className="empty-track">{fa ? "هنوز زیرنویسی اضافه نشده" : "No captions added yet"}</span></div></div>
        {error && <div className="error-banner">{error} — {fa ? "سرور محلی را طبق راهنمای README اجرا کن." : "Start the local API using the README instructions."}</div>}{renderMessage && <div className={renderState === "failed" ? "error-banner" : "render-banner"}>{renderMessage}{renderDownloadUrl && <a className="download-link" href={renderDownloadUrl}>{fa ? "دانلود ویدیوی MP4" : "Download MP4"}</a>}</div>}{publishingPack && <pre className="publishing-pack">{publishingPack}</pre>}
      </section>
      <aside className="inspector">
        <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
        <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
        {tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><input className="field edit-field" value={selected?.title ?? ""} onChange={event=>updateSelected({title:event.target.value})}/><label>{fa?"نوع صحنه":"Scene type"}</label><input className="field edit-field" value={selected?.kind ?? ""} onChange={event=>updateSelected({kind:event.target.value})}/><label>{fa?"متن گویندگی":"Narration"}</label><textarea className="field edit-field narration-field" value={selected?.narration ?? ""} onChange={event=>updateSelected({narration:event.target.value})} placeholder={fa?"متن گویندگی این صحنه...":"Scene narration..."}/><h3>{fa?"قالب بصری":"Visual style"}</h3><div className="swatches"><i/><i/><i/><i/></div><label>{fa?"پس‌زمینه":"Background"}</label><div className="field">#111827</div><h3>{fa?"لایه‌ها":"Layers"}</h3><div className="layer">▤　Headline <em>Visible</em></div><div className="layer">⌘　Architecture diagram <em>Visible</em></div><div className="layer">▤　Captions <em>Visible</em></div></>:<><h3>{tab==="motion"?"Motion controls":tab==="audio"?"Audio settings":"Scene timing"}</h3><p className="muted">{tab==="motion"?"No animation is applied by default. Choose a motion preset explicitly.":tab==="audio"?"Audio import and recording are scheduled for the audio milestone.":"Set the duration of the selected scene."}</p>{tab==="timing" && <><label>{fa?"مدت صحنه (ثانیه)":"Scene duration (seconds)"}</label><input className="field edit-field" type="number" min="1" max="3600" value={selected?.duration ?? 1} onChange={event=>updateSelected({duration:Math.max(1,Number(event.target.value)||1)})}/></>}</>}
        <div className="note">✧ {fa?"حرکت فقط با انتخاب شما اعمال می‌شود؛ محتوای ثابت بدون زوم و پن می‌ماند.":"Motion is opt-in. Static content never auto-zooms or pans."}</div>
      </aside>
    </main>
  </div>;
}
