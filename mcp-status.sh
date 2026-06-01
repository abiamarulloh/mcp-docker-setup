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

echo -e "${BOLD}${BLUE}=== MCP Status ===${RESET}"
echo -e "Directory: ${BOLD}$(pwd)${RESET}"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}Error:${RESET} Docker is not installed or not in PATH."
  exit 1
fi

status_output=$(docker compose ps --quiet)
if [[ -z "$status_output" ]]; then
  echo -e "${YELLOW}No MCP services are currently running.${RESET}"
  echo -e "Use ${BOLD}npm run start:mcp${RESET} to start them."
  exit 0
fi

docker compose ps
