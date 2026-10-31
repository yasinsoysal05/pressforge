//! Modular, local-first WordPress tooling. No arbitrary shell execution,
//! privilege escalation, remote deployment or hidden external installers.
use super::*;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioModule {
    id: &'static str,
    label: &'static str,
    group: &'static str,
    status: &'static str,
    version: String,
    description: &'static str,
    toggleable: bool,
    enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WpExtension {
    name: String,
    status: String,
    version: String,
    update: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteSnapshot {
    id: String,
    site_id: String,
    site_title: String,
    created_at: u64,
    size_bytes: u64,
    database_included: bool,
}

fn mod_entry(
    id: &'static str, label: &'static str, group: &'static str,
    enabled: bool, available: bool, description: &'static str, version: String,
) -> StudioModule {
    StudioModule {
        id, label, group,
        status: if !available { "planned" } else if enabled { "ready" } else { "missing" },
        description, version, toggleable: matches!(id, "extensions" | "snapshots"), enabled: true,
    }
}

fn module_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(super::data_dir(app)?.join("modules.json"))
}

fn read_module_settings(app: &AppHandle) -> Result<HashMap<String, bool>, String> {
    let path = module_settings_path(app)?;
    if !path.exists() { return Ok(HashMap::new()); }
    let content = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&content)
        .map_err(|_| "Modül ayar dosyası bozuk; hiçbir modül işlemi yapılmadı".to_owned())
}

fn enabled_module(app: &AppHandle, module: &str) -> Result<(), String> {
    if !read_module_settings(app)?.get(module).copied().unwrap_or(true) {
        return Err(format!("{module} modülü Modül Merkezi'nden devre dışı bırakılmış"));
    }
    Ok(())
}

#[tauri::command]
pub fn set_studio_module_enabled(
    app: AppHandle, state: State<'_, AppState>, module_id: String, enabled: bool,
) -> Result<(), String> {
    if !matches!(module_id.as_str(), "extensions" | "snapshots") {
        return Err("Yalnızca isteğe bağlı site modülleri açılıp kapatılabilir".into());
    }
    let _lock = state.operations.lock().map_err(|e| e.to_string())?;
    let mut settings = read_module_settings(&app)?;
    settings.insert(module_id, enabled);
    let path = module_settings_path(&app)?;
    let parent = path.parent().ok_or("Modül ayar dizini bulunamadı")?;
    super::ensure_private_directory(parent)?;
    let tmp = parent.join(format!("modules-{}.tmp", Uuid::new_v4().simple()));
    fs::write(&tmp, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_studio_modules(app: AppHandle) -> Result<Vec<StudioModule>, String> {
    let deps = super::check_dependencies(app.clone());
    let ok = |name: &str| deps.iter().find(|d| d.name == name).is_some_and(|d| d.installed);
    let vers = |name: &str| deps.iter().find(|d| d.name == name).map_or_else(
        String::new, |d| d.version.clone()
    );
    let php = ok("PHP") && ok("PHP mysqli");
    let wpcli = ok("WP-CLI");
    let db = ok("MariaDB / MySQL") && (
        !super::bundled_engine_required(&app) || ok("MariaDB server")
    );
    // Snapshots need an actual SQL dump executable. The DB client alone does
    // not guarantee that a full backup can be created.
    let sql_dump = if super::bundled_engine_required(&app) {
        super::bundle_runtime(&app).is_some_and(|root| {
            root.join("mariadb/bin/mariadb-dump").is_file()
                || root.join("mariadb/bin/mysqldump").is_file()
        })
    } else {
        super::find_binary(&["mariadb-dump", "mysqldump"]).is_some()
    };
    let settings = read_module_settings(&app)?;
    let mut modules = vec![
        mod_entry("php", "PHP Engine", "runtime", php, true,
            "Sistem/bundle PHP sürümü ve mysqli sürücüsü", vers("PHP")),
        mod_entry("mariadb", "MariaDB", "runtime", db, true,
            "Site başına veritabanı; paketli modda özel Unix socket", vers("MariaDB / MySQL")),
        mod_entry("wpcli", "WP-CLI", "runtime", wpcli, true,
            "WordPress çekirdek, eklenti ve tema komutları", vers("WP-CLI")),
        mod_entry("webserver", "PHP Development Server", "runtime", php, true,
            "127.0.0.1 üzerinde siteye özel port; dışa açık değil", String::new()),
        mod_entry("extensions", "Plugin & Theme Manager", "site", php && wpcli && db, true,
            "Eklenti/tema listele, etkinleştir veya devre dışı bırak", String::new()),
        mod_entry("snapshots", "Snapshots", "site", php && wpcli && db && sql_dump, true,
            "Site dosyaları + SQL dump içeren yerel snapshot", String::new()),
        mod_entry("logs", "PHP Logs", "site", true, true,
            "Siteye özel hata logu görüntüleme", String::new()),
        mod_entry("database", "Database Inspector", "site", php && wpcli && db, true,
            "Veritabanı tabloları ve kolon şeması (salt-okunur)", String::new()),
        mod_entry("ssl", "Local HTTPS / SSL", "network", false, false,
            "Özel domain için güvenilir geliştirme sertifikası", String::new()),
        mod_entry("domains", "Custom Domains", "network", false, false,
            ".test alan adı ve sistem hosts yönlendirmesi", String::new()),
        mod_entry("php_versions", "Multiple PHP Versions", "runtime", false, false,
            "Site bazında PHP sürümü seçimi", String::new()),
        mod_entry("server_adapters", "Apache / Nginx", "runtime", false, false,
            "Seçilebilir web sunucusu adaptörleri", String::new()),
        mod_entry("clone_import", "Clone / Import / Export", "site", false, false,
            "Veritabanıyla birlikte kopyalama ve taşıma", String::new()),
        mod_entry("git", "Git & GitHub", "integration", false, false,
            "Branch, commit, diff ve proje sürüm kontrolü", String::new()),
        mod_entry("deployment", "Deploy / Rollback", "integration", false, false,
            "SSH üzerinden aaPanel, cPanel, Plesk ve staging yayınlama", String::new()),
        mod_entry("live_sync", "Live Sync", "integration", false, false,
            "Seçimle eşitleme; yayın öncesi yedek ve onay", String::new()),
        mod_entry("diagnostics", "AI Diagnostics", "integration", false, false,
            "WordPress/Elementor uyumluluk ve performans analizi", String::new()),
    ];
    for item in &mut modules {
        if item.toggleable {
            item.enabled = settings.get(item.id).copied().unwrap_or(true);
            if !item.enabled { item.status = "disabled"; }
        }
    }
    Ok(modules)
}

fn validated_site(app: &AppHandle, id: &str) -> Result<(Site, PathBuf), String> {
    // Site IDs must never be accepted as arbitrary paths from a UI invocation.
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Geçersiz site kimliği".into());
    }
    let site = super::load_sites(app)?.into_iter()
        .find(|s| s.id == id).ok_or("Site bulunamadı")?;
    let public = super::sites_root(app)?.join(&site.id).join("public");
    if !public.join("wp-config.php").is_file() {
        return Err("WordPress yapılandırması bulunamadı".into());
    }
    Ok((site, public))
}

fn wp_site(app: &AppHandle, id: &str, kind: &str, action: &str, slug: Option<&str>)
    -> Result<String, String> {
    let (_site, public) = validated_site(app, id)?;
    let mut args = vec![kind.to_owned(), action.to_owned()];
    if let Some(name) = slug { args.push(name.to_owned()); }
    args.push(format!("--path={}", public.display()));
    args.push("--quiet".into());
    super::wp(app, &args, None)
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if matches!(kind, "plugin" | "theme") { Ok(()) }
    else { Err("Sadece WordPress eklenti ve temaları desteklenir".into()) }
}

fn validate_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() || slug.len() > 150 ||
        !slug.split('/').all(|component| !component.is_empty()
            && component.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
    {
        return Err("Geçersiz eklenti/tema slug değeri".into());
    }
    Ok(())
}

fn parse_extensions(input: &str) -> Result<Vec<WpExtension>, String> {
    let parsed: Value = serde_json::from_str(input)
        .map_err(|_| "WP-CLI beklenmeyen JSON cevabı verdi".to_owned())?;
    let entries = parsed.as_array().ok_or("WP-CLI liste biçimi geçersiz")?;
    let mut out = Vec::new();
    for e in entries {
        let field = |k: &str| e.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
        let name = field("name");
        validate_slug(&name)?;
        out.push(WpExtension {
            name, status: field("status"), version: field("version"), update: field("update")
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn list_site_extensions(
    app: AppHandle, id: String, kind: String,
) -> Result<Vec<WpExtension>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_kind(&kind)?;
        enabled_module(&app, "extensions")?;
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        super::ensure_database(&app, &state)?;
        let (_site, public) = validated_site(&app, &id)?;
        let output = super::wp(&app, &[
            kind, "list".into(), "--format=json".into(), "--quiet".into(),
            format!("--path={}", public.display())
        ], None)?;
        parse_extensions(&output)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn manage_site_extension(
    app: AppHandle, id: String, kind: String, slug: String, action: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_kind(&kind)?;
        enabled_module(&app, "extensions")?;
        validate_slug(&slug)?;
        if !(action == "activate" || action == "deactivate" && kind == "plugin") {
            return Err("Desteklenmeyen eklenti/tema işlemi".into());
        }
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        super::ensure_database(&app, &state)?;
        wp_site(&app, &id, &kind, &action, Some(&slug))?;
        Ok(format!("{}: {} {}", kind, slug, action))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_site_maintenance(
    app: AppHandle, id: String, operation: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let args: &[&str] = match operation.as_str() {
            "cache_flush" => &["cache", "flush"],
            "rewrite_flush" => &["rewrite", "flush"],
            "core_verify" => &["core", "verify-checksums"],
            _ => return Err("Desteklenmeyen bakım işlemi".into()),
        };
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        super::ensure_database(&app, &state)?;
        let (_site, public) = validated_site(&app, &id)?;
        let mut command: Vec<String> = args.iter().map(|x| x.to_string()).collect();
        command.push(format!("--path={}", public.display()));
        let result = super::wp(&app, &command, None)?;
        Ok(if result.is_empty() {
            format!("{operation} tamamlandı")
        } else { result.chars().take(3000).collect() })
    }).await.map_err(|e| e.to_string())?
}

fn parse_database_tables(input: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for row in input.lines() {
        let table = row.trim();
        if table.is_empty() { continue; }
        if table.len() > 200 ||
            !table.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            return Err("WP-CLI geçersiz veritabanı tablo adı döndürdü".into());
        }
        if !out.iter().any(|v| v == table) { out.push(table.to_string()); }
        if out.len() > 1500 {
            return Err("Veritabanı tablo sınırı aşıldı".into());
        }
    }
    Ok(out)
}

fn database_tables_for_site(app: &AppHandle, public: &Path) -> Result<Vec<String>, String> {
    // WP-CLI reads wp-config.php and uses the site's own database credentials.
    // No arbitrary SQL, interactive mysql shell or user-supplied CLI flags.
    let output = super::wp(app, &[
        "db".into(), "tables".into(), "--format=list".into(),
        "--all-tables-with-prefix".into(), "--skip-plugins".into(),
        "--skip-themes".into(), "--skip-packages".into(),
        "--quiet".into(), format!("--path={}", public.display()),
    ], None)?;
    parse_database_tables(&output)
}

#[tauri::command]
pub async fn list_site_database_tables(app: AppHandle, id: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        super::ensure_database(&app, &state)?;
        let (_, public) = validated_site(&app, &id)?;
        database_tables_for_site(&app, &public)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn inspect_site_database_table(
    app: AppHandle, id: String, table: String,
) -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        super::ensure_database(&app, &state)?;
        let (_, public) = validated_site(&app, &id)?;
        let tables = database_tables_for_site(&app, &public)?;
        if !tables.contains(&table) {
            return Err("Tablo bu WordPress sitesinin veritabanına ait değil".into());
        }
        let output = super::wp(&app, &[
            "db".into(), "columns".into(), table,
            "--format=json".into(), "--skip-plugins".into(),
            "--skip-themes".into(), "--skip-packages".into(),
            "--quiet".into(), format!("--path={}", public.display()),
        ], None)?;
        let parsed: Value = serde_json::from_str(&output)
            .map_err(|_| "Veritabanı kolon bilgisi geçersiz JSON döndürdü")?;
        let rows = parsed.as_array().ok_or("Kolon yanıtı beklenen diziyi içermiyor")?;
        if rows.len() > 500 { return Err("Kolon sayısı güvenlik sınırını aştı".into()); }
        Ok(rows.clone())
    }).await.map_err(|e| e.to_string())?
}

fn copy_regular_tree(from: &Path, to: &Path, level: usize) -> Result<u64, String> {
    if level > 64 { return Err("Snapshot klasör derinliği sınırı aşıldı".into()); }
    if !from.is_dir() || from.is_symlink() { return Err("Güvenli olmayan kaynak klasör".into()); }
    super::ensure_private_directory(to)?;
    let mut bytes = 0_u64;
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let dest = to.join(entry.file_name());
        if metadata.file_type().is_symlink() {
            return Err(format!("Snapshot içinde sembolik bağlantı desteklenmiyor: {}", path.display()));
        }
        if metadata.is_dir() {
            bytes = bytes.saturating_add(copy_regular_tree(&path, &dest, level + 1)?);
        } else if metadata.is_file() {
            fs::copy(&path, &dest).map_err(|e| e.to_string())?;
            bytes = bytes.saturating_add(metadata.len());
        } else {
            return Err("Snapshot içinde özel dosya tipi bulundu".into());
        }
    }
    Ok(bytes)
}

fn snapshots_root(app: &AppHandle, site: &str) -> Result<PathBuf, String> {
    Ok(super::data_dir(app)?.join("snapshots").join(site))
}

#[tauri::command]
pub async fn create_site_snapshot(app: AppHandle, id: String) -> Result<SiteSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        enabled_module(&app, "snapshots")?;
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        let (site, public) = validated_site(&app, &id)?;
        let active = state.processes.lock().map_err(|e| e.to_string())?;
        if active.contains_key(&id) {
            return Err("Tutarlı snapshot için siteyi önce durdurun".into());
        }
        drop(active);
        super::ensure_database(&app, &state)?;
        let snapshot_id = Uuid::new_v4().simple().to_string();
        let root = snapshots_root(&app, &id)?;
        super::ensure_private_directory(&root)?;
        let pending = root.join(format!(".{snapshot_id}.partial"));
        let target = root.join(&snapshot_id);
        super::ensure_private_directory(&pending)?;
        let outcome = (|| {
            let dump = pending.join("database.sql");
            // Incomplete / missing SQL export MUST fail the entire snapshot.
            super::wp(&app, &[
                "db".into(), "export".into(), dump.display().to_string(),
                format!("--path={}", public.display()), "--quiet".into(),
            ], None)?;
            if !dump.is_file() || fs::metadata(&dump).map_err(|e| e.to_string())?.len() == 0 {
                return Err("Veritabanı dump dosyası üretilemedi".into());
            }
            let bytes = copy_regular_tree(&public, &pending.join("files"), 0)?;
            let sql_size = fs::metadata(&dump).map_err(|e| e.to_string())?.len();
            let created_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?.as_secs();
            let snapshot = SiteSnapshot {
                id: snapshot_id.clone(), site_id: id.clone(), site_title: site.title,
                created_at, size_bytes: bytes.saturating_add(sql_size), database_included: true,
            };
            fs::write(pending.join("snapshot.json"),
                serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            fs::rename(&pending, &target).map_err(|e| e.to_string())?;
            Ok(snapshot)
        })();
        if outcome.is_err() { let _ = fs::remove_dir_all(&pending); }
        outcome
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_site_snapshots(app: AppHandle, id: String) -> Result<Vec<SiteSnapshot>, String> {
    enabled_module(&app, "snapshots")?;
    let (_site, _) = validated_site(&app, &id)?;
    let root = snapshots_root(&app, &id)?;
    if !root.exists() { return Ok(Vec::new()); }
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_symlink() || !entry.path().is_dir() { continue; }
        let manifest = entry.path().join("snapshot.json");
        if !manifest.is_file() { continue; }
        let snapshot: SiteSnapshot = serde_json::from_slice(
            &fs::read(manifest).map_err(|e| e.to_string())?
        ).map_err(|e| e.to_string())?;
        if snapshot.site_id == id && snapshot.database_included
            && entry.path().join("database.sql").is_file()
            && entry.path().join("files/wp-config.php").is_file()
        {
            snapshots.push(snapshot);
        }
    }
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

#[tauri::command]
pub fn open_site_snapshots_folder(app: AppHandle, id: String) -> Result<(), String> {
    enabled_module(&app, "snapshots")?;
    let (_site, _public) = validated_site(&app, &id)?;
    let folder = snapshots_root(&app, &id)?;
    super::ensure_private_directory(&folder)?;
    if !cfg!(target_os = "macos") {
        return Err("Snapshot klasörü açma işlemi yalnızca macOS ile desteklenir".into());
    }
    let status = Command::new("/usr/bin/open")
        .arg(&folder).status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Snapshot klasörü Finder içinde açılamadı".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn table_names_must_be_safe_and_bounded() {
        assert_eq!(parse_database_tables("wp_posts\nwp_options\nwp_posts\n").unwrap(),
            vec!["wp_posts".to_string(), "wp_options".to_string()]);
        for unsafe_input in ["wp_posts; DROP TABLE users", "wp_a/../../", "wp_foo\u{0}bar"] {
            assert!(parse_database_tables(unsafe_input).is_err());
        }
    }
    #[test]
    fn restricts_wp_extension_slugs() {
        for safe in ["akismet", "hello-dolly", "elementor/elementor", "twentytwentyfive"] {
            assert!(validate_slug(safe).is_ok());
        }
        for bad in ["", "../etc", "foo;whoami", "-x/$HOME", "a b", "/root", "foo//bar"] {
            assert!(validate_slug(bad).is_err(), "{bad}");
        }
    }
    #[test]
    fn parses_wpcli_extension_json() {
        let result = parse_extensions(
            r#"[{"name":"akismet","status":"inactive","version":"5.0","update":"none"}]"#
        ).unwrap();
        assert_eq!(result[0].name, "akismet");
        assert_eq!(result[0].status, "inactive");
    }
    #[test]
    fn blocks_symlinks_in_file_snapshots() {
        #[cfg(unix)] {
            use std::os::unix::fs::symlink;
            let src = tempfile::tempdir().unwrap();
            let dst = tempfile::tempdir().unwrap();
            symlink("/etc", src.path().join("link")).unwrap();
            let result = copy_regular_tree(src.path(), &dst.path().join("copy"), 0);
            assert!(result.is_err());
        }
    }
}
