# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:22-alpine AS build-frontend

WORKDIR /build

# Copy package files first for layer caching
COPY frontend/frontend/package.json frontend/frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/frontend/ ./

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
COPY backend/data/ ./data/

# Copy source PDFs + OCR (all visa types)
COPY data/eb1a/ /app/data/eb1a/
COPY data/niw/  /app/data/niw/
COPY data/l1/   /app/data/l1/

EXPOSE 8008

CMD ["python", "serve.py"]
