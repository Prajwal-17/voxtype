/** Decode framed base64 without relying on native-event boundaries. */
export class PcmDecoder {
  private pending = '';
  private ended = false;
  constructor(private audio: (bytes: Uint8Array) => void, private end: () => void) {}
  push(chunk: string) {
    this.pending += chunk;
    let newline: number;
    while ((newline = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      if (this.ended) throw new Error('Audio arrived after capture completed.');
      if (line === 'FLOW_END') { this.ended = true; this.end(); continue; }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(line) || !line) {
        throw new Error('Invalid audio transport frame.');
      }
      const binary = atob(line);
      if (binary.length % 2) throw new Error('Incomplete 16-bit audio sample.');
      this.audio(Uint8Array.from(binary, char => char.charCodeAt(0)));
    }
    if (this.pending.length > 4096) throw new Error('Audio transport frame exceeded its limit.');
  }
  complete() {
    if (this.pending || !this.ended) throw new Error('Audio capture ended before its final frame.');
  }
}

export function pcmLevel(bytes: Uint8Array): number {
  const samples = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (samples.getInt16(i, true) / 32768) ** 2;
  return bytes.length ? Math.min(1, Math.sqrt(sum / (bytes.length / 2))) : 0;
}
