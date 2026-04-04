import { open } from "@tauri-apps/plugin-dialog";

export async function pickProjectDirectory(defaultPath?: string | null) {
  const selection = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath ?? undefined,
  });

  return typeof selection === "string" ? selection : null;
}
