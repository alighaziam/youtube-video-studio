import { formatTime, projectSrt } from "../timing";
import { readingDirection } from "../textDirection";
import { outputProfile } from "./api";
import { sceneTemplates } from "./defaults";
import type { CaptionStyle, Project, ProjectVersion, Scene } from "./types";

export function ProjectLibrary({
  fa, projects, project, scenes, openProject, duplicateProject, exportProject, backupProject, deleteProject, importProject, createProject, versions, versionsFor, loadVersions, createVersion, restoreVersion,
}: {
  fa: boolean;
  projects: Project[];
  project: Project | null;
  scenes: Scene[];
  openProject: (item: Project) => void;
  duplicateProject: (id: string) => void;
  exportProject: (item: Project) => void;
  backupProject: (item: Project) => void;
  deleteProject: (id: string) => void;
  importProject: (file: File | undefined) => void;
  createProject: () => void;
  versions: ProjectVersion[];
  versionsFor: string | null;
  loadVersions: (item: Project) => void;
  createVersion: (item: Project) => void;
  restoreVersion: (item: Project, versionId: string) => void;
}) {
  return <section className="workspace-page">
    <div className="workspace-head"><div><small>PROJECTS</small><h2>{fa ? "پروژه‌های محلی" : "Local projects"}</h2></div><div className="card-actions"><label className="upload-control">{fa ? "ورود ZIP / JSON" : "Import ZIP / JSON"}<input type="file" accept="application/json,.json,application/zip,.zip" onChange={(event) => { void importProject(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className="primary" type="button" onClick={() => void createProject()}>{fa ? "پروژه تازه" : "New project"}</button></div></div>
    <p className="lede">{fa ? "هر پروژه، رسانه‌اش و رندرهایش روی همین رایانه می‌ماند. کپی، فایل‌ها را هم برمی‌دارد. نسخه پشتیبان ZIP شامل استوری‌بورد و رسانه‌هاست؛ خروجی JSON فقط سند صحنه است." : "Each project, its media, and its renders stay on this computer. Duplicate keeps the files. ZIP backup includes the storyboard and media; JSON export is the scene document only."}</p>
    <div className="card-grid">{projects.map((item) => {
      const cardScenes = item.id === project?.id ? scenes : (Array.isArray(item.document?.scenes) ? item.document.scenes : []);
      const seconds = cardScenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
      const ratio = outputProfile(item.id === project?.id ? project?.document : item.document) === "shorts-1080p" ? "9:16" : "16:9";
      return <article className={item.id === project?.id ? "studio-card current" : "studio-card"} key={item.id}><b>{item.title}</b><small className="meta">{cardScenes.length} {fa ? "صحنه" : "scenes"} · {formatTime(seconds)} · {ratio}</small><div className="card-actions"><button type="button" onClick={() => void openProject(item)}>{fa ? "باز کردن" : "Open"}</button><button type="button" onClick={() => void duplicateProject(item.id)}>{fa ? "کپی" : "Duplicate"}</button><button type="button" onClick={() => backupProject(item)}>{fa ? "پشتیبان ZIP" : "Backup ZIP"}</button><button type="button" onClick={() => exportProject(item)}>{fa ? "خروجی JSON" : "Export JSON"}</button><button type="button" onClick={() => createVersion(item)}>{fa ? "ثبت نسخه" : "Save version"}</button><button type="button" onClick={() => loadVersions(item)}>{fa ? "تاریخچه" : "History"}</button><button type="button" className="danger" onClick={() => void deleteProject(item.id)}>{fa ? "حذف" : "Delete"}</button></div>{versionsFor === item.id && <div className="version-history">{versions.length ? versions.map(version => <div key={version.id}><span>{version.label} · {version.scene_count} {fa ? "صحنه" : "scenes"} · {new Date(version.created_at).toLocaleString(fa ? "fa-IR" : "en-US")}</span><button type="button" onClick={() => restoreVersion(item, version.id)}>{fa ? "بازیابی" : "Restore"}</button></div>) : <small>{fa ? "هنوز نسخه‌ای ثبت نشده است." : "No saved versions yet."}</small>}</div>}</article>;
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
  fa, scenes, captionStyle, setCaptionStyle, rememberEdits, setActive, setScenes, downloadSrt,
}: {
  fa: boolean;
  scenes: Scene[];
  captionStyle: CaptionStyle;
  setCaptionStyle: (style: CaptionStyle) => void;
  rememberEdits: () => void;
  setActive: (id: string) => void;
  setScenes: (update: (items: Scene[]) => Scene[]) => void;
  downloadSrt: () => void;
}) {
  const placements: { id: CaptionStyle; label: string }[] = [
    { id: "lower", label: fa ? "پایین" : "Lower" },
    { id: "middle", label: fa ? "وسط" : "Middle" },
    { id: "upper", label: fa ? "بالا" : "Upper" },
  ];
  return <section className="workspace-page">
    <div className="workspace-head"><div><small>CAPTIONS</small><h2>{fa ? "زیرنویس قابل ویرایش" : "Editable captions"}</h2></div><button className="primary" type="button" onClick={downloadSrt} disabled={!projectSrt(scenes)}>{fa ? "دانلود SRT" : "Download SRT"}</button></div>
    <p className="lede">{fa ? "هر خط حداکثر دوازده کلمه است و زمانش از مدت صحنه می‌آید. جای بلوک زیرنویس در پیش‌نمایش و فایل ASS یکی است." : "Each line holds at most twelve words and takes its time from the scene duration. The caption block uses the same placement in the preview and the ASS file."}</p>
    <div className="caption-placement" role="group" aria-label={fa ? "جای زیرنویس" : "Caption placement"}>{placements.map((item) => <button key={item.id} type="button" className={captionStyle === item.id ? "chip on" : "chip"} onClick={() => setCaptionStyle(item.id)}>{item.label}</button>)}</div>
    <div className="caption-list">{scenes.map((scene) => <article className="studio-card" key={scene.id}><header><b dir={readingDirection(scene.title)}>{scene.title}</b><small>{formatTime(scene.duration)}</small></header><textarea className="field edit-field narration-field" dir="auto" value={scene.narration ?? ""} onChange={(event) => { const value = event.target.value; rememberEdits(); setActive(scene.id); setScenes((items) => items.map((item) => item.id === scene.id ? { ...item, narration: value } : item)); }} />{scene.narration?.trim() ? <div className="caption-preview" dir={readingDirection(scene.narration ?? "")}>{scene.narration.trim().split(/\s+/).slice(0, 18).map((word, index) => <em key={`${scene.id}-${index}`}>{word}</em>)}</div> : <p className="muted">{fa ? "برای این صحنه متنی نیست." : "This scene has no narration yet."}</p>}</article>)}</div>
  </section>;
}
