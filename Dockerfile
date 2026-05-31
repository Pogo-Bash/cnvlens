# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps. Use `npm install` (not `npm ci`) so the platform-specific
# optional binaries (e.g. @rollup/rollup-linux-x64-musl) are resolved for the
# Alpine/musl build image even when the committed lockfile was generated on a
# different OS. Versions stay pinned by the lockfile.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Copy source and build. The Rust/WASM bundle is committed under src/wasm/,
# so vite build picks it up without needing a Rust toolchain in the image.
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# Replace nginx's default site with our config.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Mount the built app at /cnvlens/ inside the web root.
RUN mkdir -p /usr/share/nginx/html/cnvlens
COPY --from=build /app/dist/ /usr/share/nginx/html/cnvlens/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
