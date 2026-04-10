import { useEffect, useMemo, useRef, type CSSProperties } from "react"
import { Compartment, EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import {
  EditorView,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from "@codemirror/view"

import { cn } from "@/lib/utils"

interface CodeMirrorEditorProps {
  ariaLabel: string
  className?: string
  dataTestId?: string
  fontSizePx: number
  lineHeight: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  showLineNumbers: boolean
  value: string
}

export function CodeMirrorEditor({
  ariaLabel,
  className,
  dataTestId,
  fontSizePx,
  lineHeight,
  onChange,
  placeholder,
  readOnly = false,
  showLineNumbers,
  value,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isApplyingExternalValueRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const lineNumbersCompartment = useMemo(() => new Compartment(), [])
  const placeholderCompartment = useMemo(() => new Compartment(), [])
  const readOnlyCompartment = useMemo(() => new Compartment(), [])
  const editableCompartment = useMemo(() => new Compartment(), [])
  const editorTheme = useMemo(
    () =>
      EditorView.theme({
        "&": {
          color: "var(--color-foreground)",
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          borderRight: "1px solid var(--color-border)",
          color: "var(--color-foreground)",
        },
        ".cm-gutterElement": {
          color: "inherit",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "transparent",
          color: "var(--color-foreground)",
        },
        ".cm-activeLine": {
          backgroundColor: "transparent",
        },
        ".cm-content": {
          caretColor: "var(--color-foreground)",
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "var(--color-foreground)",
        },
        ".cm-placeholder": {
          color: "var(--color-muted-foreground)",
        },
      }),
    []
  )

  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const contentAttributes: Record<string, string> = {
      "aria-label": ariaLabel,
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    }

    if (dataTestId) {
      contentAttributes["data-testid"] = dataTestId
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        editorTheme,
        EditorView.lineWrapping,
        lineNumbersCompartment.of(showLineNumbers ? lineNumbers() : []),
        placeholderCompartment.of(
          placeholder ? placeholderExtension(placeholder) : []
        ),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        EditorView.contentAttributes.of(contentAttributes),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalValueRef.current) {
            return
          }

          onChangeRef.current(update.state.doc.toString())
        }),
      ],
    })

    const view = new EditorView({
      parent: containerRef.current,
      state,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [
    ariaLabel,
    dataTestId,
    editableCompartment,
    editorTheme,
    lineNumbersCompartment,
    placeholderCompartment,
    readOnlyCompartment,
  ])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    const currentValue = view.state.doc.toString()
    if (currentValue === value) {
      return
    }

    isApplyingExternalValueRef.current = true
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    })
    isApplyingExternalValueRef.current = false
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(showLineNumbers ? lineNumbers() : []),
    })
  }, [lineNumbersCompartment, showLineNumbers])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: placeholderCompartment.reconfigure(
        placeholder ? placeholderExtension(placeholder) : []
      ),
    })
  }, [placeholder, placeholderCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: [
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
        editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
      ],
    })
  }, [editableCompartment, readOnly, readOnlyCompartment])

  return (
    <div
      className={cn("writer-editor flex-1 overflow-hidden", readOnly && "is-read-only", className)}
      ref={containerRef}
      style={
        {
          "--writer-editor-font-size": `${fontSizePx}px`,
          "--writer-editor-line-height": lineHeight,
        } as CSSProperties
      }
    />
  )
}
