/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// This file runs inside a Worker global scope (`self` is a
// DedicatedWorkerGlobalScope there), which conflicts with the `dom` lib's
// `Window`-flavored `self` used by the rest of this project's single
// tsconfig — ts-nocheck avoids that lib collision for this one small file.
// Runs the AudioSet classifier off the main thread. Model inference in
// transformers.js can take hundreds of milliseconds to multiple seconds on
// CPU/WASM — doing that on the main thread was blocking the mic's audio
// callbacks and every React re-render, which is why the UI (level meter,
// knock detection, everything) looked stuck/laggy every time a
// classification ran.

const MODEL_ID = "Xenova/ast-finetuned-audioset-10-10-0.4593";

interface ClassificationResult {
  label: string;
  score: number;
}

type Classifier = (
  audio: Float32Array,
  options?: { topk?: number }
) => Promise<ClassificationResult[]>;

let classifierPromise: Promise<Classifier> | null = null;

function getClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers").then(async ({ pipeline }) => {
      // Inference time, not the hop, sets how often audio can be examined --
      // it measures over a second on CPU, which dominates detection latency.
      // Try the GPU first, then quantized CPU weights, then whatever loads.
      const attempts: Record<string, unknown>[] = [
        { device: "webgpu", dtype: "fp32" },
        { dtype: "q8" },
        {},
      ];

      let classifier: Classifier | null = null;
      for (const options of attempts) {
        try {
          const candidate = (await pipeline(
            "audio-classification",
            MODEL_ID,
            options
          )) as unknown as Classifier;

          // Run one second of silence through it before accepting. This both
          // proves the backend can actually execute the graph -- WebGPU can
          // load and only fail at inference -- and pays the graph-compilation
          // cost here rather than on the user's first real sound.
          await candidate(new Float32Array(16000), { topk: 1 });
          classifier = candidate;
          break;
        } catch {
          // Backend unusable; fall through to the next configuration.
        }
      }
      if (!classifier) throw new Error("Could not load the sound model.");

      return classifier;
    });
  }
  return classifierPromise;
}

interface WorkerRequest {
  id: number;
  warmup?: boolean;
  samples?: Float32Array;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, warmup, samples } = event.data;
  try {
    const classifier = await getClassifier();
    if (warmup || !samples) {
      self.postMessage({ id, result: [] });
      return;
    }
    const result = await classifier(samples, { topk: 15 });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
