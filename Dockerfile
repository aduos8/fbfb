FROM oven/bun:1.3.12 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.3.12-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/packages ./packages
COPY --from=build /app/scripts ./scripts

RUN chmod +x /app/scripts/coolify-entrypoint.sh

EXPOSE 3000

CMD ["/app/scripts/coolify-entrypoint.sh"]
