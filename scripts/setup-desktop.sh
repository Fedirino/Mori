#!/usr/bin/env bash
# Mori Desktop — setup and build script for Windows
# Run this from git-bash to install dependencies and build

set -e

echo "=== Mori Desktop Setup ==="

# Check for Visual Studio Build Tools (needed for MSVC Rust toolchain)
VS_INSTALLED=false
if [ -f "/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe" ]; then
  VS_PATH=$(/c/Program\ Files\ \(x86\)/Microsoft\ Visual\ Studio/Installer/vswhere.exe -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null)
  if [ -n "$VS_PATH" ]; then
    VS_INSTALLED=true
    echo "Visual Studio Build Tools found at: $VS_PATH"
  fi
fi

if [ "$VS_INSTALLED" = false ]; then
  echo ""
  echo "=== Installing Visual Studio 2022 Build Tools ==="
  echo "This will download and install the MSVC compiler (needed to build the desktop app)."
  echo "Download size: ~500MB. Install size: ~2GB."
  echo ""
  VS_BOOTSTRAP="/tmp/vs_buildtools.exe"
  if [ ! -f "$VS_BOOTSTRAP" ]; then
    echo "Downloading bootstrapper..."
    curl -sLo "$VS_BOOTSTRAP" "https://aka.ms/vs/17/release/vs_buildtools.exe"
  fi

  # Install just the C++ build tools + Windows SDK
  "$VS_BOOTSTRAP" --quiet --wait --norestart \
    --add Microsoft.VisualStudio.Workload.VCTools \
    --includeRecommended \
    --remove Microsoft.VisualStudio.Component.Windows11SDK.26100 \
    2>&1 | tail -5

  echo "Visual Studio Build Tools installed."
fi

# 2. Switch Rust to MSVC toolchain
echo ""
echo "=== Configuring Rust MSVC toolchain ==="
export PATH="$PATH:$HOME/.cargo/bin"
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup default stable-x86_64-pc-windows-msvc

# 3. Build
echo ""
echo "=== Building Mori Desktop ==="
cd "$(dirname "$0")/../src-tauri"
cargo build --release

echo ""
echo "=== Done! ==="
echo "Binary at: src-tauri/target/release/mori.exe"
echo "Run with: npx tauri dev (from project root)"
echo "Or open src-tauri/target/release/mori.exe directly"