import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { Check, Database, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import './styles.css';
import { SiteToolkit, type ModuleInfo } from './StudioModules';
import { NativeWorkspace, type ToolkitTab } from './NativeWorkspace';

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

function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [toolSite, setToolSite] = useState<Site | null>(null);
  const [toolTab, setToolTab] = useState<ToolkitTab>('plugin');
  const [runtimeMode, setRuntimeMode] = useState<'bundled' | 'development' | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [createStep, setCreateStep] = useState<0|1>(0);
  const [form, setForm] = useState<CreateSite>({ ...initialForm });
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const [sitesResult, depResult, modeResult, moduleResult] = await Promise.all([
      invoke<Site[]>('list_sites'), invoke<Dependency[]>('check_dependencies'),
      invoke<'bundled' | 'development'>('runtime_mode'),
      invoke<ModuleInfo[]>('list_studio_modules'),
    ]);
    setSites(sitesResult);
    setDeps(depResult);
    setRuntimeMode(modeResult);
    setModules(moduleResult);
  }, []);

  useEffect(() => {
    refresh().catch(e => setNotice({ kind: 'error', message: String(e) }))
      .finally(() => setLoading(false));
  }, [refresh]);

  const notifyError = (e: unknown) => setNotice({ kind: 'error', message: String(e) });
  const allReady = deps.length > 0 && deps.every(d => d.installed);
  const bundledRuntime = runtimeMode === 'bundled';

  async function runAction(key: string, action: () => Promise<unknown>, success?: string) {
    setWorking(key); setNotice(null);
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
      const created = await invoke<Site>('create_site', { newSite: form });
      setShowForm(false);
      setForm({ ...initialForm });
      setNotice(created.running
        ? { kind: 'success', message: 'WordPress sitesi oluşturuldu ve PHP sunucusu başlatıldı.' }
        : { kind: 'error', message: 'WordPress sitesi oluşturuldu, ancak PHP sunucusu çalışmıyor. PHP loglarını inceleyin veya siteyi tekrar başlatın.' });
    });
  }

  async function openSite(site: Site, target: 'website' | 'admin' | 'folder') {
    try { await invoke('open_site', { id: site.id, target }); }
    catch (e) { notifyError(e); }
  }

  async function archiveSite(site: Site) {
   
    const accepted = window.confirm(`${site.title} projesini arşivlemek istiyor musunuz?\n\nSite dosyaları arşive taşınacak, veritabanı silinmeyecektir. Ana listeden kaldırılacaktır.`);
    if (accepted) await runAction(site.id, () => invoke('archive_site', { id: site.id }), 'Proje dosyaları arşivlendi. Veritabanı korundu.');
  }

  return <div className="app-shell ns-outer">
    <NativeWorkspace
      sites={sites} deps={deps} modules={modules} loading={loading}
      working={working} search={search} allReady={allReady} bundledRuntime={bundledRuntime}
      onSearch={setSearch}
      onRefresh={() => { void runAction('refresh',refresh); }}
      onCreate={() => {setCreateStep(0);setShowForm(true);}}
      onOpen={(site,target) => { void openSite(site,target); }}
      onPower={site => { void runAction(site.id, () => invoke(site.running?'stop_site':'start_site',{id:site.id})); }}
      onArchive={site => { void archiveSite(site); }}
      onTools={(site,tab) => {setToolTab(tab);setToolSite(site);}}
      onError={notifyError}
    />

    {notice && <div className={`toast ${notice.kind}`} role="alert"><span>{notice.kind === 'success' ? <Check size={18}/> : <X size={18}/>}</span><p>{notice.message}</p><button onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X size={16}/></button></div>}

    {showForm && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="modal-header"><div><div className="eyebrow">NEW WORKSPACE</div><h2 id="create-title">Yeni WordPress sitesi</h2><p>Kurulum otomatik olarak WP-CLI ile gerçekleştirilecek.</p></div><button className="bare-button" onClick={() => !working && setShowForm(false)} disabled={!!working} aria-label="Kapat"><X size={20}/></button></div>
      <form onSubmit={e=>{if(createStep===0){e.preventDefault();setCreateStep(1);}else{void createSite(e);}}}>
        <div className="ns-wizard-steps" aria-label="Kurulum adımları">
          <span className={createStep===0?'selected':''}>1 · Proje</span>
          <span className={createStep===1?'selected':''}>2 · Erişim & güvenlik</span>
        </div>
        <div className="form-body">
          {createStep===0?<><label>Site adı
            <input autoFocus required maxLength={90} placeholder="Örn. Magna Demo" value={form.title}
              onChange={e=>setForm({...form,title:e.target.value})}/>
          </label><div className="form-row">
            <label>Yönetici kullanıcı adı<input required value={form.adminUser}
              onChange={e=>setForm({...form,adminUser:e.target.value})}/></label>
            <label>WordPress dili<select value={form.locale}
              onChange={e=>setForm({...form,locale:e.target.value as CreateSite['locale']})}>
                <option value="tr_TR">Türkçe</option><option value="en_US">English</option>
              </select></label>
          </div><label>Yönetici e-postası<input required type="email" placeholder="admin@example.test"
            value={form.adminEmail} onChange={e=>setForm({...form,adminEmail:e.target.value})}/></label>
          </>:<><label>WordPress yönetici şifresi
            <input autoFocus required type="password" minLength={12} autoComplete="new-password"
              placeholder="En az 12 karakter" value={form.adminPassword}
              onChange={e=>setForm({...form,adminPassword:e.target.value})}/>
          </label>{!bundledRuntime&&<><div className="form-divider"><Database size={15}/>
            Geliştirici MariaDB bağlantısı</div><div className="form-row">
            <label>Veritabanı kullanıcısı<input required value={form.dbAdminUser}
              onChange={e=>setForm({...form,dbAdminUser:e.target.value})}/></label>
            <label>Veritabanı şifresi <span className="optional">(opsiyonel)</span>
              <input type="password" autoComplete="off" value={form.dbAdminPassword}
                onChange={e=>setForm({...form,dbAdminPassword:e.target.value})}/></label>
          </div></>}<div className="info-line"><ShieldCheck size={15}/>
            Kimlik bilgileri uygulama loglarına yazılmaz. Bağlantı bilgileri siteye özel wp-config.php dosyasında tutulur.
          </div></>}
        </div>
        <div className="modal-actions">
          <button type="button" className="outline-btn" disabled={!!working}
            onClick={()=>createStep===1?setCreateStep(0):setShowForm(false)}>
            {createStep===1?'Geri':'Vazgeç'}
          </button>
          <button type="submit" className="primary-btn" disabled={!!working||(createStep===1&&!allReady)}>
            {working==='create'?<><Loader2 size={16} className="spin"/> WordPress kuruluyor…</>
              :createStep===0?'Devam Et':<><Plus size={16}/> Siteyi oluştur</>}
          </button>
        </div>
      </form>
    </div></div>}

    {toolSite && <SiteToolkit site={toolSite} initialTab={toolTab} close={() => setToolSite(null)} />}

  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
