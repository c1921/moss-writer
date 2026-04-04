import { syncPull, syncPush } from "../../shared/tauri/commands";

export async function pushSync() {
  return syncPush();
}

export async function pullSync() {
  return syncPull();
}
