import { PcmDecoder } from './pcm.ts';

export interface ProcessEvent { id: number; action: string; data: string | number }
export interface ProcessBridge {
  listen(handler: (event: ProcessEvent) => void): Promise<() => Promise<void>>;
  spawn(command: string): Promise<{ id: number }>;
  update(id: number, action: 'stdIn' | 'exit', data?: string): Promise<unknown>;
}
const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

/** Owns a single short-lived capture process, including asynchronous startup. */
export class ParecCapture {
  private id: number | undefined;
  private unlisten: (() => Promise<void>) | undefined;
  private stopping = false;
  private discard = false;
  private settled = false;
  private started = false;
  private stopSent = false;
  private stderr = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settle!: (error?: Error) => void;
  private done = new Promise<Error | undefined>(resolve => { this.settle = resolve; });
  private decoder: PcmDecoder;

  constructor(private bridge: ProcessBridge, private script: string,
    private onAudio: (bytes: Uint8Array) => void, private onError: (error: Error) => void) {
    this.decoder = new PcmDecoder(bytes => { if (!this.discard) this.onAudio(bytes); }, () => {});
  }
  async start() {
    if (this.started) throw new Error('Capture already started.');
    this.started = true;
    try {
      this.unlisten = await this.bridge.listen(event => this.receive(event));
      const process = await this.bridge.spawn(`exec bash -c ${quote(this.script)}`);
      this.id = process.id;
      if (this.settled) { await this.bridge.update(process.id, 'exit').catch(() => {}); await this.unlisten?.(); return; }
      if (this.stopping) await this.sendStop();
      else await this.bridge.update(process.id, 'stdIn', 'start\n');
    } catch {
      await this.forceKill();
      this.finish(new Error('Could not start Linux audio capture. Check the Neutralino process permissions.'));
    }
  }
  async stop(discard = false): Promise<void> {
    this.discard ||= discard;
    if (!this.settled && !this.stopping) {
      this.stopping = true;
      this.timer = setTimeout(() => {
        void this.forceKill().finally(() => this.finish(new Error('Audio capture did not stop in time.')));
      }, 3000);
      if (this.id !== undefined) void this.sendStop();
    }
    const error = await this.done;
    if (error) throw error;
  }
  private async sendStop() {
    if (this.stopSent || this.id === undefined) return;
    this.stopSent = true;
    try { await this.bridge.update(this.id, 'stdIn', 'stop\n'); }
    catch { await this.forceKill(); this.finish(new Error('Could not stop audio capture cleanly.')); }
  }
  private async forceKill() {
    if (this.id !== undefined) await this.bridge.update(this.id, 'exit').catch(() => {});
  }
  private receive(event: ProcessEvent) {
    if (event.id !== this.id || this.settled) return;
    try {
      if (event.action === 'stdOut') this.decoder.push(String(event.data));
      else if (event.action === 'stdErr') this.stderr = (this.stderr + String(event.data)).slice(-1024);
      else if (event.action === 'exit') {
        if (Number(event.data) !== 0 || !this.stopping) {
          throw new Error(this.stderr.trim() || 'Audio capture exited unexpectedly. Check Ubuntu Sound input.');
        }
        this.decoder.complete(); this.finish();
      }
    } catch (error) {
      void this.forceKill();
      this.finish(error instanceof Error ? error : new Error('Audio transport failed.'));
    }
  }
  private finish(error?: Error) {
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.timer);
    void this.unlisten?.().catch(() => {});
    this.settle(error);
    if (error && !this.discard) this.onError(error);
  }
}
