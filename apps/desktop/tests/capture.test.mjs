import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function run(t, mode, action = 'stop') {
  const dir = await mkdtemp(join(tmpdir(), 'flow-capture-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  // Test-only fake parec. Production uses the system utility, never Node.
  await writeFile(join(dir, 'parec'), `#!/usr/bin/env node\n${mode === 'fail' ? "process.stderr.write('Audio server unavailable\\n'); process.exit(1);" : `
process.stderr.write('TEST_PID=' + process.pid + '\\n');
process.stdout.write(Buffer.alloc(61440, 255));
process.on('SIGTERM', () => { process.stdout.write(Buffer.from([0,128]), () => process.exit(0)); });
setInterval(() => {}, 1000);
`}`, {mode: 0o755});
  const child = spawn('bash', ['src/audio/capture.sh'], {env: {...process.env, PATH: dir + ':' + process.env.PATH}});
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '', stderr = '', pid;
  child.stderr.on('data', data => { stderr += data; const match = stderr.match(/TEST_PID=(\d+)/); if (match) pid = Number(match[1]); });
  let requested = false;
  child.stdout.on('data', data => {
    output += data;
    if (!requested && mode !== 'fail') { requested = true; if (action === 'eof') child.stdin.end(); else child.stdin.write('stop\n'); }
  });
  const completed = once(child, 'close');
  child.stdin.write('start\n');
  const [code] = await completed;
  return { code, output, stderr, pid };
}
for (const action of ['stop', 'eof']) {
  test(`shell ${action} releases capture and flushes the final non-UTF8 samples`, {timeout: 5000}, async t => {
    const result = await run(t, 'audio', action);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.output.endsWith('FLOW_END\n'));
    assert.deepEqual(Buffer.from(result.output.replace('FLOW_END\n', ''), 'base64'), Buffer.concat([Buffer.alloc(61440, 255), Buffer.from([0,128])]));
    assert.ok(result.pid); assert.throws(() => process.kill(result.pid, 0), {code: 'ESRCH'});
  });
}
test('shell reports audio-server failure instead of claiming microphone success', {timeout: 5000}, async t => {
  const result = await run(t, 'fail');
  assert.notEqual(result.code, 0); assert.match(result.stderr, /Audio server unavailable/);
});
