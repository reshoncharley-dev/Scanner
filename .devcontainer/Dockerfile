FROM ghcr.io/codesandbox/devcontainers/typescript-node:latest

# Install SQLite
USER root
RUN apt-get update && apt-get install -y \
  sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# Create database directory
RUN mkdir -p /workspace/data && chown node:node /workspace/data

# Switch back to the original user
USER node

