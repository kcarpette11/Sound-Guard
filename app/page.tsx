"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import StartListening from "@/components/StartListening";
import ListeningStatus from "@/components/ListeningStatus";
import AlertOverlay from "@/components/AlertOverlay";
import DetectionHistory from "@/components/DetectionHistory";
import SourceToggle from "@/components/SourceToggle";
import NowHearing from "@/components/NowHearing";
import {
  requestDeviceAudioStream,
  requestMicrophoneStream,
  stopMicrophoneStream,
} from "@/lib/audio/microphone";
import { AudioProcessor } from "@/lib/audio/audioProcessor";
import { classifyAudio, getClassifier } from "@/lib/ml/classifier";
import { AlertEngine, type Detection, type DominantSound } from "@/lib/alerts/alertEngine";
import type { VerificationResponse } from "@/lib/gemini/schema";
import { CATEGORY_META, type SoundGaurdCategory } from "@/lib/ml/labels";

/** The five sounds SoundGaurd watches for, in the order they're shown. */
const MONITORED: SoundGaurdCategory[] = [
  "smoke_alarm",
  "siren",
  "baby_cry",
  "car_horn",
  "door_knock",
];

type GeminiStatus = "idle" | "loading" | "done" | "error" | "quota";

/**
 * Repeat detections of the same sound reuse the previous explanation for this
 * long. Gemini's free tier allows only a small number of requests per day, and
 * re-describing a third identical knock adds nothing.
 */
const GEMINI_CACHE_MS = 120_000;

function vibrate(pattern: number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [deviceAudio, setDeviceAudio] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [dominant, setDominant] = useState<DominantSound | null>(null);
  const [history, setHistory] = useState<Detection[]>([]);
  const [activeAlert, setActiveAlert] = useState<Detection | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus>("idle");
  const [geminiResult, setGeminiResult] = useState<VerificationResponse | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioProcessor | null>(null);
  const alertEngineRef = useRef(new AlertEngine());
  const isClassifyingRef = useRef(false);
  // Mirrors `isListening` synchronously so an in-flight classification that
  // resolves just after Stop is clicked can be discarded instead of firing
  // a "ghost" alert for a session that's already over.
  const isListeningRef = useRef(false);
  // handleStop is defined below handleStart; this lets the stream's "ended"
  // listener call the latest version without a declaration-order problem.
  const handleStopRef = useRef<() => void>(() => {});
  const geminiCacheRef = useRef(
    new Map<SoundGaurdCategory, { result: VerificationResponse; at: number }>()
  );

  const verifyWithGemini = useCallback(async (detection: Detection) => {
    const cached = geminiCacheRef.current.get(detection.category);
    if (cached && Date.now() - cached.at < GEMINI_CACHE_MS) {
      setGeminiResult(cached.result);
      setGeminiStatus("done");
      return;
    }

    setGeminiStatus("loading");
    setGeminiResult(null);
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: detection.category,
          label: detection.label,
          confidence: detection.confidence,
        }),
      });
      const data = await response.json();
      if (response.status === 429 || data?.quotaExceeded) {
        setGeminiStatus("quota");
        return;
      }
      if (!response.ok) throw new Error(data?.error ?? "Gemini request failed");

      const result = data as VerificationResponse;
      geminiCacheRef.current.set(detection.category, { result, at: Date.now() });
      setGeminiResult(result);
      setGeminiStatus("done");
    } catch (err) {
      console.error("Gemini verification failed", err);
      setGeminiStatus("error");
    }
  }, []);

  const fireDetection = useCallback(
    (detection: Detection) => {
      setActiveAlert(detection);
      setHistory((prev) => [detection, ...prev].slice(0, 20));
      vibrate([200, 100, 200]);
      void verifyWithGemini(detection);
    },
    [verifyWithGemini]
  );

  const handleLevel = useCallback((rms: number) => {
    setLevel(rms);
  }, []);

  const handleTransient = useCallback(
    (strength: number, clip: Float32Array) => {
      // The onset detector supplies timing, not identity — it fires on any
      // impulse. Classify the short clip around it so only genuine knocking
      // raises the alert, while still reacting far faster than the rolling
      // window would on its own.
      if (!alertEngineRef.current.shouldInvestigateTransient(strength)) return;

      classifyAudio(clip)
        .then((predictions) => {
          if (!isListeningRef.current) return;
          const detection = alertEngineRef.current.observeTransient(strength, predictions);
          if (detection) fireDetection(detection);
        })
        .catch((err) => console.error("Transient classification failed", err));
    },
    [fireDetection]
  );

  // Classification runs back-to-back on the freshest audio rather than on a
  // fixed schedule. Inference costs well over a second, so waiting for the
  // next hop boundary after each run would idle the pipeline and add latency
  // for no benefit; windows that arrive mid-run are simply superseded.
  const pumpRef = useRef<() => void>(() => {});
  const pump = useCallback(() => {
    if (!isListeningRef.current || isClassifyingRef.current) return;
    const samples = processorRef.current?.getLatestWindow();
    if (!samples) return;

    isClassifyingRef.current = true;
    classifyAudio(samples)
      .then((predictions) => {
        if (!isListeningRef.current) return; // session ended while this was running
        const detection = alertEngineRef.current.observeWindow(predictions);
        setDominant(alertEngineRef.current.getDominant());
        if (detection) fireDetection(detection);
      })
      .catch((err) => console.error("Classification failed", err))
      .finally(() => {
        isClassifyingRef.current = false;
        pumpRef.current();
      });
  }, [fireDetection]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const handleWindow = useCallback(() => pump(), [pump]);

  const handleStart = useCallback(async () => {
    setError(null);
    setIsRequestingMic(true);
    try {
      const stream = deviceAudio
        ? await requestDeviceAudioStream()
        : await requestMicrophoneStream();
      streamRef.current = stream;

      // If the user ends the share from the browser's own "Stop sharing"
      // bar, tear the session down rather than sitting on a dead stream.
      stream.getAudioTracks()[0]?.addEventListener("ended", () => handleStopRef.current());

      // Fresh engine per session: cooldowns from a previous test run should
      // never suppress a detection in a brand-new listening session.
      alertEngineRef.current = new AlertEngine();
      isClassifyingRef.current = false;
      isListeningRef.current = true;
      setDominant(null);

      processorRef.current = new AudioProcessor(stream, {
        onLevel: handleLevel,
        // The onset detector is tuned for real room acoustics; on media
        // playback it would fire on drum hits and edits, so device mode
        // relies on the neural classifier alone for knocks.
        onTransient: deviceAudio ? () => {} : handleTransient,
        // (device mode: media playback is full of percussive edits and beats)
        onWindow: handleWindow,
      });
      setIsListening(true);

      // Don't block mic/meter/knock-detection start on the sound-ID model —
      // it can take several seconds to download on first use. It loads in
      // the background; classifyAudio() awaits it lazily once ready.
      if (!isModelReady) {
        void getClassifier()
          .then(() => setIsModelReady(true))
          .catch((err) => console.error("Failed to load sound model", err));
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : deviceAudio
            ? "Could not capture device audio."
            : "Could not start listening. Check microphone permissions."
      );
    } finally {
      setIsRequestingMic(false);
    }
  }, [deviceAudio, handleLevel, handleTransient, handleWindow, isModelReady]);

  const handleStop = useCallback(() => {
    isListeningRef.current = false;
    isClassifyingRef.current = false;
    processorRef.current?.stop();
    processorRef.current = null;
    if (streamRef.current) {
      stopMicrophoneStream(streamRef.current);
      streamRef.current = null;
    }
    setIsListening(false);
    setLevel(0);
    setDominant(null);
  }, []);

  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);

  const handleDismiss = useCallback(() => {
    setActiveAlert(null);
    setGeminiStatus("idle");
    setGeminiResult(null);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-zinc-50 dark:bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.16),_transparent_70%)]"
      />

      <Header isListening={isListening} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <div className="grid flex-1 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex h-full flex-col items-center justify-center gap-7 rounded-3xl border border-zinc-200 bg-white/70 px-6 py-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <StartListening
              isListening={isListening}
              isRequestingMic={isRequestingMic}
              error={error}
              onStart={handleStart}
              onStop={handleStop}
            />

            <ListeningStatus isListening={isListening} level={level} deviceAudio={deviceAudio} />

            <NowHearing isListening={isListening} dominant={dominant} />

            {isListening && !isModelReady && (
              <p className="text-center text-xs text-zinc-400">
                Knock detection is active — full sound ID is still loading…
              </p>
            )}
          </section>

          <section className="flex h-full flex-col gap-4">
            <SourceToggle
              deviceAudio={deviceAudio}
              disabled={isListening || isRequestingMic}
              onChange={setDeviceAudio}
            />

            <div className="flex flex-1 flex-col gap-3 rounded-3xl border border-zinc-200 bg-white/70 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Recent detections
                </h3>
                {history.length > 0 && (
                  <span className="text-xs text-zinc-400">{history.length} logged</span>
                )}
              </div>
              <DetectionHistory history={history} />
            </div>
          </section>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MONITORED.map((category) => {
            const meta = CATEGORY_META[category];
            const isActive = dominant?.category === category;
            return (
              <div
                key={category}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-center transition-colors ${
                  isActive
                    ? `${meta.chipBg} border-current ${meta.accent}`
                    : "border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/40"
                }`}
              >
                <span className="text-2xl">{meta.emoji}</span>
                <span className="text-xs font-medium leading-tight text-zinc-600 dark:text-zinc-300">
                  {meta.title}
                </span>
              </div>
            );
          })}
        </section>
      </main>

      {activeAlert && (
        <AlertOverlay
          detection={activeAlert}
          geminiStatus={geminiStatus}
          geminiResult={geminiResult}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}
