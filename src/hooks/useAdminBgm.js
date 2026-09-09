import { useEffect, useRef, useState } from "react";
import { STATUSES } from "../data/gameData.js";
import simulation from "../images/bgm01.mp3";
import setup from "../images/0011.mp3";
import evaluation from "../images/0012.mp3";
import investment from "../images/0013.mp3";
import planning from "../images/0014.mp3";

const tracks = { [STATUSES.WAITING]: setup, [STATUSES.AI_EVALUATION]: evaluation, [STATUSES.INVESTMENT]: investment, [STATUSES.IDEATION]: planning, [STATUSES.SIMULATION]: simulation };

export function useAdminBgm(roomId, status) {
  const audioRef = useRef(null);
  const muted = useRef(false);
  const wanted = useRef(false);
  const [playing, setPlaying] = useState(false);

  function play() {
    wanted.current = true;
    if (!muted.current) audioRef.current?.play().catch(() => {});
  }
  function pause() {
    wanted.current = false;
    audioRef.current?.pause();
  }
  function stop() {
    pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  }
  useEffect(() => {
    muted.current = false;
    wanted.current = status !== STATUSES.SIMULATION;
    setPlaying(false);
    if (!tracks[status]) return;
    const audio = new Audio(tracks[status]);
    audio.loop = true;
    audio.volume = 0.42;
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const retry = (event) => {
      if (event?.target?.closest?.("[data-bgm-control]")) return;
      if (wanted.current && !muted.current && audio.paused) audio.play().catch(() => {});
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    document.addEventListener("pointerdown", retry);
    document.addEventListener("keydown", retry);
    retry();
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      document.removeEventListener("pointerdown", retry);
      document.removeEventListener("keydown", retry);
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, [roomId, status]);

  function toggle() {
    if (audioRef.current && !audioRef.current.paused) {
      muted.current = true;
      audioRef.current.pause();
    } else {
      muted.current = false;
      play();
    }
  }
  return { available: Boolean(tracks[status]), playing, play, pause, stop, toggle };
}
