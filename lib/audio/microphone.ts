export type AudioSourceMode = "microphone" | "device";

export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not supported in this browser.");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
}

/**
 * Captures audio playing on this device (a browser tab, or system audio) via
 * the screen-capture picker. The browser requires the user to pick a source
 * and tick "share audio" — there is no way to grab device audio silently.
 */
export async function requestDeviceAudioStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Device audio capture is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(
      'No audio was shared. Re-pick the source and enable "Share tab audio" / "Share system audio".'
    );
  }

  // Only the audio is needed — drop the video track so the browser isn't
  // encoding frames the app never looks at.
  stream.getVideoTracks().forEach((track) => {
    track.stop();
    stream.removeTrack(track);
  });

  return stream;
}

export function stopMicrophoneStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
