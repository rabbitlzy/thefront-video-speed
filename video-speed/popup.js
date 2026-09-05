"use strict";
const enabled = document.getElementById("enabled");
const speed = document.getElementById("speed");
const status = document.getElementById("status");
enabled.disabled = speed.disabled = true;
function showStatus() {
  status.textContent = enabled.checked ? `已设置 ${speed.value} 倍速` : "自动倍速已关闭";
}
chrome.storage.local.get({ enabled: true, speed: 1.5 }).then(settings => {
  enabled.checked = settings.enabled !== false;
  speed.value = String([1, 1.25, 1.5, 1.75, 2].includes(settings.speed) ? settings.speed : 1.5);
  enabled.disabled = speed.disabled = false;
  showStatus();
}).catch(() => { status.textContent = "设置读取失败，请重新打开插件。"; });
async function save() {
  enabled.disabled = speed.disabled = true;
  try {
    await chrome.storage.local.set({ enabled: enabled.checked, speed: Number(speed.value) });
    showStatus();
  } catch { status.textContent = "保存失败，请重试。"; }
  finally { enabled.disabled = speed.disabled = false; }
}
enabled.addEventListener("change", save);
speed.addEventListener("change", save);
