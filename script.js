const state = {
  armed: false,
  mode: "idle",
  previousFrame: null,
  rafId: null,
  lastAlertAt: 0,
  events: [],
  demoStart: 0,
  demoFrame: 0,
  snapshotUrl: "",
  snapshotTimer: null,
  snapshotReady: false,
  snapshotFailures: 0,
};

const els = {
  feedFrame: document.querySelector("#feedFrame"),
  video: document.querySelector("#cameraVideo"),
  snapshotImage: document.querySelector("#snapshotImage"),
  simCanvas: document.querySelector("#simCanvas"),
  analysisCanvas: document.querySelector("#analysisCanvas"),
  detectionBox: document.querySelector("#detectionBox"),
  systemDot: document.querySelector("#systemDot"),
  systemStatus: document.querySelector("#systemStatus"),
  systemDetail: document.querySelector("#systemDetail"),
  feedTitle: document.querySelector("#feedTitle"),
  confidenceReadout: document.querySelector("#confidenceReadout"),
  motionReadout: document.querySelector("#motionReadout"),
  lastSeen: document.querySelector("#lastSeen"),
  armButton: document.querySelector("#armButton"),
  browserCameraButton: document.querySelector("#browserCameraButton"),
  demoButton: document.querySelector("#demoButton"),
  streamInput: document.querySelector("#streamInput"),
  connectStreamButton: document.querySelector("#connectStreamButton"),
  sensitivitySlider: document.querySelector("#sensitivitySlider"),
  sensitivityValue: document.querySelector("#sensitivityValue"),
  cooldownSlider: document.querySelector("#cooldownSlider"),
  cooldownValue: document.querySelector("#cooldownValue"),
  groundZoneToggle: document.querySelector("#groundZoneToggle"),
  notifyToggle: document.querySelector("#notifyToggle"),
  snapshotButton: document.querySelector("#snapshotButton"),
  clearEventsButton: document.querySelector("#clearEventsButton"),
  eventList: document.querySelector("#eventList"),
};

const simCtx = els.simCanvas.getContext("2d");
const analysisCtx = els.analysisCanvas.getContext("2d", { willReadFrequently: true });

function setStatus(status, detail, tone = "idle") {
  els.systemStatus.textContent = status;
  els.systemDetail.textContent = detail;
  els.systemDot.classList.toggle("armed", tone === "armed");
  els.systemDot.classList.toggle("alert", tone === "alert");
}

function setMode(mode) {
  state.mode = mode;
  els.feedFrame.classList.toggle("has-video", mode === "camera" || mode === "stream");
  els.feedFrame.classList.toggle("has-snapshot", mode === "snapshot");
  els.feedFrame.classList.toggle("has-demo", mode === "demo");
  state.previousFrame = null;
  state.snapshotReady = false;
  if (mode !== "snapshot") stopSnapshotPolling();
}

function stopVideoTracks() {
  const stream = els.video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    els.video.srcObject = null;
  }
  if (els.video.src) {
    els.video.removeAttribute("src");
    els.video.load();
  }
}

function stopSnapshotPolling() {
  if (state.snapshotTimer) {
    clearInterval(state.snapshotTimer);
    state.snapshotTimer = null;
  }
}

async function useBrowserCamera() {
  stopVideoTracks();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    els.video.srcObject = stream;
    await els.video.play();
    setMode("camera");
    els.feedTitle.textContent = "Browser camera";
    setStatus(state.armed ? "Armed" : "Camera ready", "Watching local browser camera", state.armed ? "armed" : "idle");
  } catch (error) {
    setStatus("Camera blocked", "Allow camera access or use the demo feed", "alert");
  }
}

async function connectStream() {
  const url = els.streamInput.value.trim();
  if (!url) {
    setStatus("Missing URL", "Paste an HTTPS, MP4, or HLS stream URL", "alert");
    return;
  }
  if (isSnapshotUrl(url)) {
    connectSnapshot(url);
    return;
  }
  stopVideoTracks();
  els.video.src = url;
  els.video.muted = true;
  els.video.playsInline = true;
  try {
    await els.video.play();
    setMode("stream");
    els.feedTitle.textContent = "Door camera stream";
    setStatus(state.armed ? "Armed" : "Stream ready", "Connected to camera URL", state.armed ? "armed" : "idle");
  } catch (error) {
    setMode("idle");
    setStatus("Stream unavailable", "This browser may need an HLS bridge for that camera", "alert");
  }
}

function isSnapshotUrl(url) {
  return url.includes("/api/camera_proxy/") || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function normalizeSnapshotUrl(url) {
  return url.replace(/(:\d+)\/+api\//, "$1/api/");
}

function proxiedSnapshotUrl(url) {
  return `/proxy-snapshot?url=${encodeURIComponent(url)}&cacheBust=${Date.now()}`;
}

function connectSnapshot(url) {
  stopVideoTracks();
  stopSnapshotPolling();
  state.snapshotUrl = normalizeSnapshotUrl(url);
  state.snapshotFailures = 0;
  setMode("snapshot");
  els.feedTitle.textContent = "Home Assistant snapshots";
  setStatus("Connecting snapshot", "Polling Home Assistant camera image", "idle");
  pollSnapshot();
  state.snapshotTimer = setInterval(pollSnapshot, 1500);
}

function pollSnapshot() {
  if (!state.snapshotUrl) return;
  const nextUrl = proxiedSnapshotUrl(state.snapshotUrl);
  const probe = new Image();
  probe.onload = () => {
    els.snapshotImage.src = nextUrl;
    state.snapshotReady = true;
    state.snapshotFailures = 0;
    setStatus(state.armed ? "Armed" : "Snapshot ready", "Polling Home Assistant snapshot feed", state.armed ? "armed" : "idle");
  };
  probe.onerror = () => {
    state.snapshotReady = false;
    state.snapshotFailures += 1;
    setStatus("Snapshot unavailable", "Check the Home Assistant token URL", "alert");
    if (state.snapshotFailures >= 5) {
      stopSnapshotPolling();
      setStatus("Snapshot stopped", "Home Assistant returned errors. Paste the current entity_picture URL.", "alert");
    }
  };
  probe.src = nextUrl;
}

function useDemoFeed() {
  stopVideoTracks();
  state.demoStart = performance.now();
  state.demoFrame = 0;
  setMode("demo");
  els.feedTitle.textContent = "Demo porch feed";
  setStatus(state.armed ? "Armed" : "Demo ready", "Synthetic porch scene with squirrel pass", state.armed ? "armed" : "idle");
}

function drawDemoFrame(now) {
  const w = els.simCanvas.width;
  const h = els.simCanvas.height;
  const t = (now - state.demoStart) / 1000;
  const squirrelX = ((t * 92) % (w + 320)) - 190;
  const hop = Math.sin(t * 7) * 8;

  const sky = simCtx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#8fa792");
  sky.addColorStop(0.52, "#62735d");
  sky.addColorStop(1, "#354233");
  simCtx.fillStyle = sky;
  simCtx.fillRect(0, 0, w, h);

  simCtx.fillStyle = "#44513f";
  simCtx.fillRect(0, h * 0.52, w, h * 0.48);
  simCtx.fillStyle = "#6d725f";
  simCtx.fillRect(0, h * 0.7, w, h * 0.3);

  simCtx.fillStyle = "#2f3a2e";
  simCtx.fillRect(90, 118, 310, 322);
  simCtx.fillStyle = "#b67a45";
  simCtx.fillRect(420, 182, 118, 258);
  simCtx.fillStyle = "#253025";
  simCtx.fillRect(455, 245, 52, 195);

  simCtx.fillStyle = "rgba(21, 30, 22, 0.24)";
  simCtx.fillRect(0, h * 0.67, w, 18);
  simCtx.fillStyle = "#d9ddcf";
  for (let x = 0; x < w; x += 116) {
    simCtx.fillRect(x, h * 0.74, 70, 8);
  }

  simCtx.save();
  simCtx.translate(squirrelX, h * 0.72 + hop);
  simCtx.fillStyle = "rgba(0, 0, 0, 0.2)";
  simCtx.beginPath();
  simCtx.ellipse(85, 76, 92, 17, 0, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.fillStyle = "#7b4e2e";
  simCtx.beginPath();
  simCtx.ellipse(84, 44, 66, 34, -0.05, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.beginPath();
  simCtx.ellipse(150, 35, 29, 25, 0.1, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.beginPath();
  simCtx.ellipse(28, 10, 34, 74, -0.45, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.strokeStyle = "#7b4e2e";
  simCtx.lineWidth = 20;
  simCtx.beginPath();
  simCtx.arc(22, -18, 58, 0.8, 4.7);
  simCtx.stroke();
  simCtx.fillStyle = "#2a1a12";
  simCtx.beginPath();
  simCtx.arc(160, 28, 4, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.fillStyle = "#4b2b1d";
  simCtx.fillRect(58, 70, 18, 36);
  simCtx.fillRect(113, 66, 16, 34);
  simCtx.restore();
}

function getFrameSource() {
  if (state.mode === "demo") return els.simCanvas;
  if (state.mode === "snapshot" && state.snapshotReady && els.snapshotImage.complete) return els.snapshotImage;
  if ((state.mode === "camera" || state.mode === "stream") && els.video.readyState >= 2) return els.video;
  return null;
}

function scoreFrame(source) {
  const w = 192;
  const h = 108;
  analysisCtx.drawImage(source, 0, 0, w, h);
  const frame = analysisCtx.getImageData(0, 0, w, h).data;
  let motionPixels = 0;
  let warmPixels = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  const useGroundZone = els.groundZoneToggle.checked;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const idx = (y * w + x) * 4;
      const r = frame[idx];
      const g = frame[idx + 1];
      const b = frame[idx + 2];
      const lowZone = !useGroundZone || y > h * 0.42;
      const warmBrown = r > 72 && r < 190 && g > 38 && g < 140 && b < 105 && r > g * 1.12 && g > b * 0.95;

      let moved = false;
      if (state.previousFrame) {
        const diff =
          Math.abs(r - state.previousFrame[idx]) +
          Math.abs(g - state.previousFrame[idx + 1]) +
          Math.abs(b - state.previousFrame[idx + 2]);
        moved = diff > 58;
      }

      if (lowZone && moved) {
        motionPixels += 1;
      }

      if (lowZone && warmBrown && (moved || state.mode === "demo")) {
        warmPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  state.previousFrame = new Uint8ClampedArray(frame);
  const sampleCount = (w / 2) * (h / 2);
  const motionScore = Math.min(100, Math.round((motionPixels / sampleCount) * 340));
  const colorScore = Math.min(100, Math.round((warmPixels / sampleCount) * 980));
  const confidence = Math.max(0, Math.min(99, Math.round(motionScore * 0.42 + colorScore * 0.76)));
  const box =
    warmPixels > 12
      ? {
          left: (minX / w) * 100,
          top: (minY / h) * 100,
          width: ((maxX - minX + 18) / w) * 100,
          height: ((maxY - minY + 18) / h) * 100,
        }
      : null;

  return { confidence, motionScore, box };
}

function updateDetectionBox(box, confidence) {
  const threshold = Number(els.sensitivitySlider.value);
  const visible = box && confidence >= Math.max(25, threshold - 20);
  els.detectionBox.classList.toggle("visible", Boolean(visible));
  if (!visible) return;
  els.detectionBox.style.left = `${Math.max(1, box.left - 2)}%`;
  els.detectionBox.style.top = `${Math.max(1, box.top - 5)}%`;
  els.detectionBox.style.width = `${Math.min(38, Math.max(14, box.width))}%`;
  els.detectionBox.style.height = `${Math.min(34, Math.max(12, box.height))}%`;
}

function maybeAlert(confidence, motionScore) {
  const threshold = Number(els.sensitivitySlider.value);
  const cooldown = Number(els.cooldownSlider.value) * 1000;
  const now = Date.now();
  if (!state.armed || confidence < threshold || now - state.lastAlertAt < cooldown) return;
  state.lastAlertAt = now;
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(now),
    time: new Date(),
    confidence,
    motionScore,
  };
  state.events.unshift(event);
  state.events = state.events.slice(0, 7);
  els.lastSeen.textContent = event.time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  setStatus("Squirrel detected", `${confidence}% confidence at the front door`, "alert");
  renderEvents();
  sendNotification(event);
}

function sendNotification(event) {
  if (!els.notifyToggle.checked || !("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("Squirrel Sentry", {
    body: `Possible squirrel at the door: ${event.confidence}% confidence.`,
  });
}

function renderEvents() {
  if (state.events.length === 0) {
    els.eventList.innerHTML = '<div class="event-row empty">No detections recorded yet.</div>';
    return;
  }

  els.eventList.innerHTML = state.events
    .map(
      (event) => `
        <article class="event-row">
          <div class="event-meta">
            <span class="event-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 13.8c0-4.5 3.6-8.1 8.1-8.1 3.5 0 6.4 2.2 7.6 5.3" /><path d="M8.2 18.8c1.1.7 2.5 1.1 3.9 1.1 2.7 0 5-1.4 6.3-3.6" /><path d="M13.6 11.1c.8.6 1.2 1.5 1.2 2.5 0 1.7-1.4 3.1-3.1 3.1h-1.2" /></svg>
            </span>
            <div class="event-copy">
              <strong>Possible squirrel at front door</strong>
              <span>${event.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} / Motion ${event.motionScore}%</span>
            </div>
          </div>
          <div class="event-confidence">${event.confidence}%</div>
        </article>
      `,
    )
    .join("");
}

function detectorLoop(now) {
  if (state.mode === "demo") drawDemoFrame(now);
  const source = getFrameSource();

  if (source && state.armed) {
    const { confidence, motionScore, box } = scoreFrame(source);
    els.confidenceReadout.textContent = `${confidence}%`;
    els.motionReadout.textContent = `${motionScore}%`;
    updateDetectionBox(box, confidence);
    maybeAlert(confidence, motionScore);
  } else {
    els.detectionBox.classList.remove("visible");
  }

  state.rafId = requestAnimationFrame(detectorLoop);
}

function toggleArmed() {
  state.armed = !state.armed;
  els.feedFrame.classList.toggle("is-armed", state.armed);
  els.armButton.classList.toggle("armed", state.armed);
  els.armButton.innerHTML = state.armed
    ? '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>Disarm detector'
    : '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.7 7 10 4-1.3 7-5.5 7-10V6z" /></svg>Arm detector';
  setStatus(state.armed ? "Armed" : "Standing by", state.armed ? "Analyzing incoming frames" : "Detection paused", state.armed ? "armed" : "idle");
}

function updateSliders() {
  els.sensitivityValue.textContent = els.sensitivitySlider.value;
  els.cooldownValue.textContent = `${els.cooldownSlider.value}s`;
}

function takeSnapshot() {
  const source = getFrameSource();
  if (!source) {
    setStatus("No frame available", "Connect a camera before taking a snapshot", "alert");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `squirrel-sentry-${Date.now()}.png`;
  link.click();
}

els.browserCameraButton.addEventListener("click", useBrowserCamera);
els.demoButton.addEventListener("click", useDemoFeed);
els.connectStreamButton.addEventListener("click", connectStream);
els.armButton.addEventListener("click", toggleArmed);
els.sensitivitySlider.addEventListener("input", updateSliders);
els.cooldownSlider.addEventListener("input", updateSliders);
els.snapshotButton.addEventListener("click", takeSnapshot);
els.clearEventsButton.addEventListener("click", () => {
  state.events = [];
  renderEvents();
});
els.notifyToggle.addEventListener("change", async () => {
  if (els.notifyToggle.checked && "Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
});

updateSliders();
renderEvents();
state.rafId = requestAnimationFrame(detectorLoop);
