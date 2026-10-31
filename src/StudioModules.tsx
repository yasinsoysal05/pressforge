import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Archive, CheckCircle2, ChevronDown, Code2, Database, FileArchive,
  HardDriveDownload, Layers3, Loader2, Package, RefreshCw, Server, ShieldAlert,
  Wrench, X } from 'lucide-react';

export type ModuleInfo = {
  id: string; label: string; group: string;
  status: 'ready'|'missing'|'planned'|'disabled'; version: string; description: string;
  toggleable: boolean; enabled: boolean;
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
const statusText = {ready:'Çalışıyor',missing:'Eksik',planned:'Planlandı',disabled:'Kapalı'};

export function ModuleCenter({modules, refresh}: {
  modules: ModuleInfo[]; refresh: () => void;
}) {
  const [showPlanned, setShowPlanned] = useState(false);
  const [changing, setChanging] = useState('');
  const [moduleError, setModuleError] = useState('');
  const available = modules.filter(m => m.status !== 'planned');
  const upcoming = modules.filter(m => m.status === 'planned');
  async function toggle(m:ModuleInfo) {
    setChanging(m.id);
    setModuleError('');
    try {
      await invoke('set_studio_module_enabled',{moduleId:m.id,enabled:!m.enabled});
      refresh();
    } catch(e) {setModuleError(String(e));}
    finally {setChanging('');}
  }
  const render = (m:ModuleInfo) => <div className="pf-module" key={m.id}>
    <div className="pf-module-heading">
      <span className={'pf-module-led '+m.status} />
      <strong>{m.label}</strong>
      <span className={'pf-module-status '+m.status}>{statusText[m.status]}</span>
    </div>
    <p>{m.description}</p>
    {m.version && <code title={m.version}>{m.version}</code>}
    {m.toggleable && <button type="button" className="pf-module-switch"
      disabled={!!changing} aria-pressed={m.enabled}
      onClick={()=>toggle(m)}>
      {changing===m.id?'İşleniyor…':m.enabled?'Modülü kapat':'Modülü etkinleştir'}
    </button>}
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
      {moduleError && <p className="pf-toolkit-warning">{moduleError}</p>}
      <p className="pf-module-warning">Planlandı etiketli özellikler henüz etkin değildir. SSL,
      çoklu PHP sürümü, Apache/Nginx, SSH deployment ve AI teşhis burada listelenir fakat çalıştırılmaz.</p>
    </div>
  </section>;
}

export function SiteToolkit({site, close, initialTab='plugin'}:{
  site:ToolkitSite;close:()=>void;initialTab?:'plugin'|'theme'|'database'|'snapshot'|'maintenance';
}) {
  const [tab,setTab]=useState<'plugin'|'theme'|'database'|'snapshot'|'maintenance'>(initialTab);
  const [listPage,setListPage]=useState(0);
  const [tablePage,setTablePage]=useState(0);
  const [columnPage,setColumnPage]=useState(0);
  const [extensions,setExtensions]=useState<ExtensionInfo[]>([]);
  const [snapshots,setSnapshots]=useState<SnapshotInfo[]>([]);
  const [tables,setTables]=useState<string[]>([]);
  const [selectedTable,setSelectedTable]=useState('');
  const [columns,setColumns]=useState<Record<string,unknown>[]>([]);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState<{ok:boolean;value:string}|null>(null);
  const limit=5;
  function pager(total:number,index:number,change:(n:number)=>void){
    const pages=Math.max(1,Math.ceil(total/limit));
    if(pages===1)return null;
    return <div className="pf-toolkit-pager">
      <button type="button" disabled={index<=0||!!busy} onClick={()=>change(index-1)}>Önceki</button>
      <span>{index+1} / {pages}</span>
      <button type="button" disabled={index>=pages-1||!!busy} onClick={()=>change(index+1)}>Sonraki</button>
    </div>;
  }

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
  const fetchDatabase=useCallback(async()=>{
    setBusy('db');
    setSelectedTable('');
    setTablePage(0);
    setColumnPage(0);
    setColumns([]);
    try {
      setTables(await invoke<string[]>('list_site_database_tables',{id:site.id}));
      setMessage(null);
    } catch(e) {setMessage({ok:false,value:String(e)});}
    finally {setBusy('');}
  },[site.id]);
  const inspectTable=useCallback(async(table:string)=>{
    setBusy('schema');
    setSelectedTable(table);
    setColumns([]);
    setColumnPage(0);
    try {
      setColumns(await invoke<Record<string,unknown>[]>('inspect_site_database_table',{id:site.id,table}));
      setMessage(null);
    } catch(e) {setMessage({ok:false,value:String(e)});}
    finally {setBusy('');}
  },[site.id]);
  useEffect(()=>setListPage(0),[tab]);
  useEffect(()=>{
    if(tab==='plugin'||tab==='theme') void fetchExtensions(tab);
    if(tab==='snapshot') void fetchSnapshots();
    if(tab==='database') void fetchDatabase();
  },[tab,fetchExtensions,fetchSnapshots,fetchDatabase]);

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
           ['database','Veritabanı',Database],['snapshot','Snapshot',FileArchive],['maintenance','Bakım',Wrench]] as const)
          .map(([key,label,Icon])=><button key={key} role="tab" aria-selected={tab===key}
            className={tab===key?'active':''} disabled={!!busy} onClick={()=>{setTab(key);setListPage(0);setTablePage(0);setColumnPage(0);}}>
            <Icon size={16}/>{label}</button>)}
      </div>
      <div className="pf-toolkit-content">
        {['list','db','schema'].includes(busy)?<div className="pf-toolkit-loading"><Loader2 className="spin"/> Yükleniyor…</div>
        : tab==='plugin'||tab==='theme' ? <>
          <p className="pf-toolkit-description">WordPress eklenti ve temaları WP-CLI ile yönetilir. Sadece etkinleştirme ve devre dışı bırakma komutları kullanılabilir.</p>
          {extensions.length?<div className="pf-extension-list">{extensions.slice(listPage*limit,(listPage+1)*limit).map(ext=><div className="pf-extension" key={ext.name}>
            <div><strong>{ext.name}</strong><span>v{ext.version||'—'} · {ext.status}</span></div>
            <button className="outline-btn" disabled={!!busy} onClick={()=>manage(tab,ext.name,
              ext.status==='active'?'deactivate':'activate')}>
              {ext.status==='active'?'Devre dışı':'Etkinleştir'}</button>
          </div>)}</div>:<div className="pf-toolkit-empty">Henüz kayıt yok.</div>}
          {pager(extensions.length,listPage,setListPage)}
        </>:tab==='database'?<>
          <p className="pf-toolkit-description">
            WordPress veritabanındaki tabloları ve kolonlarını salt-okunur görüntüleyin.
            Serbest SQL ve veri değiştiren işlemler bu araçta çalıştırılmaz.
          </p>
          <button className="outline-btn" disabled={!!busy} onClick={()=>void fetchDatabase()}>
            <RefreshCw size={15}/> Tabloları yenile
          </button>
          <div className="pf-db-inspector">
            <div className="pf-db-tables">
              <strong>{tables.length} tablo</strong>
              {tables.slice(tablePage*limit,(tablePage+1)*limit).map(table=><button key={table} type="button"
                className={selectedTable===table?'selected':''} disabled={!!busy}
                onClick={()=>void inspectTable(table)}>{table}</button>)}
              {!tables.length&&<small>Bu site için tablo bulunamadı.</small>}
              {pager(tables.length,tablePage,setTablePage)}
            </div>
            <div className="pf-db-schema">
              <strong>{selectedTable||'Kolon şeması'}</strong>
              {columns.length?<div className="pf-db-columns">
                {columns.slice(columnPage*limit,(columnPage+1)*limit).map((col,i)=><div key={i} className="pf-db-column">
                  <code>{String(col.Field??col.field??'—')}</code>
                  <small>{String(col.Type??col.type??'')}</small>
                  <small>{String(col.Key??col.key??'')}</small>
                </div>)}
              </div>:<p>Şemasını incelemek için soldan bir tablo seçin.</p>}
              {pager(columns.length,columnPage,setColumnPage)}
            </div>
          </div>
        </>:tab==='snapshot'?<>
          <p className="pf-toolkit-description">WordPress dosyaları ve SQL yedeği birlikte kaydedilir.
          Geri yükleme henüz uygulanmadı. Eksik SQL yedeğiyle snapshot başarılı sayılmaz.</p>
          <button className="primary-btn" disabled={!!busy||site.running} onClick={snapshot}>
            {busy==='snapshot'?<Loader2 className="spin" size={16}/>:<HardDriveDownload size={16}/>}
            Tam snapshot oluştur</button>
          {site.running&&<p className="pf-toolkit-warning"><ShieldAlert size={16}/> Önce siteyi durdurun.</p>}
          <button className="outline-btn pf-open-snapshots" disabled={!!busy}
            onClick={() => invoke('open_site_snapshots_folder',{id:site.id})
              .catch(e=>setMessage({ok:false,value:String(e)}))}>
            <Archive size={16}/> Snapshot klasörünü Finder'da aç
          </button>
          <div className="pf-snapshots">{snapshots.length?snapshots.slice(listPage*limit,(listPage+1)*limit).map(s=><div className="pf-snapshot" key={s.id}>
            <Archive size={18}/><div><strong>{new Date(s.createdAt*1000).toLocaleString('tr-TR')}</strong>
            <small>{s.id.slice(0,8)} · {(s.sizeBytes/1048576).toFixed(1)} MB · SQL dahil</small></div>
            <CheckCircle2 size={18}/></div>):<p>Henüz snapshot yok.</p>}</div>
          {pager(snapshots.length,listPage,setListPage)}
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
