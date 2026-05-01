# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps from the committed lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build. The build script also copies Pyodide runtime
# files from node_modules into public/pyodide/ before running vite build.
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# Replace nginx's default site with our config.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Mount the built app at /lungseq/ inside the web root.
RUN mkdir -p /usr/share/nginx/html/lungseq
COPY --from=build /app/dist/ /usr/share/nginx/html/lungseq/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
