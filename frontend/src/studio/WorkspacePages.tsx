import { formatTime, projectSrt } from "../timing";
import { readingDirection } from "../textDirection";
import { outputProfile } from "./api";
import { sceneTemplates } from "./defaults";
import type { Project, Scene } from "./types";

export function ProjectLibrary({
  fa, projects, project, scenes, openProject, duplicateProject, exportProject, deleteProject, importProject, createProject,
}: {
  fa: boolean;
  projects: Project[];
  project: Project | null;
  scenes: Scene[];
  openProject: (item: Project) => void;
  duplicateProject: (id: string) => void;
  exportProject: (item: Project) => void;
  deleteProject: (id: string) => void;
  importProject: (file: File | undefined) => void;
  createProject: () => void;
}) {
  return <section className="workspace-page">
    <div className="workspace-head"><div><small>PROJECTS</small><h2>{fa ? "پروژه‌های محلی" : "Local projects"}</h2></div><div className="card-actions"><label className="upload-control">{fa ? "ورود JSON" : "Import JSON"}<input type="file" accept="application/json,.json" onChange={(event) => { void importProject(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="primary" type="button" onClick={() => void createProject()}>{fa ? "پروژه تازه" : "New project"}</button></div></div>
    <p className="lede">{fa ? "هر پروژه، رسانه‌اش و رندرهایش روی همین رایانه می‌ماند. کپی، فایل‌ها را هم برمی‌دارد. خروجی JSON فقط سند صحنه است." : "Each project, its media, and its renders stay on this computer. Duplicate keeps the files. JSON export is the scene document only."}</p>
    <div className="card-grid">{projects.map((item) => {
      const cardScenes = item.id === project?.id ? scenes : (Array.isArray(item.document?.scenes) ? item.document.scenes : []);
      const seconds = cardScenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
      const ratio = outputProfile(item.id === project?.id ? project?.document : item.document) === "shorts-1080p" ? "9:16" : "16:9";
      return <article className={item.id === project?.id ? "studio-card current" : "studio-card"} key={item.id}><b>{item.title}</b><small className="meta">{cardScenes.length} {fa ? "صحنه" : "scenes"} · {formatTime(seconds)} · {ratio}</small><div className="card-actions"><button type="button" onClick={() => void openProject(item)}>{fa ? "باز کردن" : "Open"}</button><button type="button" onClick={() => void duplicateProject(item.id)}>{fa ? "کپی" : "Duplicate"}</button><button type="button" onClick={() => exportProject(item)}>{fa ? "خروجی" : "Export"}</button><button type="button" className="danger" onClick={() => void deleteProject(item.id)}>{fa ? "حذف" : "Delete"}</button></div></article>;
    })}</div>
  </section>;
}

export function TemplateLibrary({ fa, insertTemplate }: { fa: boolean; insertTemplate: (template: (typeof sceneTemplates)[number]) => void }) {
  return <section className="workspace-page">
    <div className="workspace-head"><div><small>TEMPLATES</small><h2>{fa ? "قالب صحنه" : "Scene templates"}</h2></div></div>
    <p className="lede">{fa ? "یک قالب را به انتهای استوری‌بورد اضافه کن. تصویر پیش‌فرض ثابت است و فقط جمع‌بندی محو شدن دارد." : "Add a template to the end of the storyboard. Pictures stay still unless the recap fade is chosen."}</p>
    <div className="card-grid">{sceneTemplates.map((template) => <button type="button" className="studio-card template-card" key={template.id} onClick={() => insertTemplate(template)}><span>{template.mark}</span><b>{fa ? template.faTitle : template.enTitle}</b><small>{fa ? template.faKind : template.enKind} · {formatTime(template.duration)}</small><p>{fa ? template.faNarration : template.enNarration}</p></button>)}</div>
  </section>;
}

export function CaptionPage({
  fa, scenes, rememberEdits, setActive, setScenes, downloadSrt,
}: {
  fa: boolean;
  scenes: Scene[];
  rememberEdits: () => void;
  setActive: (id: string) => void;
  setScenes: (update: (items: Scene[]) => Scene[]) => void;
  downloadSrt: () => void;
}) {
  return <section className="workspace-page">
    <div className="workspace-head"><div><small>CAPTIONS</small><h2>{fa ? "زیرنویس قابل ویرایش" : "Editable captions"}</h2></div><button className="primary" type="button" onClick={downloadSrt} disabled={!projectSrt(scenes)}>{fa ? "دانلود SRT" : "Download SRT"}</button></div>
    <p className="lede">{fa ? "هر خط حداکثر دوازده کلمه است و زمانش از مدت صحنه می‌آید. با ویرایش متن، تایم‌لاین و خروجی رندر عوض می‌شود." : "Each line holds at most twelve words and takes its time from the scene duration. Editing the text updates the timeline and the rendered captions."}</p>
    <div className="caption-list">{scenes.map((scene) => <article className="studio-card" key={scene.id}><header><b dir={readingDirection(scene.title)}>{scene.title}</b><small>{formatTime(scene.duration)}</small></header><textarea className="field edit-field narration-field" dir="auto" value={scene.narration ?? ""} onChange={(event) => { const value = event.target.value; rememberEdits(); setActive(scene.id); setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, narration: value } : item)); }} />{scene.narration?.trim() ? <div className="caption-preview" dir={readingDirection(scene.narration ?? "")}>{scene.narration.trim().split(/\s+/).slice(0, 18).map((word, index) => <em key={`${scene.id}-${index}`}>{word}</em>)}</div> : <p className="muted">{fa ? "برای این صحنه متنی نیست." : "This scene has no narration yet."}</p>}</article>)}</div>
  </section>;
}
