//! Private WAV files stay on this device. Only the newest ten completed files survive.
use std::{
    fs::{self, File, OpenOptions},
    io::{Seek, SeekFrom, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};

pub const AUDIO_LIMIT: usize = 10;

pub struct WavWriter {
    file: File,
    bytes: u32,
}
impl WavWriter {
    fn create(path: &Path) -> Result<Self, String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
            .map_err(|_| "Could not create a local recording.")?;
        file.write_all(&[0; 44])
            .map_err(|_| "Could not prepare the recording file.")?;
        Ok(Self { file, bytes: 0 })
    }
    pub fn append(&mut self, pcm: &[u8]) -> Result<(), String> {
        let bytes = u32::try_from(pcm.len())
            .ok()
            .and_then(|n| self.bytes.checked_add(n))
            .filter(|n| *n <= u32::MAX - 36)
            .ok_or("The recording file is too large.")?;
        self.file
            .write_all(pcm)
            .map_err(|_| "Could not save microphone audio on this device.")?;
        self.bytes = bytes;
        Ok(())
    }
    fn finish(mut self) -> Result<bool, String> {
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|_| "Could not finish the recording file.")?;
        let mut header = Vec::with_capacity(44);
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&(self.bytes + 36).to_le_bytes());
        header.extend_from_slice(b"WAVEfmt ");
        header.extend_from_slice(&16u32.to_le_bytes());
        header.extend_from_slice(&1u16.to_le_bytes()); // PCM
        header.extend_from_slice(&1u16.to_le_bytes()); // mono
        header.extend_from_slice(&16_000u32.to_le_bytes());
        header.extend_from_slice(&32_000u32.to_le_bytes());
        header.extend_from_slice(&2u16.to_le_bytes());
        header.extend_from_slice(&16u16.to_le_bytes());
        header.extend_from_slice(b"data");
        header.extend_from_slice(&self.bytes.to_le_bytes());
        self.file
            .write_all(&header)
            .and_then(|_| self.file.sync_all())
            .map_err(|_| "Could not finish the recording file.")?;
        Ok(self.bytes > 0)
    }
}

pub type SharedWriter = Arc<Mutex<Option<WavWriter>>>;

pub struct Recording {
    temporary: PathBuf,
    completed: PathBuf,
    pub writer: SharedWriter,
}
impl Recording {
    pub fn create(app: &AppHandle, id: &str, created_at: u64) -> Result<Self, String> {
        Self::in_directory(&directory(app)?, id, created_at)
    }
    fn in_directory(dir: &Path, id: &str, created_at: u64) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|_| "Could not create the recordings folder.")?;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Could not protect the recordings folder.")?;
        let completed = dir.join(format!("{created_at:020}-{id}.wav"));
        let temporary = completed.with_extension("wav.part");
        let writer = Arc::new(Mutex::new(Some(WavWriter::create(&temporary)?)));
        Ok(Self {
            temporary,
            completed,
            writer,
        })
    }
    pub fn finish(&self) -> Result<Option<String>, String> {
        let writer = self
            .writer
            .lock()
            .map_err(|_| "Recording unavailable.")?
            .take();
        let Some(writer) = writer else {
            return Ok(None);
        };
        if !writer.finish()? {
            return Ok(None);
        }
        fs::rename(&self.temporary, &self.completed)
            .map_err(|_| "Could not save the recording file.")?;
        Ok(Some(self.completed.to_string_lossy().into_owned()))
    }
}
impl Drop for Recording {
    fn drop(&mut self) {
        if let Ok(mut writer) = self.writer.lock() {
            writer.take();
        }
        let _ = fs::remove_file(&self.temporary);
    }
}

pub fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("recordings"))
        .map_err(|e| e.to_string())
}

/// Interrupted takes were never committed; remove their temporary files on startup.
pub fn recover(app: &AppHandle) -> Result<(), String> {
    let dir = directory(app)?;
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "part")
            {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub fn prune_directory(dir: &Path) -> Result<Vec<String>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut files = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "wav") && p.is_file())
        .collect::<Vec<_>>();
    files.sort();
    files.reverse();
    let mut removed = vec![];
    for path in files.into_iter().skip(AUDIO_LIMIT) {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        removed.push(path.to_string_lossy().into_owned());
    }
    Ok(removed)
}

pub fn remove(app: &AppHandle, path: &str) {
    // Never delete paths outside this app's private recordings folder.
    if directory(app).ok().as_deref() == Path::new(path).parent() {
        let _ = fs::remove_file(path);
    }
}
