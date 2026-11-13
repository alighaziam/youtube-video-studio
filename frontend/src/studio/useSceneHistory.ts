import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Scene } from "./types";

export function useSceneHistory(scenes: Scene[], setScenes: Dispatch<SetStateAction<Scene[]>>) {
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const historyRef = useRef<Scene[][]>([]);
  const futureRef = useRef<Scene[][]>([]);
  const historySnapshot = useRef<Scene[] | null>(null);
  const historyTimer = useRef(0);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

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
  const clearHistory = () => {
    window.clearTimeout(historyTimer.current);
    historyRef.current = [];
    futureRef.current = [];
    historySnapshot.current = null;
    syncHistoryCounts();
  };
  return { undoCount, redoCount, rememberEdits, undo, redo, undoRef, redoRef, clearHistory, scenesRef };
}
