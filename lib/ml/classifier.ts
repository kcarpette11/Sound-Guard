export interface ClassificationResult {
  label: string;
  score: number;
}

interface PendingRequest {
  resolve: (result: ClassificationResult[]) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let nextRequestId = 0;
let readyPromise: Promise<void> | null = null;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./classifier.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent) => {
      const { id, result, error } = event.data as {
        id: number;
        result?: ClassificationResult[];
        error?: string;
      };
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result ?? []);
    };
  }
  return worker;
}

/** Kicks off (and caches) loading the model inside the worker. */
export function getClassifier(): Promise<void> {
  if (!readyPromise) {
    const activeWorker = getWorker();
    readyPromise = new Promise((resolve, reject) => {
      const id = nextRequestId++;
      pending.set(id, { resolve: () => resolve(), reject });
      activeWorker.postMessage({ id, warmup: true });
    });
  }
  return readyPromise;
}

export function classifyAudio(samples: Float32Array): Promise<ClassificationResult[]> {
  const activeWorker = getWorker();
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    // Transfer the buffer instead of copying — `samples` is a fresh
    // resampled window that isn't reused after this call.
    activeWorker.postMessage({ id, samples }, [samples.buffer]);
  });
}
