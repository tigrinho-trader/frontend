import { defineConfig } from "vite";

// O jogo é estático (canvas + módulos ES), sem backend.
export default defineConfig({
  server: {
    port: 5173,
  },
  test: {
    coverage: {
      include: ["src/**/*.js"],
    },
  },
});
