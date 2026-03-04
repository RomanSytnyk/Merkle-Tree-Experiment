#!/bin/bash
#
# run.sh — One-command experiment runner
#
# Replicates the experiment from:
# "Implementing Application-Level Merkle Tree Verification in EVM Smart Contracts
#  for Supply Chain Data Integrity" (Sytnyk, Hnatushenko)
#
# Usage:
#   ./run.sh              # Full experiment (blockchain + MySQL, 1000 + 10000 records)
#   ./run.sh blockchain   # Only blockchain benchmark (no Docker/MySQL needed)
#   ./run.sh mysql        # Only MySQL benchmark
#   ./run.sh small        # Quick run with 1000 records only
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Ensure Node.js is available ──
# On macOS, nvm/fnm don't load in non-interactive shells.
# Try common Node.js manager init scripts.

if ! command -v node &> /dev/null; then
  # nvm
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

  # fnm
  if command -v fnm &> /dev/null 2>&1; then
    eval "$(fnm env)"
  elif [ -x "$HOME/.local/share/fnm/fnm" ]; then
    eval "$($HOME/.local/share/fnm/fnm env)"
  elif [ -x "$HOME/.fnm/fnm" ]; then
    eval "$($HOME/.fnm/fnm env)"
  fi

  # Homebrew node (Apple Silicon + Intel)
  for BREW_PREFIX in /opt/homebrew /usr/local; do
    if [ -x "$BREW_PREFIX/bin/node" ]; then
      export PATH="$BREW_PREFIX/bin:$PATH"
      break
    fi
  done

  # Volta
  [ -d "$HOME/.volta/bin" ] && export PATH="$HOME/.volta/bin:$PATH"
fi

# Also add common Docker paths
if ! command -v docker &> /dev/null; then
  for DOCKER_PATH in /usr/local/bin /opt/homebrew/bin "$HOME/.docker/bin" "/Applications/Docker.app/Contents/Resources/bin"; do
    if [ -x "$DOCKER_PATH/docker" ]; then
      export PATH="$DOCKER_PATH:$PATH"
      break
    fi
  done
fi

# Final check
if ! command -v node &> /dev/null; then
  echo -e "${RED}ERROR: Node.js not found.${NC}"
  echo ""
  echo "  Please run this in a terminal where 'node' works, or install Node.js >= 18:"
  echo "    brew install node"
  echo "  or"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo ""
  echo "  If you use nvm/fnm, try running in your normal terminal:"
  echo "    cd $(pwd) && npm install && npx hardhat compile && npx hardhat run src/run-experiment.js --network hardhat"
  exit 1
fi

echo -e "  Node.js: $(node --version) ($(which node))"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Merkle Tree vs MySQL — Supply Chain Integrity Experiment   ║"
echo "║  Sytnyk (2025)                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

MODE=${1:-full}

# ── Step 1: Install dependencies ──
echo -e "${YELLOW}[1/4] Installing dependencies...${NC}"
if [ ! -d "node_modules" ]; then
  npm install 2>&1 | tail -3
else
  echo "  node_modules exists, skipping install."
fi

# ── Step 2: Compile Solidity contracts ──
echo -e "\n${YELLOW}[2/4] Compiling Solidity contracts...${NC}"
npx hardhat compile 2>&1 | tail -5

# ── Step 3: Start MySQL (if needed) ──
if [ "$MODE" != "blockchain" ]; then
  echo -e "\n${YELLOW}[3/4] Starting MySQL via Docker...${NC}"
  if command -v docker &> /dev/null; then
    if docker compose version &> /dev/null 2>&1; then
      docker compose up -d 2>&1 | tail -3
    elif docker-compose version &> /dev/null 2>&1; then
      docker-compose up -d 2>&1 | tail -3
    else
      echo -e "${RED}  docker compose not found. Install Docker Compose or run:${NC}"
      echo "  ./run.sh blockchain"
      exit 1
    fi
    echo "  Waiting for MySQL to be ready..."
    for i in $(seq 1 30); do
      if docker compose exec -T mysql mysqladmin ping -h localhost -u root -pexperiment2024 --silent 2>/dev/null; then
        echo -e "  ${GREEN}MySQL is ready.${NC}"
        break
      fi
      if [ $i -eq 30 ]; then
        echo -e "${RED}  MySQL failed to start in 30s. Running blockchain-only.${NC}"
        MODE="blockchain"
      fi
      sleep 1
    done
  else
    echo -e "${RED}  Docker not found. Running blockchain-only mode.${NC}"
    MODE="blockchain"
  fi
else
  echo -e "\n${YELLOW}[3/4] Skipping MySQL (blockchain-only mode)${NC}"
fi

# ── Step 4: Run experiment ──
echo -e "\n${YELLOW}[4/4] Running experiment...${NC}\n"

case $MODE in
  blockchain)
    EXPERIMENT_MODE=blockchain npx hardhat run src/run-experiment.js --network hardhat
    ;;
  mysql)
    EXPERIMENT_MODE=mysql node src/run-experiment.js
    ;;
  small)
    EXPERIMENT_MODE=small npx hardhat run src/run-experiment.js --network hardhat
    ;;
  full)
    EXPERIMENT_MODE=full npx hardhat run src/run-experiment.js --network hardhat
    ;;
  *)
    echo "Usage: ./run.sh [full|blockchain|mysql|small]"
    exit 1
    ;;
esac

echo -e "\n${GREEN}Done! Results saved to results.json${NC}\n"
