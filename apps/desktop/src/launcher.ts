import { events, os } from '@neutralinojs/lib';
import { parseLauncherCommand, type LauncherCommand } from './commands.ts';

interface ProcessEvent { id: number; action: string; data: string | number }

/**
 * A tiny Linux-only command bridge. The installed flow script writes one
 * action to this private FIFO; cat keeps one reader attached to the existing
 * Neutralino process. No second webview or background server is created.
 */
export class LauncherBridge {
  private processId: number | undefined;
  private output = '';
  private closed = false;
  private listener?: (event: CustomEvent<ProcessEvent>) => void;

  async start(onCommand: (command: LauncherCommand) => void) {
    if (!('NL_OS' in window)) return;
    const runtime = await os.getEnv('XDG_RUNTIME_DIR');
    if (!runtime) return;
    const setup = await os.execCommand(
      'mkdir -p -m 700 "$XDG_RUNTIME_DIR/flow" && rm -f "$XDG_RUNTIME_DIR/flow/commands" && mkfifo -m 600 "$XDG_RUNTIME_DIR/flow/commands"',
    );
    if (setup.exitCode !== 0) throw new Error(setup.stdErr.trim() || 'Could not create Flow launcher channel.');
    this.listener = event => {
      if (event.detail.id !== this.processId) return;
      if (event.detail.action === 'stdOut') {
        this.output += String(event.detail.data);
        const lines = this.output.split('\n');
        this.output = lines.pop() ?? '';
        for (const line of lines) {
          const command = parseLauncherCommand(line);
          if (command) onCommand(command);
        }
      } else if (event.detail.action === 'exit') {
        this.processId = undefined;
        if (!this.closed) setTimeout(() => { void this.spawnReader(); }, 50);
      }
    };
    await events.on('spawnedProcess', this.listener);
    await this.spawnReader();
  }

  async stop() {
    this.closed = true;
    if (this.processId !== undefined) await os.updateSpawnedProcess(this.processId, 'exit').catch(() => {});
    this.processId = undefined;
    if (this.listener) await events.off('spawnedProcess', this.listener).catch(() => {});
    await os.execCommand('rm -f "$XDG_RUNTIME_DIR/flow/commands"').catch(() => {});
  }

  private async spawnReader() {
    if (this.closed || this.processId !== undefined) return;
    try {
      const process = await os.spawnProcess('exec cat "$XDG_RUNTIME_DIR/flow/commands"');
      if (this.closed) {
        await os.updateSpawnedProcess(process.id, 'exit').catch(() => {});
        return;
      }
      this.processId = process.id;
    } catch {
      if (!this.closed) setTimeout(() => { void this.spawnReader(); }, 500);
    }
  }
}
