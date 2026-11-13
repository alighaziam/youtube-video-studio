import type { ReactNode } from "react";
import { sceneSuggestsDiagram } from "../timing";
import { sceneKinds } from "./defaults";
import type { Asset, Scene, SceneDiagram, SceneLayer } from "./types";

export function SceneInspector({
  fa, tab, setTab, selected, selectedAsset, selectedDiagram, assets, voicePicker,
  updateSelected, updateDiagram, updateDiagramNode, updateDiagramEdge, resetDiagram,
  addLayer, updateLayer, moveLayer, deleteLayer, addDiagramNode, removeDiagramNode,
}: {
  fa: boolean;
  tab: string;
  setTab: (tab: string) => void;
  selected?: Scene;
  selectedAsset?: Asset;
  selectedDiagram: SceneDiagram;
  assets: Asset[];
  voicePicker: ReactNode;
  updateSelected: (patch: Partial<Scene>) => void;
  updateDiagram: (patch: Partial<SceneDiagram>) => void;
  updateDiagramNode: (index: number, patch: Partial<SceneDiagram["nodes"][number]>) => void;
  updateDiagramEdge: (index: number, label: string) => void;
  resetDiagram: () => void;
  addLayer: (type: SceneLayer["type"]) => void;
  updateLayer: (id: string, patch: Partial<SceneLayer>) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  deleteLayer: (id: string) => void;
  addDiagramNode: () => void;
  removeDiagramNode: (index: number) => void;
}) {
  const kindChoices = sceneKinds[fa ? "fa" : "en"];
  return <aside className="inspector">
    <small>PROPERTIES</small><h2>{fa ? "بازرس صحنه" : "Scene inspector"}</h2>
    <nav>{[["design",fa?"طراحی":"Design"],["motion",fa?"حرکت":"Motion"],["audio",fa?"صدا":"Audio"],["timing",fa?"زمان":"Timing"]].map(([k,v])=><button className={tab===k?"chosen":""} onClick={()=>setTab(k)} key={k}>{v}</button>)}</nav>
    {tab==="design"?<><h3>{fa?"محتوای صحنه":"Scene content"}</h3><label>{fa?"عنوان":"Title"}</label><input className="field edit-field" dir="auto" value={selected?.title ?? ""} onChange={event=>updateSelected({title:event.target.value})}/><label>{fa?"نوع صحنه":"Scene type"}</label><select className="field edit-field" aria-label={fa ? "نوع صحنه" : "Scene type"} value={selected?.kind ?? kindChoices[0]} onChange={event=>updateSelected({kind:event.target.value})}>{[...(selected?.kind && !kindChoices.includes(selected.kind) ? [selected.kind] : []), ...kindChoices].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select><label>{fa?"متن گویندگی":"Narration"}</label><textarea className="field edit-field narration-field" dir="auto" value={selected?.narration ?? ""} onChange={event=>updateSelected({narration:event.target.value})} placeholder={fa?"متن گویندگی این صحنه...":"Scene narration..."}/><h3>{fa?"گویندگی این صحنه":"Scene voice-over"}</h3>{voicePicker}<h3>{fa?"رسانه متصل به صحنه":"Scene media"}</h3><select className="field edit-field" value={selected?.assetId ?? ""} onChange={event=>updateSelected({assetId:event.target.value || undefined})}><option value="">{fa?"بدون رسانه":"No media attached"}</option>{assets.filter(asset=>asset.mime_type.startsWith("image/") || asset.mime_type.startsWith("video/")).map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{selectedAsset && <p className="muted">{fa?"این رسانه به صحنه انتخاب‌شده متصل و همراه پروژه ذخیره می‌شود.":"This asset reference is saved with the selected scene."}</p>}          <h3>{fa?"دیاگرام قابل ویرایش":"Editable diagram"}</h3>
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
  </aside>;
}
