import "./style.css";

const viewfinder = document.getElementById("viewfinder") as HTMLVideoElement;
const canvas = document.getElementById("photo-canvas") as HTMLCanvasElement;
const captureButton = document.getElementById(
  "capture-button",
) as HTMLDivElement;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        aspectRatio: 3 / 4,
      },
      audio: false,
    });

    viewfinder.srcObject = stream;
  } catch (err: any) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError") {
      alert("Camera access was denied.");
    } else {
      alert("Could not start camera. Error: " + err.message);
    }
  }
}

// Handle the Capture Button click
captureButton.addEventListener("click", async () => {
  // 1. Ensure the camera has loaded its dimensions
  if (!viewfinder.videoWidth || !viewfinder.videoHeight) {
    console.warn("Camera not ready yet");
    return;
  }

  // Visual "shutter" flash effect
  viewfinder.style.opacity = "0.3";
  setTimeout(() => (viewfinder.style.opacity = "1"), 150);

  // 2. Match the canvas size to the native video resolution
  canvas.width = viewfinder.videoWidth;
  canvas.height = viewfinder.videoHeight;

  // 3. Draw the current video frame onto the hidden canvas
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(viewfinder, 0, 0, canvas.width, canvas.height);

  // 4. Convert the canvas to a Base64 image string (JPEG format is better for photos)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

  // 5. Generate a unique filename
  const filename = `zerocam_${Date.now()}.jpg`;

  console.log("Theo");
  console.log(
    "functin " + typeof (window as any).saveFileToAndroid === "function",
  );
  // 6. Save using your new Native Android API (with TS bypass `as any`)
  if (typeof (window as any).saveFileToAndroid === "function") {
    console.log("Using Native API directly to gallery!");
    try {
      const result = await (window as any).saveFileToAndroid(
        filename,
        dataUrl,
        "image/jpeg",
        "PICTURES", // Saves directly to the DCIM/Pictures folder!
      );

      if (result === "SUCCESS") {
        console.log("Photo saved to gallery!");
      } else {
        console.error("App failed to save photo:", result);
      }
    } catch (err) {
      console.error("Bridge error:", err);
    }
  } else {
    // 7. Standard Browser Fallback (if opened outside of your app)
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
});

startCamera();
