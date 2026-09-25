import "./style.css";
// IMPORT the sound. Vite will turn this variable into a working /assets/... path
import shutterAudioUrl from "./assets/shutter.mp3";

// --- Global Type Declaration for the new outsync standard ---
declare global {
  interface Window {
    outsync?: {
      storage: {
        save: (
          filename: string,
          base64Data: string,
          mimeType: string,
          folder: string
        ) => Promise<string>;
      };
      haptic: {
        vibrate: (
          type:
            | "click"
            | "tick"
            | "heavy"
            | "double_click"
            | "success"
            | "error"
            | "rise"
            | "celebration"
            | "warning"
        ) => Promise<string>;
      };
      audio: {
        play: (sound: "beep" | "success" | "error" | "notification") => Promise<string>;
      };
    };
  }
}

const viewfinder = document.getElementById("viewfinder") as HTMLVideoElement;
const canvas = document.getElementById("photo-canvas") as HTMLCanvasElement;
const captureButton = document.getElementById("capture-button") as HTMLDivElement;
const flipButton = document.getElementById("flip-button") as HTMLDivElement;
const swapCameraButton = document.getElementById("swap-camera-button") as HTMLDivElement;
const buttonViewfinder = document.getElementById("button-viewfinder") as HTMLVideoElement;
const captureText = document.getElementById("capture-text") as HTMLSpanElement;

// Fallback HTML5 Audio instance
const shutterSound = new Audio(shutterAudioUrl);

// State tracking
let isMirrored = false;
let rawStream: MediaStream | null = null;
let canvasStream: MediaStream | null = null;
let animationFrameId: number | null = null;

// Lock for camera transitions
let isCameraStarting = false;

// Device enumeration state
let videoDevices: MediaDeviceInfo[] = [];
let currentCameraIndex = 0;

// Offscreen elements for square cropping and stream rendering
const rawVideo = document.createElement("video");
rawVideo.muted = true;
rawVideo.playsInline = true;

const streamCanvas = document.createElement("canvas");
const streamCtx = streamCanvas.getContext("2d");

// --- Helper to release camera hardware and cancel render loops ---
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

      if (streamCanvas.width !== squareSize) {
        streamCanvas.width = squareSize;
        streamCanvas.height = squareSize;
      }

      if (streamCtx) {
        streamCtx.clearRect(0, 0, squareSize, squareSize);
        streamCtx.save();

        if (isMirrored) {
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
          squareSize
        );
        streamCtx.restore();
      }
    }
  }
  animationFrameId = requestAnimationFrame(drawLoop);
}

// --- Query available camera devices ---
async function updateCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === "videoinput");

    if (videoDevices.length > 1) {
      swapCameraButton.classList.remove("opacity-40", "pointer-events-none");

      const activeTrack = rawStream?.getVideoTracks()[0];
      if (activeTrack) {
        const settings = activeTrack.getSettings();
        if (settings.deviceId) {
          const index = videoDevices.findIndex((d) => d.deviceId === settings.deviceId);
          if (index !== -1) {
            currentCameraIndex = index;
          }
        }
      }
      updateSwapButtonText();
    } else {
      swapCameraButton.classList.add("opacity-40", "pointer-events-none");
      const swapText = swapCameraButton.querySelector("span");
      if (swapText) {
        swapText.innerText = "1/1";
      }
    }
  } catch (err) {
    console.error("Failed to enumerate devices:", err);
    const swapText = swapCameraButton.querySelector("span");
    if (swapText) {
      swapText.innerText = "1/1";
    }
  }
}

function updateSwapButtonText() {
  const swapText = swapCameraButton.querySelector("span");
  if (swapText) {
    swapText.innerText = `${currentCameraIndex + 1}/${videoDevices.length}`;
  }
}

async function startCamera() {
  if (isCameraStarting) return;
  isCameraStarting = true;

  swapCameraButton.classList.add("opacity-40", "pointer-events-none");
  stopCamera();

  try {
    const videoConstraints: MediaTrackConstraints = {
      aspectRatio: 1 / 1,
    };

    if (videoDevices.length > 0 && videoDevices[currentCameraIndex]) {
      videoConstraints.deviceId = {
        exact: videoDevices[currentCameraIndex].deviceId,
      };
    } else {
      videoConstraints.facingMode = "environment";
    }

    rawStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });

    rawVideo.srcObject = rawStream;
    await rawVideo.play();

    drawLoop();

    // @ts-ignore
    canvasStream = streamCanvas.captureStream(30);

    viewfinder.srcObject = canvasStream;
    buttonViewfinder.srcObject = canvasStream;

    await updateCameraList();
  } catch (err: any) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError" || err.name === "NotReadableError") {
      alert("Camera access was denied or is being used by another app.");
    } else {
      alert("Could not start camera. Error: " + err.message);
    }
  } finally {
    isCameraStarting = false;
    if (videoDevices.length > 1) {
      swapCameraButton.classList.remove("opacity-40", "pointer-events-none");
    } else {
      swapCameraButton.classList.add("opacity-40", "pointer-events-none");
    }
  }
}

// Lifecycle listeners: Pause stream when backgrounded to preserve device resources
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startCamera();
  } else {
    stopCamera();
  }
});

async function takePicture() {
  if (!streamCanvas.width || !streamCanvas.height) {
    console.warn("Camera not ready yet");
    return;
  }

  // Native outsync Haptic Feedback
  if (window.outsync?.haptic) {
    window.outsync.haptic.vibrate("click");
  }

  // Play shutter sound
  shutterSound.currentTime = 0;
  shutterSound.play().catch((err) => console.warn("Failed to play sound:", err));

  // Shutter flash effect
  viewfinder.style.opacity = "0.3";
  setTimeout(() => (viewfinder.style.opacity = "1"), 150);

  canvas.width = streamCanvas.width;
  canvas.height = streamCanvas.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  // Helper for web download fallback
    const triggerBrowserDownload = () => {
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    };

    // Helper for denial visual + haptic feedback
    const handleDenial = (reason: string) => {
      console.warn("Storage permission denied or failed:", reason);
      if (window.outsync?.haptic) {
        window.outsync.haptic.vibrate("error");
      }
      // Flash button or text to notify user
      scrambleTransition(captureText, "denied", 250).then(() => {
        setTimeout(() => scrambleTransition(captureText, "camera", 250), 1200);
      });

      // Fall back to standard browser download prompt so photo is not lost
      triggerBrowserDownload();
    };

    if (window.outsync?.storage?.save) {
      try {
        const result = await window.outsync.storage.save(
          filename,
          dataUrl,
          "image/jpeg",
          "PICTURES"
        );
        if (result === "SUCCESS") {
          if (window.outsync?.haptic) window.outsync.haptic.vibrate("success");
        } else {
          handleDenial(result);
        }
      } catch (err: any) {
        handleDenial(err.message || "ERROR_PERMISSION_DENIED");
      }
    } else {
      triggerBrowserDownload();
    }
}

// Scramble text animation for buttons
async function scrambleTransition(
  element: HTMLElement,
  targetText: string,
  durationMs: number = 300
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
      const isResolved = i / maxLength < progress;
      if (isResolved) {
        if (i < targetLength) {
          result += targetText[i];
        }
      } else {
        result += glyphs[Math.floor(Math.random() * glyphs.length)];
      }
    }
    element.innerText = result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  element.innerText = targetText;
}

// Flip camera preview
flipButton.addEventListener("pointerup", async () => {
  if (window.outsync?.haptic) {
    window.outsync.haptic.vibrate("tick");
  }

  isMirrored = !isMirrored;
  const flipText = flipButton.querySelector("span");

  if (isMirrored) {
    if (flipText) {
      await scrambleTransition(flipText, "pilf", 200);
    }
  } else {
    if (flipText) {
      await scrambleTransition(flipText, "flip", 200);
    }
  }
});

// Swap active camera sensor
swapCameraButton.addEventListener("pointerup", async () => {
  if (videoDevices.length <= 1 || isCameraStarting) return;

  if (window.outsync?.haptic) {
    window.outsync.haptic.vibrate("tick");
  }

  currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;
  updateSwapButtonText();

  await startCamera();
});

// Attach capture events
captureButton.addEventListener("pointerup", takePicture);
viewfinder.addEventListener("pointerup", takePicture);

// Startup text animation
async function playStartupAnimation() {
  captureText.style.opacity = "1";
  const inFrames = ["c-----", "ca----", "cam---", "came--", "camer-", "camera"];
  const outFrames = ["-amera", "--mera", "---era", "----ra", "-----a", "------"];
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const buttonStyles = getComputedStyle(captureButton);
  const rawSpeed = buttonStyles.getPropertyValue("--animation-speed").trim() || "80";

  const frameDelay = parseInt(rawSpeed, 10);

  await delay(400);

  for (const frame of inFrames) {
    captureText.innerText = frame;
    await delay(frameDelay);
  }

  for (const frame of outFrames) {
    captureText.innerText = frame;
    await delay(frameDelay);
  }
  captureText.style.opacity = "0.6";
}

// Boot up
startCamera();
playStartupAnimation();
