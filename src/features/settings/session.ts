import type { SessionState } from "../../app/types";

const SESSION_STORAGE_KEY = "moss-writer/session-v1";

export function loadSessionState(): SessionState | null {
  const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as SessionState;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveSessionState(session: SessionState | null) {
  if (!session?.projectPath) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSessionState() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
