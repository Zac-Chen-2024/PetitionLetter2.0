#!/bin/bash
set -e
cd "$(dirname "$0")"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240726/cpython-3.11.9+20240726-aarch64-apple-darwin-install_only.tar.gz"
else
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240726/cpython-3.11.9+20240726-x86_64-apple-darwin-install_only.tar.gz"
fi

ROOT="$(cd .. && pwd)"
DIST="$(pwd)/dist-mac/PetitionLetter"

echo ""
echo " ============================================="
echo "  Building PetitionLetter Portable (macOS $ARCH)"
echo " ============================================="
echo ""

# --- Clean ---
rm -rf "$(pwd)/dist-mac"
mkdir -p "$DIST"

# ===== 1. Standalone Python =====
echo "[1/7] Downloading Python 3.11.9 for macOS ($ARCH)..."
curl -L -o _python.tar.gz "$PYTHON_URL"

echo "[2/7] Extracting Python..."
mkdir -p "$DIST/python"
tar -xzf _python.tar.gz -C "$DIST/python" --strip-components=1
rm _python.tar.gz

# ===== 3. Install Python dependencies =====
echo "[3/7] Installing Python dependencies..."
"$DIST/python/bin/python3" -m pip install --no-cache-dir -q --target "$DIST/packages" -r "$ROOT/backend/requirements.txt"

# ===== 4. Build frontend =====
echo "[4/7] Building frontend..."
cd "$ROOT/frontend/frontend"
npm install --silent
VITE_API_BASE=/api npx vite build
cd "$(dirname "$0")"

# ===== 5. Assemble =====
echo "[5/7] Copying backend..."
mkdir -p "$DIST/backend"
cp -r "$ROOT/backend/app"  "$DIST/backend/app"
[ -f "$ROOT/backend/.env" ] && cp "$ROOT/backend/.env" "$DIST/backend/.env"

# Copy only selected project data (4 demo cases)
mkdir -p "$DIST/backend/data/projects"
cp -r "$ROOT/backend/data/projects/yaruo_qu"    "$DIST/backend/data/projects/yaruo_qu"
cp -r "$ROOT/backend/data/projects/dehuan_liu"   "$DIST/backend/data/projects/dehuan_liu"
cp -r "$ROOT/backend/data/projects/chen_zhen"    "$DIST/backend/data/projects/chen_zhen"
cp -r "$ROOT/backend/data/projects/liu_donglan"  "$DIST/backend/data/projects/liu_donglan"

echo "[6/7] Copying data (PDFs + OCR)..."
mkdir -p "$DIST/data"
cp -r "$ROOT/data/eb1a" "$DIST/data/eb1a"
cp -r "$ROOT/data/niw/Chen Zhen"     "$DIST/data/niw/Chen Zhen"
cp -r "$ROOT/data/l1/Liu Donglan"    "$DIST/data/l1/Liu Donglan"

echo "[7/7] Assembling final package..."
cp -r "$ROOT/frontend/frontend/dist" "$DIST/backend/frontend-dist"
cp serve.py "$DIST/backend/serve.py"
cp start_template_mac.command "$DIST/start.command"
chmod +x "$DIST/start.command"

echo ""
echo " ============================================="
echo "  Done!"
echo "  Output: $DIST"
echo "  Size:   $(du -sh "$DIST" | cut -f1)"
echo ""
echo "  Zip:  cd dist-mac && zip -r PetitionLetter-Mac.zip PetitionLetter/"
echo "  Send the zip to the lawyer."
echo " ============================================="
