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
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
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
