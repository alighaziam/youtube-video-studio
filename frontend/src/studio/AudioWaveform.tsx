import { useEffect, useState } from "react";

const MAX_WAVEFORM_BYTES = 32 * 1024 * 1024;
const BAR_COUNT = 72;

export function AudioWaveform({ src }: { src: string }) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [message, setMessage] = useState("Loading waveform…");

  useEffect(() => {
    let alive = true;
    let context: AudioContext | null = null;

    const load = async () => {
      const response = await fetch(src);
      if (!response.ok) throw new Error("Waveform is unavailable");
      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > MAX_WAVEFORM_BYTES) {
        if (alive) setMessage("Waveform preview is limited to audio files under 32 MB.");
        return;
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_WAVEFORM_BYTES) {
        if (alive) setMessage("Waveform preview is limited to audio files under 32 MB.");
        return;
      }
      context = new AudioContext();
      const decoded = await context.decodeAudioData(bytes.slice(0));
      const channel = decoded.getChannelData(0);
      const bucketSize = Math.max(1, Math.ceil(channel.length / BAR_COUNT));
      const raw: number[] = [];
      for (let bar = 0; bar < BAR_COUNT; bar += 1) {
        const start = bar * bucketSize;
        const end = Math.min(channel.length, start + bucketSize);
        let peak = 0;
        for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(channel[index]));
        raw.push(peak);
      }
      const maximum = Math.max(...raw, 0.001);
      if (alive) {
        setPeaks(raw.map((peak) => Math.max(4, Math.round((peak / maximum) * 100))));
        setMessage("");
      }
    };

    void load().catch(() => {
      if (alive) setMessage("Waveform preview is unavailable for this audio format.");
    });
    return () => {
      alive = false;
      if (context && context.state !== "closed") void context.close();
    };
  }, [src]);

  if (!peaks.length) return <small className="waveform-message">{message}</small>;
  return <div className="audio-waveform" role="img" aria-label="Audio waveform">
    {peaks.map((peak, index) => <span key={index} style={{ height: `${peak}%` }} />)}
  </div>;
}
