import { defineConfig } from "vite";

// Em desenvolvimento o Vite repassa /api para o api-gateway (mesma origem, sem CORS).
// GATEWAY_URL=http://localhost:8090 npm run dev  se o gateway estiver em outra porta.
// O login (OIDC) usa VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID, VITE_OIDC_AUDIENCE e VITE_OIDC_PROVEDOR;
// sem elas vai para o Keycloak local em http://localhost:8180 (veja .env.example).
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.GATEWAY_URL || "http://localhost:8080",
        // A API usa o token Bearer, não cookies. Em localhost o navegador manda os cookies de todos os
        // sites locais (cookie não separa por porta) e o gateway recusaria com 431.
        configure: (proxy) => {
          proxy.on("proxyReq", (pedido) => pedido.removeHeader("cookie"));
        },
      },
    },
  },
  test: {
    coverage: {
      include: ["src/**/*.js"],
    },
  },
});
