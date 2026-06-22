# 阶段 1：编译后端
FROM golang:alpine AS backend-builder
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /moss-writer .

# 阶段 2：构建前端
FROM node:22-alpine AS frontend-builder
WORKDIR /src
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
# --ignore-scripts：pnpm v10+ 中 --frozen-lockfile 遇到未批准的构建脚本（如 vue-demi）会失败
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY frontend/ ./
RUN pnpm build

# 阶段 3：最终运行镜像
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /moss-writer .
COPY --from=frontend-builder /src/dist ./dist

ENV SPA_STATIC_DIR=/app/dist
ENV DB_PATH=/app/data/notes.db
ENV PORT=8080

EXPOSE 8080
CMD ["./moss-writer"]
