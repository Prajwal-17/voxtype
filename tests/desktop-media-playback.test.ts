import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReleaseMediaSource, releaseMediaElement } from '../apps/desktop/src/lib/media-playback';

// WebKitGTK only unregisters its MPRIS player after the element reports a fatal media error.
function fakeAudio() {
  const calls: string[] = [];
  let source = 'blob:recording';
  const element = {
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      calls.push(`set:src:${value}`);
    },
    get currentSrc() {
      return source;
    },
    paused: false,
    pause() {
      calls.push('pause');
      this.paused = true;
    },
    removeAttribute(name: string) {
      calls.push(`remove:${name}`);
      source = '';
    },
    load() {
      calls.push('load');
    },
  };
  return { element: element as unknown as HTMLMediaElement, calls };
}

test('releasing playback pauses, clears, then loads an empty local audio resource', () => {
  const { element, calls } = fakeAudio();
  assert.equal(isReleaseMediaSource(element), false);
  releaseMediaElement(element);
  assert.equal(calls.length, 4);
  assert.equal(calls[0], 'pause');
  assert.equal(calls[1], 'remove:src');
  assert.match(calls[2] ?? '', /^set:src:blob:/);
  assert.equal(calls[3], 'load');
  assert.match(element.src, /^blob:/);
  assert.notEqual(element.src, 'blob:recording');
  assert.equal(element.paused, true);
  assert.equal(isReleaseMediaSource(element), true);
});

test('the release resource is reused so repeated player cleanup cannot leak blob URLs', () => {
  const first = fakeAudio();
  const second = fakeAudio();
  releaseMediaElement(first.element);
  releaseMediaElement(second.element);
  assert.equal(first.element.src, second.element.src);
  assert.equal(isReleaseMediaSource(first.element), true);
  assert.equal(isReleaseMediaSource(second.element), true);
});

test('a recording source is never mistaken for the release resource', () => {
  const { element } = fakeAudio();
  releaseMediaElement(element);
  element.src = 'blob:another-recording';
  assert.equal(isReleaseMediaSource(element), false);
});
