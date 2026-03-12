FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm install --production=false

# Copy source
COPY . .

# Expose Cloud Run port
EXPOSE 8080

# Start via tsx (TypeScript execution)
CMD ["npx", "tsx", "server.ts"]
