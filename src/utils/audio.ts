export function createWavFile(pcmBase64: string, sampleRate: number = 24000): string {
  const binary = atob(pcmBase64);
  const pcmLength = binary.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);

  const pcmBytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLength; i++) {
    pcmBytes[i] = binary.charCodeAt(i);
  }

  let wavBinary = '';
  const wavBytes = new Uint8Array(wavBuffer);
  for (let i = 0; i < wavBytes.byteLength; i++) {
    wavBinary += String.fromCharCode(wavBytes[i]);
  }
  return `data:audio/wav;base64,${btoa(wavBinary)}`;
}

export class AudioStreamer {
  audioContext: AudioContext | null = null;
  nextStartTime: number = 0;
  isPlaying: boolean = false;
  isStreamFinished: boolean = false;
  onEndedCallback: (() => void) | null = null;
  checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(onEnded: () => void) {
    this.onEndedCallback = onEnded;
  }

  async init() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.nextStartTime = this.audioContext.currentTime;
    this.isPlaying = true;

    this.checkInterval = setInterval(() => {
      if (this.audioContext && this.isPlaying && this.isStreamFinished) {
        if (this.audioContext.currentTime >= this.nextStartTime && this.nextStartTime > 0) {
          this.stop();
          if (this.onEndedCallback) this.onEndedCallback();
        }
      }
    }, 100);
  }

  addChunk(base64PCM: string) {
    if (!this.audioContext || !this.isPlaying) return;

    const binary = atob(base64PCM);
    const length = binary.length / 2;
    const audioBuffer = this.audioContext.createBuffer(1, length, 24000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const low = binary.charCodeAt(i * 2);
      const high = binary.charCodeAt(i * 2 + 1);
      let sample = (high << 8) | low;
      if (sample >= 0x8000) sample -= 0x10000;
      channelData[i] = sample / 0x8000;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }

  markFinished() {
    this.isStreamFinished = true;
  }

  pause() {
    this.stop();
  }

  stop() {
    this.isPlaying = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
