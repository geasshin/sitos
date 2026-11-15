//! Les photos des recettes, gardées sur le Mac.
//!
//! Une fiche ne stocke qu'une adresse. Au premier affichage, l'image est
//! téléchargée une fois dans `covers/` du dossier de l'application, puis servie
//! depuis le disque : plus de requête réseau à chaque ouverture, et les photos
//! restent visibles hors connexion. Le téléchargement passe par `curl`, présent
//! sur macOS, ce qui évite une dépendance HTTP entière pour un simple cache.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

fn covers_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "DATA_DIR_UNAVAILABLE".to_string())?;
    Ok(base.join("covers"))
}

fn key(url: &str) -> String {
    let mut h = DefaultHasher::new();
    url.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Chemin local de l'image, téléchargée au besoin. `None` si le site la refuse :
/// la fiche affiche alors l'adresse d'origine, comme avant.
#[tauri::command]
pub fn cover_cache(app: AppHandle, url: String) -> Option<String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return None;
    }
    let dir = covers_dir(&app).ok()?;
    fs::create_dir_all(&dir).ok()?;
    let file = dir.join(format!("{}.img", key(&url)));
    if let Ok(meta) = fs::metadata(&file) {
        if meta.len() > 0 {
            return Some(file.to_string_lossy().into_owned());
        }
    }
    let part = dir.join(format!("{}.part", key(&url)));
    let ok = Command::new("/usr/bin/curl")
        .args(["-sSL", "--fail", "--max-time", "25", "-o"])
        .arg(&part)
        .arg(&url)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        let _ = fs::remove_file(&part);
        return None;
    }
    fs::rename(&part, &file).ok()?;
    Some(file.to_string_lossy().into_owned())
}

/// Nombre d'images en cache et place occupée, pour l'écran Paramètres.
#[tauri::command]
pub fn cover_cache_info(app: AppHandle) -> (usize, u64) {
    let Ok(dir) = covers_dir(&app) else {
        return (0, 0);
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return (0, 0);
    };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file() && m.len() > 0)
        .fold((0, 0), |(n, bytes), m| (n + 1, bytes + m.len()))
}

/// Vide le cache des photos. Elles seront retéléchargées au prochain affichage.
#[tauri::command]
pub fn clear_cover_cache(app: AppHandle) -> Result<(), String> {
    let dir = covers_dir(&app)?;
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path
            .extension()
            .map(|e| e == "img" || e == "part")
            .unwrap_or(false)
        {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::key;

    #[test]
    fn une_adresse_donne_toujours_la_meme_cle() {
        let a = key("https://exemple.fr/a.jpg");
        assert_eq!(a, key("https://exemple.fr/a.jpg"));
        assert_ne!(a, key("https://exemple.fr/b.jpg"));
        assert_eq!(a.len(), 16);
    }
}
