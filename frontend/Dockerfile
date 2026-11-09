FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview"]
