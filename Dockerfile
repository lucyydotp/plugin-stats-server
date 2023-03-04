FROM node:lts-alpine
RUN npm install -g pnpm
ADD package.json pnpm-lock.yaml ./
RUN pnpm install
ADD . .
RUN pnpm build && rm -rf src/
ENTRYPOINT pnpm start
