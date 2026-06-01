#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -t 1 ]]; then
  GREEN="\033[32m"
  YELLOW="\033[33m"
  BLUE="\033[34m"
  RED="\033[31m"
  BOLD="\033[1m"
  RESET="\033[0m"
else
  GREEN=""
  YELLOW=""
  BLUE=""
  RED=""
  BOLD=""
  RESET=""
fi

echo -e "${BOLD}${BLUE}=== MCP Start ===${RESET}"
echo -e "Directory: ${BOLD}$(pwd)${RESET}"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}Error:${RESET} Docker is not installed or not in PATH."
  exit 1
fi

echo -e "${BOLD}Starting MCP services...${RESET}"
if docker compose up -d; then
  echo -e "${GREEN}MCP services started successfully.${RESET}"
  echo
  echo -e "${BOLD}Current MCP status:${RESET}"
  docker compose ps
else
  echo -e "${RED}Failed to start MCP services.${RESET}"
  exit 1
fi

echo
echo -e "${BOLD}Next steps:${RESET}"
echo -e "  1. Check status: ${BOLD}npm run status:mcp${RESET}"
echo -e "  2. Follow logs: ${BOLD}npm run logs:mcp${RESET}"
echo -e "  3. Stop MCP: ${BOLD}npm run stop:mcp${RESET}"
