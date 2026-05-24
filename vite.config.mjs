import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = process.cwd();

export default defineConfig({
  base: "./",
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
