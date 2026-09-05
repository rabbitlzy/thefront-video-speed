(() => {
  "use strict";
  let speed = 1.5;
  let enabled = true;
  const videos = new Set();
  const original = new WeakMap();
  const roots = new WeakSet();
  const observers = [];
  const rateSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate").set;
  const defaultSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "defaultPlaybackRate").set;

  function setRate(video, rate, defaultRate = rate) {
    try {
      if (video.defaultPlaybackRate !== defaultRate) defaultSetter.call(video, defaultRate);
      if (video.playbackRate !== rate) rateSetter.call(video, rate);
    } catch { /* A player may temporarily reject rate changes while loading. */ }
  }

  function apply(video) {
    if (enabled) setRate(video, speed);
  }

  function register(video) {
    if (videos.has(video)) return;
    videos.add(video);
    // WeakMap avoids duplicate listeners when the same video is reinserted.
    if (!original.has(video)) {
      original.set(video, { rate: video.playbackRate, defaultRate: video.defaultPlaybackRate });
      for (const event of ["play", "loadedmetadata", "emptied"]) {
        video.addEventListener(event, () => apply(video));
      }
    }
    apply(video);
  }

  function scan(root) {
    if (root.matches?.("video")) register(root);
    for (const video of root.querySelectorAll("video")) register(video);
    // Open shadow roots may contain custom web players.
    if (root.shadowRoot) watch(root.shadowRoot);
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) watch(element.shadowRoot);
    }
  }

  function watch(root) {
    if (!roots.has(root)) {
      roots.add(root);
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1) scan(node);
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
    }
    scan(root);
  }

  function update(settings) {
    const wasEnabled = enabled;
    enabled = settings.enabled !== false;
    speed = [1, 1.25, 1.5, 1.75, 2].includes(settings.speed) ? settings.speed : 1.5;
    for (const video of videos) {
      if (enabled) apply(video);
      else if (wasEnabled) {
        const saved = original.get(video);
        setRate(video, saved.rate, saved.defaultRate);
      }
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    update({
      enabled: changes.enabled ? changes.enabled.newValue : enabled,
      speed: changes.speed ? changes.speed.newValue : speed
    });
  });

  chrome.storage.local.get({ enabled: true, speed: 1.5 }).then(settings => {
    update(settings);
    watch(document);
    let ticks = 0;
    setInterval(() => {
      // Bounded retry avoids ratechange event loops if the site resets speed.
      for (const video of videos) {
        if (!video.isConnected) videos.delete(video);
        else apply(video);
      }
      if (++ticks % 4 === 0) scan(document);
    }, 750);
  }).catch(() => { /* Refresh the page if the extension was reloaded. */ });
})();
