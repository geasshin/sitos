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

/// Nom de sauvegarde accepté : chiffres et tirets seulement (jamais de chemin).
fn valid_label(label: &str) -> bool {
    !label.is_empty() && label.len() <= 24 && label.chars().all(|c| c.is_ascii_digit() || c == '-')
}

/// Copie toutes les collections dans `data/.sauvegardes/manuel-<label>/`. Renvoie le nom du dossier.
pub fn snapshot(dir: &Path, label: &str) -> Result<String, String> {
    if !valid_label(label) {
        return Err("nom de sauvegarde invalide".to_string());
    }
    let name = format!("manuel-{label}");
    let target = dir.join(".sauvegardes").join(&name);
    fs::create_dir_all(&target).map_err(|e| format!("dossier de sauvegarde : {e}"))?;
    let mut copied = 0;
    for collection in COLLECTIONS {
        let file = dir.join(format!("{collection}.json"));
        if file.exists() {
            fs::copy(&file, target.join(format!("{collection}.json")))
                .map_err(|e| format!("copie de {collection} : {e}"))?;
            copied += 1;
        }
    }
    if copied == 0 {
        let _ = fs::remove_dir(&target);
        return Err("aucune donnée à sauvegarder".to_string());
    }
    Ok(name)
}

#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    /// Copies automatiques gardées avant chaque écriture.
    pub automatic: usize,
    /// Sauvegardes manuelles, la plus récente d'abord.
    pub manual: Vec<String>,
}

pub fn backup_info(dir: &Path) -> BackupInfo {
    let mut info = BackupInfo {
        automatic: 0,
        manual: vec![],
    };
    let Ok(entries) = fs::read_dir(dir.join(".sauvegardes")) else {
        return info;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_dir() && name.starts_with("manuel-") {
            info.manual.push(name);
        } else if name.ends_with(".json") {
            info.automatic += 1;
        }
    }
    info.manual.sort();
    info.manual.reverse();
    info
}

#[tauri::command]
pub fn create_backup(app: AppHandle, label: String) -> Result<String, String> {
    snapshot(&data_dir(&app)?, &label)
}

#[tauri::command]
pub fn get_backup_info(app: AppHandle) -> Result<BackupInfo, String> {
    Ok(backup_info(&data_dir(&app)?))
}

#[tauri::command]
pub fn get_data_folder(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().to_string())
}

/// Une copie automatique d'une collection, telle qu'elle est sur le disque.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub collection: String,
    /// Date du fichier, en millisecondes depuis 1970.
    pub saved_at: u64,
    pub bytes: u64,
}

/// Le résultat d'une restauration : la collection remise et la copie de l'état d'avant.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Restored {
    pub collection: String,
    /// Nom du dossier de sauvegarde créé avant l'écriture ; absent s'il n'y avait rien à copier.
    pub backup: Option<String>,
    pub bytes: u64,
}

/// Le nom d'une copie désigne une collection connue et rien d'autre : jamais un chemin.
fn collection_of(name: &str) -> Option<&'static str> {
    if !name.ends_with(".json") {
        return None;
    }
    COLLECTIONS.iter().copied().find(|collection| {
        name.strip_prefix(collection)
            .is_some_and(|rest| rest.starts_with('-'))
    })
}

/// Résout une copie dans `.sauvegardes` : le nom doit être un simple fichier,
/// d'une collection connue, présent sur le disque. Sinon, refus avant toute lecture.
fn backup_source(dir: &Path, name: &str) -> Result<(&'static str, PathBuf), String> {
    if name.is_empty()
        || name.len() > 200
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.starts_with('.')
    {
        return Err("nom de sauvegarde invalide".to_string());
    }
    let collection = collection_of(name).ok_or_else(|| "nom de sauvegarde invalide".to_string())?;
    let path = dir.join(".sauvegardes").join(name);
    if !path.is_file() {
        return Err(format!("sauvegarde introuvable : {name}"));
    }
    Ok((collection, path))
}

/// Les copies automatiques, de la plus récente à la plus ancienne.
pub fn backup_files(dir: &Path) -> Vec<BackupFile> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir.join(".sauvegardes")) else {
        return out;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(collection) = collection_of(&name) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let saved_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|since| since.as_millis() as u64)
            .unwrap_or_default();
        out.push(BackupFile {
            name,
            collection: collection.to_string(),
            saved_at,
            bytes: metadata.len(),
        });
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.saved_at));
    out
}

/// Remet une copie à la place de sa collection. L'état courant part d'abord dans
/// un dossier de sauvegarde daté ; la copie est ensuite installée par un renommage,
/// donc une coupure au mauvais moment laisse l'ancien fichier intact.
pub fn restore(dir: &Path, name: &str, label: &str) -> Result<Restored, String> {
    let (collection, source) = backup_source(dir, name)?;
    let text =
        fs::read_to_string(&source).map_err(|e| format!("lecture de la sauvegarde : {e}"))?;
    serde_json::from_str::<Value>(&text).map_err(|e| format!("sauvegarde illisible : {e}"))?;

    let target = dir.join(format!("{collection}.json"));
    let backup = if target.exists() {
        Some(snapshot(dir, label)?)
    } else {
        None
    };

    fs::create_dir_all(dir).map_err(|e| format!("dossier des données : {e}"))?;
    let tmp = dir.join(format!("{collection}.json.tmp"));
    fs::copy(&source, &tmp).map_err(|e| format!("copie de {collection} : {e}"))?;
    fs::rename(&tmp, &target).map_err(|e| format!("remplacement de {collection} : {e}"))?;
    let bytes = fs::metadata(&target).map(|m| m.len()).unwrap_or_default();
    Ok(Restored {
        collection: collection.to_string(),
        backup,
        bytes,
    })
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupFile>, String> {
    Ok(backup_files(&data_dir(&app)?))
}

#[tauri::command]
pub fn read_backup(app: AppHandle, name: String) -> Result<Value, String> {
    let dir = data_dir(&app)?;
    let (_, source) = backup_source(&dir, &name)?;
    let raw = fs::read_to_string(&source).map_err(|e| format!("lecture de la sauvegarde : {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("sauvegarde illisible : {e}"))
}

#[tauri::command]
pub fn restore_backup(app: AppHandle, name: String, label: String) -> Result<Restored, String> {
    restore(&data_dir(&app)?, &name, &label)
}

/// Liens que l'interface peut ouvrir dans le navigateur : une liste fermée, jamais une adresse libre.
pub fn link_url(target: &str) -> Option<&'static str> {
    match target {
        "releases" => Some("https://github.com/geasshin/sitos/releases"),
        "repo" => Some("https://github.com/geasshin/sitos"),
        "ciqual" => Some("https://ciqual.anses.fr/"),
        _ => None,
    }
}

#[tauri::command]
pub fn open_link(app: AppHandle, target: String) -> Result<(), String> {
    let url = link_url(&target).ok_or_else(|| "lien inconnu".to_string())?;
    app.opener()
        .open_url(url, None::<&str>)
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

    #[test]
    fn manual_backup_copies_every_collection_and_refuses_paths() {
        let dir = tempfile::tempdir().unwrap();
        write_collection(dir.path(), "plan", &json!({"n": 1})).unwrap();
        write_collection(dir.path(), "settings", &json!({"n": 2})).unwrap();
        write_collection(dir.path(), "plan", &json!({"n": 3})).unwrap();
        let name = snapshot(dir.path(), "20261114-1830").unwrap();
        assert_eq!(name, "manuel-20261114-1830");
        let copy = dir.path().join(".sauvegardes").join(&name);
        let plan: Value =
            serde_json::from_str(&fs::read_to_string(copy.join("plan.json")).unwrap()).unwrap();
        assert_eq!(plan["n"], 3);
        assert!(copy.join("settings.json").exists());
        assert!(snapshot(dir.path(), "../x").is_err());
        assert!(snapshot(dir.path(), "").is_err());
        let info = backup_info(dir.path());
        assert_eq!(info.manual, vec!["manuel-20261114-1830".to_string()]);
        assert_eq!(info.automatic, 1);
    }

    #[test]
    fn restore_puts_a_backup_back_and_snapshots_the_current_state() {
        let dir = tempfile::tempdir().unwrap();
        write_collection(dir.path(), "plan", &json!({"n": 1})).unwrap();
        write_collection(dir.path(), "settings", &json!({"n": 2})).unwrap();
        write_collection(dir.path(), "plan", &json!({"n": 3})).unwrap();
        let backups = backup_files(dir.path());
        let plan_backup = backups.iter().find(|b| b.collection == "plan").unwrap();
        assert_eq!(
            plan_backup.bytes,
            fs::metadata(dir.path().join(".sauvegardes").join(&plan_backup.name))
                .unwrap()
                .len()
        );
        let restored = restore(dir.path(), &plan_backup.name, "20261126-1200").unwrap();
        assert_eq!(restored.collection, "plan");
        let plan: Value =
            serde_json::from_str(&fs::read_to_string(dir.path().join("plan.json")).unwrap())
                .unwrap();
        assert_eq!(plan["n"], 1);
        let before = dir
            .path()
            .join(".sauvegardes")
            .join(restored.backup.expect("copie de l'état d'avant"));
        let saved: Value =
            serde_json::from_str(&fs::read_to_string(before.join("plan.json")).unwrap()).unwrap();
        assert_eq!(saved["n"], 3);
        let listed = backup_files(dir.path());
        assert!(listed.windows(2).all(|w| w[0].saved_at >= w[1].saved_at));
        assert!(restored.bytes > 0);
    }

    #[test]
    fn a_backup_name_never_leaves_the_backup_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert!(backup_source(dir.path(), "../plan.json").is_err());
        assert!(backup_source(dir.path(), "plan.json").is_err());
        assert!(backup_source(dir.path(), ".plan-1.json").is_err());
        assert!(restore(dir.path(), "../settings.json", "20261126-1200").is_err());
    }

    #[test]
    fn a_corrupt_backup_is_refused_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        write_collection(dir.path(), "plan", &json!({"n": 1})).unwrap();
        let backups = dir.path().join(".sauvegardes");
        fs::create_dir_all(&backups).unwrap();
        fs::write(backups.join("plan-000000000000001.json"), "{ pas du json").unwrap();
        assert!(restore(dir.path(), "plan-000000000000001.json", "20261126-1200").is_err());
        let plan: Value =
            serde_json::from_str(&fs::read_to_string(dir.path().join("plan.json")).unwrap())
                .unwrap();
        assert_eq!(plan["n"], 1);
    }

    #[test]
    fn only_known_links_open() {
        assert_eq!(
            link_url("releases"),
            Some("https://github.com/geasshin/sitos/releases")
        );
        assert_eq!(link_url("https://evil.example"), None);
    }
}
