FROM node:22-bookworm-slim

ARG AGENT_UID=1000
ARG AGENT_GID=1000

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code @openai/codex

RUN groupadd -g ${AGENT_GID} agent && useradd -m -u ${AGENT_UID} -g agent agent

USER agent
WORKDIR /home/agent/repo
