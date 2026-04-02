const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const qrEl = document.getElementById("qr");
const hostInput = document.getElementById("host-input");
const updateQrBtn = document.getElementById("update-qr");
const audioToggleBtn = document.getElementById("audio-toggle");

const socket = io({ path: `${getBasePath()}/socket.io` });

const state = {
  width: 960,
  height: 540,
  paddleWidth: 16,
  paddleHeight: 90,
  ballSize: 12,
  playerY: 200,
  aiY: 200,
  playerVel: 0,
  aiVel: 0,
  ballX: 0,
  ballY: 0,
  ballVX: 0,
  ballVY: 0,
  scoreLeft: 0,
  scoreRight: 0,
  serving: true,
};

let phoneDirection = 0;
let keyboardDirection = 0;
let controllerConnected = false;
let audioEnabled = false;
let audioReady = false;
let audioContext;
let ambientGain;
let ambientOsc;
let gameStarted = false;

const roomId = createRoomId();

statusEl.textContent = "WAITING FOR A PLAYER";

socket.on("connect", () => {
  socket.emit("host-join", { roomId });
});

socket.on("controller-status", ({ connected }) => {
  controllerConnected = connected;
  if (!connected) {
    statusEl.textContent = "WAITING FOR A PLAYER";
    gameStarted = false;
  } else if (!gameStarted) {
    statusEl.textContent = "PRESS START";
  }
  if (!connected) phoneDirection = 0;
});

socket.on("controller-input", ({ direction }) => {
  phoneDirection = clamp(direction || 0, -1, 1);
  if (!controllerConnected) {
    controllerConnected = true;
    if (!gameStarted) {
      statusEl.textContent = "PRESS START";
    }
  }
});

socket.on("controller-start", () => {
  if (!controllerConnected) return;
  gameStarted = true;
  statusEl.textContent = "GAME ON";
  resetPositions();
});

socket.on("controller-reset", () => {
  gameStarted = false;
  state.scoreLeft = 0;
  state.scoreRight = 0;
  updateScore();
  resetPositions();
  statusEl.textContent = controllerConnected ? "PRESS START" : "WAITING FOR A PLAYER";
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
    keyboardDirection = -1;
  }
  if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
    keyboardDirection = 1;
  }
});

window.addEventListener("keyup", (event) => {
  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "w" ||
    event.key === "W" ||
    event.key === "s" ||
    event.key === "S"
  ) {
    keyboardDirection = 0;
  }
});

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.width = rect.width;
  state.height = rect.height;
  state.paddleHeight = Math.max(70, rect.height * 0.18);
  state.paddleWidth = Math.max(12, rect.width * 0.015);
  state.ballSize = Math.max(10, rect.width * 0.012);
  resetPositions();
}

window.addEventListener("resize", resize);

function resetPositions() {
  state.playerY = (state.height - state.paddleHeight) / 2;
  state.aiY = (state.height - state.paddleHeight) / 2;
  resetBall(Math.random() > 0.5 ? 1 : -1);
}

function resetBall(direction) {
  state.ballX = state.width / 2;
  state.ballY = state.height / 2;
  const baseSpeed = Math.max(260, state.width * 0.35);
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
  state.ballVX = Math.cos(angle) * baseSpeed * direction;
  state.ballVY = Math.sin(angle) * baseSpeed;
  state.serving = true;
  playTone(420, 0.08, 0.15);
  setTimeout(() => {
    state.serving = false;
  }, 600);
}

function update(dt) {
  if (!gameStarted) return;
  const playerSpeed = Math.max(320, state.height * 0.9);
  const aiSpeed = playerSpeed * 0.75;

  const combinedDirection = clamp(phoneDirection + keyboardDirection, -1, 1);
  state.playerVel = combinedDirection * playerSpeed;
  state.playerY = clamp(
    state.playerY + state.playerVel * dt,
    0,
    state.height - state.paddleHeight
  );

  const aiTarget =
    state.ballVX > 0 ? state.ballY - state.paddleHeight / 2 : state.height / 2;
  const aiDiff = aiTarget - state.aiY;
  const aiDir = Math.abs(aiDiff) > 10 ? Math.sign(aiDiff) : 0;
  state.aiVel = aiDir * aiSpeed;
  state.aiY = clamp(
    state.aiY + state.aiVel * dt,
    0,
    state.height - state.paddleHeight
  );

  if (state.serving) return;

  state.ballX += state.ballVX * dt;
  state.ballY += state.ballVY * dt;

  if (state.ballY - state.ballSize / 2 <= 0 || state.ballY + state.ballSize / 2 >= state.height) {
    state.ballVY *= -1;
  }

  const leftX = 30;
  const rightX = state.width - 30 - state.paddleWidth;

  if (
    state.ballX - state.ballSize / 2 <= leftX + state.paddleWidth &&
    state.ballY >= state.playerY &&
    state.ballY <= state.playerY + state.paddleHeight
  ) {
    state.ballX = leftX + state.paddleWidth + state.ballSize / 2;
    state.ballVX = Math.abs(state.ballVX) * 1.03;
    state.ballVY += state.playerVel * 0.15;
    playTone(720, 0.05, 0.12);
  }

  if (
    state.ballX + state.ballSize / 2 >= rightX &&
    state.ballY >= state.aiY &&
    state.ballY <= state.aiY + state.paddleHeight
  ) {
    state.ballX = rightX - state.ballSize / 2;
    state.ballVX = -Math.abs(state.ballVX) * 1.03;
    state.ballVY += state.aiVel * 0.12;
    playTone(640, 0.05, 0.12);
  }

  if (state.ballX < -50) {
    state.scoreRight += 1;
    updateScore();
    playTone(260, 0.12, 0.2);
    resetBall(1);
  }

  if (state.ballX > state.width + 50) {
    state.scoreLeft += 1;
    updateScore();
    playTone(260, 0.12, 0.2);
    resetBall(-1);
  }
}

function render() {
  ctx.clearRect(0, 0, state.width, state.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.strokeStyle = "rgba(0, 75, 141, 0.25)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(state.width / 2, 20);
  ctx.lineTo(state.width / 2, state.height - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  drawGlowRect(30, state.playerY, state.paddleWidth, state.paddleHeight, "#004b8d");
  drawGlowRect(
    state.width - 30 - state.paddleWidth,
    state.aiY,
    state.paddleWidth,
    state.paddleHeight,
    "#ff6200"
  );

  drawGlowRect(
    state.ballX - state.ballSize / 2,
    state.ballY - state.ballSize / 2,
    state.ballSize,
    state.ballSize,
    "#ffd200"
  );
}

function drawGlowRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;
}

function updateScore() {
  scoreEl.textContent = `${state.scoreLeft} : ${state.scoreRight}`;
}

function ensureAudio() {
  if (audioReady) return true;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  audioContext = new AudioContext();
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = 0.02;
  ambientGain.connect(audioContext.destination);
  ambientOsc = audioContext.createOscillator();
  ambientOsc.type = "sawtooth";
  ambientOsc.frequency.value = 72;
  ambientOsc.connect(ambientGain);
  ambientOsc.start();
  audioReady = true;
  return true;
}

function playTone(frequency, duration, gainValue) {
  if (!audioEnabled || !audioReady) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "square";
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

audioToggleBtn.addEventListener("click", async () => {
  if (!audioReady) {
    const ok = ensureAudio();
    if (!ok) return;
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  audioEnabled = !audioEnabled;
  ambientGain.gain.value = audioEnabled ? 0.02 : 0;
  audioToggleBtn.textContent = audioEnabled ? "Audio: On" : "Audio: Off";
});

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBaseUrl(raw) {
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function getDefaultBaseUrl() {
  const { origin, pathname } = window.location;
  const trimmedPath = pathname.replace(/\/(game|controller)\/?$/, "");
  if (!trimmedPath) return origin;
  return origin + trimmedPath.replace(/\/+$/, "");
}

function getBasePath() {
  const { pathname } = window.location;
  return pathname.replace(/\/(game|controller)\/?$/, "").replace(/\/+$/, "");
}

function buildControllerUrl(host) {
  const base = normalizeBaseUrl(host) || getDefaultBaseUrl();
  return `${base}/controller?room=${roomId}`;
}

function renderQr() {
  const hostValue = hostInput.value.trim();
  const url = buildControllerUrl(hostValue);
  qrEl.innerHTML = "";
  QRCode.toCanvas(
    url,
    {
      width: 200,
      margin: 1,
      color: {
        dark: "#00d4ff",
        light: "#05070f",
      },
    },
    (error, canvasEl) => {
      if (error) {
        qrEl.textContent = "QR failed";
        return;
      }
      qrEl.appendChild(canvasEl);
    }
  );
}

updateQrBtn.addEventListener("click", renderQr);

hostInput.value = getDefaultBaseUrl();
renderQr();
resize();
updateScore();

let lastTime = 0;
function loop(time) {
  const dt = Math.min(0.016, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
