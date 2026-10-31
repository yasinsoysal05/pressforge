import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Archive, CheckCircle2, ChevronDown, Code2, Database, FileArchive,
  HardDriveDownload, Layers3, Loader2, Package, RefreshCw, Server, ShieldAlert,
  Wrench, X } from 'lucide-react';

export type ModuleInfo = {
  id: string; label: string; group: string;
  status: 'ready'|'missing'|'planned'; version: string; description: string;
};
export type ToolkitSite = { id: string; title: string; running: boolean; dbName: string };
type ExtensionInfo = { name: string; status: string; version: string; update: string };
type SnapshotInfo = {
  id: string; siteId: string; siteTitle: string; createdAt: number;
  sizeBytes: number; databaseIncluded: boolean;
};
const groups = [
  { key: 'runtime', name: 'Çalışma motorları', Icon: Server },
  { key: 'site', name: 'WordPress araçları', Icon: Package },
  { key: 'network', name: 'Domain & ağ', Icon: Database },
  { key: 'integration', name: 'Geliştirici entegrasyonları', Icon: Layers3 },
];
const statusText = {ready:'Çalışıyor',missing:'Eksik',planned:'Planlandı'};

export function ModuleCenter({modules, refresh}: {
  modules: ModuleInfo[]; refresh: () => void;
}) {
  const [showPlanned, setShowPlanned] = useState(false);
  const available = modules.filter(m => m.status !== 'planned');
  const upcoming = modules.filter(m => m.status === 'planned');
  const render = (m:ModuleInfo) => <div className="pf-module" key={m.id}>
    <div className="pf-module-heading">
      <span className={'pf-module-led '+m.status} />
      <strong>{m.label}</strong>
      <span className={'pf-module-status '+m.status}>{statusText[m.status]}</span>
    </div>
    <p>{m.description}</p>
    {m.version && <code title={m.version}>{m.version}</code>}
  </div>;
  return <section className="pf-modules" id="studio-modules">
    <header className="pf-module-top">
      <div><div className="eyebrow">LOCAL-FIRST / MODULAR RUNTIME</div>
        <h2>Modül Merkezi</h2>
        <p>PHP, MariaDB, WP-CLI ve site araçları birbirinden bağımsız denetlenir.</p>
      </div>
      <button type="button" className="outline-btn" onClick={refresh}>
        <RefreshCw size={15}/> Modülleri denetle
      </button>
    </header>
    {groups.filter(g=>available.some(m=>m.group===g.key)).map(g=><div className="pf-module-group" key={g.key}>
      <h3><g.Icon size={17}/>{g.name}</h3>
      <div className="pf-module-grid">{available.filter(m=>m.group===g.key).map(render)}</div>
    </div>)}
    <div className="pf-planned-section">
      <button className="pf-planned-toggle" aria-expanded={showPlanned}
        onClick={()=>setShowPlanned(!showPlanned)}>
        <Layers3 size={18}/> Gelecek modüller
        <span>{upcoming.length} planlanan</span><ChevronDown size={16}/>
      </button>
      {showPlanned && groups.filter(g=>upcoming.some(m=>m.group===g.key)).map(g=><div className="pf-module-group" key={g.key}>
        <h3><g.Icon size={17}/>{g.name}</h3>
        <div className="pf-module-grid">{upcoming.filter(m=>m.group===g.key).map(render)}</div>
      </div>)}
      <p className="pf-module-warning">Planlandı etiketli özellikler henüz etkin değildir. SSL,
      çoklu PHP sürümü, Apache/Nginx, SSH deployment ve AI teşhis burada listelenir fakat çalıştırılmaz.</p>
    </div>
  </section>;
}

export function SiteToolkit({site, close}:{site:ToolkitSite;close:()=>void}) {
  const [tab,setTab]=useState<'plugin'|'theme'|'snapshot'|'maintenance'>('plugin');
  const [extensions,setExtensions]=useState<ExtensionInfo[]>([]);
  const [snapshots,setSnapshots]=useState<SnapshotInfo[]>([]);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState<{ok:boolean;value:string}|null>(null);

  const fetchExtensions=useCallback(async(kind:'plugin'|'theme')=>{
    setBusy('list');
    try{setExtensions(await invoke<ExtensionInfo[]>('list_site_extensions',{id:site.id,kind}));setMessage(null);}
    catch(e){setMessage({ok:false,value:String(e)});}
    finally{setBusy('');}
  },[site.id]);
  const fetchSnapshots=useCallback(async()=>{
    setBusy('list');
    try{setSnapshots(await invoke<SnapshotInfo[]>('list_site_snapshots',{id:site.id}));setMessage(null);}
    catch(e){setMessage({ok:false,value:String(e)});}
    finally{setBusy('');}
  },[site.id]);
  useEffect(()=>{
    if(tab==='plugin'||tab==='theme') void fetchExtensions(tab);
    if(tab==='snapshot') void fetchSnapshots();
  },[tab,fetchExtensions,fetchSnapshots]);

  async function manage(kind:'plugin'|'theme',slug:string,action:'activate'|'deactivate'){
    if(!window.confirm(slug+' için '+action+' işlemini onaylıyor musunuz?'))return;
    setBusy(slug);
    try{
      await invoke('manage_site_extension',{id:site.id,kind,slug,action});
      await fetchExtensions(kind);
      setMessage({ok:true,value:slug+' — işlem tamamlandı'});
    }catch(e){setMessage({ok:false,value:String(e)});}
    finally{setBusy('');}
  }
  async function snapshot(){
    if(site.running){setMessage({ok:false,value:'Önce siteyi durdurun.'});return;}
    setBusy('snapshot');
    try{
      const snap=await invoke<SnapshotInfo>('create_site_snapshot',{id:site.id});
      await fetchSnapshots();
      setMessage({ok:true,value:'SQL + dosyalar kaydedildi: '+snap.id.slice(0,8)});
    }catch(e){setMessage({ok:false,value:String(e)});}
    finally{setBusy('');}
  }
  async function maintenance(operation:'cache_flush'|'rewrite_flush'|'core_verify'){
    setBusy(operation);
    try{
      const result=await invoke<string>('run_site_maintenance',{id:site.id,operation});
      setMessage({ok:true,value:result});
    }catch(e){setMessage({ok:false,value:String(e)});}
    finally{setBusy('');}
  }
  return <div className="modal-backdrop" role="presentation">
    <div className="modal pf-toolkit" role="dialog" aria-modal="true" aria-labelledby="pf-toolkit-title">
      <div className="modal-header">
        <div><div className="eyebrow">SITE TOOLKIT / WP-CLI</div>
          <h2 id="pf-toolkit-title">{site.title} — Araçlar</h2>
          <p>İşlemler yalnızca bu site üzerinde, izinli komutlarla yürütülür.</p></div>
        <button className="bare-button" aria-label="Kapat" onClick={close} disabled={!!busy}><X size={20}/></button>
      </div>
      <div className="pf-toolkit-tabs" role="tablist" aria-label="Site araçları">
        {([['plugin','Eklentiler',Package],['theme','Temalar',Layers3],
           ['snapshot','Snapshot',FileArchive],['maintenance','Bakım',Wrench]] as const)
          .map(([key,label,Icon])=><button key={key} role="tab" aria-selected={tab===key}
            className={tab===key?'active':''} disabled={!!busy} onClick={()=>setTab(key)}>
            <Icon size={16}/>{label}</button>)}
      </div>
      <div className="pf-toolkit-content">
        {busy==='list'?<div className="pf-toolkit-loading"><Loader2 className="spin"/> Yükleniyor…</div>
        : tab==='plugin'||tab==='theme' ? <>
          <p className="pf-toolkit-description">WordPress eklenti ve temaları WP-CLI ile yönetilir. Sadece etkinleştirme ve devre dışı bırakma komutları kullanılabilir.</p>
          {extensions.length?<div className="pf-extension-list">{extensions.map(ext=><div className="pf-extension" key={ext.name}>
            <div><strong>{ext.name}</strong><span>v{ext.version||'—'} · {ext.status}</span></div>
            <button className="outline-btn" disabled={!!busy} onClick={()=>manage(tab,ext.name,
              ext.status==='active'?'deactivate':'activate')}>
              {ext.status==='active'?'Devre dışı':'Etkinleştir'}</button>
          </div>)}</div>:<div className="pf-toolkit-empty">Henüz kayıt yok.</div>}
        </>:tab==='snapshot'?<>
          <p className="pf-toolkit-description">WordPress dosyaları ve SQL yedeği birlikte kaydedilir.
          Geri yükleme henüz uygulanmadı. Eksik SQL yedeğiyle snapshot başarılı sayılmaz.</p>
          <button className="primary-btn" disabled={!!busy||site.running} onClick={snapshot}>
            {busy==='snapshot'?<Loader2 className="spin" size={16}/>:<HardDriveDownload size={16}/>}
            Tam snapshot oluştur</button>
          {site.running&&<p className="pf-toolkit-warning"><ShieldAlert size={16}/> Önce siteyi durdurun.</p>}
          <div className="pf-snapshots">{snapshots.length?snapshots.map(s=><div className="pf-snapshot" key={s.id}>
            <Archive size={18}/><div><strong>{new Date(s.createdAt*1000).toLocaleString('tr-TR')}</strong>
            <small>{s.id.slice(0,8)} · {(s.sizeBytes/1048576).toFixed(1)} MB · SQL dahil</small></div>
            <CheckCircle2 size={18}/></div>):<p>Henüz snapshot yok.</p>}</div>
        </>:<>
          <p className="pf-toolkit-description">Keyfî terminal komutları çalıştırılmaz; yalnızca üç izinli bakım işlemi desteklenir.</p>
          <div className="pf-maintenance">
            <button disabled={!!busy} onClick={()=>maintenance('cache_flush')}><RefreshCw size={18}/><span><strong>Önbelleği temizle</strong><small>wp cache flush</small></span></button>
            <button disabled={!!busy} onClick={()=>maintenance('rewrite_flush')}><Code2 size={18}/><span><strong>Kalıcı bağlantıları yenile</strong><small>wp rewrite flush</small></span></button>
            <button disabled={!!busy} onClick={()=>maintenance('core_verify')}><CheckCircle2 size={18}/><span><strong>WP çekirdeğini doğrula</strong><small>wp core verify-checksums</small></span></button>
          </div>
        </>}
        {message&&<div className={'pf-toolkit-notice '+(message.ok?'success':'error')}>
          {message.ok?<CheckCircle2 size={17}/>:<ShieldAlert size={17}/>}<span>{message.value}</span></div>}
      </div>
      <div className="modal-actions"><button className="outline-btn" disabled={!!busy} onClick={close}>Kapat</button></div>
    </div>
  </div>;
}
