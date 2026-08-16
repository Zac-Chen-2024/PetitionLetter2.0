#!/bin/bash
cd "$(dirname "$0")"

export PATH="$(pwd)/python/bin:$PATH"
export PYTHONPATH="$(pwd)/packages:$(pwd)/backend"
# Portable package is single-user: no workspace tokens (see Doc M5)
export AUTH_DISABLED="${AUTH_DISABLED:-true}"

echo ""
echo "  =========================================="
echo "    PetitionLetter - EB-1A Petition System"
echo "  =========================================="
echo ""
echo "  Starting server..."
echo "  Browser will open at http://localhost:8008"
echo "  Press Ctrl+C to stop."
echo ""

# Open browser after 4 seconds
(sleep 4 && open http://localhost:8008) &

cd backend
python3 serve.py
