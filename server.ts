import { serveDir, serveFile } from "jsr:@std/http/file-server";

Deno.serve(async (req) => {
  // 1. Attempt to serve the exact file requested from the "frontend/dist" folder
  // (e.g., /assets/index-xxx.js, /assets/shutter.mp3)
  const response = await serveDir(req, {
    fsRoot: "frontend/dist",
    quiet: true,
  });

  // 2. SPA Fallback: If the file doesn't exist (e.g., they visit the root "/"),
  // catch the 404 and serve the main camera index.html file instead!
  if (response.status === 404) {
    return await serveFile(req, "frontend/dist/index.html");
  }

  return response;
});
