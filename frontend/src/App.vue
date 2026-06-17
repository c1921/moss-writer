<script setup lang="ts">
import { ref, onMounted } from "vue"
import NoteSidebar from "./components/NoteSidebar.vue"
import NoteEditor from "./components/NoteEditor.vue"
import { listNotes, getNote, createNote, updateNote, deleteNote } from "./api/notes"
import type { Note } from "./api/notes"

const notes = ref<Note[]>([])
const selectedId = ref<number | null>(null)
const selectedNote = ref<Note | null>(null)
const saving = ref(false)

// Load notes list
async function loadNotes() {
  try {
    notes.value = await listNotes()
  } catch (err) {
    console.error("Failed to load notes:", err)
  }
}

// Select a note
async function selectNote(note: Note) {
  selectedId.value = note.id
  try {
    selectedNote.value = await getNote(note.id)
  } catch (err) {
    console.error("Failed to load note:", err)
  }
}

// Create a new note
async function handleCreate() {
  try {
    const note = await createNote()
    await loadNotes()
    selectedId.value = note.id
    selectedNote.value = note
  } catch (err) {
    console.error("Failed to create note:", err)
  }
}

// Update title (debounced)
async function handleUpdateTitle(title: string) {
  if (!selectedNote.value) return
  if (title === selectedNote.value.title) return
  selectedNote.value.title = title
  saving.value = true
  try {
    const updated = await updateNote(selectedNote.value.id, { title })
    selectedNote.value = updated
    // Refresh list to show updated title/time
    await loadNotes()
  } catch (err) {
    console.error("Failed to update title:", err)
  } finally {
    saving.value = false
  }
}

// Update content (debounced)
async function handleUpdateContent(content: string) {
  if (!selectedNote.value) return
  if (content === selectedNote.value.content) return
  selectedNote.value.content = content
  saving.value = true
  try {
    const updated = await updateNote(selectedNote.value.id, { content })
    selectedNote.value = updated
    await loadNotes()
  } catch (err) {
    console.error("Failed to update content:", err)
  } finally {
    saving.value = false
  }
}

// Save (explicit button)
async function handleSave() {
  if (!selectedNote.value) return
  saving.value = true
  try {
    const updated = await updateNote(selectedNote.value.id, {
      title: selectedNote.value.title,
      content: selectedNote.value.content,
    })
    selectedNote.value = updated
    await loadNotes()
  } catch (err) {
    console.error("Failed to save note:", err)
  } finally {
    saving.value = false
  }
}

// Delete a note
async function handleDelete(note: Note) {
  try {
    await deleteNote(note.id)
    if (selectedId.value === note.id) {
      selectedId.value = null
      selectedNote.value = null
    }
    await loadNotes()
  } catch (err) {
    console.error("Failed to delete note:", err)
  }
}

onMounted(() => {
  loadNotes()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <NoteSidebar
      :notes="notes"
      :selected-id="selectedId"
      @select="selectNote"
      @create="handleCreate"
      @delete="handleDelete"
    />
    <NoteEditor
      :note="selectedNote"
      :saving="saving"
      @update:title="handleUpdateTitle"
      @update:content="handleUpdateContent"
      @save="handleSave"
    />
  </div>
</template>
