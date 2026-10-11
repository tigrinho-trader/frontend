FROM node:20-alpine AS build
WORKDIR /app
# Configuração do login (OpenID Connect): o Vite grava estes valores no build. Todas são opcionais;
# sem elas o jogo usa o Keycloak local (http://localhost:8180/realms/tigrinho, cliente flecha-certeira).
#   docker build --build-arg VITE_OIDC_AUTHORITY=... --build-arg VITE_OIDC_CLIENT_ID=... .
# Atenção: um ARG sem valor vira texto vazio, e vazio em AUTHORITY/CLIENT_ID desliga o login;
# por isso os padrões ficam aqui também.
ARG VITE_OIDC_AUTHORITY=http://localhost:8180/realms/tigrinho
ARG VITE_OIDC_CLIENT_ID=flecha-certeira
ARG VITE_OIDC_AUDIENCE=
ARG VITE_OIDC_PROVEDOR=keycloak
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_AUDIENCE=$VITE_OIDC_AUDIENCE \
    VITE_OIDC_PROVEDOR=$VITE_OIDC_PROVEDOR
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# O nginx repassa /api para o api-gateway
ENV GATEWAY_URL=http://api-gateway:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
