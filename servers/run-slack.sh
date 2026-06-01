#!/bin/sh
if [ -z "$SLACK_BOT_TOKEN" ] || [ -z "$SLACK_TEAM_ID" ]; then
  echo "slack disabled (set SLACK_BOT_TOKEN, SLACK_TEAM_ID to enable)" >&2
  sleep infinity
else
  exec npx -y @modelcontextprotocol/server-slack
fi