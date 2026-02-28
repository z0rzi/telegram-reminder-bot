FROM oven/bun:1

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Copy package files
COPY ./package.json /app/package.json

# Install dependencies
RUN bun install

# Copy source code
COPY ./src /app/src
COPY ./tsconfig.json /app/tsconfig.json

# Create tasks directory for persistence (empty initially)
# tasks.json will be created at runtime if it doesn't exist
RUN mkdir -p /app/tasks

# Default command - runs the bot
CMD ["bun", "src/index.ts"]