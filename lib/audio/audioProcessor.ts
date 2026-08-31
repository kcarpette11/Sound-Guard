import { resampleTo16k } from "./resample";
import { TransientDetector } from "./transientDetector";

// The AST classifier pads every input to a fixed ~10.24s spectrogram, so a
// shorter window costs exactly the same inference time -- it only changes how
// long a new sound takes to fill the window and reach a confident score.
// Benchmarking a 3.2kHz alarm confirmed a 2s clip scores at least as well as
// 4s or 10s, so the shorter window is pure latency win.
const WINDOW_SECONDS = 2;
const HOP_SECONDS = 0.5;
const BUFFER_SIZE = 2048;
// Ignore transients for a brief moment after starting — mic/AudioContext
// initialization can produce a click/pop that would otherwise register as
// a false "knock" the instant the user presses Start.
const TRANSIENT_WARMUP_MS = 300;
/**
 * Length of the clip handed to the classifier when an onset fires. Short and
 * tight around the impulse: the model pads to a fixed size anyway, so a brief
 * clip containing only the knock is a far cleaner signal than the long
 * rolling window where a single tap is diluted by seconds of room tone.
 */
const TRANSIENT_CLIP_SECONDS = 1.2;

export interface AudioProcessorHandlers {
  /** Fires on every raw audio buffer (~45-90ms) with the buffer's RMS level. */
  onLevel: (rms: number) => void;
  /**
   * Fires on a percussive onset, with its 0-1 strength and a short clip around
   * the impulse for the classifier to confirm what actually made the sound.
   */
  onTransient: (strength: number, clip: Float32Array) => void;
  /**
   * Signals that a fresh analysis window is available. The window itself is
   * pulled with getLatestWindow(), so a consumer that is busy can simply take
   * the newest audio when it frees up rather than work through stale windows.
   */
  onWindow: () => void;
}

function mergeChunks(chunks: Float32Array[], total: number): Float32Array {
  const result = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function computeRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length);
}

export class AudioProcessor {
  private audioContext: AudioContext;
  private sourceNode: MediaStreamAudioSourceNode;
  private processorNode: ScriptProcessorNode;
  private silentGain: GainNode;
  private transientDetector = new TransientDetector();
  private chunks: Float32Array[] = [];
  private bufferedSamples = 0;
  private samplesSinceLastEmit = 0;
  private latestWindow: Float32Array | null = null;
  private readonly startedAt = Date.now();

  constructor(stream: MediaStream, handlers: AudioProcessorHandlers) {
    this.audioContext = new AudioContext();
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.processorNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    // Some browsers create a suspended AudioContext even from a user
    // gesture; make sure processing actually starts.
    void this.audioContext.resume();

    this.processorNode.onaudioprocess = (event) => {
      this.handleAudioProcess(event, handlers);
    };

    // ScriptProcessorNode only fires onaudioprocess while connected to the
    // graph's destination. Route through a muted gain node so the user's
    // own microphone is never played back to them.
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  private handleAudioProcess(event: AudioProcessingEvent, handlers: AudioProcessorHandlers) {
    const input = event.inputBuffer.getChannelData(0);

    // Single RMS measurement drives the meter, the transient detector, and
    // (via the window buffer below) the classifier — one source of truth,
    // so the UI meter can never drift out of sync with what's being analyzed.
    const bufferRms = computeRms(input);
    handlers.onLevel(bufferRms);
    const transientStrength = this.transientDetector.process(bufferRms);

    this.chunks.push(new Float32Array(input));
    this.bufferedSamples += input.length;
    this.samplesSinceLastEmit += input.length;

    const nativeSampleRate = this.audioContext.sampleRate;

    // A transient only *triggers* analysis — it is not an alert by itself.
    // Any impulse (a cup set down, a cough, a click) has a knock's shape, so
    // the short clip around it is handed to the classifier for confirmation.
    if (transientStrength !== null && Date.now() - this.startedAt > TRANSIENT_WARMUP_MS) {
      const clipSamples = Math.floor(TRANSIENT_CLIP_SECONDS * nativeSampleRate);
      const recent = mergeChunks(this.chunks, this.bufferedSamples);
      const clip = recent.length > clipSamples ? recent.slice(recent.length - clipSamples) : recent;
      handlers.onTransient(transientStrength, resampleTo16k(clip, nativeSampleRate));
    }

    const hopSamples = Math.floor(HOP_SECONDS * nativeSampleRate);
    if (this.samplesSinceLastEmit < hopSamples) return;
    this.samplesSinceLastEmit = 0;

    // During the first WINDOW_SECONDS of a session this window grows from
    // whatever's been captured so far (so classification can start right
    // away) up to the full target length, then slides at a fixed size.
    const windowSamples = Math.floor(WINDOW_SECONDS * nativeSampleRate);
    const merged = mergeChunks(this.chunks, this.bufferedSamples);
    const windowed = merged.length > windowSamples ? merged.slice(merged.length - windowSamples) : merged;

    this.latestWindow = resampleTo16k(windowed, nativeSampleRate);
    handlers.onWindow();

    this.chunks = [windowed];
    this.bufferedSamples = windowed.length;
  }

  /** Newest analysis window, copied so the caller may transfer it to a worker. */
  getLatestWindow(): Float32Array | null {
    return this.latestWindow ? new Float32Array(this.latestWindow) : null;
  }

  stop(): void {
    this.processorNode.onaudioprocess = null;
    this.sourceNode.disconnect();
    this.processorNode.disconnect();
    this.silentGain.disconnect();
    void this.audioContext.close();
  }
}
