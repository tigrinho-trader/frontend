import { defineConfig } from "vite";

// Em desenvolvimento o Vite repassa /api para o api-gateway (mesma origem, sem CORS).
// GATEWAY_URL=http://localhost:8090 npm run dev  se o gateway estiver em outra porta.
// O login usa VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID e VITE_AUTH0_AUDIENCE (veja .env.example).
export default defineConfig({
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
