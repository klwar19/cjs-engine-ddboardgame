import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        tests: resolve(root, "tests.html"),
        combat: resolve(root, "combat.html"),
        campaign: resolve(root, "campaign.html"),
        editor: resolve(root, "editor.html"),
        minigames: resolve(root, "minigames.html")
      }
    }
  }
});
