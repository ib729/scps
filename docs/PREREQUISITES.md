# Prerequisites for Web UI Setup

This document covers the system requirements for running the Stuco web UI on macOS and Raspberry Pi OS (Debian-based ARM64).

## Automatic Prerequisite Check

Run the check script to verify your system has everything needed:

```bash
./check-prereqs.sh
```

This will check for all required tools and provide installation instructions if anything is missing.

## Required Tools

### All Platforms

1. **Node.js 18+**
   - Check: `node --version`
   - macOS: `brew install node` or download from nodejs.org
   - Debian/Pi: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

2. **pnpm**
   - Check: `pnpm --version`
   - Install: `npm install -g pnpm`
   - Or: `curl -fsSL https://get.pnpm.io/install.sh | sh -`

### macOS Specific

**Xcode Command Line Tools** (required for compiling native modules)

- Check: `xcode-select -p`
- Install: `xcode-select --install`
- Includes: `clang`, `make`, and other build tools

### Debian/Raspberry Pi OS Specific

**Build essentials** (required for compiling native modules)

```bash
sudo apt update
sudo apt install -y build-essential python3 pkg-config
```

This installs:
- `gcc`, `g++` - C/C++ compilers
- `make` - Build automation
- `python3` - Required by node-gyp
- `pkg-config` - Package configuration helper

### For Raspberry Pi OS Lite

If you're using Pi OS Lite (headless), you'll also want:

```bash
# Git (if not already installed)
sudo apt install -y git

# Optional: vim or nano for editing
sudo apt install -y vim

# Optional: curl/wget for downloads
sudo apt install -y curl wget
```

## Why These Are Needed

### better-sqlite3 Native Bindings

The `better-sqlite3` package is a Node.js wrapper around SQLite, written in C++. It needs to be compiled for your specific platform:

- **macOS ARM64** (Apple Silicon): Needs Xcode CLT for `clang`
- **macOS x64** (Intel): Needs Xcode CLT for `clang`
- **Linux ARM64** (Raspberry Pi): Needs `build-essential` for `gcc`
- **Linux x64**: Needs `build-essential` for `gcc`

The compilation happens automatically during `pnpm install` thanks to the `postinstall` script.

## Troubleshooting

### "xcode-select: error: command line tools are already installed"

This is fine! The tools are there. You can proceed.

### "E: Unable to locate package build-essential"

Update your package lists first:

```bash
sudo apt update
sudo apt upgrade
```

Then retry the install.

### "node-gyp: Permission denied"

Don't run `pnpm install` with `sudo`. Instead:

```bash
# Fix npm global directory permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### "Cannot find module 'node-gyp'"

Install node-gyp globally:

```bash
npm install -g node-gyp
```

### Raspberry Pi: "virtual memory exhausted: Cannot allocate memory"

The Pi ran out of RAM during compilation. Add swap space:

```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Change CONF_SWAPSIZE to 2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

Then retry `pnpm install`.

## Verification

After installing prerequisites, verify everything works:

```bash
# 1. Check prerequisites
./check-prereqs.sh

# 2. Install dependencies (this will auto-build better-sqlite3)
pnpm install

# 3. Verify better-sqlite3 built correctly
node -e "const db = require('better-sqlite3')(':memory:'); console.log('✅ better-sqlite3 works!');"

# 4. Start the dev server
pnpm dev
```

If you see "✅ better-sqlite3 works!" then everything is set up correctly.

## Platform-Specific Notes

### macOS Monterey+ (12.x+)

- Xcode CLT version 13+ recommended
- Apple Silicon (M1/M2/M3): Native ARM64 bindings
- Intel Macs: x64 bindings (Rosetta not needed)

### Raspberry Pi 4B (8GB RAM)

- Debian Trixie (testing) or Bookworm (stable)
- ARM64 architecture
- At least 4GB RAM recommended (8GB ideal)
- Swap recommended for compilation

### Raspberry Pi Zero 2 W

- Works but compilation is slower (5-10 minutes)
- Increase swap to 1GB minimum
- Consider pre-building on a faster machine and copying `node_modules`

## Quick Reference

| Platform | Install Command |
|----------|----------------|
| macOS | `xcode-select --install` |
| Debian/Pi | `sudo apt install -y build-essential python3 pkg-config` |
| Node.js | `brew install node` (macOS) or `apt install nodejs` (Debian) |
| pnpm | `npm install -g pnpm` or `curl -fsSL https://get.pnpm.io/install.sh \| sh -` |

## After Prerequisites

Once prerequisites are installed:

```bash
cd web-next
pnpm install    # Automatically builds better-sqlite3
pnpm dev        # Start development server
```

No `setup.sh` needed - it's all automatic now!

## Getting Help

- **macOS build errors**: Check Xcode CLT is updated: `softwareupdate --list`
- **Linux build errors**: Ensure all packages installed: `dpkg -l | grep build-essential`
- **Node version issues**: Use Node 18 LTS or 20 LTS (avoid bleeding edge versions)
- **pnpm issues**: Clear cache with `pnpm store prune`

## References

- [better-sqlite3 installation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md)
- [node-gyp requirements](https://github.com/nodejs/node-gyp#installation)
- [Xcode CLT installation](https://developer.apple.com/xcode/resources/)
- [Raspberry Pi swap configuration](https://www.raspberrypi.com/documentation/computers/configuration.html#configuring-swapfile)

