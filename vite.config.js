import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento o Vite repassa /api pro api-gateway (sem CORS).
// GATEWAY_URL=http://localhost:8090 npm run dev  se o gateway estiver em outra porta.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.GATEWAY_URL || "http://localhost:8080",
    },
  },
  test: {
    coverage: {
      include: ["src/**/*.js"],
    },
  },
});
