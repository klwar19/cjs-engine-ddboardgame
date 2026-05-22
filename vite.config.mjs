import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = process.cwd();

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        combat: resolve(root, "combat.html"),
        campaign: resolve(root, "campaign.html"),
        editor: resolve(root, "editor.html"),
        minigames: resolve(root, "minigames.html"),
        "entry-index": resolve(root, "src/entry-index.js"),
        "entry-combat": resolve(root, "src/entry-combat.js"),
        "entry-campaign": resolve(root, "src/entry-campaign.js"),
        "entry-editor": resolve(root, "src/entry-editor.js"),
        "entry-minigames": resolve(root, "src/entry-minigames.js")
      }
    }
  }
});
