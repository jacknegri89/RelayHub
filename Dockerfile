FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm generate && pnpm build

FROM build
ENV NEXT_TELEMETRY_DISABLED=1
RUN chown -R node:node /app/apps/web/.next
USER node
CMD ["node", "scripts/run.mjs", "start", "0.0.0.0"]
