import type { PointerEvent as ReactPointerEvent } from "react";
import { formatTime, type CaptionCue } from "../timing";
import type { Scene } from "./types";

export function TimelineBoard({
  fa, scenes, active, sceneStarts, totalSeconds, pixelsPerSecond, playhead, captionCues, activeWordIndex,
  seekTimeline, selectScene, moveScene, beginResize, dragSceneId,
}: {
  fa: boolean;
  scenes: Scene[];
  active: string;
  sceneStarts: Map<string, number>;
  totalSeconds: number;
  pixelsPerSecond: number;
  playhead: number;
  captionCues: CaptionCue[];
  activeWordIndex: number;
  seekTimeline: (event: React.MouseEvent<HTMLDivElement>) => void;
  selectScene: (id: string) => void;
  moveScene: (fromId: string, toId: string) => void;
  beginResize: (event: ReactPointerEvent<HTMLElement>, scene: Scene) => void;
  dragSceneId: { current: string };
}) {
  return <>
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
    </>;
}
