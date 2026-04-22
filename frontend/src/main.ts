import "./style.css";
// IMPORT the sound. Vite will magically turn this variable into a working /assets/... path!
import shutterAudioUrl from "./assets/shutter.mp3";

const viewfinder = document.getElementById("viewfinder") as HTMLVideoElement;
const canvas = document.getElementById("photo-canvas") as HTMLCanvasElement;
const captureButton = document.getElementById(
  "capture-button",
) as HTMLDivElement;

// Pass the Vite-processed URL into the Audio object
const shutterSound = new Audio(shutterAudioUrl);

// --- Helper to fully stop the camera hardware ---
function stopCamera() {
  if (viewfinder.srcObject) {
    const stream = viewfinder.srcObject as MediaStream;
    // Loop through all audio/video tracks and tell the hardware to stop
    stream.getTracks().forEach((track) => track.stop());
    viewfinder.srcObject = null;
  }
}

async function startCamera() {
  // Always ensure the old stream is completely dead before starting a new one
  stopCamera();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        aspectRatio: 1 / 1,
      },
      audio: false,
    });

    viewfinder.srcObject = stream;
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
  // Ensure the camera has loaded its dimensions
  if (!viewfinder.videoWidth || !viewfinder.videoHeight) {
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

  // ---------------------------------------------------------
  // THE SQUARE CROP MATH
  // ---------------------------------------------------------
  const rawWidth = viewfinder.videoWidth;
  const rawHeight = viewfinder.videoHeight;
  const squareSize = Math.min(rawWidth, rawHeight);

  const cropX = (rawWidth - squareSize) / 2;
  const cropY = (rawHeight - squareSize) / 2;

  canvas.width = squareSize;
  canvas.height = squareSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(
    viewfinder,
    cropX,
    cropY,
    squareSize,
    squareSize,
    0,
    0,
    squareSize,
    squareSize,
  );
  // ---------------------------------------------------------

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

// Attach capture events
captureButton.addEventListener("pointerup", takePicture);
viewfinder.addEventListener("pointerup", takePicture);

// --- NEW: The Text Animation Function ---
async function playStartupAnimation() {
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

  // 2. Extract `--layer-animation-speed` (which resolves to "250ms" because layer=1)
  // If it's missing, fallback to `--animation-speed`, and if that's missing, fallback to "80ms"
  const rawSpeed =
    buttonStyles.getPropertyValue("--animation-speed").trim() || "80";

  console.log(`rawspeed ${rawSpeed}`);
  // 3. parseInt automatically strips the "ms" off "250ms" and gives us the number 250
  const frameDelay = parseInt(rawSpeed, 10);

  // Wait a brief moment after the page loads before starting
  await delay(400);

  // Type "camera" in (left to right)
  for (const frame of inFrames) {
    captureButton.innerText = frame;
    await delay(frameDelay); // dynamically uses your CSS engine!
  }

  // Erase "camera" out (left to right)
  for (const frame of outFrames) {
    captureButton.innerText = frame;
    await delay(frameDelay); // dynamically uses your CSS engine!
  }
}

// Boot up the camera and trigger the animation when the page first loads
startCamera();
playStartupAnimation();
