use std::{path::PathBuf, sync::Mutex};

pub struct ProjectState {
    root: Mutex<Option<PathBuf>>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            root: Mutex::new(None),
        }
    }
}

impl ProjectState {
    pub fn set_root(&self, path: PathBuf) -> Result<(), String> {
        let mut guard = self
            .root
            .lock()
            .map_err(|_| "项目状态不可用，请重试".to_string())?;

        *guard = Some(path);
        Ok(())
    }

    pub fn get_root(&self) -> Result<PathBuf, String> {
        self.root
            .lock()
            .map_err(|_| "项目状态不可用，请重试".to_string())?
            .clone()
            .ok_or_else(|| "请先打开一个小说项目".to_string())
    }
}
