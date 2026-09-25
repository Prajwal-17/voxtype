/**
 * Holds microphone PCM until a streaming destination is ready.
 *
 * The queue is deliberately bounded. A disconnected socket must never make a
 * dictation session grow without limit, especially when the user leaves the
 * microphone running while their network is offline.
 */
export class AudioBufferQueue {
  private readonly chunks: Uint8Array[] = [];
  private bytes = 0;
  private sender: ((bytes: Uint8Array) => void) | undefined;

  constructor(private readonly maxBytes = 512_000) {}

  get bufferedBytes() { return this.bytes; }
  get isOpen() { return this.sender !== undefined; }

  push(bytes: Uint8Array) {
    if (this.sender) {
      this.sender(bytes);
      return;
    }
    if (this.bytes + bytes.byteLength > this.maxBytes) {
      throw new Error('Deepgram is taking too long to connect. Stop and retry.');
    }
    this.chunks.push(bytes);
    this.bytes += bytes.byteLength;
  }

  open(sender: (bytes: Uint8Array) => void) {
    if (this.sender) throw new Error('Audio stream is already connected.');
    this.sender = sender;
    try {
      for (const chunk of this.chunks) sender(chunk);
    } catch (error) {
      this.clear();
      throw error;
    }
    this.clear();
  }

  clear() {
    this.chunks.length = 0;
    this.bytes = 0;
  }
}
