import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity, Archive, ArrowRight, Check, ChevronRight, CircleHelp, Clock3,
  Code2, Database, ExternalLink, FileText, FolderOpen, Globe2, HardDrive,
  Layers3, Loader2, LockKeyhole, Monitor, MoreHorizontal, Play, Plus,
  RefreshCw, Search, Server, ShieldCheck, Square, TerminalSquare, X,
} from 'lucide-react';
import './styles.css';

type Site = {
  id: string;
  title: string;
  port: number;
  adminUser: string;
  locale: string;
  dbName: string;
  directory: string;
  createdAt: string;
  running: boolean;
  url: string;
};
type Dependency = { name: string; installed: boolean; version: string; path: string };
type CreateSite = {
  title: string; adminUser: string; adminPassword: string;
  adminEmail: string; dbAdminUser: string; dbAdminPassword: string;
  locale: 'tr_TR' | 'en_US';
};
const initialForm: CreateSite = {
  title: '', adminUser: 'admin', adminPassword: '', adminEmail: '',
  dbAdminUser: 'root', dbAdminPassword: '', locale: 'tr_TR',
};

function IconMark({ size = 40 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size }}><Layers3 size={size * .51} strokeWidth={2.4} /></span>;
}

function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSite>({ ...initialForm });
  const [logSite, setLogSite] = useState<Site | null>(null);
  const [logs, setLogs] = useState('');
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [sitesResult, depResult] = await Promise.all([
      invoke<Site[]>('list_sites'), invoke<Dependency[]>('check_dependencies'),
    ]);
    setSites(sitesResult);
    setDeps(depResult);
  }, []);

  useEffect(() => {
    refresh().catch(e => setNotice({ kind: 'error', message: String(e) }))
      .finally(() => setLoading(false));
  }, [refresh]);

  const notifyError = (e: unknown) => setNotice({ kind: 'error', message: String(e) });
  const allReady = deps.length > 0 && deps.every(d => d.installed);
  const bundledRuntime = deps.some(d => d.installed && (d.path.includes('/Resources/runtime/') || d.path.includes('/resources/runtime/')));
  const running = sites.filter(s => s.running).length;
  const visibleSites = useMemo(() => sites.filter(s =>
    `${s.title} ${s.url} ${s.adminUser}`.toLowerCase().includes(search.toLowerCase())), [sites, search]);

  async function runAction(key: string, action: () => Promise<unknown>, success?: string) {
    setWorking(key); setMenu(null); setNotice(null);
    try {
      await action();
      await refresh();
      if (success) setNotice({ kind: 'success', message: success });
    } catch (e) { notifyError(e); }
    finally { setWorking(''); }
  }

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    if (!allReady || working) return;
    await runAction('create', async () => {
      await invoke('create_site', { newSite: form });
      setShowForm(false);
      setForm({ ...initialForm });
    }, 'Yeni WordPress siteniz oluşturuldu.');
  }

  async function openSite(site: Site, target: 'website' | 'admin' | 'folder') {
    try { await invoke('open_site', { id: site.id, target }); }
    catch (e) { notifyError(e); }
  }

  async function showLogs(site: Site) {
    setMenu(null);
    setLogSite(site);
    setLogs('Log dosyası okunuyor…');
    try { setLogs(await invoke<string>('read_log', { id: site.id })); }
    catch (e) { setLogs(String(e)); }
  }

  async function archiveSite(site: Site) {
    setMenu(null);
    const accepted = window.confirm(`${site.title} projesini arşivlemek istiyor musunuz?\n\nSite dosyaları arşive taşınacak, veritabanı silinmeyecektir. Ana listeden kaldırılacaktır.`);
    if (accepted) await runAction(site.id, () => invoke('archive_site', { id: site.id }), 'Proje dosyaları arşivlendi. Veritabanı korundu.');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><IconMark /><div><strong>PressForge</strong><span>DEVELOPER STUDIO</span></div></div>
      <div className="sidebar-heading">WORKSPACE</div>
      <nav className="side-links" aria-label="Ana menü">
        <button className="side-link selected"><Monitor size={18} /> Sitelerim <span className="nav-count">{sites.length}</span></button>
        <button className="side-link" onClick={() => document.getElementById('environment')?.scrollIntoView({ behavior: 'smooth' })}><Server size={18} /> Yerel ortam <ChevronRight size={16} className="side-chevron" /></button>
      </nav>
      <div className="sidebar-heading tool-heading">HIZLI ERİŞİM</div>
      <div className="side-links">
        <button className="side-link" onClick={() => invoke('open_help', { target: 'cli' }).catch(notifyError)}><TerminalSquare size={18} /> WP-CLI belgeleri <ExternalLink size={14} className="side-chevron" /></button>
        <button className="side-link" onClick={() => invoke('open_help', { target: 'wordpress' }).catch(notifyError)}><CircleHelp size={18} /> WordPress destek <ExternalLink size={14} className="side-chevron" /></button>
      </div>
      <div className="sidebar-spacer" />
      <div className="local-card"><div className="local-icon"><ShieldCheck size={19} /></div><strong>Local-first</strong><p>Projelerin ve veritabanların yalnızca kendi bilgisayarında.</p><div className="local-footer"><span className="green-dot"/> Yerel geliştirme modu</div></div>
      <div className="sidebar-bottom"><IconMark size={27} /><div><strong>PressForge <small>v0.2.0</small></strong><span>Intel macOS Ventura hedefli</span></div></div>
    </aside>

    <main className="main">
      <div className="topbar"><div className="crumb">Workspace <ChevronRight size={13} /> <strong>Sitelerim</strong></div><div className="top-note"><span className="green-dot" /> LOCAL ENVIRONMENT <span className="top-divider"/> <Code2 size={17}/></div></div>
      <section className="main-content">
        <div className="hero"><div className="hero-text"><div className="eyebrow"><span className="eyebrow-circle" /> WORDPRESS DEVELOPMENT ENVIRONMENT</div><h1>Kodla. Geliştir.<br/><em>Özgürce üret.</em></h1><p>WordPress projelerini yerel ortamında oluştur, çalıştır ve tek bir yerden yönet. Karmaşık sunucu ayarlarına gerek yok.</p><button className="primary-btn" onClick={() => setShowForm(true)}><Plus size={19}/> Yeni WordPress sitesi <ArrowRight size={17}/></button></div><div className="hero-decor" aria-hidden="true"><div className="orb"><div className="orb-inner"><Layers3 size={70}/></div></div><div className="floating-pill pill-top"><span className="green-dot"/> Server ready</div><div className="floating-pill pill-bottom"><TerminalSquare size={14}/> PHP / MySQL</div></div></div>
        <div className="metrics"><div className="metric"><div className="metric-icon blue"><HardDrive size={19}/></div><div><span>Toplam proje</span><strong>{sites.length.toString().padStart(2,'0')}</strong></div></div><div className="metric"><div className="metric-icon green"><Activity size={19}/></div><div><span>Çalışan siteler</span><strong>{running.toString().padStart(2,'0')}</strong></div></div><div className="metric"><div className="metric-icon violet"><Database size={19}/></div><div><span>Yerel veritabanı</span><strong>{sites.length.toString().padStart(2,'0')}</strong></div></div></div>

        <div className="section-heading"><div><h2>Projelerim <span>{sites.length}</span></h2><p>Tüm WordPress çalışma alanların</p></div><div className="actions"><div className="search-box"><Search size={17}/><input aria-label="Projelerde ara" placeholder="Projelerde ara..." value={search} onChange={e => setSearch(e.target.value)}/></div><button title="Yenile" aria-label="Listeyi yenile" className="icon-button" onClick={() => runAction('refresh', refresh)} disabled={!!working}><RefreshCw size={18} className={working === 'refresh' ? 'spin' : ''} /></button></div></div>
        {loading ? <div className="empty-state"><Loader2 className="spin"/><p>Çalışma alanı yükleniyor…</p></div> : visibleSites.length === 0 ? <div className="empty-state"><div className="empty-art"><Layers3 size={33}/></div><h3>{search ? 'Aramanızla eşleşen proje yok' : 'İlk projenizi oluşturun'}</h3><p>{search ? 'Farklı bir arama terimi deneyin.' : 'Yeni bir WordPress sitesi oluşturduğunuzda burada görünecek.'}</p>{!search && <button onClick={() => setShowForm(true)} className="outline-btn"><Plus size={16}/> Site oluştur</button>}</div> : <div className="sites-grid">{visibleSites.map(site => <article className="site-card" key={site.id}>
          <div className="site-card-header"><div className="wp-symbol">W</div><div className="site-title"><strong>{site.title}</strong><span>{site.url}</span></div><div className="relative"><button aria-label="Proje seçenekleri" className="bare-button" onClick={() => setMenu(menu === site.id ? null : site.id)}><MoreHorizontal size={20}/></button>{menu === site.id && <div className="dropdown"><button onClick={() => showLogs(site)}><FileText size={15}/> PHP loglarını aç</button><button onClick={() => openSite(site,'folder')}><FolderOpen size={15}/> Proje klasörü</button><button className="danger-text" onClick={() => archiveSite(site)}><Archive size={15}/> Arşivle</button></div>}</div></div>
          <div className="site-tags"><span className={`state-pill ${site.running ? 'online' : 'offline'}`}><span className="green-dot"/>{site.running ? 'Çalışıyor' : 'Durduruldu'}</span><span className="subtle-chip">WordPress</span><span className="subtle-chip">{site.locale === 'tr_TR' ? 'Türkçe' : 'English'}</span></div>
          <div className="site-info"><div><Globe2 size={15}/><span>Adres</span><strong>{site.url.replace('http://','')}</strong></div><div><Database size={15}/><span>Veritabanı</span><strong title={site.dbName}>{site.dbName}</strong></div><div><Clock3 size={15}/><span>Oluşturuldu</span><strong>{new Date(Number(site.createdAt) * 1000).toLocaleDateString('tr-TR')}</strong></div></div>
          <div className="site-footer"><button className="site-open" disabled={!site.running} onClick={() => openSite(site,'website')}><ExternalLink size={15}/> Siteyi aç</button><button className="site-open" disabled={!site.running} onClick={() => openSite(site,'admin')}>WP Admin</button><button className={`site-power ${site.running ? 'stop' : 'start'}`} disabled={!!working} title={site.running ? 'Durdur' : 'Başlat'} aria-label={site.running ? 'Siteyi durdur' : 'Siteyi başlat'} onClick={() => runAction(site.id, () => invoke(site.running ? 'stop_site' : 'start_site', { id: site.id }))}>{working === site.id ? <Loader2 size={16} className="spin"/> : site.running ? <Square size={15}/> : <Play size={15}/>}</button></div>
        </article>)}</div>}

        <section className="environment" id="environment"><div className="env-head"><div><div className="eyebrow">SYSTEM HEALTH</div><h2>Yerel ortam</h2><p>{bundledRuntime ? 'Gerekli PHP, WP-CLI ve MariaDB uygulama paketinden çalıştırılıyor.' : 'Geliştirici modu: eksik bağımlılıkları sisteminize kurmanız gerekir.'}</p></div><button className="outline-btn" disabled={!!working} onClick={() => runAction('refresh', refresh)}><RefreshCw size={15}/> Tekrar kontrol et</button></div><div className="dependency-grid">{deps.map(dep => <div className="dependency" key={dep.name}><div className="dependency-symbol">{dep.name.includes('PHP') ? <Code2 size={18}/> : dep.name.includes('WordPress') || dep.name.includes('WP-CLI') ? <TerminalSquare size={18}/> : <Database size={18}/>}</div><div className="dependency-detail"><strong>{dep.name}</strong><span title={dep.version}>{dep.version || 'Yüklü değil'}</span></div><div className={`dependency-state ${dep.installed ? 'ok' : 'missing'}`}>{dep.installed ? <Check size={16}/> : <X size={16}/>}</div></div>)}</div>{deps.length > 0 && !allReady && <div className="install-warning"><LockKeyhole size={17}/><span>Eksik bağımlılıklar var. Kurulum komutları için paketteki <code>README.md</code> dosyasına bakın.</span></div>}</section>
        <footer className="footer">PressForge 0.2.0 <span>•</span> Tamamen yerel WordPress geliştirme <span>•</span> Geliştirme sunucusunu internete açmayın.</footer>
      </section>
    </main>

    {notice && <div className={`toast ${notice.kind}`} role="alert"><span>{notice.kind === 'success' ? <Check size={18}/> : <X size={18}/>}</span><p>{notice.message}</p><button onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={16}/></button></div>}

    {showForm && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-header"><div><div className="eyebrow">NEW WORKSPACE</div><h2 id="create-title">Yeni WordPress sitesi</h2><p>Kurulum otomatik olarak WP-CLI ile gerçekleştirilecek.</p></div><button className="bare-button" onClick={() => !working && setShowForm(false)} disabled={!!working} aria-label="Kapat"><X size={20}/></button></div>
      <form onSubmit={createSite}><div className="form-body"><label>Site adı<input autoFocus required maxLength={90} placeholder="Örn. Magna Demo" value={form.title} onChange={e => setForm({...form, title:e.target.value})}/></label><div className="form-row"><label>Yönetici kullanıcı adı<input required placeholder="admin" value={form.adminUser} onChange={e => setForm({...form, adminUser:e.target.value})}/></label><label>WordPress dili<select value={form.locale} onChange={e => setForm({...form, locale:e.target.value as CreateSite['locale']})}><option value="tr_TR">Türkçe (tr_TR)</option><option value="en_US">English (en_US)</option></select></label></div><div className="form-row"><label>Yönetici e-posta<input required type="email" placeholder="admin@example.test" value={form.adminEmail} onChange={e => setForm({...form, adminEmail:e.target.value})}/></label><label>WordPress şifresi<input required minLength={12} type="password" autoComplete="new-password" placeholder="En az 12 karakter" value={form.adminPassword} onChange={e => setForm({...form, adminPassword:e.target.value})}/></label></div>{!bundledRuntime && <><div className="form-divider"><Database size={17}/> Yerel MariaDB bağlantısı</div><div className="form-row"><label>MariaDB yönetici kullanıcı adı<input required value={form.dbAdminUser} onChange={e => setForm({...form, dbAdminUser:e.target.value})}/></label><label>MariaDB yönetici şifresi <span className="optional">(yoksa boş)</span><input type="password" autoComplete="off" placeholder="Yerel veritabanı şifresi" value={form.dbAdminPassword} onChange={e => setForm({...form, dbAdminPassword:e.target.value})}/></label></div></>}<div className="info-line"><ShieldCheck size={16}/> Şifreler uygulama kayıtlarında saklanmaz. WordPress bağlantı şifresi kendi wp-config.php dosyasında tutulur.</div></div><div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setShowForm(false)} disabled={!!working}>Vazgeç</button><button type="submit" className="primary-btn" disabled={!allReady || !!working}>{working === 'create' ? <><Loader2 size={17} className="spin"/> WordPress kuruluyor…</> : <><Plus size={17}/> Siteyi oluştur</>}</button></div></form>
    </div></div>}

    {logSite && <div className="modal-backdrop"><div className="modal log-modal" role="dialog" aria-modal="true" aria-labelledby="log-title"><div className="modal-header"><div><div className="eyebrow">PHP DEVELOPMENT LOG</div><h2 id="log-title">{logSite.title} — PHP logları</h2></div><button className="bare-button" onClick={() => setLogSite(null)} aria-label="Kapat"><X size={20}/></button></div><pre className="log-output">{logs}</pre><div className="modal-actions"><button className="outline-btn" onClick={async () => setLogs(await invoke<string>('read_log', { id: logSite.id }))}><RefreshCw size={15}/> Yenile</button><button className="primary-btn" onClick={() => setLogSite(null)}>Kapat</button></div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
