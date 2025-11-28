FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Run as non-root user
USER node

# Start the MCP server
CMD ["node", "index.js"]
