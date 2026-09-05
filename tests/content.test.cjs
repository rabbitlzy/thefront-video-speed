const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../video-speed/content.js'), 'utf8');

async function setup(settings = {}) {
  class Media {
    constructor() { this.rate = 1; this.defaultRate = 1; this.isConnected = true; this.events = {}; }
    get playbackRate() { return this.rate; }
    set playbackRate(value) { this.rate = value; }
    get defaultPlaybackRate() { return this.defaultRate; }
    set defaultPlaybackRate(value) { this.defaultRate = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    matches(selector) { return selector === 'video'; }
    querySelectorAll() { return []; }
  }
  const video = new Media();
  const elements = [video];
  let tick, changed, mutation;
  vm.runInNewContext(source, {
    HTMLMediaElement: Media,
    document: { querySelectorAll: () => elements },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} },
    setInterval: callback => { tick = callback; },
    chrome: { storage: {
      local: { get: async defaults => ({ ...defaults, ...settings }) },
      onChanged: { addListener: callback => { changed = callback; } }
    } }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { video, Media, tick, changed, add(v) { elements.push(v); mutation([{ addedNodes: [Object.assign(v, { nodeType: 1 })] }]); } };
}

test('default speed applies without starting or seeking playback', async () => {
  const { video } = await setup();
  assert.equal(video.playbackRate, 1.5);
  assert.equal(video.defaultPlaybackRate, 1.5);
});
test('disabled setting leaves initial rate untouched', async () => {
  const { video, tick } = await setup({ enabled: false });
  tick();
  assert.equal(video.playbackRate, 1);
});
test('site reset is corrected by bounded retry', async () => {
  const { video, tick } = await setup();
  video.playbackRate = 1;
  tick();
  assert.equal(video.playbackRate, 1.5);
});
test('settings propagate; disabling restores rate and stops retries', async () => {
  const { video, changed, tick } = await setup();
  changed({ speed: { newValue: 2 } }, 'local');
  assert.equal(video.playbackRate, 2);
  changed({ enabled: { newValue: false } }, 'local');
  assert.equal(video.playbackRate, 1);
  video.playbackRate = 1.25;
  tick();
  assert.equal(video.playbackRate, 1.25);
  changed({ enabled: { newValue: true } }, 'local');
  assert.equal(video.playbackRate, 2);
});
test('new videos and reloaded metadata receive stored speed', async () => {
  const env = await setup({ speed: 1.75 });
  const next = new env.Media();
  env.add(next);
  assert.equal(next.playbackRate, 1.75);
  next.playbackRate = 1;
  next.events.loadedmetadata();
  assert.equal(next.playbackRate, 1.75);
});
test('invalid stored speed falls back and detached videos are released', async () => {
  const { video, tick } = await setup({ speed: 99 });
  assert.equal(video.playbackRate, 1.5);
  video.isConnected = false;
  video.playbackRate = 1;
  tick();
  assert.equal(video.playbackRate, 1);
});
