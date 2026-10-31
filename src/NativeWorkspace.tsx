import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, Archive, ArrowUpRight, Blocks, BookOpen, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleAlert, Code2, Command, Database,
  ExternalLink, FileText, FolderOpen, GitBranch, Globe2, HardDrive,
  HeartPulse, Layers3, LockKeyhole, Network, Package, Play, Plus,
  RefreshCw, Search, Server, Settings2, ShieldCheck, SlidersHorizontal,
  Square, TerminalSquare, Wrench,
} from 'lucide-react';
import type { ModuleInfo } from './StudioModules';
import './native-shell.css';

export type SiteRecord = {
  id:string; title:string; port:number; adminUser:string; locale:string;
  dbName:string; directory:string; createdAt:string; running:boolean; url:string;
};
export type RuntimeDependency = {name:string;installed:boolean;version:string;path:string};
export type ToolkitTab = 'plugin'|'theme'|'snapshot'|'maintenance'|'database';
type Glyph = LucideIcon;
type NavItem = {id:string;label:string;Icon:Glyph;module?:string};
type NavGroup = {id:string;title:string;Icon:Glyph;items:NavItem[]};

const nav:NavGroup[] = [
  {id:'workspace',title:'Çalışma Alanı',Icon:Layers3,items:[
    {id:'overview',label:'Genel Bakış',Icon:Activity},
    {id:'sites',label:'WordPress Siteleri',Icon:Globe2},
    {id:'modules',label:'Modül Merkezi',Icon:Blocks},
    {id:'settings',label:'Tercihler',Icon:Settings2},
  ]},
  {id:'engines',title:'Çalışma Motorları',Icon:Server,items:[
    {id:'php',label:'PHP',Icon:Code2,module:'php'},
    {id:'mariadb',label:'MariaDB',Icon:Database,module:'mariadb'},
    {id:'wpcli',label:'WP-CLI',Icon:TerminalSquare,module:'wpcli'},
    {id:'webserver',label:'HTTP Sunucusu',Icon:Network,module:'webserver'},
    {id:'php_versions',label:'PHP Sürümleri',Icon:SlidersHorizontal,module:'php_versions'},
    {id:'server_adapters',label:'Apache / Nginx',Icon:Server,module:'server_adapters'},
  ]},
  {id:'wordpress',title:'Site Araçları',Icon:Package,items:[
    {id:'extensions',label:'Eklentiler & Temalar',Icon:Package,module:'extensions'},
    {id:'database',label:'Veritabanı',Icon:Database,module:'database'},
    {id:'snapshots',label:'Yedekler',Icon:Archive,module:'snapshots'},
    {id:'logs',label:'PHP Logları',Icon:FileText,module:'logs'},
    {id:'maintenance',label:'Bakım',Icon:Wrench,module:'wpcli'},
    {id:'clone_import',label:'Klonla / İçe Aktar',Icon:HardDrive,module:'clone_import'},
  ]},
  {id:'connect',title:'Ağ & Entegrasyon',Icon:Network,items:[
    {id:'domains',label:'Özel Domain',Icon:Globe2,module:'domains'},
    {id:'ssl',label:'Yerel SSL',Icon:LockKeyhole,module:'ssl'},
    {id:'git',label:'Git / GitHub',Icon:GitBranch,module:'git'},
    {id:'deployment',label:'Yayınlama',Icon:ArrowUpRight,module:'deployment'},
    {id:'live_sync',label:'Live Sync',Icon:RefreshCw,module:'live_sync'},
    {id:'diagnostics',label:'AI Teşhis',Icon:HeartPulse,module:'diagnostics'},
  ]},
];
const info:Record<string,{title:string;subtitle:string;expect:string;next:string}> = {
 php:{title:'PHP Motoru',subtitle:'WordPress çalışma zamanı',expect:'PHP, mysqli ve gerekli eklentilerin çalıştığını doğrular.',next:'Paketli PHP motorunun Ventura üzerinde çalışması'},
 mariadb:{title:'MariaDB',subtitle:'Yerel veritabanı motoru',expect:'Site veritabanlarını ve paketlenmiş daemon durumunu denetler.',next:'Özel Unix socket ile bağımsız veritabanı testi'},
 wpcli:{title:'WP-CLI',subtitle:'WordPress komut motoru',expect:'WordPress çekirdek kurulumu, eklenti yönetimi ve bakımı.',next:'Paketlenen PHAR için SHA-512 ve PHP uyumluluğu'},
 webserver:{title:'HTTP Sunucusu',subtitle:'Yerel ve izole siteler',expect:'Her WordPress projesi için 127.0.0.1 üzerindeki PHP sunucusu.',next:'Site başına HTTP ve WordPress giriş testi'},
 php_versions:{title:'Çoklu PHP Sürümleri',subtitle:'Planlanan runtime adaptörü',expect:'Proje bazında PHP sürümü seçimi ve izole yapılandırma.',next:'Ventura için bağımsız çok sürümlü binary paketi'},
 server_adapters:{title:'Apache / Nginx',subtitle:'Planlanan web sunucusu adaptörleri',expect:'Proje başına web sunucusu seçimi ve yapılandırma şablonları.',next:'İmzalanmış, izole Apache/Nginx runtime paketleri'},
 clone_import:{title:'Klonlama ve İçe Aktarma',subtitle:'Planlanan güvenli taşıma sistemi',expect:'Dosyalar, veritabanı ve site URL eşlemesiyle bütünlüklü kopyalama.',next:'Geri alınabilir taşıma ve staging kabul testleri'},
 domains:{title:'Özel Domainler',subtitle:'Planlanan yerel adres yönetimi',expect:'İsteğe bağlı .test alan adları ve izole host eşlemesi.',next:'Yetki onaylı hosts güncelleme altyapısı'},
 ssl:{title:'Yerel HTTPS / SSL',subtitle:'Planlanan sertifika yönetimi',expect:'Yerel geliştirme için güvenilir sertifika ve HTTPS.',next:'Sertifika oluşturma, güven zinciri ve kullanıcı onayı'},
 git:{title:'Git ve GitHub',subtitle:'Planlanan kaynak kontrol entegrasyonu',expect:'Proje diff, commit ve branch yönetimi.',next:'Dosya izinleri ve kimlik bilgilerinin güvenli saklanması'},
 deployment:{title:'SSH Yayınlama',subtitle:'Planlanan uzak sunucu adaptörleri',expect:'aaPanel, Plesk ve cPanel için test edilmiş dağıtım işlemleri.',next:'Yedekli staging, onay ve rollback'},
 live_sync:{title:'Live Sync',subtitle:'Planlanan çift yönlü eşitleme',expect:'Yerel site ile staging arasında seçici içerik eşitleme.',next:'Çakışma çözümü, geri yükleme ve veri kaybı testleri'},
 diagnostics:{title:'AI Teşhis',subtitle:'Planlanan analiz motoru',expect:'PHP logları, WordPress/Elementor ve sürüm uyumluluğu analizi.',next:'İzin kontrollü tanılama, gizli veri maskeleme'},
};
const TOOLS:Record<string,{tab:ToolkitTab;title:string;desc:string}> = {
 extensions:{tab:'plugin',title:'Eklentiler ve Temalar',desc:'WordPress eklentilerini ve temalarını WP-CLI üzerinden yönet.'},
 database:{tab:'database',title:'Veritabanı İnceleyicisi',desc:'Tabloları ve kolon şemalarını salt-okunur görüntüle.'},
 snapshots:{tab:'snapshot',title:'Yedekler ve Snapshot',desc:'WordPress dosyaları ile SQL veritabanını birlikte yedekle.'},
 maintenance:{tab:'maintenance',title:'WordPress Bakımı',desc:'Önbellek, kalıcı bağlantılar ve çekirdek bütünlük kontrolleri.'},
 logs:{tab:'plugin',title:'PHP Günlükleri',desc:'Siteye özel hata kayıtlarını görüntüle.'},
};
const listLimit=6;
function statusLabel(status:string){return ({ready:'Hazır',missing:'Eksik',disabled:'Kapalı',planned:'Planlandı'} as Record<string,string>)[status] || status;}
function pageDef(id:string){return nav.flatMap(g=>g.items).find(x=>x.id===id) || nav[0].items[0];}
function withinPage<T>(items:T[],index:number,limit=listLimit){return items.slice(index*limit,(index+1)*limit);}
function Paginator({index,count,limit=6,onChange}:{index:number;count:number;limit?:number;onChange:(n:number)=>void}){
  const pages=Math.max(1,Math.ceil(count/limit));
  return <div className="ns-pager">
    <span>{count ? index*limit+1 : 0}–{Math.min((index+1)*limit,count)} / {count}</span>
    <button type="button" aria-label="Önceki sayfa" disabled={index===0} onClick={()=>onChange(Math.max(0,index-1))}><ChevronLeft size={16}/></button>
    <span>{index+1} / {pages}</span>
    <button type="button" aria-label="Sonraki sayfa" disabled={index>=pages-1} onClick={()=>onChange(Math.min(pages-1,index+1))}><ChevronRight size={16}/></button>
  </div>;
}

export function NativeWorkspace({
  sites,deps,modules,loading,working,search,allReady,bundledRuntime,
  onSearch,onRefresh,onCreate,onOpen,onPower,onArchive,onTools,onLogs,onError,
}:{
  sites:SiteRecord[];deps:RuntimeDependency[];modules:ModuleInfo[];loading:boolean;working:string;search:string;
  allReady:boolean;bundledRuntime:boolean;
  onSearch:(value:string)=>void;onRefresh:()=>void;onCreate:()=>void;
  onOpen:(site:SiteRecord,target:'website'|'admin'|'folder')=>void;
  onPower:(site:SiteRecord)=>void;onArchive:(site:SiteRecord)=>void;
  onTools:(site:SiteRecord,tab:ToolkitTab)=>void;onLogs:(site:SiteRecord)=>void;
  onError:(error:unknown)=>void;
}){
  const [page,setPage]=useState('overview');
  const [expanded,setExpanded]=useState('workspace');
  const [index,setIndex]=useState(0);
  const [moduleIndex,setModuleIndex]=useState(0);
  const [moduleBusy,setModuleBusy]=useState('');
  const [moduleMessage,setModuleMessage]=useState('');
  const [chosen,setChosen]=useState<string>('');
  const searchRef=useRef<HTMLInputElement>(null);
  const current=pageDef(page);
  const selected=sites.find(s=>s.id===chosen) || sites[0];
  const shownSites=useMemo(()=>sites.filter(s=>(s.title+' '+s.url+' '+s.adminUser)
    .toLowerCase().includes(search.toLowerCase())),[sites,search]);
  useEffect(()=>setIndex(0),[search,page]);
  useEffect(()=>setModuleIndex(0),[page]);
  useEffect(()=>{
    function key(event:KeyboardEvent){
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();navigate('sites');searchRef.current?.focus();
      }
      if((event.metaKey||event.ctrlKey)&&event.key===','){
        event.preventDefault();navigate('settings');
      }
    }
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[]);
  function navigate(id:string){
    setPage(id);
    const parent=nav.find(g=>g.items.some(item=>item.id===id));
    if(parent)setExpanded(parent.id);
  }
  const forPage=modules.find(m=>m.id===current.module);
  const moduleStatus=forPage?.status||'planned';
  const isSiteTool=Object.prototype.hasOwnProperty.call(TOOLS,page);
  const isEngine=['php','mariadb','wpcli','webserver'].includes(page);
  async function toggleModule(item:ModuleInfo){
    if(!item.toggleable)return;
    setModuleBusy(item.id);setModuleMessage('');
    try {
      await invoke('set_studio_module_enabled',{moduleId:item.id,enabled:!item.enabled});
      setModuleMessage(item.label+' modül ayarı güncellendi.');
      onRefresh();
    }catch(err){onError(err);}
    finally{setModuleBusy('');}
  }
  const healthCount=deps.filter(d=>d.installed).length;
  function siteTable(rows:SiteRecord[],pageIndex:number){
    return <div className="ns-table ns-grow">
      <div className="ns-table-head"><span>PROJE</span><span>DURUM</span><span>ADRES</span><span>İŞLEMLER</span></div>
      {loading?<div className="ns-empty">Siteler yükleniyor…</div>
       :rows.length===0?<div className="ns-empty">{search?'Eşleşen proje bulunamadı.':'Henüz WordPress projesi yok.'}</div>
       :withinPage(rows,pageIndex).map(site=><div className="ns-site-row" key={site.id}>
        <div className="ns-site-name"><div className="ns-wp-icon">W</div><div><strong title={site.title}>{site.title}</strong><small>{site.locale==='tr_TR'?'Türkçe':'English'} · {site.dbName}</small></div></div>
        <span className={'ns-dotlabel '+(site.running?'ok':'muted')}><i/>{site.running?'Çalışıyor':'Durduruldu'}</span>
        <span className="ns-mono ns-clamp" title={site.url}>{site.url.replace('http://','')}</span>
        <div className="ns-actions">
          <button type="button" title="Siteyi aç" aria-label={site.title+' sitesini aç'} disabled={!site.running} onClick={()=>onOpen(site,'website')}><ArrowUpRight size={15}/></button>
          <button type="button" title="WordPress yönetimi" aria-label={site.title+' WP Admin'} disabled={!site.running} onClick={()=>onOpen(site,'admin')}><ExternalLink size={14}/></button>
          <button type="button" title="Proje klasörü" aria-label={site.title+' klasörü'} onClick={()=>onOpen(site,'folder')}><FolderOpen size={14}/></button>
          <button type="button" title="Site araçları" aria-label={site.title+' araçları'} onClick={()=>onTools(site,'plugin')}><Wrench size={15}/></button>
          <button type="button" title={site.running?'Durdur':'Başlat'} disabled={!!working} onClick={()=>onPower(site)}>{working===site.id?<RefreshCw className="ns-spin" size={15}/>:site.running?<Square size={14}/>:<Play size={15}/>}</button>
          <button type="button" title="Arşivle" aria-label={site.title+' arşivle'} disabled={!!working} onClick={()=>onArchive(site)}><Archive size={14}/></button>
        </div>
      </div>)}
    </div>;
  }
  function siteChooser(){
    return <div className="ns-tool-select">
      <div className="ns-field">
        <label htmlFor="ns-site-selector">HEDEF WORDPRESS SİTESİ</label>
        <select id="ns-site-selector" value={selected?.id||''} onChange={e=>setChosen(e.target.value)}>
          {sites.map(s=><option value={s.id} key={s.id}>{s.title}</option>)}
        </select>
      </div>
      {selected?<div className="ns-selected-site">
        <div className="ns-wp-icon">W</div><div><strong>{selected.title}</strong><small>{selected.url}</small></div>
        <span className={'ns-dotlabel '+(selected.running?'ok':'muted')}><i/>{selected.running?'Çalışıyor':'Durduruldu'}</span>
      </div>:<p className="ns-subtle">Önce WordPress siteleri ekranından bir proje oluştur.</p>}
    </div>;
  }
  return <div className="ns-window">
    <aside className="ns-sidebar">
      <div className="ns-identity"><div className="ns-logo"><Layers3 size={19}/></div>
        <div><strong>PressForge</strong><span>WORDPRESS STUDIO</span></div></div>
      <div className="ns-sidebar-caption">WORKSPACE</div>
      <nav className="ns-navigation" aria-label="PressForge modülleri">
        {nav.map(group=><div className="ns-nav-group" key={group.id}>
          <button type="button" className={'ns-group-header '+(expanded===group.id?'expanded':'')}
            aria-expanded={expanded===group.id} onClick={()=>setExpanded(expanded===group.id?'':group.id)}>
            <group.Icon size={15}/><span>{group.title}</span><ChevronDown size={14}/>
          </button>
          {expanded===group.id&&<div className="ns-nav-children">
            {group.items.map(item=>{
              const data=modules.find(m=>m.id===item.module);
              return <button type="button" key={item.id} className={'ns-nav-item '+(page===item.id?'selected':'')}
                aria-current={page===item.id?'page':undefined} onClick={()=>navigate(item.id)}>
                <item.Icon size={15}/><span>{item.label}</span>
                {data?.status==='planned'&&<i className="ns-mini-pending" title="Henüz uygulanmadı"/>}
              </button>;
            })}
          </div>}
        </div>)}
      </nav>
      <div className="ns-sidebar-footer">
        <div className={'ns-runtime-indicator '+(allReady?'healthy':'warning')}>
          <span className="ns-status-circle"/>
          <div><strong>{allReady?'Motorlar hazır':'Motor eksik'}</strong><small>{bundledRuntime?'Paketli çalışma ortamı':'Geliştirici modu'}</small></div>
        </div>
        <span>PressForge 0.2.0 · Intel macOS</span>
      </div>
    </aside>
    <div className="ns-frame">
      <header className="ns-toolbar">
        <div className="ns-toolbar-leading"><button type="button" aria-label="Genel bakışa dön" onClick={()=>navigate('overview')}><Layers3 size={18}/></button><span className="ns-divider"/>
        <span>PressForge</span><ChevronRight size={13}/><strong>{current.label}</strong></div>
        <div className="ns-toolbar-actions">
          <span className="ns-toolbar-mode">{bundledRuntime?'BUNDLED':'DEVELOPMENT'}</span>
          <button type="button" onClick={onRefresh} title="Durumu yenile" aria-label="Durumu yenile"><RefreshCw size={16}/></button>
          <button type="button" title="Tercihler (⌘,)" aria-label="Tercihler" onClick={()=>navigate('settings')}><Settings2 size={16}/></button>
        </div>
      </header>
      <main className="ns-workarea">
        <div className="ns-page-heading"><div><p>{nav.find(g=>g.items.some(x=>x.id===page))?.title.toUpperCase()}</p><h1>{current.label}</h1></div>
          <div className="ns-heading-right">
            {page==='sites'||page==='overview'?<button type="button" className="ns-accent" onClick={onCreate} disabled={!allReady||!!working}><Plus size={15}/> Yeni Site</button>:null}
            {page==='modules'||isEngine?<button type="button" className="ns-secondary" onClick={onRefresh}><RefreshCw size={15}/> Yeniden denetle</button>:null}
          </div></div>
        {page==='overview'&&<div className="ns-view">
          <div className="ns-stat-grid">
            <div className="ns-stat"><small>WORDPRESS SİTELERİ</small><strong>{sites.length}</strong><span>Yerel projeler</span></div>
            <div className="ns-stat"><small>ÇALIŞAN SİTELER</small><strong>{sites.filter(s=>s.running).length}</strong><span>127.0.0.1 üzerinde</span></div>
            <div className="ns-stat"><small>ÇALIŞMA MOTORLARI</small><strong>{healthCount}/{deps.length||0}</strong><span>{allReady?'Tümü hazır':'Kontrol gerekli'}</span></div>
          </div>
          <div className="ns-panel ns-grow"><div className="ns-panel-heading"><div><strong>Son Projeler</strong><small>Yerel WordPress sitelerin</small></div>
            <button type="button" onClick={()=>navigate('sites')}>Tümünü gör <ChevronRight size={15}/></button></div>
            {siteTable(sites,0)}
          </div>
          <div className="ns-overview-bottom">
            <button type="button" onClick={()=>navigate('modules')}><Blocks size={17}/><strong>Modül Merkezi</strong><small>Motorlar ve eklentiler</small><ChevronRight size={16}/></button>
            <button type="button" onClick={()=>navigate('snapshots')}><Archive size={17}/><strong>Yedekler</strong><small>SQL + site dosyaları</small><ChevronRight size={16}/></button>
            <button type="button" onClick={()=>navigate('database')}><Database size={17}/><strong>Veritabanı</strong><small>Tablo ve şema</small><ChevronRight size={16}/></button>
          </div>
        </div>}
        {page==='sites'&&<div className="ns-view">
          <div className="ns-panel ns-grow">
            <div className="ns-panel-heading"><div><strong>Siteler</strong><small>{shownSites.length} proje bulundu</small></div>
              <div className="ns-search"><Search size={15}/><input ref={searchRef} value={search} onChange={e=>onSearch(e.target.value)} placeholder="Sitede ara… (⌘K)" aria-label="Site ara"/></div></div>
            {siteTable(shownSites,index)}
            <Paginator index={index} count={shownSites.length} onChange={setIndex}/>
          </div>
          <div className="ns-hint"><ShieldCheck size={15}/> Siteler yalnızca yerel bilgisayarında çalışır; dış ağlara otomatik açılmaz.</div>
        </div>}
        {page==='modules'&&<div className="ns-view"><div className="ns-panel ns-grow">
          <div className="ns-panel-heading"><div><strong>Yüklü ve planlanan modüller</strong><small>{modules.filter(m=>m.status==='ready').length} hazır · {modules.filter(m=>m.status==='planned').length} planlandı</small></div></div>
          <div className="ns-module-grid">
            {withinPage(modules,moduleIndex,8).map(item=><div className="ns-module-card" key={item.id}>
              <div><span className={'ns-status-tag '+item.status}>{statusLabel(item.status)}</span><strong>{item.label}</strong></div>
              <p>{item.description}</p>
              <div><small title={item.version}>{item.version||'PressForge modülü'}</small>
              {item.toggleable?<button type="button" disabled={!!moduleBusy} onClick={()=>void toggleModule(item)}>{moduleBusy===item.id?'…':item.enabled?'Kapat':'Aç'}</button>
              :<button type="button" disabled={!nav.some(g=>g.items.some(n=>n.module===item.id))} onClick={()=>{const target=nav.flatMap(g=>g.items).find(n=>n.module===item.id);if(target)navigate(target.id);}}>Aç <ChevronRight size={13}/></button>}</div>
            </div>)}
          </div>
          <Paginator index={moduleIndex} count={modules.length} limit={8} onChange={setModuleIndex}/>
        </div>{moduleMessage&&<div className="ns-hint"><Check size={15}/>{moduleMessage}</div>}</div>}
        {isEngine&&<div className="ns-view">
          <div className="ns-panel ns-engine-panel">
            <div className="ns-engine-intro"><div className="ns-large-icon"><current.Icon size={28}/></div><div><span>ÇALIŞMA MOTORU</span><h2>{info[page]?.title}</h2><p>{info[page]?.expect}</p></div>
              <span className={'ns-status-tag '+moduleStatus}>{statusLabel(moduleStatus)}</span></div>
            <div className="ns-engine-details">{deps.filter(d=>{
              const n=d.name.toLowerCase();return page==='php'||page==='webserver'?n.includes('php'):page==='wpcli'?n.includes('wp-cli'):n.includes('mariadb')||n.includes('mysql');
            }).map(d=><div className="ns-dependency-row" key={d.name}><div><strong>{d.name}</strong><small title={d.path}>{d.version||'Bulunamadı'}</small></div><span className={'ns-dotlabel '+(d.installed?'ok':'muted')}><i/>{d.installed?'Hazır':'Eksik'}</span></div>)}</div>
          </div><div className="ns-hint"><CircleAlert size={15}/>{bundledRuntime?'Paketlenmiş runtime eksikse sistem araçlarına geri dönülmez.':'Geliştirici modunda sistemdeki araçlar kullanılabilir.'}</div>
        </div>}
        {isSiteTool&&<div className="ns-view">
          <div className="ns-panel ns-grow">
            <div className="ns-panel-heading"><div><strong>{TOOLS[page].title}</strong><small>{TOOLS[page].desc}</small></div>
              <span className="ns-status-tag ready">Yerel işlem</span></div>
            {siteChooser()}
            <div className="ns-tool-actions">
              {page==='extensions'?<>
                <button type="button" disabled={!selected} onClick={()=>selected&&onTools(selected,'plugin')}><Package size={21}/><strong>Eklentileri Yönet</strong><small>Etkinleştir veya devre dışı bırak</small></button>
                <button type="button" disabled={!selected} onClick={()=>selected&&onTools(selected,'theme')}><Layers3 size={21}/><strong>Temaları Yönet</strong><small>Kurulu temaları görüntüle</small></button>
              </>:page==='logs'?<button type="button" disabled={!selected} onClick={()=>selected&&onLogs(selected)}><FileText size={21}/><strong>PHP Hata Günlüğü</strong><small>Son yerel kayıtları aç</small></button>
              :<button type="button" disabled={!selected} onClick={()=>selected&&onTools(selected,TOOLS[page].tab)}><current.Icon size={21}/><strong>{page==='database'?'Tablo ve Kolonları İncele':page==='snapshots'?'Snapshot Oluştur / Yönet':'Bakım Araçlarını Aç'}</strong><small>{page==='snapshots'?'SQL ve dosya yedeği; site durdurulmuş olmalı':'Yalnızca izinli yerel WP-CLI işlemleri'}</small></button>}
            </div>
          </div><div className="ns-hint"><ShieldCheck size={15}/> Bu sayfa doğrudan seçtiğin WordPress projesiyle çalışır; keyfî komut yürütmez.</div>
        </div>}
        {page==='settings'&&<div className="ns-view"><div className="ns-panel ns-grow">
          <div className="ns-panel-heading"><div><strong>Tercihler ve Güvenlik</strong><small>Paket, modül ve yardım seçenekleri</small></div></div>
          <div className="ns-settings-grid">
            <div className="ns-setting"><Server size={19}/><div><strong>Çalışma modu</strong><small>{bundledRuntime?'Paketli runtime':'Geliştirici araçları'}</small></div><span className={'ns-status-tag '+(allReady?'ready':'missing')}>{allReady?'Hazır':'Eksik'}</span></div>
            <div className="ns-setting"><ShieldCheck size={19}/><div><strong>Yerel güvenlik</strong><small>127.0.0.1 · proje klasörleri sahibine özel</small></div><Check size={16}/></div>
            <div className="ns-setting"><Package size={19}/><div><strong>Eklenti yöneticisi</strong><small>Site bazlı WP-CLI işlemleri</small></div><button type="button" onClick={()=>navigate('modules')}>Yönet</button></div>
            <div className="ns-setting"><BookOpen size={19}/><div><strong>WP-CLI dökümantasyonu</strong><small>Resmî geliştirici rehberi</small></div><button type="button" onClick={()=>invoke('open_help',{target:'cli'}).catch(onError)}>Aç</button></div>
          </div>
          <div className="ns-hint"><CircleAlert size={15}/> Dağıtım öncesinde Ventura cihaz testi, Apple imzalama ve noter onayı gereklidir.</div>
        </div></div>}
        {!['overview','sites','modules','settings'].includes(page)&&!isEngine&&!isSiteTool&&<div className="ns-view">
          <div className="ns-panel ns-grow ns-roadmap"><div className="ns-large-icon"><current.Icon size={29}/></div>
            <span className="ns-status-tag planned">Henüz uygulanmadı</span>
            <h2>{info[page]?.title||current.label}</h2>
            <p>{info[page]?.expect}</p>
            <div className="ns-roadmap-next"><strong>Aktivasyon için gereken</strong><span>{info[page]?.next}</span></div>
            <p className="ns-subtle">Bu ekran işlevsel olmayan seçenekler sunmaz. Modül, güvenlik ve gerçek cihaz testleri tamamlandığında etkinleştirilecektir.</p>
          </div>
        </div>}
      </main>
      <footer className="ns-statusbar"><span><span className={'ns-status-circle '+(allReady?'healthy':'')}/>{allReady?'Çalışma ortamı hazır':'Eksik çalışma motoru'}</span>
        <span><Command size={12}/> K · Proje ara</span><span>{modules.filter(m=>m.status==='ready').length} etkin modül</span></footer>
    </div>
  </div>;
}
