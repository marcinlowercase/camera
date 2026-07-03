import "./style.css";
// IMPORT the sound. Vite will magically turn this variable into a working /assets/... path!
import shutterAudioUrl from "./assets/shutter.mp3";

const viewfinder = document.getElementById("viewfinder") as HTMLVideoElement;
const canvas = document.getElementById("photo-canvas") as HTMLCanvasElement;
const captureButton = document.getElementById(
  "capture-button",
) as HTMLDivElement;
const flipButton = document.getElementById("flip-button") as HTMLDivElement;

const buttonViewfinder = document.getElementById(
  "button-viewfinder",
) as HTMLVideoElement;
const captureText = document.getElementById("capture-text") as HTMLSpanElement;

// Pass the Vite-processed URL into the Audio object
const shutterSound = new Audio(shutterAudioUrl);

// Keep track of states
let isMirrored = false;
let rawStream: MediaStream | null = null;
let canvasStream: MediaStream | null = null;
let animationFrameId: number | null = null;

// Hidden elements for capturing and processing the stream
const rawVideo = document.createElement("video");
rawVideo.muted = true;
rawVideo.playsInline = true;

const streamCanvas = document.createElement("canvas");
const streamCtx = streamCanvas.getContext("2d");

// --- Helper to fully stop the camera hardware and processing loop ---
function stopCamera() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (rawStream) {
    rawStream.getTracks().forEach((track) => track.stop());
    rawStream = null;
  }

  if (canvasStream) {
    canvasStream.getTracks().forEach((track) => track.stop());
    canvasStream = null;
  }

  rawVideo.srcObject = null;
  viewfinder.srcObject = null;
  buttonViewfinder.srcObject = null;
}

// Draw crop loop: extracts a 1:1 ratio frame and applies mirror transformation on-the-fly
function drawLoop() {
  if (!rawVideo.paused && !rawVideo.ended) {
    const rawW = rawVideo.videoWidth;
    const rawH = rawVideo.videoHeight;

    if (rawW && rawH) {
      const squareSize = Math.min(rawW, rawH);
      const cropX = (rawW - squareSize) / 2;
      const cropY = (rawH - squareSize) / 2;

      // Ensure stream canvas dimensions match the cropped square size
      if (streamCanvas.width !== squareSize) {
        streamCanvas.width = squareSize;
        streamCanvas.height = squareSize;
      }

      if (streamCtx) {
        streamCtx.clearRect(0, 0, squareSize, squareSize);
        streamCtx.save();

        if (isMirrored) {
          // Draw the stream mirrored
          streamCtx.translate(squareSize, 0);
          streamCtx.scale(-1, 1);
        }

        streamCtx.drawImage(
          rawVideo,
          cropX,
          cropY,
          squareSize,
          squareSize,
          0,
          0,
          squareSize,
          squareSize,
        );
        streamCtx.restore();
      }
    }
  }
  animationFrameId = requestAnimationFrame(drawLoop);
}

async function startCamera() {
  // Always ensure the old stream is completely dead before starting a new one
  stopCamera();

  try {
    rawStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        aspectRatio: 1 / 1,
      },
      audio: false,
    });

    rawVideo.srcObject = rawStream;
    await rawVideo.play();

    // Start running the loop that draws frames on our helper canvas
    drawLoop();

    // Capture the 1:1 stream from our canvas at 30fps
    // @ts-ignore
    canvasStream = streamCanvas.captureStream(30);

    // Apply the perfectly square stream to the viewfinders
    viewfinder.srcObject = canvasStream;
    buttonViewfinder.srcObject = canvasStream;
  } catch (err: any) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError" || err.name === "NotReadableError") {
      alert("Camera access was denied or is being used by another app.");
    } else {
      alert("Could not start camera. Error: " + err.message);
    }
  }
}

// --- Listen for the user swiping away or returning to the app ---
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // The user came back! Restart the camera hardware.
    startCamera();
  } else {
    // The user swiped home. Turn off the camera hardware to save battery and drop the lock.
    stopCamera();
  }
});

async function takePicture() {
  // Ensure the stream is rendering
  if (!streamCanvas.width || !streamCanvas.height) {
    console.warn("Camera not ready yet");
    return;
  }

  // Play the sound immediately
  shutterSound.currentTime = 0;
  shutterSound
    .play()
    .catch((err) => console.warn("Failed to play sound:", err));

  // Visual "shutter" flash effect
  viewfinder.style.opacity = "0.3";
  setTimeout(() => (viewfinder.style.opacity = "1"), 150);

  canvas.width = streamCanvas.width;
  canvas.height = streamCanvas.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // The streamCanvas is already running live cropping and mirroring.
  // Drawing it directly keeps the snapshot exactly identical to the preview.
  ctx.drawImage(streamCanvas, 0, 0);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const filename = `picture_taken_at_${yyyy}${mm}${dd}_${hh}${min}${ss}.jpg`;

  if (typeof (window as any).saveFileToAndroid === "function") {
    try {
      const result = await (window as any).saveFileToAndroid(
        filename,
        dataUrl,
        "image/jpeg",
        "PICTURES",
      );
      if (result !== "SUCCESS")
        console.error("App failed to save photo:", result);
    } catch (err) {
      console.error("Bridge error:", err);
    }
  } else {
    // Standard Browser Fallback
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}

// --- Text Scrambler Animation Helper for Flip Button ---
async function scrambleTransition(
  element: HTMLElement,
  targetText: string,
  durationMs: number = 300,
) {
  const glyphs = "abcdefghijklmnopqrstuvwxyz-";
  const startLength = element.innerText.length;
  const targetLength = targetText.length;
  const maxLength = Math.max(startLength, targetLength);

  const steps = 12;
  const interval = durationMs / steps;

  for (let step = 0; step <= steps; step++) {
    let result = "";
    const progress = step / steps;

    for (let i = 0; i < maxLength; i++) {
      // Gradually lock in correct characters from left to right as the animation progresses
      const isResolved = i / maxLength < progress;

      if (isResolved) {
        if (i < targetLength) {
          result += targetText[i];
        }
      } else {
        // Scramble phase: insert random lowercase letters/dash
        result += glyphs[Math.floor(Math.random() * glyphs.length)];
      }
    }
    element.innerText = result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  element.innerText = targetText;
}

// Flip action: toggles state, updates button style, and runs text scramble animation
flipButton.addEventListener("pointerup", async () => {
  isMirrored = !isMirrored;
  const flipText = flipButton.querySelector("span");

  if (isMirrored) {
    flipButton.classList.add("bg-neutral-200", "dark:bg-neutral-800");
    if (flipText) {
      await scrambleTransition(flipText, "pilf", 200);
    }
  } else {
    flipButton.classList.remove("bg-neutral-200", "dark:bg-neutral-800");
    if (flipText) {
      await scrambleTransition(flipText, "flip", 200);
    }
  }
});

// Attach capture events
captureButton.addEventListener("pointerup", takePicture);
viewfinder.addEventListener("pointerup", takePicture);

// --- The Original Text Frame-by-Frame Animation Function for Camera Button ---
async function playStartupAnimation() {
  captureText.style.opacity = "1";
  const inFrames = ["c-----", "ca----", "cam---", "came--", "camer-", "camera"];
  const outFrames = [
    "-amera",
    "--mera",
    "---era",
    "----ra",
    "-----a",
    "------",
  ];
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // 1. Read the styles currently applied to the capture button
  const buttonStyles = getComputedStyle(captureButton);

  // 2. Extract `--animation-speed`
  const rawSpeed =
    buttonStyles.getPropertyValue("--animation-speed").trim() || "80";

  console.log(`rawspeed ${rawSpeed}`);
  // 3. parseInt automatically strips the "ms" off "250ms"
  const frameDelay = parseInt(rawSpeed, 10);

  // Wait a brief moment after the page loads before starting
  await delay(400);

  // Type "camera" in (left to right)
  for (const frame of inFrames) {
    captureText.innerText = frame;
    await delay(frameDelay);
  }

  // Erase "camera" out (left to right)
  for (const frame of outFrames) {
    captureText.innerText = frame;
    await delay(frameDelay);
  }
  captureText.style.opacity = "0.6";
}

// Boot up the camera and trigger the animation when the page first loads
startCamera();
playStartupAnimation();
