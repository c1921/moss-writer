# Moss Writer

自托管 Markdown 笔记应用。Go 后端 + Vue 3 前端，支持实时同步、全文搜索、暗色模式，一行 Docker 命令即可部署。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go + Echo v5 + GORM + SQLite |
| 前端 | Vue 3 + TypeScript + Vite + UnoCSS |
| 编辑器 | Milkdown (ProseMirror 内核) |
| UI 组件 | Vuetify0 (headless) |
| 实时同步 | WebSocket (Melody) |
| 部署 | Docker + docker-compose |

## 快速开始

### 开发模式

```bash
# 终端 1：后端
cd backend
go run .
# → http://localhost:8080

# 终端 2：前端
cd web
pnpm install
pnpm dev
# → http://localhost:3000
```

前端 `.env.development` 已配置指向 `localhost:8080`，开箱即用。后端 CORS 已自动允许 `localhost:3000`。

### Docker 部署

```bash
# 默认端口 8080
docker compose up --build
# → http://localhost:8080

# 若 8080 被占用，通过 PORT 变量指定其他端口
PORT=3000 docker compose up --build
# → http://localhost:3000
```

数据持久化在 `./data/notes.db`（通过 bind mount）。

## 功能

- **Markdown 编辑** — Milkdown (ProseMirror) 所见即所得编辑器
- **实时同步** — 多标签页/多设备间 WebSocket 推送
- **全文搜索** — 按标题和内容即时过滤
- **暗色模式** — 手动切换 / 跟随系统偏好
- **键盘快捷键** — `Ctrl+N` 新建 / `Ctrl+S` 保存 / `Ctrl+K` 搜索
- **自动保存** — 800ms debounce，保存状态实时可见
- **软删除确认** — Dialog 弹窗防止误删

## 项目结构

```
moss-writer/
├── backend/
│   ├── main.go              # 入口：路由组装、优雅关闭
│   ├── store/db.go          # SQLite 连接与自动迁移
│   ├── ws/hub.go            # WebSocket 管理与广播
│   ├── handlers/notes.go    # CRUD handler（闭包注入依赖）
│   ├── models/note.go       # Note GORM 模型
│   └── data/                # SQLite 数据库（已 gitignore）
├── web/
│   ├── src/
│   │   ├── api/notes.ts            # REST API 封装
│   │   ├── stores/                 # Pinia stores（notes / websocket / theme）
│   │   ├── components/
│   │   │   ├── NoteSidebar.vue     # 侧边栏：列表、搜索、暗色切换
│   │   │   ├── NoteEditor.vue      # 编辑器：标题栏 + Milkdown
│   │   │   └── MarkdownEditor.vue  # Milkdown 编辑器封装
│   │   └── pages/index.vue         # 主页面
│   ├── unocss.config.ts            # UnoCSS 配置（含图标预设）
│   └── .env.development            # 开发环境变量
├── Dockerfile              # 多阶段构建（web/ 构建前端）
├── docker-compose.yml      # 单服务编排
└── .dockerignore
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/notes` | 笔记列表（`?q=` 全文搜索） |
| `GET` | `/api/notes/:id` | 笔记详情 |
| `POST` | `/api/notes` | 创建笔记 |
| `PUT` | `/api/notes/:id` | 更新笔记 |
| `DELETE` | `/api/notes/:id` | 删除笔记 |
| `GET` | `/api/settings/:key` | 读取设置 |
| `PUT` | `/api/settings/:key` | 写入设置 |
| WebSocket | `/ws` | 实时推送 `note_created/updated/deleted` |

## 环境变量（后端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 监听端口 |
| `DB_PATH` | `data/notes.db` | SQLite 数据库文件路径 |
| `CORS_ORIGINS` | 空 | 显式 CORS 来源（逗号分隔）。未设置且非 Docker 模式时自动允许 `localhost:5173`、`localhost:3000` |
| `SPA_STATIC_DIR` | 空 | 前端静态文件目录。Docker 中自动设为 `/app/dist`，启用同源托管 |

## 环境变量（前端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 后端 API 地址。开发模式在 `.env.development` 中设为 `http://localhost:8080/api` |
| `VITE_WS_URL` | 自动推导 | WebSocket 地址。开发模式在 `.env.development` 中设为 `ws://localhost:8080/ws` |
