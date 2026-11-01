# --- build stage -----------------------------------------------------------
FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Оставляем только production-зависимости и переснимаем Prisma Client.
RUN npm prune --omit=dev

# --- runtime stage ---------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

RUN mkdir -p /app/storage && chown -R node:node /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/package-lock.json ./package-lock.json

# Корень национального УЦ Минцифры: без него не открывается TLS-соединение с
# elk.roszdravnadzor.gov.ru, откуда грузится государственный реестр
# (ADR 0010). Доверие задаётся переменной NODE_EXTRA_CA_CERTS, то есть
# действует только на этот процесс и не отключает проверку сертификатов.
COPY --chown=node:node certs ./certs

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
