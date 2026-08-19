# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:22-alpine AS build-frontend

WORKDIR /build

# Copy package files first for layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./

# Same-origin API requests in production
ENV VITE_API_BASE=/api
RUN npm run build

# ============================================================
# Stage 2: Python runtime
# ============================================================
FROM python:3.11-slim AS runtime

WORKDIR /app/backend

# Install dependencies first for layer caching
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/app/ ./app/

# Copy frontend build output from stage 1
COPY --from=build-frontend /build/dist/ ./frontend-dist/

# Copy production entrypoint
COPY Docker/serve.py ./serve.py

# Copy project data (JSON: arguments, snippets, OCR results, etc.)
# Only include selected demo cases. Since M5 projects live under
# data/workspaces/<workspace>/projects/ (run scripts/migrate_to_workspaces.py
# once on the source tree before building).
COPY backend/data/workspaces/default/projects/yaruo_qu/     ./data/workspaces/default/projects/yaruo_qu/
COPY backend/data/workspaces/default/projects/dehuan_liu/   ./data/workspaces/default/projects/dehuan_liu/
COPY backend/data/workspaces/default/projects/chen_zhen/    ./data/workspaces/default/projects/chen_zhen/
COPY backend/data/workspaces/default/projects/liu_donglan/  ./data/workspaces/default/projects/liu_donglan/

# Portable/demo image is single-user: no workspace tokens. A server deployment
# overrides this via env_file (AUTH_DISABLED=false + scripts/mint_token.py).
ENV AUTH_DISABLED=true
ENV SOURCE_DATA_DIR=/app/data

# Copy source PDFs + OCR (selected cases only)
COPY data/eb1a/ /app/data/eb1a/
COPY "data/niw/Chen Zhen/"      "/app/data/niw/Chen Zhen/"
COPY "data/l1/Liu Donglan/"     "/app/data/l1/Liu Donglan/"

EXPOSE 8008

CMD ["python", "serve.py"]
