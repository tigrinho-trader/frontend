import { defineConfig } from "vite";

// Em desenvolvimento o Vite repassa /api para o api-gateway (mesma origem, sem CORS).
// GATEWAY_URL=http://localhost:8090 npm run dev  se o gateway estiver em outra porta.
// O login (OIDC) usa VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID, VITE_OIDC_AUDIENCE e VITE_OIDC_PROVEDOR;
// sem elas vai para o Keycloak local em http://localhost:8180 (veja .env.example).
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
