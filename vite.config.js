import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// 三个入口：index.html = 主看板（密码）· team.html = 团队预算推算页（TEAM_KEY）· cs.html = 客服助手（CS_KEY）
const at = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: { main: at("./index.html"), team: at("./team.html"), cs: at("./cs.html") },
    },
  },
});
