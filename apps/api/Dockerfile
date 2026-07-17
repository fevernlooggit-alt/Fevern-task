# iCRM API (also used for the worker via a different command). Build context = repo root.
FROM node:22-slim

WORKDIR /app

# Prisma engines need OpenSSL + CA certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install workspace deps (root + apps/api).
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install

# App source.
COPY . .

# Generate the Prisma client for the container's platform.
RUN npm -w @icrm/api run db:generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "-w", "@icrm/api", "run", "start"]
