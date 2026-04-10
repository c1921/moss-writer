# Moss Writer

一个基于 `Tauri + React + TypeScript` 的本地 Markdown 编辑器，目标是提供极简、稳定的章节写作体验。

## 当前能力

- 选择本地文件夹作为项目
- 递归展示项目内的 `.md` 文件，并按目录结构组织章节
- 打开、创建、重命名、删除章节文件
- 编辑区自动保存
- 自动监听项目内 `.md` 文件的外部变更
- 记住上次打开的项目和章节

## 项目约定

- 只把项目目录内的 `.md` 文件当作章节
- 新建文件支持输入相对路径，例如 `卷一/第一章`
- 新建文件时会自动补 `.md` 扩展名
- 新建文件不会自动创建父目录，父目录必须已经存在

## 自动保存

- 编辑内容后会在约 `800ms` 内触发自动保存
- 切换文件、切换项目、窗口失焦或页面隐藏时会主动冲刷未保存内容
- 如果保存失败，当前文件不会被切走，错误会显示在顶部

## 开发

```bash
npm install
npm run dev
npm run test:run
npm run build
npm run tauri dev
```

## 结构说明

- `src/app`: 应用状态、Provider 和副作用 hooks
- `src/features/editor`: 编辑区
- `src/features/fileManager`: 文件树和文件操作 UI
- `src/shared/tauri`: 前端到 Tauri 命令边界
- `src-tauri/src/commands.rs`: 本地文件系统命令实现

## 当前边界

- 同步接口目前只是占位能力，还没有实际实现
- 外部改动当前章节时，编辑区会以磁盘最新内容为准重载
- 设置入口目前只保留了界面占位，尚未提供实际配置项
