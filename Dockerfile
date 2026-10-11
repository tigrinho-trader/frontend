FROM node:20-alpine AS build
WORKDIR /app
# Configuração do login (Auth0): o Vite grava estes valores no build.
#   docker build --build-arg VITE_AUTH0_DOMAIN=... --build-arg VITE_AUTH0_CLIENT_ID=... --build-arg VITE_AUTH0_AUDIENCE=... .
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN     VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID     VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
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
