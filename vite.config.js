import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// 两个入口：index.html = 主看板（密码）· team.html = 分享给团队的预算推算页（TEAM_KEY）
const at = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: { main: at("./index.html"), team: at("./team.html") },
    },
  },
});
