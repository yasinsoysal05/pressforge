//! PressForge MVP: local-only WordPress manager. No shell interpolation or remote deployment.
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::Write,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, RunEvent, State};
use uuid::Uuid;

#[derive(Default)]
struct AppState {
    operations: Mutex<()>,
    processes: Mutex<HashMap<String, Child>>,
    database_process: Mutex<Option<Child>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Site {
    id: String,
    title: String,
    port: u16,
    admin_user: String,
    locale: String,
    db_name: String,
    directory: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SiteView {
    #[serde(flatten)]
    site: Site,
    running: bool,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewSite {
    title: String,
    admin_user: String,
    admin_password: String,
    admin_email: String,
    db_admin_user: String,
    db_admin_password: String,
    locale: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Dependency {
    name: String,
    installed: bool,
    version: String,
    path: String,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn registry(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("sites.json"))
}

fn sites_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("sites"))
}

fn load_sites(app: &AppHandle) -> Result<Vec<Site>, String> {
    let p = registry(app)?;
    if !p.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&p).map_err(|e| format!("Site kayıtları okunamadı: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("Site kayıtları bozuk: {e}"))
}

fn save_sites(app: &AppHandle, sites: &[Site]) -> Result<(), String> {
    let p = registry(app)?;
    let parent = p.parent().ok_or("Veri dizini belirlenemedi")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = parent.join(format!("sites-{}.tmp", Uuid::new_v4()));
    let data = serde_json::to_vec_pretty(sites).map_err(|e| e.to_string())?;
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}

fn bundle_runtime(app: &AppHandle) -> Option<PathBuf> {
    let root = app.path().resource_dir().ok()?.join("runtime");
    if root.join("php/bin/php").is_file() && root.join("tools/wp-cli.phar").is_file()
        && root.join("mariadb/bin/mariadbd").is_file() {
        Some(root)
    } else { None }
}

// The portable runtime is kept INSIDE Contents/Resources, never modified in place.
// Site databases and logs are stored in Application Support instead.
fn bundled_binary(app: &AppHandle, names: &[&str]) -> Option<PathBuf> {
    let root = bundle_runtime(app)?;
    for name in names {
        let path = match *name {
            "php" => root.join("php/bin/php"),
            "mariadbd" => root.join("mariadb/bin/mariadbd"),
            "mariadb" | "mysql" => root.join("mariadb/bin/mariadb"),
            "mariadb-install-db" => root.join("mariadb/scripts/mariadb-install-db"),
            _ => continue,
        };
        if path.is_file() { return Some(path); }
    }
    None
}

fn app_binary(app: &AppHandle, names: &[&str]) -> Result<PathBuf, String> {
    if bundle_runtime(app).is_some() {
        // Never fall back to a host database/PHP binary if a runtime is bundled.
        return bundled_binary(app, names).ok_or_else(|| {
            format!("Paketlenmiş çalışma ortamında komut eksik: {}", names.join(" / "))
        });
    }
    find_binary(names)
        .ok_or_else(|| format!("Gerekli komut bulunamadı: {}", names.join(" / ")))
}

fn configure_runtime(command: &mut Command, app: &AppHandle) {
    if let Some(runtime) = bundle_runtime(app) {
        // Do not depend on Homebrew/MacPorts binaries installed on the user's Mac.
        // Dynamic libraries must be relocated at build time, not via DYLD overrides.
        command.env(
            "PATH",
            format!(
                "{}:{}:/usr/bin:/bin:/usr/sbin:/sbin",
                runtime.join("mariadb/bin").display(),
                runtime.join("php/bin").display()
            ),
        );
        command.env("PHPRC", runtime.join("php/etc"));
        command.env("PHP_INI_SCAN_DIR", runtime.join("php/etc/conf.d"));
    } else {
        command.env("PATH", runtime_path());
    }
}

fn run_app_capture(app: &AppHandle, program: &Path, args: &[String], stdin_data: Option<&str>) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    configure_runtime(&mut command, app);
    if stdin_data.is_some() { command.stdin(Stdio::piped()); } else { command.stdin(Stdio::null()); }
    let mut child = command.spawn().map_err(|e| format!("{} çalıştırılamadı: {e}", program.display()))?;
    if let Some(input) = stdin_data {
        if let Some(mut pipe) = child.stdin.take() {
            pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() {
        let details = format!("{} {}", stdout, stderr);
        return Err(format!("Komut başarısız ({}): {}", out.status, details.chars().take(1500).collect::<String>()));
    }
    Ok(stdout.trim().to_string())
}

fn portable_socket(app: &AppHandle) -> Result<PathBuf, String> {
    // Unix domain sockets have a short filename length limit on macOS (sun_path ~104 bytes).
    // Use /tmp scoped by the current UID and a hash of the application data path.
    let home = std::env::var_os("HOME").ok_or("HOME ortam değişkeni tanımlı değil")?;
    let private = PathBuf::from(home).join(".pressforge-private");
    fs::create_dir_all(&private).map_err(|e| e.to_string())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&private, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let _ = app; // reserved for future isolated per-instance state
    Ok(private.join("db.sock"))
}

fn ensure_database(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let Some(runtime) = bundle_runtime(app) else { return Ok(()); };
    let server = runtime.join("mariadb/bin/mariadbd");
    let installer = if runtime.join("mariadb/scripts/mariadb-install-db").is_file() {
        runtime.join("mariadb/scripts/mariadb-install-db")
    } else { runtime.join("mariadb/bin/mariadb-install-db") };
    if !server.exists() || !installer.exists() {
        return Err("Paketlenen MariaDB çalışma dosyaları eksik".into());
    }
    let mut active = state.database_process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = active.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() { return Ok(()); }
        *active = None;
    }
    let root = data_dir(app)?.join("database");
    let dbdir = root.join("data");
    fs::create_dir_all(&dbdir).map_err(|e| e.to_string())?;
    if !dbdir.join("mysql").exists() {
        let args = [
            "--no-defaults".into(),
            format!("--basedir={}", runtime.join("mariadb").display()),
            format!("--datadir={}", dbdir.display()),
            "--auth-root-authentication-method=normal".into(),
            "--skip-test-db".into(),
        ];
        run_app_capture(app, &installer, &args, None)
            .map_err(|e| format!("Paketlenmiş MariaDB başlatılamadı: {e}"))?;
    }
    let socket = portable_socket(app)?;
    // The socket lives in an owner-only directory; there is no TCP listener.
    let log = root.join("mariadb.log");
    let mut command = Command::new(server);
    command.args([
        "--no-defaults".to_string(),
        format!("--basedir={}", runtime.join("mariadb").display()),
        format!("--datadir={}", dbdir.display()),
        format!("--socket={}", socket.display()),
        format!("--pid-file={}", root.join("mariadb.pid").display()),
        format!("--log-error={}", log.display()),
        "--skip-networking".into(),
    ]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    configure_runtime(&mut command, app);
    let mut child = command.spawn().map_err(|e| format!("MariaDB başlatılamadı: {e}"))?;
    // Readiness is verified through the private socket, never assumed after a fixed sleep.
    let client = runtime.join("mariadb/bin/mariadb");
    for _ in 0..50 {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("MariaDB kapandı ({status}). Log: {}", log.display()));
        }
        let probe = ["--no-defaults".into(), format!("--socket={}", socket.display()),
            "--protocol=SOCKET".into(), "--user=root".into(), "--execute=SELECT 1".into()];
        if run_app_capture(app, &client, &probe, None).is_ok() {
            *active = Some(child);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err(format!("MariaDB zaman aşımına uğradı; log: {}", log.display()))
}

fn runtime_path() -> String {
    let inherited = std::env::var("PATH").unwrap_or_default();
    format!(
        "/usr/local/bin:/usr/local/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/opt/local/bin:/opt/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin:{inherited}"
    )
}

fn find_binary(names: &[&str]) -> Option<PathBuf> {
    let path = runtime_path();
    for name in names {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(*name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn binary(names: &[&str]) -> Result<PathBuf, String> {
    find_binary(names).ok_or_else(|| format!("Gerekli komut bulunamadı: {}", names.join(" / ")))
}

fn run_capture(program: &Path, args: &[String], stdin_data: Option<&str>) -> Result<String, String> {
    let mut command = Command::new(program);
    command.args(args).env("PATH", runtime_path());
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    if stdin_data.is_some() {
        command.stdin(Stdio::piped());
    } else {
        command.stdin(Stdio::null());
    }
    let mut child = command.spawn().map_err(|e| format!("{} çalıştırılamadı: {e}", program.display()))?;
    if let Some(input) = stdin_data {
        if let Some(mut pipe) = child.stdin.take() {
            pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() {
        let details = format!("{} {}", stdout, stderr);
        // Avoid dumping arbitrary large command output into the frontend.
        return Err(format!("Komut başarısız ({}): {}", out.status, details.chars().take(1500).collect::<String>()));
    }
    Ok(stdout.trim().to_string())
}

fn mysql_exec(app: &AppHandle, state: &AppState, admin: &NewSite, sql: &str) -> Result<(), String> {
    if bundle_runtime(app).is_some() {
        ensure_database(app, state)?;
        let mariadb = app_binary(app, &["mariadb", "mysql"])?;
        let args = vec!["--no-defaults".into(), format!("--socket={}", portable_socket(app)?.display()),
            "--protocol=SOCKET".into(), "--user=root".into(), "--batch".into(), "--skip-column-names".into()];
        return run_app_capture(app, &mariadb, &args, Some(sql)).map(|_| ());
    }
    let mariadb = binary(&["mariadb", "mysql"])?;
    if !valid_ident(&admin.db_admin_user) {
        return Err("Geçersiz MariaDB yönetici kullanıcı adı".into());
    }
    if admin.db_admin_password.chars().any(|c| c == '\n' || c == '\r') {
        return Err("MariaDB yönetici şifresi satır sonu içeremez".into());
    }
    // Tempfile uses OS-enforced private permissions (0600 on Unix); never pass passwords as CLI args.
    let mut config = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    let safe_password = admin.db_admin_password.replace('\\', "\\\\").replace('"', "\\\"");
    write!(config, "[client]\nuser={}\n", admin.db_admin_user).map_err(|e| e.to_string())?;
    if !admin.db_admin_password.is_empty() {
        writeln!(config, "password=\"{}\"", safe_password).map_err(|e| e.to_string())?;
    }
    config.flush().map_err(|e| e.to_string())?;
    let args = vec![
        format!("--defaults-extra-file={}", config.path().display()),
        "--host=localhost".into(),
        "--protocol=SOCKET".into(),
        "--batch".into(),
        "--skip-column-names".into(),
    ];
    run_capture(&mariadb, &args, Some(sql)).map(|_| ())
}

fn valid_ident(s: &str) -> bool {
    !s.is_empty() && s.len() <= 48 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

fn validate(new: &NewSite) -> Result<(), String> {
    if new.title.trim().is_empty() || new.title.chars().count() > 90 {
        return Err("Site adı 1-90 karakter olmalı".into());
    }
    if !valid_ident(&new.admin_user) {
        return Err("WordPress kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir".into());
    }
    if new.admin_password.chars().count() < 12 || new.admin_password.chars().any(|c| c == '\n' || c == '\r') {
        return Err("WordPress yönetici şifresi en az 12 karakter olmalı ve satır sonu içermemeli".into());
    }
    if !new.admin_email.contains('@') || new.admin_email.contains(char::is_whitespace) || new.admin_email.len() > 190 {
        return Err("Geçerli bir e-posta adresi girin".into());
    }
    if new.locale != "tr_TR" && new.locale != "en_US" {
        return Err("Desteklenmeyen dil".into());
    }
    if !valid_ident(&new.db_admin_user) {
        return Err("MariaDB yönetici kullanıcı adı geçersiz".into());
    }
    Ok(())
}

fn choose_port(sites: &[Site]) -> Result<u16, String> {
    let used: HashSet<u16> = sites.iter().map(|s| s.port).collect();
    for port in 10100_u16..11000_u16 {
        if !used.contains(&port) && TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err("Uygun yerel port bulunamadı (10100-10999)".into())
}

fn create_database(app: &AppHandle, state: &AppState, new: &NewSite, name: &str, user: &str, password: &str) -> Result<(), String> {
    // All identifiers and the generated password are ASCII with trusted, restricted alphabet.
    let sql = format!(
        "CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n\
         CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';\n\
         GRANT ALL PRIVILEGES ON `{name}`.* TO '{user}'@'localhost';\n"
    );
    mysql_exec(app, state, new, &sql).map_err(|e| e.replace(password, "[REDACTED]"))
}

fn rollback_database(app: &AppHandle, state: &AppState, new: &NewSite, name: &str, user: &str) -> Result<(), String> {
    mysql_exec(app, state, new, &format!("DROP DATABASE IF EXISTS `{name}`;\nDROP USER IF EXISTS '{user}'@'localhost';\n"))
}

fn wp(app: &AppHandle, args: &[String], input: Option<&str>) -> Result<String, String> {
    if let Some(runtime) = bundle_runtime(app) {
        let php = runtime.join("php/bin/php");
        let mut wp_args = vec![runtime.join("tools/wp-cli.phar").display().to_string()];
        wp_args.extend_from_slice(args);
        return run_app_capture(app, &php, &wp_args, input);
    }
    let exe = binary(&["wp"])?;
    run_capture(&exe, args, input)
}

fn site_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn site_view(site: Site, state: &AppState) -> Result<SiteView, String> {
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    let running = if let Some(child) = processes.get_mut(&site.id) {
        match child.try_wait() {
            Ok(None) => true,
            _ => { processes.remove(&site.id); false }
        }
    } else { false };
    Ok(SiteView { url: site_url(site.port), site, running })
}

#[tauri::command]
fn check_dependencies(app: AppHandle) -> Vec<Dependency> {
    let entries: [(&str, &[&str], &[&str]); 3] = [
        ("PHP", &["php"], &["-v"]),
        ("WP-CLI", &["wp"], &["--version"]),
        ("MariaDB / MySQL", &["mariadb", "mysql"], &["--version"]),
    ];
    let mut results: Vec<Dependency> = entries.iter().map(|(name, names, flags)| {
        let found = if *name == "WP-CLI" {
            bundle_runtime(&app).map(|r| r.join("tools/wp-cli.phar")).or_else(|| find_binary(names))
        } else { bundled_binary(&app, names).or_else(|| find_binary(names)) };
        let version = found.as_ref()
            .and_then(|b| {
                if *name == "WP-CLI" && bundle_runtime(&app).is_some() {
                    wp(&app, &flags.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None).ok()
                } else {
                    run_app_capture(&app, b, &flags.iter().map(|s| s.to_string()).collect::<Vec<_>>(), None).ok()
                }
            })
            .unwrap_or_default()
            .lines().next().unwrap_or("").to_string();
        Dependency {
            name: name.to_string(),
            installed: found.is_some(),
            version,
            path: found.map(|p| p.display().to_string()).unwrap_or_default(),
        }
    }).collect();
    if let Some(php) = bundled_binary(&app, &["php"]).or_else(|| find_binary(&["php"])) {
        let modules = run_app_capture(&app, &php, &["-m".into()], None).unwrap_or_default().to_lowercase();
        results.push(Dependency {
            name: "PHP mysqli".into(),
            installed: modules.lines().any(|line| line.trim() == "mysqli"),
            version: "WordPress veritabanı sürücüsü".into(),
            path: php.display().to_string(),
        });
    } else {
        results.push(Dependency { name: "PHP mysqli".into(), installed: false, version: String::new(), path: String::new() });
    }
    results
}

#[tauri::command]
fn list_sites(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<SiteView>, String> {
    load_sites(&app)?.into_iter().map(|s| site_view(s, &state)).collect()
}

fn create_site_impl(app: &AppHandle, state: &AppState, new: NewSite) -> Result<Site, String> {
    validate(&new)?;
    // Preflight before creating anything on disk.
    let _ = app_binary(app, &["php"])?;
    if bundle_runtime(app).is_none() { let _ = binary(&["wp"])?; }
    let _ = app_binary(app, &["mariadb", "mysql"])?;
    mysql_exec(app, state, &new, "SELECT 1;\n").map_err(|e| format!("MariaDB bağlantısı başarısız. 'brew services start mariadb' komutunu ve yönetici bilgilerini kontrol edin. {e}"))?;

    let mut existing = load_sites(app)?;
    let port = choose_port(&existing)?;
    let id = Uuid::new_v4().simple().to_string();
    let name = format!("pf_{}", &id[..12]);
    let db_user = format!("pf_{}", &id[..12]);
    let db_password = Uuid::new_v4().simple().to_string();
    let root = sites_root(app)?.join(&id);
    let public = root.join("public");
    fs::create_dir_all(&public).map_err(|e| e.to_string())?;

    let mut attempted_db = false;
    let install_result: Result<(), String> = (|| {
        wp(app, &[
            "core".into(), "download".into(),
            format!("--path={}", public.display()),
            format!("--locale={}", new.locale),
        ], None)?;
        attempted_db = true;
        create_database(app, state, &new, &name, &db_user, &db_password)?;
        wp(app, &[
            "config".into(), "create".into(),
            format!("--path={}", public.display()),
            format!("--dbname={name}"),
            format!("--dbuser={db_user}"),
            format!("--dbhost={}", if bundle_runtime(app).is_some() {
                format!("localhost:{}", portable_socket(app)?.display())
            } else { "localhost".into() }),
            "--prompt=dbpass".into(),
            "--skip-check".into(),
        ], Some(&format!("{db_password}\n")))?;
        wp(app, &[
            "core".into(), "install".into(),
            format!("--path={}", public.display()),
            format!("--url={}", site_url(port)),
            format!("--title={}", new.title.trim()),
            format!("--admin_user={}", new.admin_user),
            format!("--admin_email={}", new.admin_email),
            format!("--locale={}", new.locale),
            "--skip-email".into(),
            "--prompt=admin_password".into(),
        ], Some(&format!("{}\n", new.admin_password)))?;
        Ok(())
    })();
    if let Err(err) = install_result {
        let rollback = if attempted_db { rollback_database(app, state, &new, &name, &db_user).err() } else { None };
        let _ = fs::remove_dir_all(&root);
        return Err(match rollback {
            Some(rollback_err) => format!("Kurulum başarısız: {err}. Veritabanı otomatik temizlenemedi: {rollback_err}. Kalan veritabanını '{name}' adıyla kontrol edin."),
            None => format!("Kurulum başarısız, oluşturulan geçici dosyalar temizlendi: {err}"),
        });
    }
    let site = Site {
        id, title: new.title.trim().to_string(), port,
        admin_user: new.admin_user.clone(),
        locale: new.locale.clone(),
        db_name: name.clone(),
        directory: public.display().to_string(),
        created_at: format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()),
    };
    existing.push(site.clone());
    if let Err(err) = save_sites(app, &existing) {
        let rollback = rollback_database(app, state, &new, &name, &db_user).err();
        let _ = fs::remove_dir_all(&root);
        return Err(format!("Site kaydı yazılamadı: {err}. DB rollback: {}", rollback.unwrap_or_else(|| "başarılı".into())));
    }
    Ok(site)
}

#[tauri::command]
async fn create_site(app: AppHandle, new_site: NewSite) -> Result<SiteView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.operations.lock().map_err(|e| e.to_string())?;
        let site = create_site_impl(&app, &state, new_site)?;
        let _ = start_site_impl(&app, &state, &site.id);
        site_view(site, &state)
    }).await.map_err(|e| e.to_string())?
}

fn router_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = data_dir(app)?.join("router.php");
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(&path, include_str!("router.php")).map_err(|e| e.to_string())?;
    Ok(path)
}

fn start_site_impl(app: &AppHandle, state: &AppState, id: &str) -> Result<(), String> {
    let site = load_sites(app)?.into_iter().find(|s| s.id == id).ok_or("Site bulunamadı")?;
    let public = sites_root(app)?.join(&site.id).join("public");
    if !public.join("index.php").exists() { return Err("WordPress dosyaları bulunamadı".into()); }
    let php = app_binary(app, &["php"])?;
    ensure_database(app, state)?;
    let router = router_path(app)?;
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    if let Some(child) = processes.get_mut(id) {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() { return Ok(()); }
        processes.remove(id);
    }
    if TcpListener::bind(("127.0.0.1", site.port)).is_err() {
        return Err(format!("{} portu başka bir uygulama tarafından kullanılıyor", site.port));
    }
    let log = site_log_path(app, id)?;
    let stdout = File::options().create(true).append(true).open(&log).map_err(|e| e.to_string())?;
    let stderr = stdout.try_clone().map_err(|e| e.to_string())?;
    let mut command = Command::new(php);
    configure_runtime(&mut command, app);
    let mut child = command
        .arg("-S").arg(format!("127.0.0.1:{}", site.port))
        .arg("-t").arg(&public)
        .arg(&router)
        .current_dir(&public)
        .stdin(Stdio::null()).stdout(Stdio::from(stdout)).stderr(Stdio::from(stderr))
        .spawn().map_err(|e| format!("PHP sunucusu başlatılamadı: {e}"))?;
    thread::sleep(Duration::from_millis(180));
    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
        return Err(format!("PHP sunucusu başlangıçta kapandı ({status}); logları kontrol edin"));
    }
    processes.insert(id.into(), child);
    Ok(())
}

#[tauri::command]
fn start_site(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let _lock = state.operations.lock().map_err(|e| e.to_string())?;
    start_site_impl(&app, &state, &id)
}

fn stop_site_impl(state: &AppState, id: &str) -> Result<(), String> {
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = processes.remove(id) {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            child.kill().map_err(|e| e.to_string())?;
            let _ = child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
fn stop_site(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let _lock = state.operations.lock().map_err(|e| e.to_string())?;
    if !load_sites(&app)?.iter().any(|s| s.id == id) { return Err("Site bulunamadı".into()); }
    stop_site_impl(&state, &id)
}

#[tauri::command]
fn archive_site(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let _lock = state.operations.lock().map_err(|e| e.to_string())?;
    let mut sites = load_sites(&app)?;
    if !sites.iter().any(|s| s.id == id) { return Err("Site bulunamadı".into()); }
    stop_site_impl(&state, &id)?;
    let source = sites_root(&app)?.join(&id);
    let archive = data_dir(&app)?.join("archive");
    fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
    let target = archive.join(format!("{}-{}", id, &Uuid::new_v4().simple().to_string()[..8]));
    fs::rename(source, target).map_err(|e| format!("Site arşivlenemedi: {e}"))?;
    sites.retain(|s| s.id != id);
    save_sites(&app, &sites)
    // DB is intentionally retained: archiving is a reversible file-level operation, not deletion.
}

fn site_log_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(sites_root(app)?.join(id).join("php.log"))
}

#[tauri::command]
fn read_log(app: AppHandle, id: String) -> Result<String, String> {
    if !load_sites(&app)?.iter().any(|s| s.id == id) { return Err("Site bulunamadı".into()); }
    let file = site_log_path(&app, &id)?;
    if !file.exists() { return Ok("Henüz PHP log kaydı yok.".into()); }
    let data = fs::read(file).map_err(|e| e.to_string())?;
    let start = data.len().saturating_sub(24_000);
    Ok(String::from_utf8_lossy(&data[start..]).to_string())
}

#[tauri::command]
fn open_site(app: AppHandle, id: String, target: String) -> Result<(), String> {
    let site = load_sites(&app)?.into_iter().find(|s| s.id == id).ok_or("Site bulunamadı")?;
    let destination = match target.as_str() {
        "website" => site_url(site.port),
        "admin" => format!("{}/wp-admin/", site_url(site.port)),
        "folder" => sites_root(&app)?.join(&id).join("public").display().to_string(),
        _ => return Err("Geçersiz açma hedefi".into()),
    };
    if !cfg!(target_os = "macos") { return Err("Bu özellik şu anda yalnızca macOS için geliştirildi".into()); }
    let status = Command::new("/usr/bin/open").arg(destination).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("macOS open komutu başarısız".into()); }
    Ok(())
}

#[tauri::command]
fn open_help(target: String) -> Result<(), String> {
    let url = match target.as_str() {
        "cli" => "https://developer.wordpress.org/cli/commands/",
        "wordpress" => "https://wordpress.org/support/",
        _ => return Err("Geçersiz yardım bağlantısı".into()),
    };
    if !cfg!(target_os = "macos") { return Err("macOS gerektirir".into()); }
    let status = Command::new("/usr/bin/open").arg(url).status().map_err(|e| e.to_string())?;
    if !status.success() { return Err("Bağlantı açılamadı".into()); }
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            check_dependencies, list_sites, create_site, start_site, stop_site,
            archive_site, read_log, open_site, open_help,
        ])
        .build(tauri::generate_context!())
        .expect("PressForge başlatılamadı");
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            let state = handle.state::<AppState>();
            if let Ok(mut processes) = state.processes.lock() {
                for (_, mut child) in processes.drain() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            if let Ok(mut db) = state.database_process.lock() {
                if let Some(mut child) = db.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            };
        }
    });
}
