<script setup lang="ts">
import {
  Bold, Italic, Strikethrough,
  Code, CodeXml, TextQuote,
  Link2, List, ListOrdered, SquareCheck,
  Undo2, Redo2,
  Heading, Minus, Table2,
  BookOpen, WrapText, Eye,
  Pilcrow, IndentIncrease, IndentDecrease,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = defineProps<{
  vditor: any
}>()

// ---------- 选区工具 ----------

function getV() {
  return props.vditor
}

function wrapSelected(prefix: string, suffix: string) {
  const v = getV()
  if (!v) return
  const sel = v.getSelection()
  v.focus()
  if (sel) {
    v.insertValue(`${prefix}${sel}${suffix}`)
  } else {
    v.insertValue(`${prefix}文本${suffix}`)
  }
}

function insertBlock(block: string) {
  const v = getV()
  if (!v) return
  v.focus()
  v.insertValue(`\n${block}\n`)
}

function insertHeading(level: number) {
  const v = getV()
  if (!v) return
  v.focus()
  v.insertValue(`${'#'.repeat(level)} 标题\n`)
}

function insertLink() {
  const v = getV()
  if (!v) return
  const sel = v.getSelection()
  v.focus()
  v.insertValue(`[${sel || '链接文本'}](url)`)
}

function insertTable() {
  insertBlock('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |')
}

function insertLine() {
  insertBlock('---')
}

function insertList(prefix: string) {
  const v = getV()
  if (!v) return
  v.focus()
  v.insertValue(`\n${prefix} 列表项`)
}

// ---------- 编辑操作 ----------

function undo() {
  document.execCommand('undo')
}

function redo() {
  document.execCommand('redo')
}

function toggleOutline() {
  const v = getV()
  if (!v) return
  v.vditor.outline.toggle(v.vditor)
}
</script>

<template>
  <TooltipProvider>
    <div class="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/50 overflow-x-auto">
      <!-- 历史 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="undo" :disabled="!vditor">
            <Undo2 class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">撤销 Ctrl+Z</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="redo" :disabled="!vditor">
            <Redo2 class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">重做 Ctrl+Y</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 标题 -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon-sm" :disabled="!vditor">
                <Heading class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">标题</TooltipContent>
          </Tooltip>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem @click="insertHeading(1)">标题 1</DropdownMenuItem>
          <DropdownMenuItem @click="insertHeading(2)">标题 2</DropdownMenuItem>
          <DropdownMenuItem @click="insertHeading(3)">标题 3</DropdownMenuItem>
          <DropdownMenuItem @click="insertHeading(4)">标题 4</DropdownMenuItem>
          <DropdownMenuItem @click="insertHeading(5)">标题 5</DropdownMenuItem>
          <DropdownMenuItem @click="insertHeading(6)">标题 6</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 内联格式 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('**', '**')" :disabled="!vditor">
            <Bold class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">加粗 Ctrl+B</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('*', '*')" :disabled="!vditor">
            <Italic class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">斜体 Ctrl+I</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('~~', '~~')" :disabled="!vditor">
            <Strikethrough class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">删除线</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('`', '`')" :disabled="!vditor">
            <Code class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">行内代码</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertLink" :disabled="!vditor">
            <Link2 class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">链接 Ctrl+K</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 块级 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('> ', '')" :disabled="!vditor">
            <TextQuote class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">引用</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('```\n', '\n```')" :disabled="!vditor">
            <CodeXml class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">代码块</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertLine" :disabled="!vditor">
            <Minus class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">分割线</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 列表 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertList('-')" :disabled="!vditor">
            <List class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">无序列表</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertList('1.')" :disabled="!vditor">
            <ListOrdered class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">有序列表</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertList('- [ ]')" :disabled="!vditor">
            <SquareCheck class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">任务列表</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 插入 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="insertTable" :disabled="!vditor">
            <Table2 class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">插入表格</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="wrapSelected('\n', '\n')" :disabled="!vditor">
            <Pilcrow class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">段落</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 缩进 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" :disabled="!vditor">
            <IndentIncrease class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">增加缩进</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" :disabled="!vditor">
            <IndentDecrease class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">减少缩进</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 视图 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="vditor?.setPreviewMode('both')" :disabled="!vditor">
            <Eye class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">预览</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="vditor?.setPreviewMode('editor')" :disabled="!vditor">
            <WrapText class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">编辑模式</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="toggleOutline" :disabled="!vditor">
            <BookOpen class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">大纲</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
