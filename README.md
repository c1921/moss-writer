# Moss Writer

自托管 Markdown 笔记应用。Go 后端 + Vue 3 前端，支持实时同步、全文搜索、暗色模式，一行 Docker 命令即可部署。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go + Echo v5 + GORM + SQLite |
| 前端 | Vue 3 + TypeScript + Vite + Tailwind CSS v4 |
| 编辑器 | md-editor-v3 (CodeMirror 内核) |
| UI 组件 | shadcn-vue (reka-ui) |
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
cd frontend
pnpm install
pnpm dev
# → http://localhost:5173
```

前端 `.env.development` 已配置指向 `localhost:8080`，开箱即用。

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

- **Markdown 编辑** — 分屏编辑/预览，语法高亮
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
│   ├── main.go            # 入口：Echo 路由、Melody WebSocket
│   ├── models/
│   │   └── note.go        # Note GORM 模型
│   └── data/              # SQLite 数据库（已 gitignore）
├── frontend/
│   ├── src/
│   │   ├── api/notes.ts          # REST API 封装
│   │   ├── composables/          # useWebSocket / useDarkMode
│   │   └── components/
│   │       ├── NoteSidebar.vue   # 侧边栏：列表、搜索、暗色切换
│   │       ├── NoteEditor.vue    # 编辑器：md-editor-v3 + 标题栏
│   │       └── ui/               # shadcn-vue 组件
│   └── .env.development          # 开发环境变量
├── Dockerfile              # 多阶段构建
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
| WebSocket | `/ws` | 实时推送 `note_created/updated/deleted` |

## 环境变量（后端）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | 监听端口。若 8080 被占用，改为 `3000` 或任意空闲端口 |

同时更新 docker-compose 中的端口部分。随后在 Docker 部署一节补充环境变量用法。

Docker 启动方式补充：

```bash
# 默认端口 8080
docker compose up --build

# 自定义端口（如 3000）
PORT=3000 docker compose up --build
# 或修改 docker-compose.yml 中 ports 为 "3000:8080"
```

让我也更新 Docker 部署章节。<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="edit_file">
<｜｜DSML｜｜parameter name="new_string" string="true">| `PORT` | `8080` | 监听端口。若 8080 被占用，改为 `3000` 或任意空闲端口 |
| `DB_PATH` | `data/notes.db` | SQLite 数据库路径 |
| `CORS_ORIGINS` | 空（禁用） | 允许的跨域来源，逗号分隔，如 `http://localhost:5173` |
| `SPA_STATIC_DIR` | 空（禁用） | 前端 `dist/` 目录路径，Docker 中设为 `/app/dist` |
