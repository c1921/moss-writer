<script setup lang="ts">
import { ref } from 'vue'
import {
  Bold, Italic, Strikethrough,
  Code, CodeXml, TextQuote,
  Link2, List, ListOrdered, SquareCheck,
  Undo2, Redo2,
  Heading, Minus, Table2,
  BookOpen, Eye,
  Pilcrow, IndentIncrease, IndentDecrease,
  Pen, PanelRightOpen,
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

// ---------- 编辑模式 ----------

type EditMode = 'wysiwyg' | 'ir' | 'sv'

const currentMode = ref<EditMode>('ir')

function getV() {
  return props.vditor
}

function switchEditMode(mode: EditMode) {
  const v = getV()
  if (!v) return
  const iv = v.vditor
  if (!iv || iv.currentMode === mode) return

  // 获取当前内容
  const markdown = v.getValue()

  // 隐藏所有编辑面板
  iv.ir.element.parentElement.style.display = 'none'
  iv.wysiwyg.element.parentElement.style.display = 'none'
  iv.sv.element.style.display = 'none'
  iv.preview.element.style.display = 'none'

  // 配置 Lute 模式
  iv.lute.SetVditorIR(mode === 'ir')
  iv.lute.SetVditorWYSIWYG(mode === 'wysiwyg')
  iv.lute.SetVditorSV(mode === 'sv')

  // 显示目标面板并渲染内容
  if (mode === 'ir') {
    iv.ir.element.parentElement.style.display = 'block'
    iv.ir.element.innerHTML = iv.lute.Md2VditorIRDOM(markdown)
  } else if (mode === 'wysiwyg') {
    iv.wysiwyg.element.parentElement.style.display = 'block'
    iv.wysiwyg.element.innerHTML = iv.lute.Md2VditorDOM(markdown)
  } else if (mode === 'sv') {
    iv.sv.element.style.display = 'block'
    const svHTML = iv.lute.SpinVditorSVDOM(markdown)
    iv.sv.element.innerHTML = svHTML || ''
  }

  iv.currentMode = mode
  currentMode.value = mode

  // 更新大纲
  iv.outline.toggle(iv, mode !== 'sv' && !!iv.options.outline?.enable, true)
}

// ---------- SV 模式预览切换 ----------

/** 在 SV 模式下切换预览面板显隐 */
function toggleSVPreview() {
  const v = getV()
  if (!v) return
  const iv = v.vditor
  if (iv.currentMode !== 'sv') return

  const previewEl = iv.preview.element
  if (previewEl.style.display === 'none' || !previewEl.style.display) {
    previewEl.style.display = 'block'
    iv.preview.render(iv)
  } else {
    previewEl.style.display = 'none'
  }
}

// ---------- 选区工具 ----------

function wrapSelected(prefix: string, suffix: string) {
  const v = getV()
  if (!v) return
  const sel = v.getSelection()
  v.focus()
  if (sel) {
    // ⚠️ 不能使用 v.insertValue()，它内部会 range.collapse(true)
    // 导致选中文本不被删除，出现 **xx**xx 的重复问题。
    // 改用 execCommand 正确替换选中区域并触发 Vditor 的 input 事件。
    document.execCommand('insertText', false, `${prefix}${sel}${suffix}`)
  } else {
    document.execCommand('insertText', false, `${prefix}文本${suffix}`)
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
  const v = getV()
  if (!v) return
  v.vditor.ir?.undo?.()
  v.vditor.wysiwyg?.undo?.()
}

function redo() {
  const v = getV()
  if (!v) return
  v.vditor.ir?.redo?.()
  v.vditor.wysiwyg?.redo?.()
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

      <!-- 编辑模式 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="!vditor"
            :class="{ 'bg-primary/15 text-primary!': currentMode === 'wysiwyg' }"
            @click="switchEditMode('wysiwyg')"
          >
            <Pen class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">所见即所得</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="!vditor"
            :class="{ 'bg-primary/15 text-primary!': currentMode === 'ir' }"
            @click="switchEditMode('ir')"
          >
            <Pilcrow class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">即时渲染</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :disabled="!vditor"
            :class="{ 'bg-primary/15 text-primary!': currentMode === 'sv' }"
            @click="switchEditMode('sv')"
          >
            <PanelRightOpen class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">分屏预览</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-1 h-5" />

      <!-- 视图（仅在 SV 模式下可切换预览） -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" @click="toggleSVPreview" :disabled="!vditor || currentMode !== 'sv'">
            <Eye class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">SV 预览</TooltipContent>
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
