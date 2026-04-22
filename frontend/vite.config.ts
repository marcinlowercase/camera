import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    // This allows any Cloudflare Tunnel URL to securely connect to your local server
    allowedHosts: [".trycloudflare.com"],
  },
});
