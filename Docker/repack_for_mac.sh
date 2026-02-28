#!/bin/bash
#
# Run this ON a Mac inside the unzipped PetitionLetter folder.
# It replaces Windows python/packages with macOS versions.
# No Node.js needed — frontend is already built.
#
# Usage:
#   cd PetitionLetter
#   chmod +x repack_for_mac.sh
#   ./repack_for_mac.sh
#
set -e
cd "$(dirname "$0")"

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240726/cpython-3.11.9+20240726-aarch64-apple-darwin-install_only.tar.gz"
else
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240726/cpython-3.11.9+20240726-x86_64-apple-darwin-install_only.tar.gz"
fi

echo ""
echo " ============================================="
echo "  Repacking for macOS ($ARCH)"
echo " ============================================="
echo ""

# ===== 1. Replace Windows Python with macOS Python =====
echo "[1/4] Downloading Python 3.11.9 for macOS..."
rm -rf python
curl -L -o _python.tar.gz "$PYTHON_URL"
mkdir -p python
tar -xzf _python.tar.gz -C python --strip-components=1
rm _python.tar.gz

# ===== 2. Reinstall pip packages for macOS =====
echo "[2/4] Installing Python packages for macOS..."
rm -rf packages
mkdir packages
python/bin/python3 -m pip install --no-cache-dir -q \
    --target packages \
    -r requirements.txt

# ===== 3. Replace start.bat with start.command =====
echo "[3/4] Creating start.command..."
rm -f start.bat
cat > start.command << 'SCRIPT'
#!/bin/bash
cd "$(dirname "$0")"
export PATH="$(pwd)/python/bin:$PATH"
export PYTHONPATH="$(pwd)/packages:$(pwd)/backend"
echo ""
echo "  =========================================="
echo "    PetitionLetter - EB-1A Petition System"
echo "  =========================================="
echo ""
echo "  Starting server..."
echo "  Browser will open at http://localhost:8008"
echo "  Press Ctrl+C to stop."
echo ""
(sleep 4 && open http://localhost:8008) &
cd backend
python3 serve.py
SCRIPT
chmod +x start.command

# ===== 4. Clean up Windows leftovers =====
echo "[4/4] Cleaning up..."
rm -f repack_for_mac.sh

echo ""
echo " ============================================="
echo "  Done! Size: $(du -sh . | cut -f1)"
echo ""
echo "  Double-click start.command to launch."
echo "  Or zip and send:  zip -r PetitionLetter-Mac.zip ."
echo " ============================================="
