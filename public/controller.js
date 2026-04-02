const statusEl = document.getElementById("controller-status");
const touchpad = document.getElementById("touchpad");
const indicator = document.getElementById("touch-indicator");
const motionToggleBtn = document.getElementById("motion-toggle");
const motionCalibrateBtn = document.getElementById("motion-calibrate");
const motionStatusEl = document.getElementById("motion-status");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");

const params = new URLSearchParams(window.location.search);
const rawRoom = params.get("room") || "";
const roomId = rawRoom.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();

const socket = io();

let currentDirection = 0;
let pointerActive = false;
let motionEnabled = false;
let motionListenerActive = false;
let motionBaseline = 0;
let motionFiltered = 0;
let lastTilt = null;
let wakeLock;

const deadZone = 0.08;
const motionDeadZone = 7;
const motionMax = 35;
const motionSmoothing = 0.12;

function setStatus(text) {
  statusEl.textContent = text;
}

function setMotionStatus(text) {
  if (!motionStatusEl) return;
  motionStatusEl.textContent = text;
}

function setCalibrateVisible(visible) {
  if (!motionCalibrateBtn) return;
  motionCalibrateBtn.classList.toggle("is-hidden", !visible);
}

if (!roomId) {
  setStatus("Missing or invalid room id");
} else {
  setStatus("Connecting...");
}

function sendDirection(direction) {
  if (!roomId) return;
  const next = Math.max(-1, Math.min(1, direction));
  if (next === currentDirection) return;
  currentDirection = next;
  socket.emit("controller-input", { roomId, direction: currentDirection });
}

function sendStart() {
  if (!roomId) return;
  socket.emit("controller-start", { roomId });
  requestWakeLock();
}

function sendReset() {
  if (!roomId) return;
  socket.emit("controller-reset", { roomId });
  releaseWakeLock();
}

function setIndicatorFromOffset(offset, rect) {
  const baseRect = rect || touchpad.getBoundingClientRect();
  const indicatorY = offset * baseRect.height * 0.6;
  indicator.style.transform = `translate(-50%, ${indicatorY}px)`;
  indicator.style.opacity = "1";
}

function updateFromPointer(event) {
  if (motionEnabled) return;
  const rect = touchpad.getBoundingClientRect();
  const clampedY = Math.max(rect.top, Math.min(rect.bottom, event.clientY));
  const normalized = (clampedY - rect.top) / rect.height;
  const offset = normalized - 0.5;
  let direction = 0;
  if (Math.abs(offset) > deadZone) {
    direction = offset > 0 ? 1 : -1;
  }
  sendDirection(direction);
  setIndicatorFromOffset(offset, rect);
}

touchpad.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pointerActive = true;
  touchpad.setPointerCapture(event.pointerId);
  updateFromPointer(event);
});

touchpad.addEventListener("pointermove", (event) => {
  if (!pointerActive) return;
  updateFromPointer(event);
});

function releasePointer() {
  pointerActive = false;
  if (!motionEnabled) {
    sendDirection(0);
    indicator.style.transform = "translate(-50%, 0px)";
    indicator.style.opacity = "0.7";
  }
}

touchpad.addEventListener("pointerup", releasePointer);
touchpad.addEventListener("pointercancel", releasePointer);
touchpad.addEventListener("pointerleave", releasePointer);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) sendDirection(0);
  if (document.hidden) releaseWakeLock();
});

async function requestWakeLock() {
  if (!navigator.wakeLock || !navigator.wakeLock.request) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (error) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.release();
  wakeLock = null;
}

function updateMotionToggle() {
  if (!motionToggleBtn) return;
  motionToggleBtn.textContent = motionEnabled ? "Motion: On" : "Motion: Off";
}

function handleOrientation(event) {
  if (typeof event.beta === "number") {
    lastTilt = event.beta;
  }

  if (!motionEnabled) return;

  if (typeof event.beta !== "number") return;
  const raw = event.beta - motionBaseline;

  motionFiltered = motionFiltered * (1 - motionSmoothing) + raw * motionSmoothing;
  let direction = 0;
  if (Math.abs(motionFiltered) > motionDeadZone) {
    direction = motionFiltered > 0 ? 1 : -1;
  }

  sendDirection(direction);
  const normalized = Math.max(-1, Math.min(1, motionFiltered / motionMax));
  setIndicatorFromOffset(normalized);
}

async function enableMotion() {
  if (typeof DeviceOrientationEvent === "undefined") {
    setMotionStatus("Motion not supported");
    return false;
  }

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        setMotionStatus("Motion permission denied");
        return false;
      }
    } catch (error) {
      setMotionStatus("Motion permission failed");
      return false;
    }
  }

  if (!motionListenerActive) {
    window.addEventListener("deviceorientation", handleOrientation);
    motionListenerActive = true;
  }

  motionEnabled = true;
  updateMotionToggle();
  setMotionStatus("Motion control active");
  setCalibrateVisible(true);
  return true;
}

function disableMotion() {
  motionEnabled = false;
  updateMotionToggle();
  setMotionStatus("Motion control off");
  setCalibrateVisible(false);
  sendDirection(0);
  indicator.style.transform = "translate(-50%, 0px)";
  indicator.style.opacity = "0.7";
}

function calibrateMotion() {
  if (lastTilt !== null) {
    motionBaseline = lastTilt;
    motionFiltered = 0;
    setMotionStatus("Motion calibrated");
    return;
  }

  setMotionStatus("Tilt phone to calibrate");
}

if (motionToggleBtn) {
  if (typeof DeviceOrientationEvent === "undefined") {
    motionToggleBtn.disabled = true;
    motionToggleBtn.textContent = "Motion: N/A";
    setMotionStatus("Motion not supported");
    setCalibrateVisible(false);
  } else {
    setMotionStatus("Motion control off");
    setCalibrateVisible(false);
    motionToggleBtn.addEventListener("click", async () => {
      if (motionEnabled) {
        disableMotion();
      } else {
        const ok = await enableMotion();
        if (ok) calibrateMotion();
      }
    });
  }
}

if (motionCalibrateBtn) {
  motionCalibrateBtn.addEventListener("click", () => {
    calibrateMotion();
  });
}

socket.on("connect", () => {
  if (!roomId) return;
  socket.emit("controller-join", { roomId });
  setStatus(`Connected to ${roomId}`);
});

socket.on("connect_error", () => {
  setStatus("Connection failed");
});

if (startBtn) {
  startBtn.addEventListener("click", () => {
    sendStart();
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    sendReset();
  });
}
