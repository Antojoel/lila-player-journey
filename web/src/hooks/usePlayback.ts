import { useCallback, useEffect, useRef, useState } from "react";

export interface Playback {
  t: number;
  playing: boolean;
  speed: number;
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
}

/** Wall-clock playback of a match timeline of `duration` ms. */
export function usePlayback(duration: number): Playback {
  const [t, setT] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const raf = useRef<number>(0);
  const last = useRef<number>(0);

  // Reset to "show the whole journey" whenever the match length changes.
  useEffect(() => {
    setT(duration);
    setPlaying(false);
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, duration]);

  const play = useCallback(() => {
    setT((prev) => (prev >= duration ? 0 : prev));
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(
    () => (playing ? pause() : play()),
    [playing, play, pause],
  );
  const seek = useCallback(
    (v: number) => {
      setPlaying(false);
      setT(Math.max(0, Math.min(duration, v)));
    },
    [duration],
  );

  return {
    t,
    playing,
    speed,
    atEnd: t >= duration,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
  };
}
