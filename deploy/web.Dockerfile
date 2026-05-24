# syntax=docker/dockerfile:1
#
# Multi-stage build for statera-web (Vite/React frontend + Caddy reverse proxy).
#
# Stage 1: build the Vite frontend with Node.
# Stage 2: Caddy image with built assets and Caddyfile baked in.
#
# Base image pinned to an exact digest for reproducible builds.
# To update: docker buildx imagetools inspect node:22-alpine --format "{{json .Manifest}}"
# Current: node:22.22.3-alpine (build-only stage; pinned independently of api's 22.11.0)
ARG NODE_IMAGE=node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920

# ── Stage 1: build ────────────────────────────────────────────────────────────

FROM ${NODE_IMAGE} AS build

# Install pnpm directly rather than via corepack to avoid corepack's key-verification
# fetching behaviour, which is fragile in hermetic build environments.
# See docker/Dockerfile.api for the full rationale.
RUN npm install -g pnpm@9.15.9

WORKDIR /build

# Workspace manifests first — changes to source don't bust the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

# pnpm installs only apps/web deps — apps/api/package.json is absent from the
# build context, so pnpm skips that workspace member automatically.
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

RUN pnpm --filter statera-frontend build

# ── Stage 2: Caddy runtime ────────────────────────────────────────────────────

# caddy:2-alpine — Caddy 2.11.3
# To update: docker buildx imagetools inspect caddy:2-alpine --format "{{json .Manifest}}"
FROM caddy:2-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794

# GIT_SHA is stamped into the image at build time by CI (--build-arg GIT_SHA=$GITHUB_SHA).
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}

COPY --from=build /build/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443

# caddy:2-alpine sets no USER directive (runs as root). Caddy needs root to bind
# ports 80 and 443; it does not drop privileges internally. This is the official
# upstream pattern — no USER override is added here.

# Default CMD from base image is correct:
#   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
