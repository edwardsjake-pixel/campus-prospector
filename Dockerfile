# --- Build stage ---
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS production
WORKDIR /app

# Install Python for scrapers
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Set up Python venv and install scraper deps
COPY pyproject.toml ./
RUN python3 -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir -e . 2>/dev/null || \
    /app/.venv/bin/pip install --no-cache-dir requests beautifulsoup4 pdfplumber
ENV PATH="/app/.venv/bin:$PATH"

# Copy built assets and production node_modules
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server/scraper ./server/scraper

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
