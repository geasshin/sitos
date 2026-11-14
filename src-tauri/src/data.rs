//! Les données de Sitos : un fichier JSON par collection, dans le dossier de
//! l'application (`~/Library/Application Support/com.aurelientrouble.sitos/data`).
//!
//! Chaque écriture passe par un fichier temporaire puis un renommage : une
//! coupure au mauvais moment laisse l'ancienne version intacte, jamais un
//! fichier à moitié écrit. Avant d'écrire, la version précédente est copiée
//! dans `data/.sauvegardes/` ; les 60 plus récentes par collection sont gardées.

use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

pub const COLLECTIONS: [&str; 7] = [
    "foods",
    "stock",
    "recipes",
    "plan",
    "journal",
    "settings",
    "snackIdeas",
];
const KEEP_BACKUPS: usize = 60;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "DATA_DIR_UNAVAILABLE".to_string())?;
    Ok(base.join("data"))
}

/// Lit toutes les collections présentes. Une collection absente est simplement
/// omise : l'interface la complète avec ses valeurs de départ. Un fichier
/// illisible, lui, est une erreur : on ne repart jamais de zéro en silence.
pub fn read_all(dir: &Path) -> Result<Map<String, Value>, String> {
    let mut out = Map::new();
    for name in COLLECTIONS {
        let file = dir.join(format!("{name}.json"));
        if !file.exists() {
            continue;
        }
        let raw = fs::read_to_string(&file).map_err(|e| format!("{name}.json illisible : {e}"))?;
        let value: Value =
            serde_json::from_str(&raw).map_err(|e| format!("{name}.json invalide : {e}"))?;
        out.insert(name.to_string(), value);
    }
    Ok(out)
}

pub fn write_collection(dir: &Path, name: &str, value: &Value) -> Result<(), String> {
    if !COLLECTIONS.contains(&name) {
        return Err(format!("collection inconnue : {name}"));
    }
    fs::create_dir_all(dir).map_err(|e| format!("dossier des données : {e}"))?;
    let file = dir.join(format!("{name}.json"));
    if file.exists() {
        backup(dir, name, &file)?;
    }
    let tmp = dir.join(format!("{name}.json.tmp"));
    let mut text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    text.push('\n');
    fs::write(&tmp, text).map_err(|e| format!("écriture de {name} : {e}"))?;
    fs::rename(&tmp, &file).map_err(|e| format!("remplacement de {name} : {e}"))?;
    Ok(())
}

fn backup(dir: &Path, name: &str, file: &Path) -> Result<(), String> {
    let backups = dir.join(".sauvegardes");
    fs::create_dir_all(&backups).map_err(|e| format!("dossier des sauvegardes : {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    // Millisecondes sur 15 chiffres : l'ordre alphabétique suit l'ordre chronologique.
    fs::copy(file, backups.join(format!("{name}-{stamp:015}.json")))
        .map_err(|e| format!("sauvegarde de {name} : {e}"))?;
    prune(&backups, name)
}

fn prune(backups: &Path, name: &str) -> Result<(), String> {
    let prefix = format!("{name}-");
    let mut files: Vec<String> = fs::read_dir(backups)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|file| file.starts_with(&prefix) && file.ends_with(".json"))
        .collect();
    files.sort();
    let excess = files.len().saturating_sub(KEEP_BACKUPS);
    for file in &files[..excess] {
        let _ = fs::remove_file(backups.join(file));
    }
    Ok(())
}

#[tauri::command]
pub fn load_data(app: AppHandle) -> Result<Map<String, Value>, String> {
    read_all(&data_dir(&app)?)
}

#[tauri::command]
pub fn save_collection(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    write_collection(&data_dir(&app)?, &name, &value)
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn absent_collections_are_omitted() {
        let dir = tempfile::tempdir().unwrap();
        write_collection(dir.path(), "settings", &json!({"kcalTarget": 2000})).unwrap();
        let all = read_all(dir.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all["settings"]["kcalTarget"], 2000);
    }

    #[test]
    fn unknown_collection_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_collection(dir.path(), "../evil", &json!({})).is_err());
        assert!(fs::read_dir(dir.path()).unwrap().next().is_none());
    }

    #[test]
    fn a_corrupt_file_is_an_error_not_an_empty_start() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("plan.json"), "{ pas du json").unwrap();
        assert!(read_all(dir.path()).is_err());
    }

    #[test]
    fn previous_version_is_backed_up_and_pruned() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..(KEEP_BACKUPS + 5) {
            write_collection(dir.path(), "plan", &json!({ "n": i })).unwrap();
            // Horodatage à la milliseconde : on espace les écritures.
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let all = read_all(dir.path()).unwrap();
        assert_eq!(all["plan"]["n"], KEEP_BACKUPS + 4);
        let kept = fs::read_dir(dir.path().join(".sauvegardes"))
            .unwrap()
            .count();
        assert_eq!(kept, KEEP_BACKUPS);
        assert!(!dir.path().join("plan.json.tmp").exists());
    }
}
