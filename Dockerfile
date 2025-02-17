# ---- Base Stage ----
FROM node:22-alpine AS base

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# ---- Dependencies Stage ----
FROM base AS deps

# Install dependencies with caching
RUN pnpm install --frozen-lockfile

# ---- Build Stage (Production) ----
FROM base AS build

# Copy dependencies from deps stage to avoid reinstalling
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN pnpm build

# ---- Production Stage ----
FROM base AS production

# Set environment to production
ENV NODE_ENV=production

# Copy only required files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Command to run the application
CMD ["pnpm", "start:prod"]
