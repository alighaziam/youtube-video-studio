import { API, starterScenes } from "./defaults";
import type { Project } from "./types";

export function outputProfile(document: Project["document"] | undefined): "youtube-1080p" | "shorts-1080p" {
  const profile = document?.profile as { aspectRatio?: string } | undefined;
  return profile?.aspectRatio === "9:16" ? "shorts-1080p" : "youtube-1080p";
}
export function profileDocument(profile: "youtube-1080p" | "shorts-1080p") {
  return profile === "shorts-1080p"
    ? { aspectRatio: "9:16", width: 1080, height: 1920, fps: 30 }
    : { aspectRatio: "16:9", width: 1920, height: 1080, fps: 30 };
}
let startupRequest: Promise<{ projects: Project[]; current: Project }> | null = null;
export function loadStartupProject(): Promise<{ projects: Project[]; current: Project }> {
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

