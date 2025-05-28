# ステージ1: ビルド環境
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . . 
RUN pnpm run build

# ステージ2: 実行環境
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json pnpm-lock.yaml ./
# 本番では開発用の依存関係は不要な場合が多いので --prod
RUN npm install -g pnpm && pnpm install --prod
COPY --from=builder /usr/src/app/dist ./dist

# GitHub Appの秘密鍵をコンテナ内にコピーする場合 (非推奨だがローカルテストなどではありうる)
# COPY your-private-key.pem ./your-private-key.pem
# 環境変数で秘密鍵の内容を渡す方が安全

EXPOSE 3000
CMD ["node", "dist/main.js"]