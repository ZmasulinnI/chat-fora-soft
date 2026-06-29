import useSound from 'use-sound';

const SOUND_VOLUME = 0.28;
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==';

const sounds = {
  click: createToneDataUri([
    { frequency: 520, duration: 0.035, gain: 0.55 }
  ]),
  toggle: createToneDataUri([
    { frequency: 360, duration: 0.04, gain: 0.42 },
    { frequency: 520, duration: 0.045, gain: 0.34 }
  ]),
  success: createToneDataUri([
    { frequency: 560, duration: 0.045, gain: 0.34 },
    { frequency: 760, duration: 0.07, gain: 0.32 }
  ]),
  error: createToneDataUri([
    { frequency: 180, duration: 0.055, gain: 0.36 },
    { frequency: 140, duration: 0.075, gain: 0.32 }
  ]),
  join: createToneDataUri([
    { frequency: 480, duration: 0.04, gain: 0.32 },
    { frequency: 640, duration: 0.055, gain: 0.3 },
    { frequency: 820, duration: 0.08, gain: 0.26 }
  ]),
  leave: createToneDataUri([
    { frequency: 520, duration: 0.045, gain: 0.28 },
    { frequency: 330, duration: 0.08, gain: 0.28 }
  ]),
  message: createToneDataUri([
    { frequency: 720, duration: 0.035, gain: 0.24 },
    { frequency: 900, duration: 0.04, gain: 0.2 }
  ])
};

export function useUiFeedback() {
  const options = { volume: SOUND_VOLUME, interrupt: true };
  const [playClick] = useSound(sounds.click, options);
  const [playToggle] = useSound(sounds.toggle, options);
  const [playSuccess] = useSound(sounds.success, options);
  const [playError] = useSound(sounds.error, { ...options, volume: 0.22 });
  const [playJoin] = useSound(sounds.join, { ...options, volume: 0.24 });
  const [playLeave] = useSound(sounds.leave, { ...options, volume: 0.22 });
  const [playMessage] = useSound(sounds.message, { ...options, volume: 0.2 });

  return {
    playClick,
    playToggle,
    playSuccess,
    playError,
    playJoin,
    playLeave,
    playMessage
  };
}

function createToneDataUri(notes) {
  if (typeof btoa !== 'function') {
    return SILENT_WAV;
  }

  const sampleRate = 44100;
  const gapSamples = Math.floor(sampleRate * 0.018);
  const samples = [];

  for (const note of notes) {
    const noteSamples = Math.floor(sampleRate * note.duration);

    for (let index = 0; index < noteSamples; index += 1) {
      const progress = index / noteSamples;
      const envelope = Math.sin(Math.PI * progress);
      const value =
        Math.sin((2 * Math.PI * note.frequency * index) / sampleRate) *
        envelope *
        note.gain;

      samples.push(value);
    }

    for (let index = 0; index < gapSamples; index += 1) {
      samples.push(0);
    }
  }

  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (const sample of samples) {
    const clampedSample = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clampedSample * 0x7fff, true);
    offset += 2;
  }

  return `data:audio/wav;base64,${arrayBufferToBase64(buffer)}`;
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
