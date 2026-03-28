FROM node:20-alpine AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

ENV HTTP_PROXY=$HTTP_PROXY \
    HTTPS_PROXY=$HTTPS_PROXY \
    NO_PROXY=$NO_PROXY \
    http_proxy=$http_proxy \
    https_proxy=$https_proxy \
    no_proxy=$no_proxy

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .

RUN npm run build

FROM nginx:alpine

WORKDIR /etc/nginx/conf.d

RUN rm default.conf

COPY docker/nginx.conf ./default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
