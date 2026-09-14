// The dynamic page payload is server-shaped; runtime validation remains authoritative in PHP.
// @ts-nocheck
import React,{useMemo,useState,useEffect,useRef} from 'react'; import {createRoot} from 'react-dom/client'; import {createPortal} from 'react-dom'; import {LayoutDashboard,Table2,Package,ClipboardList,ReceiptText,Utensils,Tags,Users,BarChart3,Percent,Gift,History,Settings,LogOut,Plus,Minus,Search,Printer,IndianRupee,ChevronRight,ChevronDown,Menu as MenuIcon,TrendingUp,XCircle,Pencil,X,Trash2,CheckCircle2,Clock,RotateCcw,Wallet,Smartphone,Coffee,Sunrise,Soup,UtensilsCrossed,Salad,GlassWater,ChefHat,Star,Sandwich,MoreVertical,Eye,EyeOff,Info,ShieldCheck,RefreshCw,AlertTriangle,User,KeyRound,Camera,Maximize2,Minimize2,Download} from 'lucide-react'; import '../css/app.css'; import type {Boot,AnyRecord} from './types';
import {buildEscPosBuffer,bytesToBase64,PAPER_PROFILES} from './receipt';
declare global{interface Window{__CANTEEN__:Boot}} const boot=window.__CANTEEN__; const money=(v:any)=>'₹'+Number(v||0).toFixed(2); const Form=({children,method='post',...p}:any)=><form method={method} {...p}>{method==='post'&&<input type="hidden" name="_csrf" value={boot.csrf}/>} {children}</form>; const toggleSidebar=()=>document.querySelector('.sidebar')?.classList.toggle('collapsed');
const settingOn=(k:string,def=true)=>{const v=(boot.data as any)?.settings?.[k];return v===undefined?def:v==='1'};

// ===== Persistent client-side module navigation =====
// The authenticated app used to change modules via location.href — a real
// browser navigation that destroys and recreates the whole document. That
// meant Fullscreen API state (tied to the document itself) always dropped
// on every module switch, and the sidebar/logo/topbar were torn down and
// rebuilt every time even though nothing about them had changed.
// PHP/MySQL remain the sole source of truth for every module — this layer
// changes ONLY the transport: instead of letting the browser navigate to a
// URL, it fetches that exact same URL (the exact same route, same
// PageDataService call, same auth/session checks, same HTML response
// app.php already renders for a normal GET) and reads the very
// window.__CANTEEN__ payload that response embeds — the same object the
// whole app already reads everywhere via the module-level `boot` const.
// boot's OWN PROPERTIES are mutated in place (Object.assign), not
// reassigned, so every existing component that already does boot.data /
// boot.page / boot.user / boot.csrf keeps working completely unchanged;
// they just see fresh values on the next render. There is exactly one
// long-lived subscriber (the top-level AuthenticatedApp component below),
// notified via these two plain callbacks rather than React context, since
// this is the only cross-cutting signal needed and every page component
// already reads `boot` as a bare module global.
let notifyNav:((loading:boolean,error:string|null)=>void)|null=null;
let notifyBootChanged:(()=>void)|null=null;
let navSeq=0;
let lastNavUrl='';
function clientNavigate(url:string,init?:any,push=true){
  const seq=++navSeq;
  lastNavUrl=url;
  notifyNav&&notifyNav(true,null);
  fetch(url,{credentials:'same-origin',...(init||{})}).then(async(res:any)=>{
    const html=await res.text();
    if(seq!==navSeq)return; // superseded by a newer navigation - discard this stale response
    const m=html.match(/window\.__CANTEEN__=(\{[\s\S]*?\});<\/script>/);
    if(!m){
      // Not an authenticated-shell response — most likely the session
      // expired and the server served the login page instead. Never
      // render that fetched markup in place of the current module (that
      // would either show nothing useful or risk a confusing blank
      // state); a hard navigation is the correct, safe way to land the
      // user back on the real login flow with zero protected data ever
      // touched.
      location.href=res.url||url;
      return;
    }
    const newBoot=JSON.parse(m[1]);
    Object.assign(boot,newBoot);
    if(push){try{const u=new URL(res.url||url,location.href);history.pushState({},'',u.pathname+u.search);}catch{}}
    notifyNav&&notifyNav(false,null);
    notifyBootChanged&&notifyBootChanged();
  }).catch(()=>{
    if(seq!==navSeq)return;
    notifyNav&&notifyNav(false,'Could not load this page. Check your connection and try again.');
  });
}
const go=(p:string)=>clientNavigate('/'+p);

// ===== System-wide loading/processing UX layer =====
// This app has no client-side router or fetch-driven data loading — every
// module switch is a real browser navigation and every Save/Add/Delete is a
// native form POST-redirect-GET. A React "isNavigating" state can never
// reliably represent that transition (it lives on the outgoing document,
// which is torn down mid-navigation, and never fires at all for a
// form-submit-triggered redirect) — that inconsistency is exactly why the
// content-area loading indicator now lives as plain static markup directly
// in resources/views/app.php (inside #root, matching the real Shell's
// classes), painted by the browser before any JS runs, and replaced
// wholesale once React mounts. See the comment on .main-loading-overlay in
// app.css for the full reasoning. This file only owns the per-button
// processing state below (Save/Add/Delete/Pay etc.), applied via one
// delegated 'submit' listener so every form's submit button gets
// consistent feedback with zero changes to each individual component.
// Button label -> present-participle ("Save" -> "Saving"), covering every
// verb actually used across the app's buttons; anything unlisted falls back
// to a generic e/consonant-aware "+ing" guess rather than being left blank.
const LOADING_VERB_MAP:Record<string,string>={save:'Saving',add:'Adding',update:'Updating',delete:'Deleting',create:'Creating',change:'Changing',reset:'Resetting',cancel:'Cancelling',reject:'Rejecting',approve:'Approving',pay:'Paying',enable:'Enabling',disable:'Disabling',print:'Printing',export:'Exporting',apply:'Applying',logout:'Logging out'};
function toLoadingLabel(text:string):string{
  const trimmed=text.replace(/\s+/g,' ').trim(); if(!trimmed)return 'Processing';
  const sp=trimmed.indexOf(' '); const firstWord=(sp===-1?trimmed:trimmed.slice(0,sp)).toLowerCase().replace(/[^a-z]/g,'');
  const rest=sp===-1?'':trimmed.slice(sp+1);
  const gerund=LOADING_VERB_MAP[firstWord];
  if(gerund)return rest?`${gerund} ${rest}`:gerund;
  const guess=/e$/i.test(firstWord)?firstWord.slice(0,-1)+'ing':firstWord+'ing';
  return rest?`${guess.charAt(0).toUpperCase()+guess.slice(1)} ${rest}`:guess.charAt(0).toUpperCase()+guess.slice(1);
}
// Disables a button, swaps its label for a spinner + present-participle
// ("Save order" -> "⟳ Saving order..."), and locks its rendered width so
// the longer label can't shift surrounding layout. A 20s safety timeout
// re-enables it if the page never actually navigates (e.g. a dropped
// connection) — this app's only "restore on success" path is the browser
// reloading to the new page state, which resets everything for free; this
// timeout exists purely so a genuine failure never leaves a button stuck.
function startButtonLoading(btn:HTMLButtonElement|null|undefined,labelOverride?:string){
  if(!btn||btn.disabled||btn.getAttribute('data-loading')==='1')return;
  const text=btn.textContent||'';
  const label=labelOverride||toLoadingLabel(text);
  const width=btn.getBoundingClientRect().width;
  if(width)btn.style.minWidth=width+'px';
  btn.setAttribute('data-loading','1');
  if(text.trim())btn.innerHTML=`<span class="btn-spinner"></span>${label}...`;
  // Disabling the submitter is deferred a tick: some of this app's forms
  // have multiple submit buttons whose own name/value the server depends
  // on (e.g. Pay cash / Pay UPI, both name="method"). Browsers decide
  // which control's value to include in the submission by reading its
  // disabled state as part of the same synchronous submit algorithm that
  // follows this event — disabling it here would make that value vanish
  // from the POST body before it's ever sent. A 0ms defer runs after that
  // data is already collected, so it still blocks a human double-click
  // (imperceptibly fast) without corrupting the very submission it's
  // reacting to.
  setTimeout(()=>{if(btn.getAttribute('data-loading')==='1')btn.disabled=true},0);
  setTimeout(()=>{
    if(btn.isConnected&&btn.getAttribute('data-loading')==='1'){btn.disabled=false;btn.style.minWidth='';btn.removeAttribute('data-loading')}
  },20000);
}
if(boot&&typeof document!=='undefined'){
  // Gated on `boot` because this whole delegated-listener layer exists for
  // the authenticated app's own navigation/form UX — the login page (which
  // has no window.__CANTEEN__) mounts only <InstallBanner/> below and keeps
  // its own separate, pre-existing submit handling untouched.
  //
  // Every existing <form method="post"> (whether built via the <Form>
  // component or, in one place, by hand for an auto-submitting table
  // card) still POSTs to the exact same PHP action with the exact same
  // fields/CSRF token — none of that changes. What changes is only what
  // happens with the *response*: instead of letting the browser follow
  // the server's redirect as a real navigation, this fetches it, so
  // clientNavigate can read the resulting page's own boot payload and
  // swap the module in place. FormData(form, submitter) — not just
  // FormData(form) — is what correctly includes the clicked submit
  // button's own name/value (e.g. Pay's method=CASH/UPI), matching what
  // a native submit would have sent.
  document.addEventListener('submit',(e:any)=>{
    if(e.defaultPrevented)return; // a component's own validation already blocked this submit
    const form=e.target as HTMLFormElement;
    const submitter=e.submitter as HTMLButtonElement|undefined;
    if(submitter&&submitter.tagName==='BUTTON')startButtonLoading(submitter);
    // Logout is deliberately EXCLUDED from client-side navigation. Letting
    // the browser perform its own real submit+redirect (rather than
    // fetching it and swapping the module in place) guarantees an actual
    // full document navigation to the login page — the session is
    // destroyed server-side either way, but a real navigation also tears
    // down the in-memory React app and its history-spanning pushState
    // entries, which matters together with the no-store header on every
    // authenticated response (see routes/web.php) for making sure Back
    // after logout can't resurrect authenticated content from cache.
    if((new FormData(form).get('action'))==='logout')return;
    e.preventDefault();
    const fd=new FormData(form,submitter);
    // form.action/form.method (the DOM properties) are NOT safe here: per
    // the HTML spec, a <form> exposes its own named controls as properties
    // of the same name ("named element access"), so on any form with an
    // <input name="action"> (i.e. every action-based form in this app) or
    // a <button name="method"> (the Pay form), form.action/form.method
    // resolve to THAT control element instead of the URL/method string.
    // The raw attributes are unaffected by this shadowing.
    const actionUrl=form.getAttribute('action')||location.href;
    const methodAttr=(form.getAttribute('method')||'post').toLowerCase();
    if(methodAttr==='get'){
      const qs=new URLSearchParams(fd as any).toString();
      clientNavigate(actionUrl.split('?')[0]+(qs?'?'+qs:''));
    }else{
      clientNavigate(actionUrl,{method:'POST',body:fd});
    }
  });
  // Same-origin link navigation (an order row, "View Cancelled Bills",
  // etc.) — anything not opting out via target="_blank", a download
  // attribute, a modifier-key click, or its own preventDefault().
  document.addEventListener('click',(e:MouseEvent)=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=(e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement|null;
    if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    let url:URL;
    try{url=new URL(a.href,location.href)}catch{return}
    if(url.origin!==location.origin)return;
    e.preventDefault();
    clientNavigate(url.pathname+url.search);
  });
}
// Reusable pattern for the handful of client-only actions that aren't a
// form submit (Export/Print) — idle -> loading -> idle, with a minimum
// display time so a fast operation doesn't just flash the spinner.
function AsyncButton({onAction,loadingText,minMs=350,className,children,...rest}:any){
  const [running,setRunning]=useState(false);
  const handleClick=async(e:any)=>{
    if(running)return;
    setRunning(true);
    const started=Date.now();
    try{await onAction(e)}finally{
      const wait=Math.max(0,minMs-(Date.now()-started));
      setTimeout(()=>setRunning(false),wait);
    }
  };
  return <button type="button" className={className} onClick={handleClick} disabled={running} {...rest}>
    {running?(loadingText?<><span className="btn-spinner"/>{loadingText}...</>:<span className="btn-spinner"/>):children}
  </button>;
}
const applyThermalPageSize=()=>{
  // Chrome doesn't reliably size a print page from `@page{size:80mm auto}`,
  // so measure the receipt's real rendered height and inject an exact
  // `@page{size:80mm Xmm}` for this print job instead of leaving a tall
  // fixed page with blank space below a short bill. Bound to `beforeprint`
  // (see OrderEditor) rather than only the print button's onClick, so this
  // also fires for Ctrl+P / the browser's own Print menu — any trigger a
  // user might reach for, not just the in-app button.
  const bill=document.querySelector('.print-bill') as HTMLElement|null;
  if(!bill)return;
  const widthMm=bill.classList.contains('paper-58')?58:80;
  const prev={display:bill.style.display,position:bill.style.position,visibility:bill.style.visibility,left:bill.style.left,top:bill.style.top};
  bill.style.setProperty('display','block','important');
  bill.style.setProperty('position','fixed','important');
  bill.style.setProperty('visibility','hidden','important');
  bill.style.setProperty('left','-9999px','important');
  bill.style.setProperty('top','0','important');
  const heightPx=bill.getBoundingClientRect().height;
  const heightMm=Math.max(30,Math.ceil(heightPx*25.4/96)+4);
  bill.style.display=prev.display; bill.style.position=prev.position; bill.style.visibility=prev.visibility; bill.style.left=prev.left; bill.style.top=prev.top;
  let style=document.getElementById('thermal-page-style') as HTMLStyleElement|null;
  if(!style){style=document.createElement('style'); style.id='thermal-page-style'; document.head.appendChild(style)}
  // Chrome's print pipeline resolves .print-bill's percentage/auto margins
  // against html/body's width, not the @page size above — if that ends up
  // wider than the paper (observed in practice), centering the receipt then
  // shoves it sideways far enough to clip the rightmost table column off
  // the physical page. Pinning html/body to the same width too (print-only,
  // scoped to this same removable style tag) keeps that containing block
  // accurate at either 80mm or 58mm.
  style.textContent=`@page{size:${widthMm}mm ${heightMm}mm;margin:0}@media print{html,body{width:${widthMm}mm!important;max-width:${widthMm}mm!important}}`;
};
const clearThermalPageSize=()=>{document.getElementById('thermal-page-style')?.remove()};
// One click, straight into Chrome's normal print flow — no popup window.
// The 4-column receipt bug earlier was the <table>/table-layout:fixed
// rendering itself (fixed by switching to CSS Grid), not same-document
// printing, so there's no remaining reason to isolate the print job in a
// separate window.
const printThermalBill=()=>{applyThermalPageSize(); window.print()};
// ===== Local printer agent (instant/silent ESC/POS printing) =====
// This app's PHP/MySQL backend runs on shared hosting with no route at all
// to a USB thermal printer sitting on a cashier's Windows PC, and no print
// job is ever routed through it for that reason — printing instead happens
// entirely between this browser tab and a small standalone process the
// cashier runs once on their own PC (see print-agent/README.md), which is
// the only thing that actually talks to the OS print spooler. When that
// agent isn't configured or isn't reachable, every print action below
// falls back to the existing browser print path (printThermalBill) that
// was already working before this feature existed — this file never
// removes that fallback, only adds an instant path in front of it.
const AGENT_TIMEOUT_MS=4000;
function printerSettings(){
  const s=(boot.data as any)?.settings||{};
  return {
    paperWidth:(s.printer_paper_width==='58'?'58':'80') as '58'|'80',
    autoPrint:s.printer_auto_print==='1',
    autoCut:s.printer_auto_cut!=='0',
    agentUrl:String(s.printer_agent_url||'').replace(/\/+$/,''),
    printerName:String(s.printer_name||''),
    counterId:s.printer_counter_id?Number(s.printer_counter_id):null,
  };
}
// The counter this browser is configured for, plus whether ITS bridge has
// heartbeated recently — read from boot.data.counters, which every page
// response carries (see PageDataService::data(), which merges it in
// alongside `settings` for exactly this reason: printing can be triggered
// from Tables/Order/Bills, not only the Settings screen).
function configuredCounter():any|null{
  const cfg=printerSettings();
  if(!cfg.counterId)return null;
  const counters=(boot.data as any)?.counters||[];
  return counters.find((c:any)=>Number(c.id)===cfg.counterId)||null;
}
async function fetchAgent(agentUrl:string,path:string,init?:any):Promise<Response>{
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),AGENT_TIMEOUT_MS);
  try{return await fetch(agentUrl+path,{...(init||{}),signal:ctrl.signal})}
  finally{clearTimeout(timer)}
}
async function checkAgentStatus(agentUrl:string):Promise<{ok:boolean;printers:string[];error?:string}>{
  if(!agentUrl)return{ok:false,printers:[],error:'No printer agent address configured.'};
  try{
    const res=await fetchAgent(agentUrl,'/status');
    if(!res.ok)return{ok:false,printers:[],error:'Agent responded with an error.'};
    const data=await res.json();
    return{ok:true,printers:Array.isArray(data.printers)?data.printers:[]};
  }catch{return{ok:false,printers:[],error:'Could not reach the local printer agent. Is it running on this PC?'}}
}
async function sendToAgent(agentUrl:string,printerName:string,bytes:Uint8Array):Promise<{ok:boolean;error?:string}>{
  if(!agentUrl)return{ok:false,error:'No printer agent configured. Set one up in Settings → Printer.'};
  try{
    const res=await fetchAgent(agentUrl,'/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({printerName,dataBase64:bytesToBase64(bytes)})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)return{ok:false,error:data.error||'The printer agent reported a failure.'};
    return{ok:true};
  }catch{return{ok:false,error:'Could not reach the local printer agent. Is it running on this PC?'}}
}
// Bridges this app's existing order/item shape (unchanged — see
// PageDataService::order() in PHP) into receipt.ts's plain formatting
// input. Every money value here is read directly from the order/order_items
// rows the server already computed and stored (order.subtotal,
// discount_amount, complementary_amount, grand_total; item.net_amount) —
// nothing is recalculated here, so this can never disagree with the
// authoritative numbers OrderService.php already wrote to the database.
function orderReceiptPayload(order:any,items:any[],settings:any){
  const header={
    canteenName:settings.canteen_name||'Canteen',
    address:settings.address||'',
    phone:settings.phone||'',
    gstNumber:settings.gst_number||'',
    billNumber:order.bill_number||order.order_number||'',
    tableName:order.table_name||'',
    waiterName:order.created_by_name||'',
    paymentMethod:order.payment_method||'',
    dateText:new Date().toLocaleString(),
    showTableNumber:settings.show_table_number!=='0',
    showWaiterName:settings.show_waiter_name!=='0',
    showThankYou:settings.show_thank_you_message!=='0',
    thankYouMessage:settings.thank_you_message||'',
  };
  const receiptItems=(items||[]).map((x:any)=>({
    name:x.item_name_snapshot+(x.variant_name_snapshot?` (${x.variant_name_snapshot})`:'')+(Number(x.complementary_amount)>0?' - Complementary':''),
    quantity:Number(x.quantity),
    rate:Number(x.unit_price),
    amount:Number(x.net_amount),
  }));
  const totals={
    subtotal:Number(order.subtotal||0),
    complementary:Number(order.complementary_amount||0),
    discount:Number(order.discount_amount||0),
    grandTotal:Number(order.grand_total||0),
  };
  return{header,items:receiptItems,totals};
}
// ===== Server-mediated print queue (production architecture) =====
// PWA -> this app's own PHP server -> print_jobs queue -> the counter's
// Niyati Print Bridge -> printer. Neither a PC nor a mobile browser ever
// calls a counter PC directly — the server is the broker, which is what
// lets a mobile device (with no possible route to a till PC's loopback
// address) request printing at all. Creating a job here never claims
// success: the job starts QUEUED and only becomes PRINTED once the correct
// bridge has actually reported it, which pollJobStatus below checks for.
async function createServerPrintJob(kind:'RECEIPT'|'TEST',orderId:number|null,counterId:number,paperWidth:string,bytes:Uint8Array):Promise<{ok:boolean;jobId?:number;error?:string}>{
  try{
    const body=new URLSearchParams({action:kind==='TEST'?'print_test_job_create':'print_job_create',_csrf:boot.csrf,counter_id:String(counterId),paper_width:paperWidth,escpos_base64:bytesToBase64(bytes)});
    if(kind==='RECEIPT'&&orderId)body.set('order_id',String(orderId));
    const res=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',body});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)return{ok:false,error:data.error||'Could not queue the print job.'};
    return{ok:true,jobId:data.job_id};
  }catch{return{ok:false,error:'Could not reach the server to queue the print job.'}}
}
// Short client-side poll so the UI can report a genuine PRINTED/FAILED
// outcome instead of just "sent" — the bridge itself polls the server on
// its own schedule (see print-agent's /status equivalent, or the future
// Print Bridge's poll loop), so this is purely about giving the cashier a
// real answer, not about how the job actually gets claimed/printed.
async function pollJobStatus(jobId:number,{tries=8,intervalMs=800}:{tries?:number;intervalMs?:number}={}):Promise<{status:string;error?:string}>{
  for(let i=0;i<tries;i++){
    try{
      const res=await fetch('/tables?job_status='+jobId,{credentials:'same-origin',cache:'no-store'});
      const data=await res.json();
      if(data.status==='PRINTED'||data.status==='FAILED'||data.status==='CANCELLED')return{status:data.status,error:data.last_error};
    }catch{/* transient — keep polling until tries run out */}
    await new Promise(r=>setTimeout(r,intervalMs));
  }
  return{status:'QUEUED'};
}
// The one place that decides HOW a bill actually gets printed, in order:
// (1) the server-mediated bridge, if a counter is configured and its
// bridge has heartbeated recently — this is the production path, and the
// only one that works for a mobile device with no route to a till PC; (2)
// the legacy local agent (127.0.0.1, development-only — see
// print-agent/README.md); (3) the existing browser print dialog, exactly
// as it worked before this feature existed. `silent` distinguishes an
// explicit user click (fine to fall back to Chrome's print dialog) from an
// automatic post-payment print (must never surprise the cashier with an
// unexpected print dialog — on failure it just reports back so the caller
// can show a manual retry link instead). Either way, this only ever runs
// on a bill that already exists — every call site is reached strictly
// after payment/order data has been read back from the server, never
// before or instead of it.
async function printOrderReceipt(order:any,items:any[],settings:any,opts:{silent?:boolean}={}):Promise<{ok:boolean;via:'bridge'|'agent'|'browser'|'none';error?:string;jobId?:number}>{
  const cfg=printerSettings();
  const {header,items:receiptItems,totals}=orderReceiptPayload(order,items,settings);
  const bytes=buildEscPosBuffer(header,receiptItems,totals,cfg.paperWidth,{cut:cfg.autoCut,feedLinesBeforeCut:3});
  const counter=configuredCounter();
  if(counter&&counter.online){
    const created=await createServerPrintJob('RECEIPT',order.id?Number(order.id):null,Number(counter.id),cfg.paperWidth,bytes);
    if(created.ok&&created.jobId){
      const final=await pollJobStatus(created.jobId);
      if(final.status==='PRINTED')return{ok:true,via:'bridge',jobId:created.jobId};
      if(opts.silent)return{ok:false,via:'none',error:final.error||'Print bridge did not confirm printing.',jobId:created.jobId};
    }else if(opts.silent)return{ok:false,via:'none',error:created.error};
  }
  if(cfg.agentUrl){
    const result=await sendToAgent(cfg.agentUrl,cfg.printerName,bytes);
    if(result.ok)return{ok:true,via:'agent'};
    if(opts.silent)return{ok:false,via:'none',error:result.error};
  }
  if(opts.silent)return{ok:false,via:'none',error:'No printer bridge or agent configured.'};
  printThermalBill();
  return{ok:true,via:'browser'};
}
const hasPermission=(code:string)=>boot.user.role==='ADMIN'||(boot.user.permissions||[]).includes(code);
const logoSrc=(path?:string)=>path?`/?media=${encodeURIComponent(path)}`:null;
const MENU_IMAGE_MAP:Record<string,string>={'tea':'tea.webp','special tea':'special tea.webp','coffee':'coffee.webp','milk':'milk.webp','pohe':'pohe.webp','upit':'upit.webp','sheera':'sheera.webp','kurma puri':'kurma puri.webp','kolhapuri misal':'kolhapuri misal.webp','vada pav':'vada pav.webp','dahi vada':'dahi vada.webp','kat vada':'kat vada.webp','mirchi bajji':'mirchi bajji.webp','idli sambar':'idli sambar.webp','masala dosa':'masala dosa.webp','plain dosa':'plain dosa.webp','sponge dosa':'sponge dosa.webp','onion uttapam':'onion uttapam.webp','tomato omelette':'tomato omelette.webp','medu vada sambar':'medu vada sambar.webp','paper dosa':'paper dosa.webp','idli vada sambar':'idli vada sambar.webp','rice plate':'rice-plate.webp','jhunka bhakri':'zunka-bhakri.webp','shalu khichdi':'sabudana-khichdi.webp','tak':'taak.webp','lassi':'lassi.webp','paani':'water-bottle.webp','cold drinks':'cold-drink-bottles.webp','veg manchurian':'veg-manchurian.webp','veg noodles':'veg-noodles.webp','pulav':'pulav.webp','samosa':'samosa.webp'};
// image_path now always names a file the admin picked from the
// server-controlled public/canteen_images/ library (never an upload — see
// MenuImagePicker/menu_save) — same directory, same URL shape as the
// MENU_IMAGE_MAP fallback below, so both branches resolve to a real static
// file Apache serves directly from public/, with no dependency on any
// particular host/port (works unchanged on XAMPP and production).
const menuImageSrc=(m:any)=>{if(m.image_path)return `/canteen_images/${encodeURIComponent(m.image_path)}`;const file=MENU_IMAGE_MAP[String(m.name||'').trim().toLowerCase()];return file?`/canteen_images/${encodeURIComponent(file)}`:'/assets/menu-fallback.png'};
const CATEGORY_ICON_MAP:Record<string,any>={'tea':Coffee,'coffee':Coffee,'tea & coffee':Coffee,'breakfast':Sunrise,'south indian':Soup,'maharashtrian':UtensilsCrossed,'meals':Salad,'drinks':GlassWater,'beverages':GlassWater,'chinese':ChefHat,'specials':Star,'snacks':Sandwich};
const categoryIcon=(name:string)=>CATEGORY_ICON_MAP[String(name||'').trim().toLowerCase()]||Tags;
const CATEGORY_COLORS=[['var(--primary-soft)','var(--primary-dark)'],['var(--teal-soft)','var(--c-teal)'],['var(--orange-soft)','#b8790a'],['var(--purple-soft)','var(--purple)'],['var(--c-magenta-soft)','var(--c-magenta)'],['var(--blue-soft)','var(--blue)']];
const categoryColor=(id:number)=>CATEGORY_COLORS[Number(id)%CATEGORY_COLORS.length];
const NAV_ITEMS=[['dashboard',LayoutDashboard,'Dashboard'],['orders',ClipboardList,'Orders'],['bills',ReceiptText,'Bills'],['tables',Table2,'Tables'],['parcels',Package,'Parcel'],['menu',Utensils,'Menu'],['categories',Tags,'Categories'],['users',Users,'Users'],['reports',BarChart3,'Reports'],['cancelled',ReceiptText,'Cancelled Bills'],['modified',History,'Modified Bills'],['audits',History,'Audit History'],['settings',Settings,'Settings']]; // 'settings' is a base nav item (visible to every authenticated user, not
// just ones with the 'settings' permission) because My Profile lives
// there and every user needs a discoverable path to their own account —
// SettingsPage/SettingsTabs independently restrict a non-privileged user
// to only ever seeing the My Profile tab once they arrive.
const NAV_BASE_PAGES=['tables','parcels','orders','bills','settings']; const navFor=(user:any)=>user.role==='ADMIN'?NAV_ITEMS:NAV_ITEMS.filter(([key]:any)=>NAV_BASE_PAGES.includes(key)||(user.permissions||[]).includes(key));
const closeSidebar=()=>document.querySelector('.sidebar')?.classList.remove('collapsed');
// ===== Fullscreen toggle (desktop "installed app" feel) =====
// Never auto-requested — only ever called from this button's own click, per
// the Fullscreen API's requirement of a direct user gesture.
function useFullscreen(){
  const supported=typeof document!=='undefined'&&!!(document.documentElement.requestFullscreen&&document.exitFullscreen);
  const [isFullscreen,setIsFullscreen]=useState(()=>!!document.fullscreenElement);
  useEffect(()=>{
    if(!supported)return;
    const onChange=()=>setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange',onChange);
    return()=>document.removeEventListener('fullscreenchange',onChange);
  },[supported]);
  const toggle=()=>{
    if(!supported)return;
    if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
  };
  return {supported,isFullscreen,toggle};
}
function FullscreenButton(){
  // isStandalone (installed-PWA state) and isFullscreen (Fullscreen API
  // state) are deliberately independent. An installed PWA's standalone
  // window and true browser/OS fullscreen are two distinct, stackable
  // modes — standalone removes the browser's own tabs/address bar, but the
  // Fullscreen API still adds real edge-to-edge fullscreen on top of that,
  // and the user can toggle it either way. So standalone state must never
  // gate this button's existence, only isFullscreen may ever affect what's
  // rendered (icon/label/aria-pressed) — the button always stays mounted
  // in both a normal browser tab and an installed PWA. A full page
  // navigation ends browser fullscreen by design (the document is
  // destroyed), and this never auto-re-enters it — only a direct click may
  // request it.
  const {supported,isFullscreen,toggle}=useFullscreen();
  if(!supported)return null;
  return <button type="button" className="menu-toggle" onClick={toggle} title={isFullscreen?'Exit full screen':'Enter full screen'} aria-pressed={isFullscreen}>
    {isFullscreen?<Minimize2 size={19}/>:<Maximize2 size={19}/>}
  </button>;
}
// ===== PWA install/standalone detection =====
// Server-authoritative business data is untouched by any of this — it only
// ever reads browser/OS install signals, never writes app state.
const isIOSDevice=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandaloneDisplay=()=>window.matchMedia('(display-mode: standalone)').matches||(window.navigator as any).standalone===true;
function usePWAInstall(){
  const [installed,setInstalled]=useState(isStandaloneDisplay);
  const [deferred,setDeferred]=useState<any>(null);
  useEffect(()=>{
    const onBeforeInstall=(e:any)=>{e.preventDefault();setDeferred(e)};
    const onInstalled=()=>{setInstalled(true);setDeferred(null)};
    const mq=window.matchMedia('(display-mode: standalone)');
    const onModeChange=(e:any)=>{if(e.matches)setInstalled(true)};
    window.addEventListener('beforeinstallprompt',onBeforeInstall);
    window.addEventListener('appinstalled',onInstalled);
    mq.addEventListener('change',onModeChange);
    return()=>{window.removeEventListener('beforeinstallprompt',onBeforeInstall);window.removeEventListener('appinstalled',onInstalled);mq.removeEventListener('change',onModeChange)};
  },[]);
  const promptInstall=async():Promise<'accepted'|'dismissed'|'unavailable'>=>{
    if(!deferred)return 'unavailable';
    deferred.prompt();
    const choice=await deferred.userChoice.catch(()=>null);
    setDeferred(null);
    if(choice?.outcome==='accepted'){setInstalled(true);return 'accepted'}
    return 'dismissed';
  };
  return {installed,canInstall:!!deferred,isIOS:isIOSDevice(),promptInstall};
}
const INSTALL_DISMISS_KEY='pwa_install_dismissed';
function InstallBanner(){
  const {installed,canInstall,isIOS,promptInstall}=usePWAInstall();
  const [dismissed,setDismissed]=useState(()=>{try{return sessionStorage.getItem(INSTALL_DISMISS_KEY)==='1'}catch{return false}});
  const later=()=>{setDismissed(true);try{sessionStorage.setItem(INSTALL_DISMISS_KEY,'1')}catch{}};
  if(installed||dismissed||(!canInstall&&!isIOS))return null;
  const install=async()=>{const r=await promptInstall();if(r!=='unavailable')later()};
  return <div className="install-banner" role="region" aria-label="Install application">
    <img className="install-banner-icon" src="/icons/icon-192.png" alt="" width={40} height={40}/>
    <div className="install-banner-body">
      <b>Install Niyati Canteen</b>
      <p>{canInstall?'Install this app for a faster, full-screen billing experience.':<>Tap <b>Share</b> → <b>Add to Home Screen</b> for a faster, full-screen billing experience.</>}</p>
    </div>
    <div className="install-banner-actions">
      {canInstall&&<button type="button" className="primary" onClick={install}><Download size={15}/> Install App</button>}
      <button type="button" className="secondary" onClick={later}>Later</button>
    </div>
  </div>;
}
// Mounted exactly once for the whole authenticated document (see
// AuthenticatedApp below) — module navigation only ever swaps `children`,
// so the sidebar/logo/topbar/fullscreen button/account menu are never
// unmounted or re-fetched by switching modules, and the Fullscreen API
// state (tied to the document, not to any React subtree) survives it.
function Shell({children,navLoading,navError,onRetry}:any){const nav=navFor(boot.user);return <div className="app"><aside className="sidebar"><div className="brand"><img src="/icons/logo.png" alt="Niyati"/></div><nav>{nav.map(([key,Icon,label]:any)=><button className={boot.page===key?'active':''} onClick={()=>{closeSidebar();go(key)}} key={key}><Icon size={19}/><span>{label}</span></button>)}</nav><Form><input name="action" value="logout" type="hidden"/><button className="logout"><LogOut size={18}/><span>Logout</span></button></Form></aside><div className="sidebar-backdrop" onClick={closeSidebar}/><main className="main"><header className="topbar"><button type="button" className="menu-toggle" onClick={toggleSidebar} title="Toggle menu"><MenuIcon/></button><div className="topbar-right"><FullscreenButton/><AccountMenu/></div></header>{!navLoading&&boot.flash.error&&<div className="alert error">{boot.flash.error}</div>}{!navLoading&&boot.flash.success&&<div className="alert success">{boot.flash.success}</div>}{navLoading?<div className="main-loading-overlay"><span className="main-loading-spinner"></span><span>Loading...</span></div>:navError?<div className="main-error-state"><AlertTriangle size={28}/><p>{navError}</p><button type="button" className="secondary" onClick={onRetry}>Retry</button></div>:children}</main></div>}
function AccountMenu(){
  const [open,setOpen]=useState(false); const [pwOpen,setPwOpen]=useState(false);
  const boxRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onDoc=(e:MouseEvent)=>{if(boxRef.current&&!boxRef.current.contains(e.target as Node))setOpen(false)};
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',onDoc);window.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onKey)};
  },[open]);
  return <div className="user-menu" ref={boxRef}>
    <button type="button" className="user-chip" onClick={()=>setOpen(o=>!o)}><span className="user-chip-icon">{boot.user.avatar?<img src={logoSrc(boot.user.avatar)||''} alt=""/>:<User size={16}/>}</span><b>{boot.user.name}</b></button>
    {open&&<div className="kebab-menu user-dropdown">
      <button type="button" onClick={()=>{setOpen(false);go('settings?tab=profile')}}><User size={14}/> My Profile</button>
      <button type="button" onClick={()=>{setOpen(false);setPwOpen(true)}}><KeyRound size={14}/> Change Password</button>
    </div>}
    {pwOpen&&<ChangePasswordModal onClose={()=>setPwOpen(false)}/>}
  </div>;
}
// Shared by all three Change Password fields: hidden by default, its own
// independent show/hide toggle (each instance owns its own `visible`
// state, so toggling one never affects the others), and a fixed-position
// eye button that never shifts the field's own width/layout.
function PasswordField({label,name,value,onChange,ariaBase,hint,autoFocus,autoComplete}:any){
  const [visible,setVisible]=useState(false);
  return <label className={name==='current_password'?'wide':'pw-field'}>
    {label}
    <span className="pw-input">
      <input name={name} type={visible?'text':'password'} required autoFocus={autoFocus} autoComplete={autoComplete} value={value} onChange={onChange}/>
      <button type="button" className="pw-input-toggle" onClick={()=>setVisible(v=>!v)} aria-label={(visible?'Hide ':'Show ')+ariaBase} title={(visible?'Hide ':'Show ')+ariaBase}>
        {visible?<EyeOff size={17}/>:<Eye size={17}/>}
      </button>
    </span>
    {hint&&<small className="current-image-hint">{hint}</small>}
  </label>;
}
function ChangePasswordModal({onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState(''); const [confirmPassword,setConfirmPassword]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [submitting,setSubmitting]=useState(false);
  // This form is handled entirely here rather than through the app's
  // generic client-navigation submit listener: that generic path applies a
  // server error to the whole page's flash banner (behind this modal, per
  // Shell), which is exactly the bug being fixed — Change Password errors
  // must stay inside the modal that caused them. e.preventDefault() here
  // stops the event before it ever reaches that document-level listener,
  // and this does its own fetch to the same server action (unchanged
  // validation/hashing/CSRF), branching on the result itself instead of
  // letting the generic handler decide what happens next.
  const submit=async(e:any)=>{
    e.preventDefault();
    if(submitting)return;
    if(!currentPassword){setError('Current password is required.');return;}
    if(newPassword.length<8){setError('New password must be at least 8 characters.');return;}
    if(newPassword!==confirmPassword){setError('New password and confirm password do not match.');return;}
    setError(null); setSubmitting(true);
    try{
      const fd=new FormData();
      fd.set('_csrf',boot.csrf); fd.set('action','change_password');
      fd.set('current_password',currentPassword); fd.set('new_password',newPassword); fd.set('confirm_password',confirmPassword);
      const res=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',body:fd});
      const html=await res.text();
      const m=html.match(/window\.__CANTEEN__=(\{[\s\S]*?\});<\/script>/);
      if(!m){location.href=res.url||location.href;return;}
      const newBoot=JSON.parse(m[1]);
      if(newBoot.flash&&newBoot.flash.error){
        setError(newBoot.flash.error);
        setCurrentPassword(''); // never keep a rejected current-password value around
        setSubmitting(false);
        return;
      }
      Object.assign(boot,newBoot); notifyBootChanged&&notifyBootChanged();
      onClose();
    }catch{
      setError('Could not change the password. Check your connection and try again.');
      setSubmitting(false);
    }
  };
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>Change password</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      {error&&<div className="alert error">{error}</div>}
      <Form onSubmit={submit}>
        <div className="form-grid">
          <PasswordField label="Current password" name="current_password" value={currentPassword} onChange={(e:any)=>setCurrentPassword(e.target.value)} ariaBase="current password" autoFocus autoComplete="current-password"/>
          <PasswordField label="New password" name="new_password" value={newPassword} onChange={(e:any)=>setNewPassword(e.target.value)} ariaBase="new password" hint="At least 8 characters." autoComplete="new-password"/>
          <PasswordField label="Confirm new password" name="confirm_password" value={confirmPassword} onChange={(e:any)=>setConfirmPassword(e.target.value)} ariaBase="confirm password" autoComplete="new-password"/>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={submitting}>{submitting?<><span className="btn-spinner"></span>Changing password...</>:'Change password'}</button>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </Form>
    </div>
  </div>;
}
function Metric({label,value,icon:Icon}:any){return <article className="metric">{Icon&&<Icon size={55}/>}<div><small>{label}</small><strong>{value}</strong></div></article>}
const moneyINR=(v:any)=>'₹'+Math.round(Number(v||0)).toLocaleString('en-IN');
const DASH_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DASH_DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const formatDashDate=()=>{const d=new Date();return `${DASH_DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} ${DASH_MONTHS[d.getMonth()]} ${d.getFullYear()}`};
// Dashboard-only status set: "Parcel" here is a display state for takeaway orders (order_type=TAKEAWAY), distinct from the DRAFT/OPEN/SERVED/PAID/CANCELLED order.status enum used elsewhere.
const DASH_STATUS_COLORS:Record<string,string>={New:'#38a4f8',Preparing:'#ffb822',Served:'#6690f4',Parcel:'#7c5cff',Completed:'#01b393',Cancelled:'#f5325c'};
function DashStatusChip({status}:any){const c=DASH_STATUS_COLORS[status]||'#8a94a6';return <span className="status-chip" style={{background:c+'1f',color:c}}>{status}</span>}
function DashStatCard({label,value,trend,icon:Icon}:any){const dir=trend.startsWith('↑')?' up':trend.startsWith('↓')?' down':'';return <article className="dash-stat-card"><span className="dash-stat-icon"><Icon size={20}/></span><div className="dash-stat-text"><small>{label}</small><strong>{value}</strong><span className={'dash-stat-trend'+dir}>{trend}</span></div></article>}
function SalesRingChart({data,format}:any){
  const [hover,setHover]=useState<number|null>(null);
  const indexed=data.map((x:any,i:number)=>({...x,idx:i}));
  const total=indexed.reduce((a:number,x:any)=>a+Number(x.value||0),0);
  const r=70,cx=84,cy=84,c=2*Math.PI*r;
  let acc=0;
  const active=hover!=null?indexed[hover]:null;
  return <div className="dash-ring-wrap">
    {!total&&<p className="muted chart-empty">No sales recorded for this period.</p>}
    {!!total&&<svg viewBox="0 0 168 168" className="dash-ring-svg" onMouseLeave={()=>setHover(null)}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="20"/>
      {indexed.filter((x:any)=>Number(x.value||0)>0).map((x:any)=>{
        const frac=Number(x.value||0)/total;
        const dash=frac*c;
        const rotate=(acc/total)*360-90; acc+=Number(x.value||0);
        const color=CANCEL_PALETTE[x.idx%CANCEL_PALETTE.length];
        return <circle key={x.idx} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={hover===x.idx?23:20} strokeDasharray={`${Math.max(dash-2,0)} ${c-dash+2}`} transform={`rotate(${rotate} ${cx} ${cy})`} onMouseEnter={()=>setHover(x.idx)} style={{transition:'stroke-width .15s ease',cursor:'pointer'}}/>;
      })}
      <text x={cx} y={cy-6} textAnchor="middle" className="donut-total">{format(active?active.value:total)}</text>
      <text x={cx} y={cy+14} textAnchor="middle" className="donut-total-label">{active?active.label:'Total Sales'}</text>
    </svg>}
  </div>;
}
function SalesOverviewCard({trend,totalToday}:any){
  const [period,setPeriod]=useState('today');
  const data=(trend||{})[period]||[];
  return <section className="surface chart-card dash-sales-card">
    <div className="section-head">
      <h2>Sales Overview</h2>
      <select className="dash-period-select" value={period} onChange={e=>setPeriod(e.target.value)}>
        <option value="today">Today</option>
        <option value="week">Last 7 Days</option>
        <option value="month">This Month</option>
      </select>
    </div>
    <SalesRingChart data={data} format={moneyINR}/>
    <div className="dash-sales-footer">
      <b>Today's Sales: {moneyINR(totalToday)}</b>
      <button type="button" className="secondary view-full-btn" onClick={()=>go('reports')}>View Sales Report <ChevronRight size={15}/></button>
    </div>
  </section>;
}
function OrdersOverviewCard({data}:any){
  const d=data||{};
  const total=d.total||0;
  const rows=[['Completed',d.completed||0],['Preparing',d.preparing||0],['Served',d.served||0],['Parcel',d.parcel||0],['Cancelled',d.cancelled||0],['New',d.new||0]];
  return <section className="surface dash-card">
    <div className="section-head"><h2>Orders Overview</h2></div>
    <div className="dash-orders-total"><span>Total Orders</span><b>{total}</b></div>
    <div className="dash-bar-list">
      {rows.map(([label,value]:any)=>{const color=DASH_STATUS_COLORS[label]||'#8a94a6';const pct=Math.round(value/Math.max(1,total)*100);return <div className="payment-bar-row" key={label}>
        <span className="payment-bar-label"><i style={{background:color}}/>{label}</span>
        <div className="payment-bar-track"><div className="payment-bar-fill" style={{width:pct+'%',background:color}}/></div>
        <b>{value}</b><small>{pct}%</small>
      </div>})}
    </div>
  </section>;
}
function TablesOverviewCard({data}:any){
  const d=data||{};
  const grid=d.grid||[];
  const cls:Record<string,string>={Available:'available',Occupied:'occupied',Disabled:'disabled'};
  return <section className="surface dash-card">
    <div className="section-head"><h2>Tables</h2></div>
    <div className="dash-table-counts">
      <div className="dash-table-count available"><small>Available</small><b>{String(d.available||0).padStart(2,'0')}</b></div>
      <div className="dash-table-count occupied"><small>Occupied</small><b>{String(d.occupied||0).padStart(2,'0')}</b></div>
      <div className="dash-table-count disabled"><small>Disabled</small><b>{String(d.disabled||0).padStart(2,'0')}</b></div>
    </div>
    {grid.length?<div className="dash-table-mini-grid">{grid.map((t:any)=><div className={'dash-table-chip '+cls[t.status]} key={t.code} title={t.status}>{t.code}</div>)}</div>:<p className="muted">No tables configured.</p>}
    <button type="button" className="secondary view-full-btn dash-card-footer-btn" onClick={()=>go('tables')}>View All Tables <ChevronRight size={15}/></button>
  </section>;
}
function RecentOrdersCard({rows}:any){
  rows=rows||[];
  return <section className="surface data-table dash-card">
    <div className="section-head"><h2>Recent Orders</h2><button type="button" className="secondary view-full-btn" onClick={()=>go('orders')}>View All <ChevronRight size={15}/></button></div>
    <div className="table-scroll dash-orders-table-wrap"><table>
      <thead><tr><th>Order</th><th>Time</th><th>Table</th><th>Waiter</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>{rows.length?rows.map((o:any)=><tr key={o.id} className="dash-order-row" onClick={()=>go('order?id='+o.id)}>
        <td><a href={'/order?id='+o.id}>{o.order}</a></td><td>{o.time}</td><td>{o.table}</td><td>{o.waiter}</td><td>{moneyINR(o.amount)}</td><td><DashStatusChip status={o.status}/></td>
      </tr>):<tr><td colSpan={6} className="muted">No orders yet today.</td></tr>}</tbody>
    </table></div>
    <div className="dash-orders-cards">
      {rows.length?rows.map((o:any)=><a href={'/order?id='+o.id} className="dash-order-card" key={o.id}>
        <div className="dash-order-card-top"><span className="dash-order-number">{o.order}</span><b>{moneyINR(o.amount)}</b></div>
        <div className="dash-order-card-meta"><span>{o.table}</span><span className="dash-order-card-dot">·</span><span>{o.time}</span></div>
        <div className="dash-order-card-bottom"><span className="dash-order-card-waiter">{o.waiter}</span><DashStatusChip status={o.status}/></div>
      </a>):<p className="muted">No orders yet today.</p>}
    </div>
  </section>;
}
function CollectionCard({data}:any){
  const d=data||{};
  return <section className="surface dash-card">
    <div className="section-head"><h2>Today's Collection</h2></div>
    <div className="dash-collection-grid">
      <div className="dash-collection-item"><span className="dash-collection-icon cash"><Wallet size={17}/></span><small>Cash</small><b>{moneyINR(d.cash)}</b></div>
      <div className="dash-collection-item"><span className="dash-collection-icon upi"><Smartphone size={17}/></span><small>UPI</small><b>{moneyINR(d.upi)}</b></div>
      <div className="dash-collection-item total"><span className="dash-collection-icon total"><IndianRupee size={17}/></span><small>Total</small><b>{moneyINR(d.total)}</b></div>
    </div>
  </section>;
}
function TopItemsCard({items}:any){
  items=items||[];
  return <section className="surface dash-card">
    <div className="section-head"><h2>Top Selling Items Today</h2></div>
    <div className="table-scroll dash-topitems-table-wrap"><table><thead><tr><th>Item</th><th>Qty Sold</th><th>Sales</th></tr></thead>
      <tbody>{items.length?items.map((x:any)=><tr key={x.name}><td>{x.name}</td><td>{x.qty}</td><td>{moneyINR(x.sales)}</td></tr>):<tr><td colSpan={3} className="muted">No items sold yet today.</td></tr>}</tbody>
    </table></div>
    <div className="dash-topitem-cards">
      {items.length?items.map((x:any,i:number)=><div className="dash-topitem-card" key={x.name}>
        <span className="dash-topitem-rank">{i+1}</span>
        <div className="dash-topitem-info">
          <div className="dash-topitem-top"><span className="dash-topitem-name">{x.name}</span><b>{x.qty}</b></div>
          <div className="dash-topitem-sales">{moneyINR(x.sales)}</div>
        </div>
      </div>):<p className="muted">No items sold yet today.</p>}
    </div>
    <button type="button" className="secondary view-full-btn dash-card-footer-btn" onClick={()=>go('reports')}>View Menu Report <ChevronRight size={15}/></button>
  </section>;
}
function DiscountsCard({data}:any){
  const d=data||{};
  return <section className="surface dash-card">
    <div className="section-head"><h2>Discounts &amp; Complimentary</h2></div>
    <div className="dash-stat-grid">
      <div><small>Discount Given</small><b>{moneyINR(d.discountGiven)}</b></div>
      <div><small>Discounted Bills</small><b>{d.discountedBills||0}</b></div>
      <div><small>Complimentary Value</small><b>{moneyINR(d.complimentaryValue)}</b></div>
      <div><small>Complimentary Orders</small><b>{d.complimentaryOrders||0}</b></div>
    </div>
    <button type="button" className="secondary view-full-btn dash-card-footer-btn" onClick={()=>go('reports')}>View Details <ChevronRight size={15}/></button>
  </section>;
}
function AttentionCard({alerts}:any){
  alerts=alerts||[];
  return <section className="surface dash-card">
    <div className="section-head"><h2>Needs Attention</h2></div>
    {alerts.length?<ul className="dash-attention-list">
      {alerts.map((a:any)=><li key={a.id}><button type="button" className="dash-attention-row" onClick={()=>go(a.page)}><AlertTriangle size={16}/><span>{a.text}</span><ChevronRight size={15}/></button></li>)}
    </ul>:<div className="dash-attention-empty"><CheckCircle2 size={20}/><p>All caught up — nothing needs your attention.</p></div>}
  </section>;
}
function QuickActionsBar(){
  return <section className="surface dash-card dash-quick-actions-card">
    <div className="section-head"><h2>Quick Actions</h2></div>
    <div className="dash-quick-actions-row">
      <button type="button" className="primary" onClick={()=>go('orders')}><Plus size={16}/> New Order</button>
      <button type="button" className="secondary" onClick={()=>go('menu')}><Plus size={16}/> Add Menu Item</button>
      <button type="button" className="secondary" onClick={()=>go('tables')}><Plus size={16}/> Add Table</button>
      <button type="button" className="secondary" onClick={()=>go('reports')}><BarChart3 size={16}/> View Reports</button>
    </div>
  </section>;
}
function Dashboard(){
  const dash=boot.data as any;
  const s=dash.summary||{};
  const disc=dash.discounts||{};
  const arrow=(n:number)=>n>=0?'↑':'↓';
  return <>
    <div className="section-head dash-head">
      <h2 className="page-heading">DASHBOARD</h2>
      <div className="dash-head-right">
        <span className="dash-date">{formatDashDate()}</span>
        <button type="button" className="icon" title="Refresh" onClick={()=>location.reload()}><RefreshCw size={17}/></button>
      </div>
    </div>
    <section className="dash-summary-grid">
      <DashStatCard label="Today's Sales" value={moneyINR(s.salesToday)} trend={`${arrow(s.salesChangePct||0)} ${Math.abs(s.salesChangePct||0)}% vs yesterday`} icon={IndianRupee}/>
      <DashStatCard label="Today's Orders" value={s.ordersToday||0} trend={`${arrow(s.ordersChangePct||0)} ${Math.abs(s.ordersChangePct||0)}% vs yesterday`} icon={ClipboardList}/>
      <DashStatCard label="Total Bills" value={s.totalBills||0} trend={`${s.pendingToday||0} pending`} icon={ReceiptText}/>
      <DashStatCard label="Discount" value={moneyINR(disc.discountGiven)} trend={`${disc.discountedBills||0} discounted bills`} icon={Percent}/>
      <DashStatCard label="Complementary" value={moneyINR(disc.complimentaryValue)} trend={`${disc.complimentaryOrders||0} complementary orders`} icon={Gift}/>
    </section>
    <section className="split dash-split dash-sales-actions">
      <SalesOverviewCard trend={dash.salesTrend||{}} totalToday={s.salesToday}/>
      <QuickActionsBar/>
    </section>
    <section className="split dash-split">
      <OrdersOverviewCard data={dash.ordersOverview}/>
      <TablesOverviewCard data={dash.tables}/>
    </section>
    <RecentOrdersCard rows={dash.recentOrders}/>
    <section className="split dash-split">
      <CollectionCard data={dash.collection}/>
      <TopItemsCard items={dash.topItems}/>
    </section>
    <section className="split dash-split">
      <DiscountsCard data={dash.discounts}/>
      <AttentionCard alerts={dash.attention}/>
    </section>
  </>;
}
function PaymentSuccessToast(){
  // Reads the one-shot 'payment_success' session flash the server attaches
  // to the post-payment redirect (see order_pay in routes/web.php) — the
  // same response pay() already returned, never a second request. The flash
  // is consumed server-side on this single page load, so a refresh won't
  // re-show it.
  const [info,setInfo]=useState<any>(()=>{const raw=boot.flash.payment_success;if(!raw)return null;try{return JSON.parse(raw)}catch{return null}});
  useEffect(()=>{if(!info)return;const t=setTimeout(()=>setInfo(null),3500);return()=>clearTimeout(t)},[]);
  if(!info)return null;
  return <div className="payment-success-toast" role="status">
    <CheckCircle2 size={22}/>
    <div><b>Payment Successful</b><span>{info.bill_number} · {money(info.amount)} · {info.method}</span></div>
  </div>;
}
// Fires at most once per payment (same one-shot flash as PaymentSuccessToast
// above, so a re-render from table polling can never trigger a second print)
// and only when the "print automatically after payment" setting is on.
// Strictly a post-payment side effect: it reads the SAME payment_success
// flash that already proves OrderService::pay() committed, then fetches the
// now-PAID order back from the server (the normal, already-authenticated
// /order?id=X route) to get the real stored items/totals for the receipt —
// it never computes or guesses a total itself, and never runs before a
// payment exists. On failure it never falls back to opening a print dialog
// unprompted (see printOrderReceipt's `silent` mode) — only a small inline
// notice with a manual reprint link, so an offline printer can never block
// or confuse the payment flow itself.
function PostPaymentAutoPrint(){
  const [state,setState]=useState<'idle'|'trying'|'failed'>('idle');
  const [orderId,setOrderId]=useState<number|null>(null);
  useEffect(()=>{
    const raw=boot.flash.payment_success; if(!raw)return;
    let info:any; try{info=JSON.parse(raw)}catch{return}
    if(!info||!info.order_id)return;
    setOrderId(info.order_id);
    if(printerSettings().agentUrl===''||!printerSettings().autoPrint)return;
    setState('trying');
    (async()=>{
      try{
        const res=await fetch('/order?id='+info.order_id,{credentials:'same-origin'});
        const html=await res.text();
        const m=html.match(/window\.__CANTEEN__=(\{[\s\S]*?\});<\/script>/);
        if(!m)throw new Error('session');
        const newBoot=JSON.parse(m[1]);
        const result=await printOrderReceipt(newBoot.data.order,newBoot.data.items||[],newBoot.data.settings||{},{silent:true});
        setState(result.ok?'idle':'failed');
      }catch{setState('failed')}
    })();
  },[]);
  if(state!=='failed'||!orderId)return null;
  return <div className="alert error printer-auto-print-alert" role="status">
    Auto-print failed — the printer may be offline. <a href={'/order?id='+orderId+'&print=1'}>Reprint this bill</a>
  </div>;
}
// Keeps the Tables/Parcels grid in sync across devices without WebSockets:
// a plain 5s poll against the same page's own JSON variant (?poll=1, same
// query PageDataService already runs for the initial SSR), refreshed
// immediately on tab-visibility/focus regain since a backgrounded tab's
// last poll can be stale by the time the operator looks back at it. Skips
// setState entirely when the response is byte-identical to what's already
// shown, so an unchanged table never re-renders or flickers; when a table
// *did* change, only its own keyed card updates because table id doubles
// as the React key. The interval/listeners are torn down on unmount, which
// happens for free here since every navigation in this app is a full page
// load (no SPA router), so leaving /tables always kills the polling.
function useTablesPolling(initial:any[]){
  const [tables,setTables]=useState(initial);
  const lastJson=useRef(JSON.stringify(initial));
  useEffect(()=>{
    let cancelled=false;
    const fetchLatest=async()=>{
      try{
        const res=await fetch(location.pathname+'?poll=1',{headers:{Accept:'application/json'},cache:'no-store'});
        if(!res.ok||cancelled)return;
        const data=await res.json();
        const next=data.tables||[];
        const json=JSON.stringify(next);
        if(json===lastJson.current)return;
        lastJson.current=json;
        if(!cancelled)setTables(next);
      }catch{/* transient network hiccup - next tick or focus/visibility retries */}
    };
    fetchLatest();
    const timer=setInterval(fetchLatest,5000);
    const onVisible=()=>{if(document.visibilityState==='visible')fetchLatest()};
    const onFocus=()=>fetchLatest();
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onFocus);
    window.addEventListener('pageshow',onFocus);
    return()=>{cancelled=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onFocus)};
  },[]);
  return tables;
}
function Tables(){const isParcel=boot.page==='parcels';const kind=isParcel?'Parcel':'Table';const Icon=isParcel?Package:Table2;const tables=useTablesPolling(boot.data.tables||[]);const [editing,setEditing]=useState<any>(null);const [showModal,setShowModal]=useState(false);const isAdmin=boot.user.role==='ADMIN';const startFormRefs=useRef<Record<number,HTMLFormElement|null>>({});const openAdd=()=>{setEditing(null);setShowModal(true)};const startEdit=(t:any,e:any)=>{e.stopPropagation();setEditing(t);setShowModal(true)};const occupiedCount=tables.filter((t:any)=>t.status!=='AVAILABLE').length;const availableCount=tables.length-occupiedCount;return <><PaymentSuccessToast/><PostPaymentAutoPrint/><div className="section-head"><h2 className="page-heading">{kind.toUpperCase()}S</h2>{isAdmin&&<button type="button" className="primary tables-add-btn" onClick={openAdd}><Plus size={16}/> Add {kind}</button>}</div>{!isParcel&&<section className="table-widgets"><article className="table-widget widget-available"><div><small>Available {kind}s</small><strong>{availableCount}</strong></div><span className="widget-icon"><CheckCircle2/></span></article><article className="table-widget widget-occupied"><div><small>Occupied {kind}s</small><strong>{occupiedCount}</strong></div><span className="widget-icon"><Users/></span></article></section>}<div className="table-grid">{tables.map((t:any)=><article className={'table-card '+t.status.toLowerCase()} key={t.id} onClick={(e:any)=>{if((e.target as HTMLElement).closest('button,a,input'))return;if(t.order_id)go('order?id='+t.order_id);else startFormRefs.current[t.id]?.requestSubmit()}}><div className="table-card-body"><div className="table-card-top"><span className="table-card-icon"><Icon size={17}/></span>{!isParcel&&<small>{t.status}</small>}{isAdmin&&<div className="table-card-actions"><button type="button" className="menu-card-icon-btn" title={`Edit ${kind.toLowerCase()}`} onClick={(e:any)=>startEdit(t,e)}><Pencil size={14}/></button></div>}</div><h2>{t.table_name}</h2>{t.order_id&&<b>{money(t.grand_total)}</b>}</div>{!t.order_id&&<form ref={(el:any)=>{startFormRefs.current[t.id]=el}} method="post"><input type="hidden" name="_csrf" value={boot.csrf}/><input type="hidden" name="action" value="order_create"/><input type="hidden" name="table_id" value={t.id}/></form>}</article>)}</div>{showModal&&<TableModal kind={kind} editing={editing} onClose={()=>setShowModal(false)}/>}</>}
function TableModal({kind,editing,onClose}:any){useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);const deleteFormRef=useRef<HTMLFormElement>(null);const onDelete=(e:any)=>{if(confirm(`Delete "${editing.table_name}"? This cannot be undone.`)){startButtonLoading(e.currentTarget,'Deleting');deleteFormRef.current?.requestSubmit()}};return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}><div className="modal-panel"><div className="modal-head"><h2>{editing?`Edit ${kind.toLowerCase()}`:`Add ${kind.toLowerCase()}`}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>{editing&&<form ref={deleteFormRef} method="post"><input type="hidden" name="_csrf" value={boot.csrf}/><input type="hidden" name="action" value="table_delete"/><input type="hidden" name="id" value={editing.id}/></form>}<Form key={editing?.id||'new'}><input type="hidden" name="action" value="table_save"/><input type="hidden" name="id" value={editing?.id||0}/><input type="hidden" name="kind" value={kind.toUpperCase()}/><div className="form-grid"><label>{kind} name<input name="table_name" required autoFocus defaultValue={editing?.table_name||''}/></label><label>Display order<input name="sort_order" type="number" defaultValue={editing?.sort_order??0}/></label><label className="check"><input type="checkbox" name="active" defaultChecked={editing?Number(editing.active)===1:true}/>Active</label></div><div className="form-actions"><button className="primary">{editing?`Update ${kind.toLowerCase()}`:`Save ${kind.toLowerCase()}`}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button>{editing&&<button type="button" className="danger" onClick={onDelete}><Trash2 size={14}/> Delete {kind.toLowerCase()}</button>}</div></Form></div></div>}
function Order(){const d=boot.data;if(d.missing)return <div className="surface">Order not found.</div>;return <OrderEditor order={d.order} menu={d.menu||[]} variants={d.variants||[]} initial={d.items||[]} settings={d.settings||{}}/>}
function OrderEditor({order,menu,variants,initial,settings}:any){
  const [items,setItems]=useState(initial.map((x:any)=>({...x,menu_item_id:Number(x.menu_item_id),variant_id:x.menu_item_variant_id?Number(x.menu_item_variant_id):null,complementary:Number(x.complementary_amount)>0,discount_type:x.item_discount_type||'NONE',discount_value:x.item_discount_value||''})));
  useEffect(()=>{if(new URLSearchParams(location.search).get('print')==='1'){const t=setTimeout(()=>{printOrderReceipt(order,items,settings)},300);return()=>clearTimeout(t)}},[]);
  useEffect(()=>{
    window.addEventListener('beforeprint',applyThermalPageSize);
    window.addEventListener('afterprint',clearThermalPageSize);
    return()=>{window.removeEventListener('beforeprint',applyThermalPageSize);window.removeEventListener('afterprint',clearThermalPageSize);clearThermalPageSize()};
  },[]);
  const [query,setQuery]=useState(''); const [category,setCategory]=useState('All');
  const [discountType,setDiscountType]=useState('NONE'); const [discountValue,setDiscountValue]=useState(''); const [discountReason,setDiscountReason]=useState('');
  const [compReasonChoice,setCompReasonChoice]=useState('Staff Meal'); const [compReasonOther,setCompReasonOther]=useState('');
  const discountEnabled=settingOn('discount_enabled'); const scope=settings.discount_scope||'BOTH';
  const allowedTypes=String(settings.discount_allowed_types||'PERCENT,FIXED').split(',').filter(Boolean);
  const maxPercent=Number(settings.discount_max_percent||0); const maxFixed=Number(settings.discount_max_fixed||0);
  const scopeAllowsOrder=discountEnabled&&(scope==='ORDER'||scope==='BOTH'); const scopeAllowsItem=discountEnabled&&(scope==='ITEM'||scope==='BOTH');
  const compEnabled=settingOn('complementary_enabled'); const compRoles=String(settings.complementary_roles||'ADMIN,MANAGER').split(',').filter(Boolean);
  const compAllowedForRole=compEnabled&&(boot.user.role==='ADMIN'||compRoles.includes(boot.user.role));
  const compReasonRequired=settingOn('complementary_require_reason'); const isApprover=boot.user.role==='ADMIN'||boot.user.role==='MANAGER';
  const cats=['All',...Array.from(new Set(menu.map((m:any)=>m.category_name)))];
  const filtered=menu.filter((m:any)=>(category==='All'||m.category_name===category)&&(`${m.name} ${m.category_name}`.toLowerCase().includes(query.toLowerCase())));
  const add=(m:any,v:any=null)=>setItems((old:any[])=>{const key=(x:any)=>x.menu_item_id===m.id&&x.variant_id===(v?.id||null);const found=old.find(key);return found?old.map(x=>key(x)?{...x,quantity:Number(x.quantity)+1}:x):[...old,{menu_item_id:m.id,variant_id:v?.id||null,item_name_snapshot:m.name,variant_name_snapshot:v?.name||null,quantity:1,unit_price:Number(v?.price??m.price),complementary:false,discount_type:'NONE',discount_value:''}]});
  const update=(i:number,delta:number)=>setItems(xs=>xs.flatMap((x,j)=>j!==i?[x]:Number(x.quantity)+delta>0?[{...x,quantity:Number(x.quantity)+delta}]:[]));
  const patch=(i:number,fields:any)=>setItems(xs=>xs.map((x,j)=>j===i?{...x,...fields}:x));
  const itemDiscountAmount=(x:any,gross:number)=>{if(x.complementary||!scopeAllowsItem||x.discount_type==='NONE'||!Number(x.discount_value)||!allowedTypes.includes(x.discount_type))return 0;const raw=x.discount_type==='PERCENT'?gross*Math.min(Number(x.discount_value),maxPercent)/100:Math.min(Number(x.discount_value),maxFixed);return Math.min(gross,Math.max(0,raw))};
  const subtotal=items.reduce((a:any,x:any)=>a+Number(x.unit_price)*Number(x.quantity),0);
  const comp=items.reduce((a:any,x:any)=>a+(x.complementary?Number(x.unit_price)*Number(x.quantity):0),0);
  const itemDiscountTotal=items.reduce((a:any,x:any)=>a+itemDiscountAmount(x,Number(x.unit_price)*Number(x.quantity)),0);
  const orderBase=subtotal-comp-itemDiscountTotal;
  const orderDiscountValueCapped=discountType==='PERCENT'?Math.min(Number(discountValue)||0,maxPercent):Math.min(Number(discountValue)||0,maxFixed);
  const orderDiscount=scopeAllowsOrder&&discountType!=='NONE'&&allowedTypes.includes(discountType)?Math.min(Math.max(0,orderBase),discountType==='PERCENT'?orderBase*orderDiscountValueCapped/100:orderDiscountValueCapped):0;
  const totalDiscount=itemDiscountTotal+orderDiscount;
  const total=Math.max(0,subtotal-comp-totalDiscount);
  const approvalBase=subtotal-comp; const approvalPercentEquivalent=approvalBase>0?totalDiscount/approvalBase*100:0;
  const approvalPercentThreshold=settings.discount_approval_threshold_percent; const approvalFixedThreshold=settings.discount_approval_threshold_fixed;
  const willNeedApproval=totalDiscount>0&&!isApprover&&(((approvalPercentThreshold??'')!==''&&approvalPercentEquivalent>Number(approvalPercentThreshold))||((approvalFixedThreshold??'')!==''&&totalDiscount>Number(approvalFixedThreshold)));
  const compReason=compReasonChoice==='Other'?compReasonOther:compReasonChoice;
  const payload=JSON.stringify({items:items.map((x:any)=>({...x,discount_value:x.discount_value||0,discount_reason:x.complementary?'':x.discount_reason})),discount_type:scopeAllowsOrder?discountType:'NONE',discount_value:discountValue||0,discount_reason:discountReason,complementary_reason:compReason});
  const pending=order.discount_approval_status==='PENDING';
  return <div className="order-layout"><section className="menu-area"><div className="order-meta"><div><span>{order.table_name}</span><b>{order.order_number}</b></div><small>Opened {new Date(order.created_at).toLocaleString()} by {order.created_by_name}</small></div><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search menu or category"/></div><div className="chips order-category-chips">{cats.map(c=><button className={c===category?'selected':''} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><div className="menu-scroll"><div className="menu-grid">{filtered.map((m:any,i:number)=>{const vs=variants.filter((v:any)=>v.menu_item_id===m.id);return <article className="food-card" key={m.id} onClick={()=>!vs.length&&m.price!==null&&add(m)}><img loading={i<8?'eager':'lazy'} decoding="async" src={menuImageSrc(m)} alt=""/><div><h3>{m.name}</h3><small>{m.description||m.category_name}</small>{vs.length?<div className="variant-buttons">{vs.map((v:any)=><button type="button" onClick={e=>{e.stopPropagation();add(m,v)}} key={v.id}>{v.name} {money(v.price)}</button>)}</div>:<b>{m.price===null?'Configure price':money(m.price)}</b>}</div></article>})}</div></div></section>
  <aside className="cart">
    <div className="cart-head"><div><small>Current order</small><h2>{items.length} item{items.length===1?'':'s'}</h2></div><AsyncButton className="icon" title="Print bill" onAction={async()=>{await printOrderReceipt(order,items,settings)}}><Printer size={19}/></AsyncButton></div>
    {pending&&<div className="alert warning">This bill's discount is pending {isApprover?'your':'admin/manager'} approval and cannot be paid until it is resolved.
      {isApprover&&<div className="form-actions">
        <Form><input type="hidden" name="action" value="discount_approve"/><input type="hidden" name="order_id" value={order.id}/><button className="secondary" type="submit">Approve discount</button></Form>
        <Form onSubmit={(e:any)=>{const r=prompt('Reason for rejecting this discount:');if(!r){e.preventDefault();return}(e.target as HTMLFormElement).reason.value=r}}><input type="hidden" name="action" value="discount_reject"/><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="reason"/><button className="danger" type="submit">Reject discount</button></Form>
      </div>}
    </div>}
    <div className="cart-lines">{items.map((x:any,i:number)=>{const gross=Number(x.unit_price)*Number(x.quantity);const lineDiscount=itemDiscountAmount(x,gross);return <div className="cart-line" key={i}>
      <div className="cart-line-top">
        <div className="cart-line-info"><b>{x.item_name_snapshot}{x.variant_name_snapshot&&` · ${x.variant_name_snapshot}`}</b><small>{money(x.unit_price)} each{x.complementary?' · Complimentary':''}{lineDiscount>0?` · -${money(lineDiscount)} off`:''}</small></div>
        <div className="quantity"><button onClick={()=>update(i,-1)}><Minus size={15}/></button><span>{x.quantity}</span><button onClick={()=>update(i,1)}><Plus size={15}/></button></div>
      </div>
      <div className="cart-line-controls">
        {!x.complementary&&scopeAllowsItem&&<div className="item-discount-row">
          <select value={x.discount_type} onChange={e=>patch(i,{discount_type:e.target.value,discount_value:e.target.value==='NONE'?'':x.discount_value})}>
            <option value="NONE">No item discount</option>
            {allowedTypes.includes('PERCENT')&&<option value="PERCENT">% off</option>}
            {allowedTypes.includes('FIXED')&&<option value="FIXED">₹ off</option>}
          </select>
          {x.discount_type!=='NONE'&&<input type="number" min="0" value={x.discount_value} onChange={e=>patch(i,{discount_value:e.target.value})} placeholder="Value"/>}
        </div>}
        {compAllowedForRole&&<label className="comp" title="Mark this item complementary"><input type="checkbox" checked={x.complementary} onChange={e=>patch(i,{complementary:e.target.checked})}/>Complimentary</label>}
        <b className="cart-line-total">{x.complementary?money(0):money(gross-lineDiscount)}</b>
      </div>
    </div>})}</div>
    {items.some((x:any)=>x.complementary)&&<div className="comp-reason-block">
      <label>Complementary reason<select value={compReasonChoice} onChange={e=>setCompReasonChoice(e.target.value)}>{COMPLEMENTARY_REASONS.map(r=><option value={r} key={r}>{r}</option>)}</select></label>
      {compReasonChoice==='Other'&&<input value={compReasonOther} onChange={e=>setCompReasonOther(e.target.value)} required={compReasonRequired} placeholder="Enter reason"/>}
    </div>}
    <div className="adjustments">
      {scopeAllowsOrder&&<><div className="field-row"><select value={discountType} onChange={e=>setDiscountType(e.target.value)}>
        <option value="NONE">No order discount</option>
        {allowedTypes.includes('PERCENT')&&<option value="PERCENT">% discount</option>}
        {allowedTypes.includes('FIXED')&&<option value="FIXED">Fixed discount</option>}
      </select>{discountType!=='NONE'&&<input value={discountValue} onChange={e=>setDiscountValue(e.target.value)} type="number" min="0" placeholder="Value"/>}</div>
      {discountType!=='NONE'&&<input value={discountReason} onChange={e=>setDiscountReason(e.target.value)} placeholder="Discount reason (optional)"/>}</>}
      {willNeedApproval&&<small className="current-image-hint">This discount is above the auto-approve limit — it will be held for admin/manager approval before payment.</small>}
    </div>
    <div className="totals"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Complementary</span><b>-{money(comp)}</b></div><div><span>Discount</span><b>-{money(totalDiscount)}</b></div><div className="grand"><span>Grand total</span><b>{money(total)}</b></div></div>
    <Form className="cart-actions" onSubmit={(e:any)=>{if(compReasonRequired&&items.some((x:any)=>x.complementary)&&!compReason.trim()){alert('A complementary reason is required.');e.preventDefault()}}}><input type="hidden" name="action" value="order_sync"/><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="payload" value={payload}/><button className="secondary" type="submit">Save order</button></Form>
    {order.status==='OPEN'&&(pending?<p className="muted">Payment is blocked while a discount is pending approval.</p>:<Form className="pay-form"><input type="hidden" name="action" value="order_pay"/><input type="hidden" name="order_id" value={order.id}/>{String(settings.payment_methods||'CASH,UPI').split(',').filter(Boolean).map((m:string)=><button className="primary" name="method" value={m} key={m}>Pay {m==='CASH'?'cash':m==='UPI'?'UPI':m.charAt(0)+m.slice(1).toLowerCase()}</button>)}</Form>)}
    {hasPermission('cancel_orders')&&settingOn('allow_order_cancellation')&&<details className="cancel"><summary>Cancel this bill</summary><Form onSubmit={(e:any)=>{if(settingOn('confirm_cancel_bill')&&!confirm('Cancel this bill? This will be recorded in cancelled bills history.'))e.preventDefault()}}><input type="hidden" name="action" value="order_cancel"/><input type="hidden" name="order_id" value={order.id}/><input name="reason" required={settingOn('require_cancellation_reason')} placeholder="Cancellation reason"/><button className="danger">Cancel bill</button></Form></details>}
  </aside>
  <div className={'print-bill'+(settings.printer_paper_width==='58'?' paper-58':'')}><div className="bill-head">{settingOn('show_logo_on_bill')&&settings.logo_path&&<img className="bill-logo" src={logoSrc(settings.logo_path)} alt=""/>}<h2>{settings.canteen_name||'Canteen'}</h2>{settings.address&&<p>{settings.address}</p>}{settings.phone&&<p>Ph: {settings.phone}</p>}{settings.gst_number&&<p>GSTIN: {settings.gst_number}</p>}</div><div className="bill-meta"><div><span>Bill No</span><b>{order.bill_number||order.order_number}</b></div>{settingOn('show_table_number')&&<div><span>Table</span><b>{order.table_name}</b></div>}<div><span>Date</span><b>{new Date().toLocaleString()}</b></div>{settingOn('show_waiter_name')&&<div><span>Served by</span><b>{order.created_by_name}</b></div>}</div><div className="bill-table">
            <div className="bill-row bill-table-head"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
            {items.map((x:any,i:number)=>{const gross=Number(x.unit_price)*Number(x.quantity);const lineDiscount=itemDiscountAmount(x,gross);return <div className="bill-row" key={i}>
              <span>{x.item_name_snapshot}{x.variant_name_snapshot?` (${x.variant_name_snapshot})`:''}{x.complementary?' - Complementary':''}</span>
              <span>{x.quantity}</span>
              <span>{money(x.unit_price)}</span>
              <span>{x.complementary?money(0):money(gross-lineDiscount)}</span>
            </div>})}
          </div><div className="bill-totals"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{comp>0&&<div><span>Complementary</span><b>-{money(comp)}</b></div>}{totalDiscount>0&&<div><span>Discount</span><b>-{money(totalDiscount)}</b></div>}<div className="grand"><span>Grand Total</span><b>{money(total)}</b></div></div>{settingOn('show_thank_you_message')&&<p className="bill-footer">{settings.thank_you_message||'Thank you. Visit again.'}</p>}</div></div>
}
function DataTable({title,headers,rows,mobileRows,className}:any){return <section className={'surface data-table'+(className?' '+className:'')}><h2>{title}</h2><div className={'table-scroll'+(mobileRows?' data-table-scroll-wrap':'')}><table><thead><tr>{headers.map((h:string)=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows?.length?rows.map((r:any[],i:number)=><tr key={i}>{r.map((c:any,j:number)=><td key={j}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="muted">No records found.</td></tr>}</tbody></table></div>{mobileRows&&<div className="data-table-cards">{mobileRows.length?mobileRows:<p className="muted">No records found.</p>}</div>}</section>}
function ListPage(){const rows=boot.data.orders||[];const title=boot.page==='modified'?'Modified bills':'Bills';return <DataTable title={title} headers={['Reference','Table','Status','Total','Updated']} rows={rows.map((o:any)=>[<a href={'/order?id='+o.id}>{o.bill_number||o.order_number}</a>,o.table_name||'—',o.status+(o.modifications?` (${o.modifications} changes)`:''),money(o.grand_total),new Date(o.updated_at||o.completed_at||o.cancelled_at).toLocaleString()])}/>}
const ORDER_STATUS_LABEL:Record<string,string>={DRAFT:'New',OPEN:'Preparing',SERVED:'Served',PAID:'Completed',CANCELLED:'Cancelled'};
function StatusChip({status}:any){return <span className={'status-chip status-'+String(status).toLowerCase()}>{ORDER_STATUS_LABEL[status]||status}</span>}
function TableSelect({options,value,onChange,placeholder}:any){
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [pos,setPos]=useState<any>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const isDesktop=useIsDesktop();

  const computePosition=()=>{
    if(!triggerRef.current)return;
    const r=triggerRef.current.getBoundingClientRect();
    const spaceBelow=window.innerHeight-r.bottom;
    const spaceAbove=r.top;
    const openUp=spaceBelow<220&&spaceAbove>spaceBelow;
    const maxHeight=Math.max(140,Math.min(280,(openUp?spaceAbove:spaceBelow)-16));
    setPos(openUp
      ?{left:r.left,width:r.width,bottom:window.innerHeight-r.top+6,maxHeight}
      :{left:r.left,width:r.width,top:r.bottom+6,maxHeight});
  };

  useEffect(()=>{
    if(!open||!isDesktop)return;
    computePosition();
    const onScroll=()=>computePosition();
    window.addEventListener('scroll',onScroll,true);
    window.addEventListener('resize',onScroll);
    return()=>{window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll)};
  },[open,isDesktop]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[open]);

  useEffect(()=>{if(!open)setSearch('')},[open]);

  const selected=options.find((t:any)=>String(t.id)===String(value));
  const filtered=search.trim()?options.filter((t:any)=>t.table_name.toLowerCase().includes(search.trim().toLowerCase())):options;
  const pick=(id:any)=>{onChange(id);setOpen(false)};

  return <div className="table-select">
    <button type="button" ref={triggerRef} className="table-select-trigger" onClick={()=>setOpen(true)}>
      <span className={selected?'':'table-select-placeholder'}>{selected?selected.table_name:placeholder}</span>
      <ChevronDown size={16}/>
    </button>
    {open&&createPortal(isDesktop?<>
      <div className="table-select-backdrop" onClick={()=>setOpen(false)}/>
      {pos&&<div className="table-select-popover" style={pos}>
        {options.length?options.map((t:any)=><button type="button" key={t.id} className={'table-select-option'+(String(t.id)===String(value)?' active':'')} onClick={()=>pick(t.id)}>{t.table_name}</button>):<div className="table-select-empty muted">No tables available</div>}
      </div>}
    </>:
      <div className="table-sheet-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setOpen(false)}}>
        <div className="table-sheet">
          <div className="table-sheet-head"><h3>{placeholder}</h3><button type="button" className="modal-close" onClick={()=>setOpen(false)} title="Close"><X size={18}/></button></div>
          <div className="table-sheet-search"><Search size={16}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search table..."/></div>
          <div className="table-sheet-list">
            {filtered.length?filtered.map((t:any)=><button type="button" key={t.id} className={'table-sheet-option'+(String(t.id)===String(value)?' active':'')} onClick={()=>pick(t.id)}>{t.table_name}</button>):<div className="table-select-empty muted">No matching tables</div>}
          </div>
        </div>
      </div>
    ,document.body)}
  </div>;
}
function useIsDesktop(){
  const [isDesktop,setIsDesktop]=useState(()=>typeof window!=='undefined'?window.innerWidth>680:true);
  useEffect(()=>{
    const mq=window.matchMedia('(min-width:681px)');
    const onChange=()=>setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change',onChange);
    return()=>mq.removeEventListener('change',onChange);
  },[]);
  return isDesktop;
}
function OrderModal({mode,order,tables,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const [status,setStatus]=useState(order?.status||'DRAFT');
  const [orderType,setOrderType]=useState(order?.order_type||'TABLE');
  const [orderKind,setOrderKind]=useState('TABLE');
  const [tableId,setTableId]=useState(order?.table_id||'');
  const options=tables.filter((t:any)=>t.status==='AVAILABLE'||t.id===order?.table_id);
  const tableOptions=mode==='add'?options.filter((t:any)=>t.kind===orderKind):options;
  const action=mode==='add'?'order_create':status==='CANCELLED'?'order_cancel':status==='PAID'?'order_pay':'order_edit';
  const isParcel=mode==='add'&&orderKind==='PARCEL';
  useEffect(()=>{
    if(isParcel)setTableId(tableOptions[0]?.id||'');
  },[isParcel,tableOptions.map((t:any)=>t.id).join(',')]);
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>{mode==='add'?'Add order':`Edit order · ${order.order_number}`}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <Form key={action}>
        <input type="hidden" name="action" value={action}/>
        {(mode==='add'||action==='order_edit')&&<input type="hidden" name="table_id" value={tableId}/>}
        {mode==='edit'&&<input type="hidden" name="order_id" value={order.id}/>}
        {mode==='edit'&&action==='order_edit'&&<input type="hidden" name="status" value={status}/>}
        {mode==='edit'&&action==='order_edit'&&<input type="hidden" name="order_type" value={orderType}/>}
        <div className="form-grid">
          {mode==='add'&&<div className="wide order-type-field">
            <span className="order-type-field-label">Select order type</span>
            <div className="order-type-picker">
              <button type="button" className={'order-type-card'+(orderKind==='TABLE'?' active':'')} onClick={()=>{setOrderKind('TABLE');setTableId('')}}>
                <Table2 size={22}/>
                <span className="order-type-card-text"><b>Table</b><small>Dine-in</small></span>
              </button>
              <button type="button" className={'order-type-card'+(orderKind==='PARCEL'?' active':'')} onClick={()=>setOrderKind('PARCEL')}>
                <Package size={22}/>
                <span className="order-type-card-text"><b>Parcel</b><small>Takeaway</small></span>
              </button>
            </div>
          </div>}
          {!isParcel&&(mode==='add'||action==='order_edit')&&<label className="wide">Select Table
            <TableSelect options={mode==='add'?tableOptions:options} value={tableId} onChange={setTableId} placeholder="Select table"/>
          </label>}
          {mode==='edit'&&action==='order_edit'&&<label>Order type<select value={orderType} onChange={e=>setOrderType(e.target.value)}>
            <option value="TABLE">Table</option>
            <option value="TAKEAWAY">Parcel</option>
          </select></label>}
          {mode==='edit'&&<label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="DRAFT">New</option>
            <option value="OPEN">Preparing</option>
            <option value="SERVED">Served</option>
            <option value="PAID">Completed</option>
            {hasPermission('cancel_orders')&&settingOn('allow_order_cancellation')&&<option value="CANCELLED">Cancelled</option>}
          </select></label>}
          {action==='order_pay'&&<label>Payment method<select name="method" defaultValue="CASH">{String((boot.data as any)?.settings?.payment_methods||'CASH,UPI').split(',').filter(Boolean).map((m:string)=><option value={m} key={m}>{m.charAt(0)+m.slice(1).toLowerCase()}</option>)}</select></label>}
          {action==='order_cancel'&&<label>Cancellation reason<input name="reason" required={settingOn('require_cancellation_reason')} placeholder="Reason for cancelling"/></label>}
        </div>
        <div className="form-actions">
          <button className="primary" onClick={(e:any)=>{
            if((mode==='add'||action==='order_edit')&&!tableId){e.preventDefault();alert(isParcel?'No parcel is available right now.':'Please select a table.');return}
            if(action==='order_cancel'&&settingOn('confirm_cancel_order')&&!confirm('Cancel this order?')){e.preventDefault()}
          }}>{mode==='add'?'Create order':'Save changes'}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </Form>
    </div>
  </div>;
}
function OrdersPage(){
  const all=boot.data.orders||[];
  const canteenTables=boot.data.tables||[];
  const [modal,setModal]=useState<any>(null);
  const [search,setSearch]=useState('');
  const [dateFilter,setDateFilter]=useState('today');
  const [customDate,setCustomDate]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [tableFilter,setTableFilter]=useState('ALL');
  const [waiterFilter,setWaiterFilter]=useState('ALL');
  const tables=useMemo(()=>Array.from(new Set(all.map((o:any)=>o.table_name).filter(Boolean))),[all]);
  const waiters=useMemo(()=>Array.from(new Set(all.map((o:any)=>o.display_name).filter(Boolean))),[all]);
  // READY has no distinct underlying state yet, so it still maps onto OPEN.
  const statusGroups:Record<string,string[]>={NEW:['DRAFT'],PREPARING:['OPEN'],READY:['OPEN'],SERVED:['SERVED'],COMPLETED:['PAID'],CANCELLED:['CANCELLED']};
  const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  const inDateRange=(o:any)=>{const d=new Date(o.updated_at||o.created_at);const now=new Date();if(dateFilter==='all')return true;if(dateFilter==='today')return sameDay(d,now);if(dateFilter==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y);}if(dateFilter==='7days'){const from=new Date(now);from.setDate(from.getDate()-6);from.setHours(0,0,0,0);return d>=from;}if(dateFilter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();return customDate?sameDay(d,new Date(customDate+'T00:00:00')):true;};
  const filtered=all.filter((o:any)=>{
    if(statusFilter!=='ALL'&&!(statusGroups[statusFilter]||[]).includes(o.status))return false;
    if(tableFilter!=='ALL'&&o.table_name!==tableFilter)return false;
    if(waiterFilter!=='ALL'&&o.display_name!==waiterFilter)return false;
    if(!inDateRange(o))return false;
    if(search.trim()){const q=search.trim().toLowerCase();const hay=`${o.order_number||''} ${o.bill_number||''} ${o.table_name||''} ${o.display_name||''}`.toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  // KPI widgets must mirror the same filtered set the table renders, never
  // separately-computed global counts.
  const total=filtered.length;
  const completed=filtered.filter((o:any)=>o.status==='PAID').length;
  const pending=filtered.filter((o:any)=>o.status!=='PAID'&&o.status!=='CANCELLED').length;
  const clearFilters=()=>{setSearch('');setDateFilter('today');setCustomDate('');setStatusFilter('ALL');setTableFilter('ALL');setWaiterFilter('ALL');};
  return <>
    <div className="section-head"><h2 className="page-heading">ORDERS</h2><button type="button" className="primary" onClick={()=>setModal({mode:'add'})}><Plus size={16}/> Add Order</button></div>
    <section className="metric-grid metric-grid-3 orders-metrics">
      <Metric label="Total orders" value={total} icon={ClipboardList}/>
      <Metric label="Completed orders" value={completed} icon={CheckCircle2}/>
      <Metric label="Pending orders" value={pending} icon={Clock}/>
    </section>
    <section className="orders-toolbar">
      <div className="orders-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by order number, table number or waiter name"/></div>
      <div className="orders-filters">
        <label>Date<select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="month">This Month</option><option value="all">All Dates</option><option value="custom">Custom Date</option></select></label>
        {dateFilter==='custom'&&<label>&nbsp;<input className="orders-custom-date" type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/></label>}
        <label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Status</option><option value="NEW">New</option><option value="PREPARING">Preparing</option><option value="READY">Ready</option><option value="SERVED">Served</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label>Table<select value={tableFilter} onChange={e=>setTableFilter(e.target.value)}><option value="ALL">All Tables</option>{tables.map((t:any)=><option value={t} key={t}>{t}</option>)}</select></label>
        <label>Waiter<select value={waiterFilter} onChange={e=>setWaiterFilter(e.target.value)}><option value="ALL">All Waiters</option>{waiters.map((w:any)=><option value={w} key={w}>{w}</option>)}</select></label>
      </div>
      <button type="button" className="clear-filters-btn" onClick={clearFilters}><RotateCcw size={15}/> Clear Filters</button>
    </section>
    <DataTable title="Orders" headers={['Order','Table','Waiter','Status','Items','Total','Actions']} rows={filtered.map((o:any)=>[<a href={'/order?id='+o.id}>{o.order_number}</a>,o.table_name||'—',o.display_name||'—',<StatusChip status={o.status}/>,o.item_count,money(o.grand_total),<button type="button" className="icon" title="Edit order" onClick={()=>setModal({mode:'edit',order:o})}><Pencil size={15}/></button>])}
      mobileRows={filtered.map((o:any)=><div className="order-list-card" key={o.id}>
        <div className="order-list-card-top">
          <a href={'/order?id='+o.id} className="order-list-number">{o.order_number}</a>
          <StatusChip status={o.status}/>
        </div>
        <div className="order-list-card-row"><span>Table</span><b>{o.table_name||'—'}</b></div>
        <div className="order-list-card-row"><span>Waiter</span><b>{o.display_name||'—'}</b></div>
        <div className="order-list-card-row"><span>Items</span><b>{o.item_count}</b></div>
        <div className="order-list-card-row"><span>Total</span><div className="order-list-card-total-actions"><b>{money(o.grand_total)}</b><button type="button" className="icon" title="Edit order" onClick={()=>setModal({mode:'edit',order:o})}><Pencil size={14}/></button></div></div>
      </div>)}/>
    {modal&&<OrderModal mode={modal.mode} order={modal.order} tables={canteenTables} onClose={()=>setModal(null)}/>}
  </>;
}
function PaymentChip({method}:any){const m=String(method||'—').toUpperCase();const cls=m==='CASH'?'cash':m==='UPI'?'upi':'other';return <span className={'payment-chip payment-'+cls}>{m}</span>}
function BillsPage(){
  const all=boot.data.orders||[];
  const [search,setSearch]=useState('');
  const [dateFilter,setDateFilter]=useState('today');
  const [customDate,setCustomDate]=useState('');
  const [paymentFilter,setPaymentFilter]=useState('ALL');
  const billDate=(o:any)=>new Date(o.completed_at||o.updated_at||o.created_at);
  const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  const inDateRange=(o:any)=>{const d=billDate(o);const now=new Date();if(dateFilter==='all')return true;if(dateFilter==='today')return sameDay(d,now);if(dateFilter==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y);}if(dateFilter==='7days'){const from=new Date(now);from.setDate(from.getDate()-6);from.setHours(0,0,0,0);return d>=from;}if(dateFilter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();return customDate?sameDay(d,new Date(customDate+'T00:00:00')):true;};
  const filtered=all.filter((o:any)=>{
    if(paymentFilter!=='ALL'&&String(o.method||'').toUpperCase()!==paymentFilter)return false;
    if(!inDateRange(o))return false;
    if(search.trim()){const q=search.trim().toLowerCase();const hay=`${o.bill_number||''} ${o.order_number||''} ${o.table_name||''} ${o.display_name||''}`.toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  // KPI widgets must always mirror the same filtered set the table renders,
  // never a separately-computed "today" or "global" figure.
  const totalBills=filtered.length;
  const sales=filtered.reduce((a:number,o:any)=>a+Number(o.grand_total||0),0);
  const cash=filtered.filter((o:any)=>String(o.method||'').toUpperCase()==='CASH').reduce((a:number,o:any)=>a+Number(o.grand_total||0),0);
  const upi=filtered.filter((o:any)=>String(o.method||'').toUpperCase()==='UPI').reduce((a:number,o:any)=>a+Number(o.grand_total||0),0);
  const salesLabel=dateFilter==='today'?"Today's sales":dateFilter==='yesterday'?"Yesterday's sales":dateFilter==='month'?"This Month's sales":dateFilter==='all'?'Total sales':dateFilter==='7days'?'Last 7 Days sales':'Sales';
  const clearFilters=()=>{setSearch('');setDateFilter('today');setCustomDate('');setPaymentFilter('ALL');};
  return <>
    <h2 className="page-heading">BILLS</h2>
    <section className="metric-grid metric-grid-4 bills-metrics">
      <Metric label="Total bills" value={totalBills} icon={ReceiptText}/>
      <Metric label={salesLabel} value={money(sales)} icon={IndianRupee}/>
      <Metric label="Cash" value={money(cash)} icon={Wallet}/>
      <Metric label="UPI" value={money(upi)} icon={Smartphone}/>
    </section>
    <section className="orders-toolbar">
      <div className="orders-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by bill number, order number, table or waiter"/></div>
      <div className="orders-filters">
        <label>Date<select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="month">This Month</option><option value="all">All Dates</option><option value="custom">Custom Date</option></select></label>
        {dateFilter==='custom'&&<label>&nbsp;<input className="orders-custom-date" type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/></label>}
        <label>Payment<select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="ALL">All Payments</option><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></label>
      </div>
      <button type="button" className="clear-filters-btn" onClick={clearFilters}><RotateCcw size={15}/> Clear Filters</button>
    </section>
    <DataTable title="Bills" headers={['Bill','Time','Order','Table','Waiter','Amount','Payment']} rows={filtered.map((o:any)=>[<a href={'/order?id='+o.id}>{o.bill_number||o.order_number}</a>,billDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),o.order_number,o.table_name||'—',o.display_name||'—',money(o.grand_total),<PaymentChip method={o.method}/>])}
      mobileRows={filtered.map((o:any)=><div className="order-list-card" key={o.id}>
        <div className="order-list-card-top">
          <a href={'/order?id='+o.id} className="order-list-number">{o.bill_number||o.order_number}</a>
          <b>{money(o.grand_total)}</b>
        </div>
        <div className="order-list-card-row"><span>Order</span><b>{o.order_number}</b></div>
        <div className="order-list-card-row"><span>Table</span><b>{o.table_name||'—'}</b></div>
        <div className="order-list-card-row"><span>Waiter</span><b>{o.display_name||'—'}</b></div>
        <div className="order-list-card-row"><span>Time</span><b>{billDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</b></div>
        <div className="order-list-card-row"><span>Payment</span><PaymentChip method={o.method}/></div>
      </div>)}/>
  </>;
}
const CANCEL_PALETTE=['#fd397a','#38a4f8','#485bbd','#01b393','#f5325c','#ffb822','#6690f4'];
const paletteColor=(s:string)=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return CANCEL_PALETTE[h%CANCEL_PALETTE.length]};
function ByChip({name}:any){if(!name)return <span className="muted">—</span>;const c=paletteColor(name);return <span className="by-chip"><span className="by-avatar" style={{background:c}}>{name.trim().slice(0,1).toUpperCase()}</span><span className="by-name">{name}</span></span>}
function CancelledActions({id}:any){
  return <div className="row-actions">
    <button type="button" className="row-action" style={{background:'rgba(56,164,248,.14)',color:'#1672b9'}} onClick={()=>go('order?id='+id+'&print=1')}><Eye size={13}/> View Bill</button>
    <button type="button" className="row-action" style={{background:'rgba(72,91,189,.14)',color:'#485bbd'}} onClick={()=>go('order?id='+id)}><ClipboardList size={13}/> View Order</button>
  </div>;
}
function CancelledBillsPage(){
  const all=boot.data.orders||[];
  const [search,setSearch]=useState('');
  const [dateFilter,setDateFilter]=useState('today');
  const [customDate,setCustomDate]=useState('');
  const [cancelledByFilter,setCancelledByFilter]=useState('ALL');
  const cancelDate=(o:any)=>new Date(o.cancelled_at||o.updated_at);
  const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  const inDateRange=(o:any)=>{const d=cancelDate(o);const now=new Date();if(dateFilter==='today')return sameDay(d,now);if(dateFilter==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y);}if(dateFilter==='7days'){const from=new Date(now);from.setDate(from.getDate()-6);from.setHours(0,0,0,0);return d>=from;}if(dateFilter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();return customDate?sameDay(d,new Date(customDate+'T00:00:00')):true;};
  const cancellers=useMemo(()=>(boot.data.users||[]).map((u:any)=>u.display_name),[]);
  const filtered=all.filter((o:any)=>{
    if(cancelledByFilter!=='ALL'&&o.cancelled_by_name!==cancelledByFilter)return false;
    if(!inDateRange(o))return false;
    if(search.trim()){const q=search.trim().toLowerCase();const hay=`${o.bill_number||''} ${o.order_number||''} ${o.table_name||''}`.toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const clearFilters=()=>{setSearch('');setDateFilter('today');setCustomDate('');setCancelledByFilter('ALL');};
  return <>
    <h2 className="page-heading">CANCELLED BILLS</h2>
    <section className="orders-toolbar">
      <div className="orders-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by bill no., order no., table"/></div>
      <div className="orders-filters">
        <label>Date<select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="month">This Month</option><option value="custom">Custom Date</option></select></label>
        {dateFilter==='custom'&&<label>&nbsp;<input className="orders-custom-date" type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/></label>}
        <label>Cancelled By<select value={cancelledByFilter} onChange={e=>setCancelledByFilter(e.target.value)}><option value="ALL">All</option>{cancellers.map((c:any)=><option value={c} key={c}>{c}</option>)}</select></label>
      </div>
      <button type="button" className="clear-filters-btn" onClick={clearFilters}><RotateCcw size={15}/> Clear Filters</button>
    </section>
    <DataTable title="Cancelled bills" headers={['Bill No','Date/Time','Order','Table','Waiter','Amount','By','Action']} rows={filtered.map((o:any)=>[
      o.bill_number||'—',
      cancelDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),
      o.order_number,
      o.table_name||'—',
      o.created_by_name||'—',
      money(o.grand_total),
      <ByChip name={o.cancelled_by_name}/>,
      <CancelledActions id={o.id}/>
    ])}
      mobileRows={filtered.map((o:any)=><div className="user-card" key={o.id}>
        <div className="user-card-top">
          <span className="user-card-name">{o.bill_number||o.order_number}</span>
          <span className="status-chip status-cancelled">Cancelled</span>
        </div>
        <div className="user-card-field"><small>Order</small><b>{o.order_number}</b></div>
        <div className="user-card-field"><small>Date &amp; Time</small><b>{cancelDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b></div>
        <div className="user-card-field"><small>Table</small><b>{o.table_name||'—'}</b></div>
        <div className="user-card-field"><small>Waiter</small><b>{o.created_by_name||'—'}</b></div>
        <div className="user-card-field"><small>Cancelled by</small><ByChip name={o.cancelled_by_name}/></div>
        {o.cancellation_reason&&<div className="user-card-field"><small>Reason</small><b>{o.cancellation_reason}</b></div>}
        <div className="user-card-field"><small>Total</small><b>{money(o.grand_total)}</b></div>
        <div className="user-card-field"><CancelledActions id={o.id}/></div>
      </div>)}/>
  </>;
}
const CHANGE_META:Record<string,[any,string,string]>={
  QUANTITY_CHANGED:[Pencil,'var(--c-skyblue)','Quantity changed'],
  ITEM_ADDED:[Plus,'var(--c-teal)','Item added'],
  ITEM_REMOVED:[Trash2,'var(--c-red)','Item removed'],
  DISCOUNT_APPLIED:[Percent,'var(--c-magenta)','Discount applied'],
  TABLE_CHANGED:[Table2,'var(--c-indigo)','Table changed'],
};
function changeDetail(c:any){
  const old=c.old_values?JSON.parse(c.old_values):null; const val=c.new_values?JSON.parse(c.new_values):null;
  switch(c.action){
    case 'QUANTITY_CHANGED':return `${old?.quantity??'—'} → ${val?.quantity??'—'}`;
    case 'ITEM_ADDED':return `Quantity ${val?.quantity??val?.qty??1}`;
    case 'ITEM_REMOVED':return `${old?.item_name_snapshot||'Item'} × ${old?.quantity??1}`;
    case 'DISCOUNT_APPLIED':return `${val?.value??0}${val?.type==='PERCENT'?'%':' ₹'} off`;
    case 'TABLE_CHANGED':return 'Table updated';
    default:return '';
  }
}
function ChangeRow({c}:any){
  const [Icon,color,label]=CHANGE_META[c.action]||[Info,'var(--text-muted)',c.action];
  return <div className="change-row">
    <span className="change-icon" style={{background:color+'22',color}}><Icon size={15}/></span>
    <div className="change-body"><b>{label}</b><small>{changeDetail(c)}</small></div>
    <div className="change-meta"><span>{c.display_name}</span><small>{new Date(c.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div>
  </div>;
}
function ChangesModal({order,changes,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>Changes · {order.bill_number||order.order_number}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <div className="changes-summary">
        <div><small>Table</small><b>{order.table_name||'—'}</b></div>
        <div><small>Original</small><b>{money(order.original_total)}</b></div>
        <div><small>Current</small><b>{money(order.grand_total)}</b></div>
      </div>
      <div className="changes-list">{changes.length?changes.map((c:any,i:number)=><ChangeRow c={c} key={i}/>):<p className="muted">No detailed change history recorded.</p>}</div>
    </div>
  </div>;
}
function ModifiedActions({id,onViewChanges}:any){
  const [open,setOpen]=useState(false);
  const boxRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onDoc=(e:MouseEvent)=>{if(boxRef.current&&!boxRef.current.contains(e.target as Node))setOpen(false)};
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',onDoc);window.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onKey)};
  },[open]);
  return <div className="kebab" ref={boxRef}>
    <button type="button" className="kebab-btn" onClick={()=>setOpen(o=>!o)} title="Bill actions"><MoreVertical size={17}/></button>
    {open&&<div className="kebab-menu">
      <button type="button" onClick={()=>{setOpen(false);go('order?id='+id+'&print=1')}}><Eye size={14}/> View Bill</button>
      <button type="button" onClick={()=>{setOpen(false);onViewChanges()}}><History size={14}/> View Changes</button>
      <button type="button" onClick={()=>{setOpen(false);go('order?id='+id)}}><ClipboardList size={14}/> View Order</button>
      <button type="button" onClick={()=>{setOpen(false);go('order?id='+id+'&print=1')}}><Printer size={14}/> Print Bill</button>
    </div>}
  </div>;
}
function ModifiedBillsPage(){
  const all=boot.data.orders||[];
  const allChanges=boot.data.changes||[];
  const [search,setSearch]=useState('');
  const [dateFilter,setDateFilter]=useState('month');
  const [customDate,setCustomDate]=useState('');
  const [modifiedByFilter,setModifiedByFilter]=useState('ALL');
  const [viewing,setViewing]=useState<any>(null);
  const modDate=(o:any)=>new Date(o.modified_at||o.updated_at);
  const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
  const inDateRange=(o:any)=>{const d=modDate(o);const now=new Date();if(dateFilter==='today')return sameDay(d,now);if(dateFilter==='yesterday'){const y=new Date(now);y.setDate(y.getDate()-1);return sameDay(d,y);}if(dateFilter==='7days'){const from=new Date(now);from.setDate(from.getDate()-6);from.setHours(0,0,0,0);return d>=from;}if(dateFilter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();return customDate?sameDay(d,new Date(customDate+'T00:00:00')):true;};
  const modifiers=useMemo(()=>Array.from(new Set(all.map((o:any)=>o.modified_by_name).filter(Boolean))),[all]);
  const filtered=all.filter((o:any)=>{
    if(modifiedByFilter!=='ALL'&&o.modified_by_name!==modifiedByFilter)return false;
    if(!inDateRange(o))return false;
    if(search.trim()){const q=search.trim().toLowerCase();const hay=`${o.bill_number||''} ${o.order_number||''} ${o.table_name||''}`.toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const clearFilters=()=>{setSearch('');setDateFilter('month');setCustomDate('');setModifiedByFilter('ALL');};
  return <>
    <h2 className="page-heading">MODIFIED BILLS</h2>
    <section className="orders-toolbar">
      <div className="orders-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by bill no., order no., table..."/></div>
      <div className="orders-filters">
        <label>Date<select value={dateFilter} onChange={e=>setDateFilter(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7days">Last 7 Days</option><option value="month">This Month</option><option value="custom">Custom Date</option></select></label>
        {dateFilter==='custom'&&<label>&nbsp;<input className="orders-custom-date" type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/></label>}
        <label>Modified By<select value={modifiedByFilter} onChange={e=>setModifiedByFilter(e.target.value)}><option value="ALL">All</option>{modifiers.map((m:any)=><option value={m} key={m}>{m}</option>)}</select></label>
      </div>
      <button type="button" className="clear-filters-btn" onClick={clearFilters}><RotateCcw size={15}/> Clear Filters</button>
    </section>
    <DataTable title="Modified bills" headers={['Bill No','Modified','Order','Table','Original','New','By','Action']} rows={filtered.map((o:any)=>{
      const orig=Number(o.original_total||0),curr=Number(o.grand_total||0);
      const diffColor=curr>orig?'var(--c-magenta)':curr<orig?'var(--c-teal)':'var(--text-soft)';
      return [
        o.bill_number||o.order_number||'—',
        modDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),
        <a href={'/order?id='+o.id}>{o.order_number}</a>,
        o.table_name||'—',
        <span className="amount-original">{money(orig)}</span>,
        <b style={{color:diffColor}}>{money(curr)}</b>,
        <ByChip name={o.modified_by_name}/>,
        <ModifiedActions id={o.id} onViewChanges={()=>setViewing(o)}/>
      ];
    })}
      mobileRows={filtered.map((o:any)=>{
        const orig=Number(o.original_total||0),curr=Number(o.grand_total||0);
        const diffColor=curr>orig?'var(--c-magenta)':curr<orig?'var(--c-teal)':'var(--text-soft)';
        return <div className="user-card" key={o.id}>
          <div className="user-card-top">
            <span className="user-card-name">{o.bill_number||o.order_number}</span>
            <div className="user-card-top-actions">
              <span className="status-chip status-modified">Modified</span>
              <ModifiedActions id={o.id} onViewChanges={()=>setViewing(o)}/>
            </div>
          </div>
          <div className="user-card-field"><small>Modified</small><b>{modDate(o).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b></div>
          <div className="user-card-field"><small>Order</small><a href={'/order?id='+o.id}>{o.order_number}</a></div>
          <div className="user-card-field"><small>Table</small><b>{o.table_name||'—'}</b></div>
          <div className="user-card-field"><small>Original</small><span className="amount-original">{money(orig)}</span></div>
          <div className="user-card-field"><small>New amount</small><b style={{color:diffColor}}>{money(curr)}</b></div>
          <div className="user-card-field"><small>Modified by</small><ByChip name={o.modified_by_name}/></div>
        </div>;
      })}/>
    {viewing&&<ChangesModal order={viewing} changes={allChanges.filter((c:any)=>String(c.order_id)===String(viewing.id))} onClose={()=>setViewing(null)}/>}
  </>;
}
// The menu image library is server-controlled (public/canteen_images/) and
// fetched fresh from /menu?images=1 rather than hardcoded here — the same
// endpoint menu_save itself re-validates a selection against, so the list
// this picker shows and the list the server actually accepts can never
// drift apart.
function MenuImagePicker({onSelect,onClose}:any){
  const [images,setImages]=useState<string[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;
    fetch('/menu?images=1',{credentials:'same-origin'}).then(r=>r.ok?r.json():Promise.reject())
      .then(d=>{if(!cancelled)setImages(Array.isArray(d.images)?d.images:[])})
      .catch(()=>{if(!cancelled)setError('Could not load the image library. Please try again.')});
    return()=>{cancelled=true};
  },[]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>Choose from canteen images</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      {error&&<div className="alert error">{error}</div>}
      {!images&&!error&&<p className="muted">Loading images…</p>}
      {images&&!images.length&&<p className="muted empty-state">No images found in the canteen image library.</p>}
      {images&&images.length>0&&<div className="image-picker-grid">
        {images.map((f:string)=><button type="button" className="image-picker-item" key={f} title={f} onClick={()=>onSelect(f)}>
          <img src={`/canteen_images/${encodeURIComponent(f)}`} alt="" loading="lazy"/>
          <span>{f}</span>
        </button>)}
      </div>}
    </div>
  </div>;
}
function MenuModal({editing,categories,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  useEffect(()=>{
    const prevBody=document.body.style.overflow; const prevHtml=document.documentElement.style.overflow;
    document.body.style.overflow='hidden'; document.documentElement.style.overflow='hidden';
    return()=>{document.body.style.overflow=prevBody; document.documentElement.style.overflow=prevHtml};
  },[]);
  const [imagePath,setImagePath]=useState(editing?.image_path||'');
  const [showPicker,setShowPicker]=useState(false);
  const deleteFormRef=useRef<HTMLFormElement>(null);
  const onDelete=(e:any)=>{if(confirm(`Delete "${editing.name}"?\nThis action cannot be undone.`)){startButtonLoading(e.currentTarget,'Deleting');deleteFormRef.current?.requestSubmit()}};
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel menu-modal">
      <div className="modal-head"><h2>{editing?`Edit "${editing.name}"`:'Add menu item'}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      {editing&&<form ref={deleteFormRef} method="post"><input type="hidden" name="_csrf" value={boot.csrf}/><input type="hidden" name="action" value="menu_delete"/><input type="hidden" name="id" value={editing.id}/></form>}
      <Form key={editing?.id||'new'}>
        <input type="hidden" name="action" value="menu_save"/>
        <input type="hidden" name="id" value={editing?.id||0}/>
        <input type="hidden" name="image_path" value={imagePath}/>
        <div className="form-grid">
          <label>Name<input name="name" required defaultValue={editing?.name||''}/></label>
          <label>Category<select name="category_id" defaultValue={editing?.category_id||''}>{categories.map((c:any)=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
          <label>Price<input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price??''}/></label>
          <label>Display order<input name="sort_order" type="number" defaultValue={editing?.sort_order??0}/></label>
          <label className="wide">WebP image
            {imagePath?
              <div className="image-picker-selected">
                <img src={`/canteen_images/${encodeURIComponent(imagePath)}`} alt="" className="image-picker-selected-thumb"/>
                <div className="image-picker-selected-info">
                  <span className="image-picker-selected-name">{imagePath}</span>
                  <div className="image-picker-selected-actions">
                    <button type="button" className="secondary" onClick={()=>setShowPicker(true)}>Change image</button>
                    <button type="button" className="secondary" onClick={()=>setImagePath('')}>Remove</button>
                  </div>
                </div>
              </div>
            :
              <button type="button" className="file-upload" onClick={()=>setShowPicker(true)}>
                <div className="file-upload-visual"><Camera size={20}/><span className="file-upload-text">Choose from canteen images</span></div>
              </button>
            }
          </label>
          <label className="wide">Description<textarea name="description" defaultValue={editing?.description||''}/></label>
        </div>
        <div className="form-actions">
          <button className="primary">{editing?'Update menu item':'Save menu item'}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          {editing&&<button type="button" className="danger" onClick={onDelete}><Trash2 size={14}/> Delete menu item</button>}
        </div>
      </Form>
      {showPicker&&<MenuImagePicker onSelect={(f:string)=>{setImagePath(f);setShowPicker(false)}} onClose={()=>setShowPicker(false)}/>}
    </div>
  </div>;
}
function Menu(){const d=boot.data;const items=d.menu||[];const [editing,setEditing]=useState<any>(null);const [showModal,setShowModal]=useState(false);const initialCategory=useMemo(()=>{const id=new URLSearchParams(location.search).get('category');const found=id&&(d.categories||[]).find((c:any)=>String(c.id)===id);return found?found.name:'All'},[]);const [category,setCategory]=useState(initialCategory);const cats=['All',...Array.from(new Set(items.map((m:any)=>m.category_name)))];const filtered=category==='All'?items:items.filter((m:any)=>m.category_name===category);const openAdd=()=>{setEditing(null);setShowModal(true)};const startEdit=(m:any)=>{setEditing(m);setShowModal(true)};const closeModal=()=>setShowModal(false);return <><section className="menu-catalog-wrap"><div className="section-head"><h2>Menu items</h2><div className="menu-head-right"><span className="muted">{filtered.length} items</span><button type="button" className="primary menu-add-btn" onClick={openAdd}><Plus size={16}/> Add menu item</button></div></div><div className="chips menu-page-chips">{cats.map((c:any)=><button type="button" className={c===category?'selected':''} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><div className="menu-catalog">{filtered.length?filtered.map((m:any,i:number)=><article className="menu-card" key={m.id}><div className="menu-card-media"><img loading={i<8?'eager':'lazy'} decoding="async" src={menuImageSrc(m)} alt=""/><div className="menu-card-actions"><button type="button" className="menu-card-icon-btn" title="Edit item" onClick={()=>startEdit(m)}><Pencil size={15}/></button></div></div><div className="menu-card-body"><span className="menu-card-tag">{m.category_name}</span><h3>{m.name}</h3><b>{m.price===null?'Price not set':money(m.price)}</b></div></article>):<p className="muted empty-state">{category==='All'?'No menu items yet — add one above.':`No menu items in "${category}" yet.`}</p>}</div></section>{showModal&&<MenuModal editing={editing} categories={d.categories||[]} onClose={closeModal}/>}</>}
function CategoryMenu({onEdit,onView,onDelete}:any){
  const [open,setOpen]=useState(false);
  const boxRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onDoc=(e:MouseEvent)=>{if(boxRef.current&&!boxRef.current.contains(e.target as Node))setOpen(false)};
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',onDoc);window.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onKey)};
  },[open]);
  return <div className="kebab" ref={boxRef}>
    <button type="button" className="kebab-btn" onClick={()=>setOpen(o=>!o)} title="Category actions"><MoreVertical size={17}/></button>
    {open&&<div className="kebab-menu">
      <button type="button" onClick={()=>{setOpen(false);onEdit()}}><Pencil size={14}/> Edit Category</button>
      <button type="button" onClick={()=>{setOpen(false);onView()}}><Eye size={14}/> View Items</button>
      <button type="button" className="delete" onClick={()=>{setOpen(false);onDelete()}}><Trash2 size={14}/> Delete Category</button>
    </div>}
  </div>;
}
function CategoryCard({c,onEdit}:any){
  const Icon=categoryIcon(c.name);
  const [bg,fg]=categoryColor(c.id);
  const formRef=useRef<HTMLFormElement>(null);
  const count=Number(c.item_count||0);
  const viewItems=()=>go('menu?category='+c.id);
  const onDelete=(e:any)=>{if(confirm(`Delete "${c.name}"? It will be hidden but existing menu history stays intact.`)){startButtonLoading(e.currentTarget,'Deleting');formRef.current?.requestSubmit()}};
  return <article className={'category-card'+(c.active?'':' inactive')}>
    <form ref={formRef} method="post" className="category-delete-form"><input type="hidden" name="_csrf" value={boot.csrf}/><input type="hidden" name="action" value="category_delete"/><input type="hidden" name="id" value={c.id}/></form>
    <div className="category-card-top">
      <span className="category-icon" style={{background:bg,color:fg}}><Icon size={22}/></span>
      <CategoryMenu onEdit={onEdit} onView={viewItems} onDelete={onDelete}/>
    </div>
    <div className="category-card-body">
      <h3>{c.name}{!c.active&&<span className="category-inactive-badge">Inactive</span>}</h3>
      <small className="category-card-count">{count} Menu Item{count===1?'':'s'}</small>
    </div>
    <button type="button" className="secondary category-view-btn" onClick={viewItems}>View Items <ChevronRight size={15}/></button>
  </article>;
}
function CategoryModal({editing,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>{editing?`Edit "${editing.name}"`:'Add category'}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <Form key={editing?.id||'new'}>
        <input type="hidden" name="action" value="category_save"/>
        <input type="hidden" name="id" value={editing?.id||0}/>
        <div className="form-grid">
          <label>Category name<input name="name" required autoFocus defaultValue={editing?.name||''}/></label>
          <label>Display order<input name="sort_order" type="number" defaultValue={editing?.sort_order??0}/></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={editing?Number(editing.active)===1:true}/>Active</label>
        </div>
        <div className="form-actions">
          <button className="primary">{editing?'Update category':'Save category'}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </Form>
    </div>
  </div>;
}
function Categories(){
  const d=boot.data;const list=d.categories||[];
  const [search,setSearch]=useState('');
  const [modal,setModal]=useState<any>(null);
  const filtered=list.filter((c:any)=>c.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <div className="section-head"><h2 className="page-heading">CATEGORIES</h2><button type="button" className="primary" onClick={()=>setModal({mode:'add'})}><Plus size={16}/> Add Category</button></div>
    <div className="search category-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search categories"/></div>
    <div className="category-grid">
      {filtered.length?filtered.map((c:any)=><CategoryCard c={c} key={c.id} onEdit={()=>setModal({mode:'edit',category:c})}/>):<p className="muted empty-state">No categories match your search.</p>}
    </div>
    {modal&&<CategoryModal editing={modal.category} onClose={()=>setModal(null)}/>}
  </>;
}
function RoleChip({role}:any){const r=String(role||'').toLowerCase();return <span className={'role-chip role-'+r}>{role}</span>}
function UserMenu({active,onView,onEdit,onReset,onToggle}:any){
  const [open,setOpen]=useState(false);
  const boxRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onDoc=(e:MouseEvent)=>{if(boxRef.current&&!boxRef.current.contains(e.target as Node))setOpen(false)};
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('mousedown',onDoc);window.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onKey)};
  },[open]);
  return <div className="kebab" ref={boxRef}>
    <button type="button" className="kebab-btn" onClick={()=>setOpen(o=>!o)} title="User actions"><MoreVertical size={17}/></button>
    {open&&<div className="kebab-menu">
      <button type="button" onClick={()=>{setOpen(false);onView()}}><Eye size={14}/> View Profile</button>
      <button type="button" onClick={()=>{setOpen(false);onEdit()}}><Pencil size={14}/> Edit User</button>
      <button type="button" onClick={()=>{setOpen(false);onReset()}}><RotateCcw size={14}/> Reset Password</button>
      <button type="button" className="delete" onClick={()=>{setOpen(false);onToggle()}}><XCircle size={14}/> {active?'Disable User':'Enable User'}</button>
    </div>}
  </div>;
}
function UserModal({editing,roles,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const validate=(e:any)=>{const f=e.target;const pass=f.password.value,confirm=f.confirm_password.value;if(!editing&&!pass){e.preventDefault();alert('Password is required.');return}if(pass&&pass!==confirm){e.preventDefault();alert('Password and confirm password do not match.')}};
  const visibleRoles=boot.user.role==='ADMIN'?roles:roles.filter((r:any)=>r.code!=='ADMIN');
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>{editing?`Edit "${editing.display_name}"`:'Add user'}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <Form key={editing?.id||'new'} onSubmit={validate}>
        <input type="hidden" name="action" value="user_save"/>
        <input type="hidden" name="id" value={editing?.id||0}/>
        <div className="form-grid">
          <label>Full name<input name="display_name" required autoFocus defaultValue={editing?.display_name||''}/></label>
          <label>Email<input name="email" type="email" required defaultValue={editing?.email||''}/></label>
          <label>Mobile number<input name="mobile" type="tel" pattern="[0-9]{7,15}" defaultValue={editing?.mobile||''}/></label>
          <label>Role<select name="role_id" required defaultValue={editing?.role_id||''}>{visibleRoles.map((r:any)=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
          <label>Password<input name="password" type="password" placeholder={editing?'Leave blank to keep current':''}/></label>
          <label>Confirm password<input name="confirm_password" type="password" placeholder={editing?'Leave blank to keep current':''}/></label>
          <label className="check"><input name="active" type="checkbox" defaultChecked={editing?Number(editing.active)===1:true}/>Active</label>
        </div>
        <div className="form-actions">
          <button className="primary">{editing?'Update User':'Create User'}</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </Form>
    </div>
  </div>;
}
function ResetPasswordModal({user,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const validate=(e:any)=>{const f=e.target;if(f.password.value!==f.confirm_password.value){e.preventDefault();alert('Password and confirm password do not match.')}};
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>Reset password &middot; {user.display_name}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <Form onSubmit={validate}>
        <input type="hidden" name="action" value="user_reset_password"/>
        <input type="hidden" name="id" value={user.id}/>
        <div className="form-grid">
          <label>New password<input name="password" type="password" required autoFocus/></label>
          <label>Confirm password<input name="confirm_password" type="password" required/></label>
        </div>
        <div className="form-actions">
          <button className="primary">Reset Password</button>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </Form>
    </div>
  </div>;
}
function UserProfileModal({user,onClose}:any){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  return <div className="modal-overlay" onMouseDown={(e:any)=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal-panel">
      <div className="modal-head"><h2>{user.display_name}</h2><button type="button" className="modal-close" onClick={onClose} title="Close"><X size={18}/></button></div>
      <div className="profile-grid">
        <div><small>Email</small><b>{user.email}</b></div>
        <div><small>Mobile</small><b>{user.mobile||'—'}</b></div>
        <div><small>Role</small><b><RoleChip role={user.role}/></b></div>
        <div><small>Status</small><b>{Number(user.active)?'Active':'Disabled'}</b></div>
        <div><small>Last login</small><b>{user.last_login_at?new Date(user.last_login_at).toLocaleString():'Never'}</b></div>
        <div><small>Created on</small><b>{new Date(user.created_at).toLocaleString()}</b></div>
      </div>
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Close</button></div>
    </div>
  </div>;
}
function UserActions({u,onView,onEdit,onReset}:any){
  const formRef=useRef<HTMLFormElement>(null);
  const onToggle=()=>{if(settingOn('confirm_disable_user')&&!confirm(`${Number(u.active)?'Disable':'Enable'} "${u.display_name}"?`))return;formRef.current?.requestSubmit()};
  return <>
    <form ref={formRef} method="post" className="user-toggle-form"><input type="hidden" name="_csrf" value={boot.csrf}/><input type="hidden" name="action" value="user_toggle_active"/><input type="hidden" name="id" value={u.id}/></form>
    <UserMenu active={Number(u.active)===1} onView={onView} onEdit={onEdit} onReset={onReset} onToggle={onToggle}/>
  </>;
}
function UsersPage(){
  const d=boot.data;const list=d.users||[];
  const [modal,setModal]=useState<any>(null);
  const [search,setSearch]=useState('');
  const [searchBy,setSearchBy]=useState('name');
  const [roleFilter,setRoleFilter]=useState('ALL');
  const searchField=(x:any)=>searchBy==='email'?x.email:searchBy==='mobile'?(x.mobile||''):x.display_name;
  const filtered=list.filter((x:any)=>{
    if(roleFilter!=='ALL'&&x.role!==roleFilter)return false;
    if(search.trim()&&!String(searchField(x)).toLowerCase().includes(search.trim().toLowerCase()))return false;
    return true;
  });
  const clearFilters=()=>{setSearch('');setSearchBy('name');setRoleFilter('ALL')};
  return <>
    <div className="section-head"><h2 className="page-heading">USERS</h2><button type="button" className="primary" onClick={()=>setModal({mode:'add'})}><Plus size={16}/> Add User</button></div>
    <section className="orders-toolbar">
      <div className="orders-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search by ${searchBy==='mobile'?'mobile number':searchBy}`}/></div>
      <div className="orders-filters">
        <label>Search by<select value={searchBy} onChange={e=>setSearchBy(e.target.value)}><option value="name">Name</option><option value="email">Email</option><option value="mobile">Mobile number</option></select></label>
        <label>Role<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="ALL">All</option><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="WAITER">Waiter</option></select></label>
        <button type="button" className="clear-filters-btn" style={{marginLeft:0}} onClick={clearFilters}><RotateCcw size={15}/> Clear Filters</button>
      </div>
    </section>
    <DataTable title="Users" headers={['Name','Email','Mobile','Role','Status','Actions']} rows={filtered.map((x:any)=>[
      x.display_name,x.email,x.mobile||'—',<RoleChip role={x.role}/>,
      <span className={'status-chip status-'+(Number(x.active)?'paid':'cancelled')}>{Number(x.active)?'Active':'Disabled'}</span>,
      <UserActions u={x} onView={()=>setModal({mode:'view',user:x})} onEdit={()=>setModal({mode:'edit',user:x})} onReset={()=>setModal({mode:'reset',user:x})}/>
    ])}
      mobileRows={filtered.map((x:any)=><div className="user-card" key={x.id}>
        <div className="user-card-top">
          <span className="user-card-name">{x.display_name}</span>
          <UserActions u={x} onView={()=>setModal({mode:'view',user:x})} onEdit={()=>setModal({mode:'edit',user:x})} onReset={()=>setModal({mode:'reset',user:x})}/>
        </div>
        <div className="user-card-email">{x.email}</div>
        <div className="user-card-field"><small>Role</small><RoleChip role={x.role}/></div>
        <div className="user-card-field"><small>Status</small><span className={'status-chip status-'+(Number(x.active)?'paid':'cancelled')}>{Number(x.active)?'Active':'Disabled'}</span></div>
      </div>)}/>
    {modal&&(modal.mode==='add'||modal.mode==='edit')&&<UserModal editing={modal.user} roles={d.roles} onClose={()=>setModal(null)}/>}
    {modal&&modal.mode==='view'&&<UserProfileModal user={modal.user} onClose={()=>setModal(null)}/>}
    {modal&&modal.mode==='reset'&&<ResetPasswordModal user={modal.user} onClose={()=>setModal(null)}/>}
  </>;
}
const STATUS_COLORS:Record<string,string>={DRAFT:'#38a4f8',OPEN:'#ffb822',SERVED:'#6690f4',PAID:'#01b393',CANCELLED:'#f5325c'};
const PAYMENT_COLORS:Record<string,string>={CASH:'#01b393',UPI:'#485bbd',OTHER:'#ffb822'};
function ChartTooltip({x,y,label,children}:any){const align=x<15?'start':x>85?'end':'center';return <div className={'chart-tooltip chart-tooltip-'+align} style={{left:`${x}%`,top:`${Math.max(y,8)}%`}}><b>{label}</b><span>{children}</span></div>}
function AreaChart({data,valueKey,color,format}:any){
  const [hover,setHover]=useState<number|null>(null);
  const W=760,H=220,padL=8,padR=8,padT=16,padB=26;
  const values=data.map((x:any)=>Number(x[valueKey]||0));
  const max=Math.max(1,...values);
  const innerW=W-padL-padR,innerH=H-padT-padB;
  const stepX=values.length>1?innerW/(values.length-1):0;
  const points=values.map((v:number,i:number)=>[padL+i*stepX,padT+innerH-(v/max)*innerH]);
  const linePath=points.map((p:number[],i:number)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const last=points[points.length-1]||[padL,padT+innerH];
  const areaPath=points.length?`${linePath} L${last[0].toFixed(1)},${padT+innerH} L${points[0][0].toFixed(1)},${padT+innerH} Z`:'';
  const showEvery=Math.max(1,Math.ceil(data.length/9));
  return <div className="chart-wrap">
    {!data.length&&<p className="muted chart-empty">No sales recorded for this period.</p>}
    {!!data.length&&<svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none" onMouseLeave={()=>setHover(null)}>
      <defs><linearGradient id="reportsAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.32"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {[0,0.25,0.5,0.75,1].map(f=><line key={f} x1={padL} x2={W-padR} y1={padT+innerH*f} y2={padT+innerH*f} className="chart-grid"/>)}
      <path d={areaPath} fill="url(#reportsAreaGrad)" stroke="none"/>
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {points.map((p:number[],i:number)=><g key={i}>
        <rect x={padL+i*stepX-(stepX||innerW)/2} y={padT} width={stepX||innerW} height={innerH} fill="transparent" onMouseEnter={()=>setHover(i)}/>
        {(i%showEvery===0||i===points.length-1)&&<text x={p[0]} y={H-8} textAnchor="middle" className="chart-axis-label">{data[i].label}</text>}
        {hover===i&&<><line x1={p[0]} x2={p[0]} y1={padT} y2={padT+innerH} className="chart-crosshair"/><circle cx={p[0]} cy={p[1]} r="4.5" fill={color} stroke="#fff" strokeWidth="2"/></>}
      </g>)}
    </svg>}
    {hover!=null&&<ChartTooltip x={(points[hover][0]/W)*100} y={(points[hover][1]/H)*100} label={data[hover].label}>{format?format(values[hover]):values[hover]}</ChartTooltip>}
  </div>;
}
function BarChart({data,valueKey,color,suffix}:any){
  const [hover,setHover]=useState<number|null>(null);
  const W=760,H=220,padL=8,padR=8,padT=16,padB=26;
  const values=data.map((x:any)=>Number(x[valueKey]||0));
  const max=Math.max(1,...values);
  const innerW=W-padL-padR,innerH=H-padT-padB;
  const slot=values.length?innerW/values.length:innerW;
  const barW=Math.max(4,Math.min(38,slot*0.55));
  const showEvery=Math.max(1,Math.ceil(data.length/9));
  return <div className="chart-wrap">
    {!data.length&&<p className="muted chart-empty">No orders recorded for this period.</p>}
    {!!data.length&&<svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none" onMouseLeave={()=>setHover(null)}>
      {[0,0.25,0.5,0.75,1].map(f=><line key={f} x1={padL} x2={W-padR} y1={padT+innerH*f} y2={padT+innerH*f} className="chart-grid"/>)}
      {values.map((v:number,i:number)=>{const h=(v/max)*innerH;const x=padL+i*slot+(slot-barW)/2;const y=padT+innerH-h;return <g key={i}>
        <rect x={x} y={y} width={barW} height={Math.max(h,2)} rx="4" fill={color} opacity={hover===i?1:0.85} onMouseEnter={()=>setHover(i)}/>
        {(i%showEvery===0||i===values.length-1)&&<text x={x+barW/2} y={H-8} textAnchor="middle" className="chart-axis-label">{data[i].label}</text>}
      </g>})}
    </svg>}
    {hover!=null&&<ChartTooltip x={((padL+hover*slot+slot/2)/W)*100} y={((padT+innerH-(values[hover]/max)*innerH)/H)*100} label={data[hover].label}>{values[hover]}{suffix||''}</ChartTooltip>}
  </div>;
}
function StatusDonut({data}:any){
  const [hover,setHover]=useState<number|null>(null);
  const total=data.reduce((a:number,x:any)=>a+Number(x.count||0),0);
  const r=52,cx=64,cy=64,c=2*Math.PI*r;
  let acc=0;
  return <div className="donut-wrap">
    <svg viewBox="0 0 128 128" className="donut-svg">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="17"/>
      {total>0&&data.filter((x:any)=>x.count>0).map((x:any,i:number)=>{const frac=x.count/total;const dash=frac*c;const rotate=(acc/total)*360-90;acc+=x.count;return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={STATUS_COLORS[x.status]} strokeWidth={hover===i?19:17} strokeDasharray={`${Math.max(dash-2,0)} ${c-dash+2}`} transform={`rotate(${rotate} ${cx} ${cy})`} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} style={{transition:'stroke-width .15s ease',cursor:'pointer'}}/>})}
      <text x={cx} y={cy-3} textAnchor="middle" className="donut-total">{total}</text>
      <text x={cx} y={cy+13} textAnchor="middle" className="donut-total-label">Orders</text>
    </svg>
    <ul className="legend-list">
      {data.map((x:any,i:number)=><li key={x.status} className={hover===i?'hovered':''} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}><span className="legend-dot" style={{background:STATUS_COLORS[x.status]}}/>{ORDER_STATUS_LABEL[x.status]||x.status}<b>{x.count}</b></li>)}
    </ul>
  </div>;
}
function PaymentBars({data}:any){
  const total=data.reduce((a:number,x:any)=>a+Number(x.amount||0),0)||1;
  return <div className="payment-bars">
    {data.length?data.map((x:any)=>{const pct=Math.round(Number(x.amount||0)/total*100);const col=PAYMENT_COLORS[String(x.method||'').toUpperCase()]||'#8a94a6';return <div className="payment-bar-row" key={x.method}>
      <span className="payment-bar-label"><i style={{background:col}}/>{x.method}</span>
      <div className="payment-bar-track"><div className="payment-bar-fill" style={{width:pct+'%',background:col}}/></div>
      <b>{money(x.amount)}</b><small>{pct}%</small>
    </div>}):<p className="muted">No payments recorded for this period.</p>}
  </div>;
}
function TopSellingCard({items,onViewAll}:any){
  const max=Math.max(1,...items.map((x:any)=>Number(x.sales||0)));
  return <section className="surface top-selling-card">
    <h2>Top Selling Items</h2>
    {items.length?<ul className="rank-list">
      {items.map((x:any,i:number)=>{const color=CANCEL_PALETTE[i%CANCEL_PALETTE.length];const pct=Math.max(6,Math.round(Number(x.sales||0)/max*100));return <li className="rank-row" key={i}>
        <span className="rank-badge" style={{background:color}}>{i+1}</span>
        <div className="rank-info">
          <div className="rank-top"><b>{x.name}</b><span className="rank-category" style={{color,background:color+'1f'}}>{x.category}</span></div>
          <div className="rank-bar-track"><div className="rank-bar-fill" style={{width:pct+'%',background:color}}/></div>
        </div>
        <div className="rank-stats"><b>{money(x.sales)}</b><small>{x.qty} sold</small></div>
      </li>})}
    </ul>:<p className="muted empty-state">No sales recorded for this period.</p>}
    {onViewAll&&<button type="button" className="secondary view-full-btn" onClick={onViewAll}>View Full Menu Report <ChevronRight size={15}/></button>}
  </section>;
}
function WaiterPerformanceCard({waiters}:any){
  return <section className="surface waiter-card">
    <h2>Waiter Performance</h2>
    {waiters.length?<ul className="waiter-list">
      {waiters.map((x:any,i:number)=>{const color=paletteColor(x.waiter||'');const rate=x.orders>0?Math.round(x.completed/x.orders*100):0;return <li className="waiter-row" key={i}>
        <span className="waiter-avatar" style={{background:color}}>{String(x.waiter||'?').trim().slice(0,1).toUpperCase()}</span>
        <div className="waiter-info">
          <b>{x.waiter}</b>
          <div className="waiter-rate-track"><div className="waiter-rate-fill" style={{width:rate+'%',background:color}}/></div>
        </div>
        <div className="waiter-pills">
          <span className="waiter-pill" title="Total orders"><ClipboardList size={12}/>{x.orders}</span>
          <span className="waiter-pill pill-good" title="Completed"><CheckCircle2 size={12}/>{x.completed}</span>
          <span className="waiter-pill pill-bad" title="Cancelled"><XCircle size={12}/>{x.cancelled}</span>
        </div>
        <b className="waiter-sales">{money(x.sales)}</b>
      </li>})}
    </ul>:<p className="muted empty-state">No waiter activity for this period.</p>}
  </section>;
}
function PeakHoursCard({hours}:any){
  const max=Math.max(1,...hours.map((x:any)=>Number(x.orders||0)));
  return <section className="surface peak-card">
    <h2>Peak Hours</h2>
    {!!hours.length&&<div className="peak-highlight"><Clock size={15}/> Peak Hour: <b>{hours[0].label}</b></div>}
    {hours.length?<ul className="peak-list">
      {hours.map((x:any,i:number)=>{const color=CANCEL_PALETTE[i%CANCEL_PALETTE.length];const pct=Math.max(8,Math.round(Number(x.orders||0)/max*100));return <li className="peak-row" key={i}>
        <span className="peak-icon" style={{background:color+'1f',color}}><Clock size={15}/></span>
        <div className="peak-info">
          <div className="peak-top"><b>{x.label}</b><span>{x.orders} order{x.orders===1?'':'s'}</span></div>
          <div className="peak-bar-track"><div className="peak-bar-fill" style={{width:pct+'%',background:color}}/></div>
        </div>
        <b className="peak-sales">{money(x.sales)}</b>
      </li>})}
    </ul>:<p className="muted empty-state">No peak activity recorded for this period.</p>}
  </section>;
}
function CancelledSummaryCard({cancelledOrders,cancelledAmount,totalOrders}:any){
  const pct=totalOrders>0?Math.round(cancelledOrders/totalOrders*100):0;
  return <section className="surface cancelled-card">
    <div className="cancelled-card-icon"><ReceiptText size={26}/></div>
    <div className="cancelled-card-body">
      <h2>Cancelled Bills Summary</h2>
      <div className="cancelled-card-stats">
        <div><small>Cancelled Bills</small><b className="stat-red">{cancelledOrders||0}</b></div>
        <div><small>Cancelled Amount</small><b className="stat-magenta">{money(cancelledAmount)}</b></div>
        <div><small>Share Of Orders</small><b className="stat-indigo">{pct}%</b></div>
      </div>
    </div>
    <button type="button" className="secondary cancelled-card-btn" onClick={()=>go('cancelled')}>View Cancelled Bills <ChevronRight size={15}/></button>
  </section>;
}
const REPORT_PERIODS=[['today','Today'],['yesterday','Yesterday'],['7days','Last 7 Days'],['month','This Month'],['lastmonth','Last Month'],['custom','Custom Date']];
const REPORT_SECTIONS=[['summary','Daily Business Summary'],['sales','Daily Sales Report'],['payment','Payment Collection'],['trend','Sales Trend'],['orderType','Order Report'],['orderStatus','Order Status Report'],['menu','Menu Item Performance'],['table','Table Report'],['waiter','Waiter Report'],['discount','Discount Report'],['complementary','Complementary Report'],['cancelled','Cancelled Bills Report'],['modified','Modified Bills Report'],['peak','Peak Business Hours'],['closing','Daily Closing Summary']];
const ORDER_TYPE_LABEL:Record<string,string>={TABLE:'Dine-In',TAKEAWAY:'Parcel'};
const GRANULARITY_LABEL:Record<string,string>={hour:'Sales by Hour',day:'Sales by Day',month:'Sales by Month'};
function StatsCard({title,items,children}:any){
  return <section className="surface stats-card">
    {title&&<h2>{title}</h2>}
    <div className="report-stats">{items.map((it:any,i:number)=><div key={i}><small>{it.label}</small><b className={it.cls||''}>{it.value}</b></div>)}</div>
    {children}
  </section>;
}
function csvEscape(v:any):string{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function downloadReportCsv(d:any,section:string='all'){
  const rows:string[]=[]; const push=(cols:any[])=>rows.push(cols.map(csvEscape).join(','));
  const ov=d.overview||{}; const ms=d.modifiedSummary||{};
  push(['Niyati Canteen Report',`${d.from} to ${d.to}`]); rows.push('');
  const blocks:Record<string,()=>void>={
    summary:()=>{push(['Business Summary']); push(['Total Sales',ov.totalSales]); push(['Total Orders',ov.totalOrders]); push(['Paid Bills',ov.paidBills]); push(['Average Bill',ov.avgOrder]); push(['Cancelled Bills',ov.cancelledOrders]); push(['Discount Given',ov.discounts]); push(['Complimentary',ov.complementary]); rows.push('');},
    sales:()=>{push(['Sales Summary']); push(['Gross Sales',ov.grossSales]); push(['Discounts',-Number(ov.discounts||0)]); push(['Complimentary',-Number(ov.complementary||0)]); push(['Net Sales',ov.totalSales]); push(['Cancelled Bills Amount',ov.cancelledAmount]); rows.push('');},
    payment:()=>{push(['Payment Collection','Bills','Amount']); (d.payments||[]).forEach((p:any)=>push([p.method,p.bills,p.amount])); rows.push('');},
    orderType:()=>{push(['Order Report','Orders','Amount']); (d.orderTypeBreakdown||[]).forEach((o:any)=>push([ORDER_TYPE_LABEL[o.order_type]||o.order_type,o.orders,o.sales])); rows.push('');},
    orderStatus:()=>{push(['Order Status','Count']); (d.statusBreakdown||[]).forEach((s:any)=>push([ORDER_STATUS_LABEL[s.status]||s.status,s.count])); rows.push('');},
    menu:()=>{push(['Top Selling Items','Category','Qty','Sales']); (d.topItems||[]).forEach((x:any)=>push([x.name,x.category,x.qty,x.sales])); rows.push(''); push(['Category Sales','Items Sold','Orders','Sales']); (d.categoryPerformance||[]).forEach((x:any)=>push([x.category,x.items_sold,x.orders,x.sales])); rows.push('');},
    table:()=>{push(['Table Performance','Orders','Sales']); (d.tablePerformance||[]).forEach((x:any)=>push([x.table_name,x.orders,x.sales])); rows.push('');},
    waiter:()=>{push(['Waiter Performance','Orders','Completed','Cancelled','Sales']); (d.waiterPerformance||[]).forEach((x:any)=>push([x.waiter,x.orders,x.completed,x.cancelled,x.sales])); rows.push('');},
    discount:()=>{push(['Discount Breakdown','Bills','Amount']); (d.discountBreakdown||[]).forEach((x:any)=>push([x.discount_type,x.bills,x.amount])); rows.push('');},
    complementary:()=>{push(['Complimentary Breakdown','Orders','Amount']); (d.complimentaryBreakdown||[]).forEach((x:any)=>push([x.reason,x.orders,x.amount])); rows.push('');},
    cancelled:()=>{push(['Cancelled Breakdown','Bills','Amount']); (d.cancelledBreakdown||[]).forEach((x:any)=>push([x.reason,x.bills,x.amount])); rows.push('');},
    modified:()=>{push(['Modified Bills','Count','Amount Changed']); push(['',ms.count||0,ms.amountChanged||0]); rows.push('');},
    peak:()=>{push(['Peak Hours','Orders','Sales']); (d.peakHours||[]).forEach((x:any)=>push([x.label,x.orders,x.sales]));},
  };
  const order=['summary','sales','payment','orderType','orderStatus','menu','table','waiter','discount','complementary','cancelled','modified','peak'];
  if(section==='all'){order.forEach(k=>blocks[k]());}
  else if(blocks[section]){blocks[section]();}
  else{push([REPORT_SECTIONS.find(([k])=>k===section)?.[1]||'Report']); push(['This report section has no tabular data to export.']);}
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`report-${d.period}-${d.from}-to-${d.to}${section&&section!=='all'?'-'+section:''}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function TableReportCard({tables}:any){
  const list=tables||[]; const totalOrders=list.reduce((a:number,x:any)=>a+Number(x.orders||0),0); const totalSales=list.reduce((a:number,x:any)=>a+Number(x.sales||0),0);
  const mostUsed=list.length?list.reduce((a:any,x:any)=>Number(x.orders||0)>Number(a.orders||0)?x:a,list[0]):null;
  const highestSales=list.length?list.reduce((a:any,x:any)=>Number(x.sales||0)>Number(a.sales||0)?x:a,list[0]):null;
  return <>
    <StatsCard title="Table Performance" items={[
      {label:'Most Used Table',value:mostUsed?.table_name||'—',cls:'stat-indigo'},
      {label:'Highest Sales Table',value:highestSales?.table_name||'—',cls:'stat-magenta'},
      {label:'Average Bill',value:money(totalOrders>0?totalSales/totalOrders:0),cls:'stat-teal'},
    ]}/>
    <DataTable title="Tables" headers={['Table','Orders','Sales','Avg. Bill']} rows={list.map((x:any)=>[x.table_name,x.orders,money(x.sales),money(Number(x.orders)>0?Number(x.sales)/Number(x.orders):0)])}
      mobileRows={list.map((x:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{x.table_name}</span></div>
        <div className="user-card-field"><small>Orders</small><b>{x.orders}</b></div>
        <div className="user-card-field"><small>Sales</small><b>{money(x.sales)}</b></div>
        <div className="user-card-field"><small>Avg. Bill</small><b>{money(Number(x.orders)>0?Number(x.sales)/Number(x.orders):0)}</b></div>
      </div>)}/>
  </>;
}
function DiscountReportCard({breakdown,discountGiven}:any){
  const list=breakdown||[]; const totalBills=list.reduce((a:number,x:any)=>a+Number(x.bills||0),0); const totalAmount=list.reduce((a:number,x:any)=>a+Number(x.amount||0),0);
  const label:Record<string,string>={PERCENT:'Percentage',FIXED:'Fixed'};
  const rows=list.map((x:any)=>[label[x.discount_type]||x.discount_type,x.bills,money(x.amount)]);
  if(list.length)rows.push([<b key="t">Total</b>,<b key="tb">{totalBills}</b>,<b key="ta">{money(totalAmount)}</b>]);
  return <>
    <DataTable title="Discount Summary" headers={['Discount Type','Bills','Discount Amount']} rows={rows}
      mobileRows={list.length?[...list.map((x:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{label[x.discount_type]||x.discount_type}</span></div>
        <div className="user-card-field"><small>Bills</small><b>{x.bills}</b></div>
        <div className="user-card-field"><small>Discount Amount</small><b>{money(x.amount)}</b></div>
      </div>),<div className="user-card" key="total">
        <div className="user-card-top"><span className="user-card-name">Total</span></div>
        <div className="user-card-field"><small>Bills</small><b>{totalBills}</b></div>
        <div className="user-card-field"><small>Discount Amount</small><b>{money(totalAmount)}</b></div>
      </div>]:[]}/>
    <StatsCard title="" items={[{label:'Discounted Bills',value:totalBills,cls:'stat-yellow'},{label:'Total Discount',value:money(discountGiven),cls:'stat-magenta'}]}/>
  </>;
}
function ComplimentaryReportCard({breakdown,complimentaryGiven}:any){
  const list=breakdown||[]; const totalOrders=list.reduce((a:number,x:any)=>a+Number(x.orders||0),0); const totalAmount=list.reduce((a:number,x:any)=>a+Number(x.amount||0),0);
  const rows=list.map((x:any)=>[x.reason,x.orders,money(x.amount)]);
  if(list.length)rows.push([<b key="t">Total</b>,<b key="tb">{totalOrders}</b>,<b key="ta">{money(totalAmount)}</b>]);
  return <>
    <DataTable title="Complimentary Sales" headers={['Reason','Orders','Amount']} rows={rows}
      mobileRows={list.length?[...list.map((x:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{x.reason}</span></div>
        <div className="user-card-field"><small>Orders</small><b>{x.orders}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(x.amount)}</b></div>
      </div>),<div className="user-card" key="total">
        <div className="user-card-top"><span className="user-card-name">Total</span></div>
        <div className="user-card-field"><small>Orders</small><b>{totalOrders}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(totalAmount)}</b></div>
      </div>]:[]}/>
    <StatsCard title="" items={[{label:'Complimentary Orders',value:totalOrders,cls:'stat-periwinkle'},{label:'Complimentary Value',value:money(complimentaryGiven),cls:'stat-teal'}]}/>
  </>;
}
function CancelledBreakdownTable({breakdown}:any){
  const list=breakdown||[]; const totalBills=list.reduce((a:number,x:any)=>a+Number(x.bills||0),0); const totalAmount=list.reduce((a:number,x:any)=>a+Number(x.amount||0),0);
  const rows=list.map((x:any)=>[x.reason,x.bills,money(x.amount)]);
  if(list.length)rows.push([<b key="t">Total</b>,<b key="tb">{totalBills}</b>,<b key="ta">{money(totalAmount)}</b>]);
  return <DataTable title="Cancelled Bills by Reason" headers={['Reason','Bills','Amount']} rows={rows}
    mobileRows={list.length?[...list.map((x:any,i:number)=><div className="user-card" key={i}>
      <div className="user-card-top"><span className="user-card-name">{x.reason}</span></div>
      <div className="user-card-field"><small>Bills</small><b>{x.bills}</b></div>
      <div className="user-card-field"><small>Amount</small><b>{money(x.amount)}</b></div>
    </div>),<div className="user-card" key="total">
      <div className="user-card-top"><span className="user-card-name">Total</span></div>
      <div className="user-card-field"><small>Bills</small><b>{totalBills}</b></div>
      <div className="user-card-field"><small>Amount</small><b>{money(totalAmount)}</b></div>
    </div>]:[]}/>;
}
function ModifiedSummaryCard({summary}:any){
  const s=summary||{}; const rows=(s.rows||[]);
  return <section className="surface modified-summary-card">
    <h2>Modified Bills</h2>
    <div className="report-stats">
      <div><small>Modified Bills</small><b className="stat-indigo">{s.count||0}</b></div>
      <div><small>Total Amount Changed</small><b className="stat-magenta">{money(s.amountChanged)}</b></div>
    </div>
    {rows.length?<>
      <div className="table-scroll data-table-scroll-wrap"><table><thead><tr><th>Bill</th><th>Original</th><th>Final</th><th>Modified By</th></tr></thead><tbody>{rows.map((r:any,i:number)=>{const diffColor=r.final>r.original?'var(--c-magenta)':r.final<r.original?'var(--c-teal)':'var(--text-soft)';return <tr key={i}><td>{r.bill||'—'}</td><td className="amount-original">{money(r.original)}</td><td><b style={{color:diffColor}}>{money(r.final)}</b></td><td>{r.modifiedBy||'—'}</td></tr>})}</tbody></table></div>
      <div className="data-table-cards">{rows.map((r:any,i:number)=>{const diffColor=r.final>r.original?'var(--c-magenta)':r.final<r.original?'var(--c-teal)':'var(--text-soft)';return <div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{r.bill||'—'}</span></div>
        <div className="user-card-field"><small>Original</small><span className="amount-original">{money(r.original)}</span></div>
        <div className="user-card-field"><small>Final</small><b style={{color:diffColor}}>{money(r.final)}</b></div>
        <div className="user-card-field"><small>Modified By</small><b>{r.modifiedBy||'—'}</b></div>
      </div>})}</div>
    </>:<p className="muted empty-state">No modified bills for this period.</p>}
    <button type="button" className="secondary view-full-btn" onClick={()=>go('modified')}>View Modified Bills <ChevronRight size={15}/></button>
  </section>;
}
function ClosingSummaryCard({ov,payments}:any){
  const cash=(payments||[]).find((p:any)=>String(p.method).toUpperCase()==='CASH');
  const upi=(payments||[]).find((p:any)=>String(p.method).toUpperCase()==='UPI');
  const other=(payments||[]).filter((p:any)=>!['CASH','UPI'].includes(String(p.method).toUpperCase()));
  const otherTotal=other.reduce((a:number,p:any)=>a+Number(p.amount||0),0);
  const totalCollection=(payments||[]).reduce((a:number,p:any)=>a+Number(p.amount||0),0);
  const netSales=Number(ov.grossSales||0)-Number(ov.discounts||0)-Number(ov.complementary||0);
  const Row=({label,value,strong}:any)=><div className={strong?'closing-row closing-total':'closing-row'}><span>{label}</span><b>{value}</b></div>;
  return <section className="surface closing-summary">
    <h2>Today's Closing</h2>
    <Row label="Gross Sales" value={money(ov.grossSales)}/>
    <Row label="Discount" value={'-'+money(ov.discounts)}/>
    <Row label="Net Sales" value={money(netSales)}/>
    <Row label="Complimentary Value" value={money(ov.complementary)}/>
    <Row label="Cancelled Bills" value={ov.cancelledOrders||0}/>
    <Row label="Paid Bills" value={ov.paidBills||0}/>
    <div className="closing-divider"/>
    <Row label="Cash Collection" value={money(cash?.amount)}/>
    <Row label="UPI Collection" value={money(upi?.amount)}/>
    {otherTotal>0&&<Row label="Other Collection" value={money(otherTotal)}/>}
    <div className="closing-divider"/>
    <Row label="Total Collection" value={money(totalCollection)} strong/>
  </section>;
}
function Reports(){
  const d=boot.data,ov=d.overview||{},period=d.period||'today';
  const [section,setSection]=useState<string>(()=>new URLSearchParams(location.search).get('section')||'all');
  const goPeriod=(p:string)=>go('reports?period='+p+(section!=='all'?'&section='+section:''));
  const changeSection=(s:string)=>{setSection(s);const url=new URL(location.href);url.searchParams.set('section',s);history.replaceState(null,'',url.toString())};
  const scrollTo=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
  const show=(id:string)=>section==='all'||section===id;
  const sectionLabel=section==='all'?'All Reports':(REPORT_SECTIONS.find(([k])=>k===section)?.[1]||'Report');
  const periodLabel=(REPORT_PERIODS.find(([v])=>v===period)?.[1]||period)+` (${d.from} to ${d.to})`;
  const totalPaymentBills=(d.payments||[]).reduce((a:number,p:any)=>a+Number(p.bills||0),0);
  const totalPaymentAmount=(d.payments||[]).reduce((a:number,p:any)=>a+Number(p.amount||0),0);
  const totalOrderTypeOrders=(d.orderTypeBreakdown||[]).reduce((a:number,x:any)=>a+Number(x.orders||0),0);
  const totalOrderTypeSales=(d.orderTypeBreakdown||[]).reduce((a:number,x:any)=>a+Number(x.sales||0),0);
  return <>
    <div className="reports-page">
    <div className="reports-print-head">
      <h1>{d.settings?.canteen_name||d.settings?.business_name||'Canteen'}</h1>
      <p>{sectionLabel} — {periodLabel}</p>
    </div>
    <div className="section-head reports-head">
      <h2 className="page-heading">REPORTS</h2>
      <div className="reports-controls">
        <label className="reports-period">Report Period<select value={period} onChange={e=>goPeriod(e.target.value)}>{REPORT_PERIODS.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
        {period==='custom'&&<Form method="get" className="reports-custom-range"><input type="hidden" name="page" value="reports"/><input type="hidden" name="period" value="custom"/><input type="date" name="from" defaultValue={d.from} required/><input type="date" name="to" defaultValue={d.to} required/><button className="secondary">Apply</button></Form>}
        <label className="reports-period">Report Section<select value={section} onChange={e=>changeSection(e.target.value)}><option value="all">All Reports</option>{REPORT_SECTIONS.map(([k,l])=><option value={k} key={k}>{l}</option>)}</select></label>
        <AsyncButton className="secondary reports-export-btn" loadingText="Exporting" onAction={async()=>downloadReportCsv(d,section)}><ReceiptText size={16}/> Export Report</AsyncButton>
        <AsyncButton className="secondary reports-print-btn" loadingText="Preparing" onAction={async()=>window.print()}><Printer size={16}/> Print Report</AsyncButton>
      </div>
    </div>

    {show('summary')&&<>
    <h3 className="report-section-title">Daily Business Summary</h3>
    <section className="metric-grid metric-grid-7 reports-summary-metrics">
      <Metric label="Total Sales" value={money(ov.totalSales)} icon={IndianRupee}/>
      <Metric label="Total Orders" value={ov.totalOrders||0} icon={ClipboardList}/>
      <Metric label="Paid Bills" value={ov.paidBills||0} icon={ReceiptText}/>
      <Metric label="Average Bill" value={money(ov.avgOrder)} icon={TrendingUp}/>
      <Metric label="Cancelled Bills" value={ov.cancelledOrders||0} icon={XCircle}/>
      <Metric label="Discount Given" value={money(ov.discounts)} icon={Percent}/>
      <Metric label="Complimentary" value={money(ov.complementary)} icon={Gift}/>
    </section>
    </>}

    {show('sales')&&<>
    <h3 className="report-section-title">Daily Sales Report</h3>
    <DataTable title="Sales Summary" headers={['Particular','Amount']} rows={[
      ['Gross Sales',money(ov.grossSales)],
      ['Discounts','-'+money(ov.discounts)],
      ['Complimentary','-'+money(ov.complementary)],
      [<b key="ns">Net Sales</b>,<b key="nsv">{money(ov.totalSales)}</b>],
      ['Cancelled Bills',money(ov.cancelledAmount)],
    ]}
      mobileRows={[<div className="user-card" key="s">
        <div className="kv-row"><span>Gross Sales</span><b>{money(ov.grossSales)}</b></div>
        <div className="kv-row"><span>Discounts</span><b>-{money(ov.discounts)}</b></div>
        <div className="kv-row"><span>Complimentary</span><b>-{money(ov.complementary)}</b></div>
        <div className="kv-row kv-row-total"><span>Net Sales</span><b>{money(ov.totalSales)}</b></div>
        <div className="kv-row"><span>Cancelled Bills</span><b>{money(ov.cancelledAmount)}</b></div>
      </div>]}/>
    </>}

    {show('payment')&&<>
    <h3 className="report-section-title">Payment Collection</h3>
    <DataTable title="Payment Summary" headers={['Payment Method','Bills','Amount']} rows={[
      ...(d.payments||[]).map((p:any)=>[p.method,p.bills,money(p.amount)]),
      ...((d.payments||[]).length?[[<b key="t">Total</b>,<b key="tb">{totalPaymentBills}</b>,<b key="ta">{money(totalPaymentAmount)}</b>]]:[]),
    ]}
      mobileRows={(d.payments||[]).length?[...(d.payments||[]).map((p:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{p.method}</span></div>
        <div className="user-card-field"><small>Bills</small><b>{p.bills}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(p.amount)}</b></div>
        <div className="user-card-field"><small>Share Of Collection</small><b>{totalPaymentAmount>0?Math.round(Number(p.amount||0)/totalPaymentAmount*100):0}%</b></div>
      </div>),<div className="user-card" key="total">
        <div className="user-card-top"><span className="user-card-name">Total</span></div>
        <div className="user-card-field"><small>Bills</small><b>{totalPaymentBills}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(totalPaymentAmount)}</b></div>
      </div>]:[]}/>
    <section className="surface chart-card">
      <PaymentBars data={d.payments||[]}/>
      <div className="report-stats">{(d.payments||[]).map((p:any,i:number)=><div key={i}><small>{p.method} Collection</small><b style={{color:PAYMENT_COLORS[String(p.method||'').toUpperCase()]||'var(--text)'}}>{money(p.amount)}</b></div>)}</div>
    </section>
    </>}

    {show('trend')&&<>
    <h3 className="report-section-title">Sales Trend</h3>
    <section className="surface chart-card">
      <h2>{GRANULARITY_LABEL[d.granularity]||'Sales Trend'}</h2>
      <AreaChart data={d.trend||[]} valueKey="sales" color="#fd397a" format={money}/>
    </section>
    </>}

    {show('orderType')&&<>
    <h3 className="report-section-title">Order Report</h3>
    <DataTable title="Order Summary" headers={['Order Type','Orders','Amount']} rows={[
      ...(d.orderTypeBreakdown||[]).map((x:any)=>[ORDER_TYPE_LABEL[x.order_type]||x.order_type,x.orders,money(x.sales)]),
      ...((d.orderTypeBreakdown||[]).length?[[<b key="t">Total</b>,<b key="tb">{totalOrderTypeOrders}</b>,<b key="ta">{money(totalOrderTypeSales)}</b>]]:[]),
    ]}
      mobileRows={(d.orderTypeBreakdown||[]).length?[...(d.orderTypeBreakdown||[]).map((x:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{ORDER_TYPE_LABEL[x.order_type]||x.order_type}</span></div>
        <div className="user-card-field"><small>Orders</small><b>{x.orders}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(x.sales)}</b></div>
      </div>),<div className="user-card" key="total">
        <div className="user-card-top"><span className="user-card-name">Total</span></div>
        <div className="user-card-field"><small>Orders</small><b>{totalOrderTypeOrders}</b></div>
        <div className="user-card-field"><small>Amount</small><b>{money(totalOrderTypeSales)}</b></div>
      </div>]:[]}/>
    </>}

    {show('orderStatus')&&<>
    <h3 className="report-section-title">Order Status Report</h3>
    <section className="split reports-split">
      <div className="surface chart-card">
        <h2>Orders Overview</h2>
        <BarChart data={d.trend||[]} valueKey="orders" color="#38a4f8" suffix=" orders"/>
      </div>
      <div className="surface chart-card">
        <h2>Orders by Status</h2>
        <StatusDonut data={d.statusBreakdown||[]}/>
      </div>
    </section>
    </>}

    {show('menu')&&<>
    <h3 className="report-section-title">Menu Item Performance</h3>
    <TopSellingCard items={d.topItems||[]} onViewAll={()=>scrollTo('category-sales')}/>

    <h3 className="report-section-title" id="category-sales">Category Sales</h3>
    <DataTable className="reports-category-table" title="Category Performance" headers={['Category','Items Sold','Orders','Sales']} rows={(d.categoryPerformance||[]).map((x:any)=>[x.category,x.items_sold,x.orders,money(x.sales)])}
      mobileRows={(d.categoryPerformance||[]).map((x:any,i:number)=><div className="user-card" key={i}>
        <div className="user-card-top"><span className="user-card-name">{x.category}</span></div>
        <div className="user-card-field"><small>Items Sold</small><b>{x.items_sold}</b></div>
        <div className="user-card-field"><small>Orders</small><b>{x.orders}</b></div>
        <div className="user-card-field"><small>Sales</small><b>{money(x.sales)}</b></div>
      </div>)}/>
    </>}

    {show('table')&&<>
    <h3 className="report-section-title">Table Report</h3>
    <TableReportCard tables={d.tablePerformance||[]}/>
    </>}

    {show('waiter')&&<>
    <h3 className="report-section-title">Waiter Report</h3>
    <WaiterPerformanceCard waiters={d.waiterPerformance||[]}/>
    </>}

    {show('discount')&&<>
    <h3 className="report-section-title">Discount Report</h3>
    <DiscountReportCard breakdown={d.discountBreakdown||[]} discountGiven={ov.discounts}/>
    </>}

    {show('complementary')&&<>
    <h3 className="report-section-title">Complementary Report</h3>
    <ComplimentaryReportCard breakdown={d.complimentaryBreakdown||[]} complimentaryGiven={ov.complementary}/>
    </>}

    {show('cancelled')&&<>
    <h3 className="report-section-title">Cancelled Bills Report</h3>
    <CancelledSummaryCard cancelledOrders={ov.cancelledOrders} cancelledAmount={ov.cancelledAmount} totalOrders={ov.totalOrders}/>
    <CancelledBreakdownTable breakdown={d.cancelledBreakdown||[]}/>
    </>}

    {show('modified')&&<>
    <h3 className="report-section-title">Modified Bills Report</h3>
    <ModifiedSummaryCard summary={d.modifiedSummary}/>
    </>}

    {show('peak')&&<>
    <h3 className="report-section-title">Peak Business Hours</h3>
    <PeakHoursCard hours={d.peakHours||[]}/>
    </>}

    {show('closing')&&<>
    <h3 className="report-section-title">Daily Closing Summary</h3>
    <ClosingSummaryCard ov={ov} payments={d.payments||[]}/>
    </>}
    </div>
  </>;
}
function SimpleRecords(){const d=boot.data;const list=d.audits||[];const rows=list.map((x:any)=>[x.action,x.bill_number||x.order_number,x.display_name,new Date(x.created_at).toLocaleString()]);return <DataTable title="Audit history" headers={['Action','Order','User','At']} rows={rows}
    mobileRows={list.map((x:any,i:number)=><div className="user-card" key={x.id||i}>
      <div className="user-card-top"><span className="user-card-name">{x.action}</span></div>
      <div className="user-card-field"><small>Order</small><b>{x.bill_number||x.order_number||'—'}</b></div>
      <div className="user-card-field"><small>User</small><b>{x.display_name}</b></div>
      <div className="user-card-field"><small>Date &amp; Time</small><b>{new Date(x.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b></div>
    </div>)}/>}
const SETTINGS_TABS=[['profile','My Profile'],['business','Business Information'],['order','Order Settings'],['billing','Billing & Payment'],['discount','Discount & Complimentary'],['printer','Printer'],['access','User Access Settings'],['system','System Preferences']];
// Business/Order/Billing/Discount/System are business-configuration tabs
// gated behind the 'settings' permission (matching settings_save's own
// independent server-side check); 'access' is admin-only on top of that.
// My Profile is a personal account tab and is never gated — every
// authenticated user reaches it regardless of role/permissions.
function SettingsTabs({tab,onChange,isAdmin,canManageSettings}:any){
  const tabs=isAdmin?SETTINGS_TABS:canManageSettings?SETTINGS_TABS.filter(([k]:any)=>k!=='access'):SETTINGS_TABS.filter(([k]:any)=>k==='profile');
  return <div className="chips settings-tabs">{tabs.map(([k,label]:any)=><button type="button" className={tab===k?'selected':''} onClick={()=>onChange(k)} key={k}>{label}</button>)}</div>;
}
// Floating label: the label sits inside the input's border at rest and
// rises above it once the field has a value or is focused — driven purely
// by CSS (:placeholder-shown / :focus), so these stay uncontrolled inputs
// exactly like the rest of this form (placeholder=" " is the trick that
// lets :placeholder-shown detect "empty" vs "has a value").
function FloatingInput({id,label,className,...inputProps}:any){
  return <div className={'fl-field'+(className?' '+className:'')}>
    <input id={id} placeholder=" " {...inputProps}/>
    <label htmlFor={id}>{label}</label>
  </div>;
}
function ProfileSettingsTab({u}:any){
  const [preview,setPreview]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const [submitting,setSubmitting]=useState(false);
  // Handled locally (not the app's generic client-nav submit listener) for
  // the same reason as the Change Password modal: a server error here must
  // stay on this tab/card, never the page-level flash banner, and the
  // active Settings tab (plain React state in the parent) already survives
  // this re-render regardless, since boot.page never changes.
  const submit=async(e:any)=>{
    e.preventDefault();
    if(submitting)return;
    setError(null); setSuccess(null); setSubmitting(true);
    try{
      const fd=new FormData(e.currentTarget);
      const res=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',body:fd});
      const html=await res.text();
      const m=html.match(/window\.__CANTEEN__=(\{[\s\S]*?\});<\/script>/);
      if(!m){location.href=res.url||location.href;return;}
      const newBoot=JSON.parse(m[1]);
      if(newBoot.flash&&newBoot.flash.error){setError(newBoot.flash.error);setSubmitting(false);return;}
      Object.assign(boot,newBoot); notifyBootChanged&&notifyBootChanged();
      setPreview(null);
      setSuccess(newBoot.flash&&newBoot.flash.success||'Profile updated.');
      setSubmitting(false);
    }catch{
      setError('Could not save your profile. Check your connection and try again.');
      setSubmitting(false);
    }
  };
  return <section className="surface form-panel">
    <h2>My Profile</h2>
    <p className="muted">General information for your own account — this does not affect other staff members.</p>
    {error&&<div className="alert error">{error}</div>}
    {success&&<div className="alert success">{success}</div>}
    <Form encType="multipart/form-data" id="settings-form-profile" onSubmit={submit}>
      <input type="hidden" name="action" value="profile_save"/>
      <label className="profile-avatar-field">Profile icon
        <input name="avatar" type="file" accept="image/webp" onChange={(e:any)=>{const f=e.target.files?.[0];setPreview(f?URL.createObjectURL(f):null)}}/>
        <small className="current-image-hint">WebP file, under 2 MB. Leave blank to keep the current icon.</small>
        {(preview||u.avatar)&&<img className="avatar-preview" src={preview||logoSrc(u.avatar)||''} alt="Current profile icon"/>}
      </label>
      <div className="profile-grid">
        <FloatingInput id="profile-name" label="Username / Full Name" name="display_name" defaultValue={u.name} maxLength={100} required/>
        <FloatingInput id="profile-email" label="Email" name="email" type="email" defaultValue={u.email} required/>
        <FloatingInput id="profile-mobile" label="Phone Number" name="mobile" type="tel" defaultValue={u.mobile}/>
        <FloatingInput id="profile-role" label="Role" value={u.role} disabled/>
      </div>
    </Form>
    <div className="form-actions">
      <button type="submit" form="settings-form-profile" className="primary" disabled={submitting}>{submitting?<><span className="btn-spinner"></span>Saving...</>:'Save changes'}</button>
    </div>
  </section>;
}
function BusinessSettingsTab({s}:any){
  const [preview,setPreview]=useState<string|null>(null);
  return <section className="surface form-panel">
    <h2>Business Information</h2>
    <p className="muted">This is important — these details appear on printed bills and receipts.</p>
    <Form encType="multipart/form-data" id="settings-form-business">
      <input type="hidden" name="action" value="settings_save"/>
      <input type="hidden" name="group" value="business"/>
      <div className="form-grid">
        <label>Canteen name<input name="canteen_name" defaultValue={s.canteen_name}/></label>
        <label>Business / organization name<input name="business_name" defaultValue={s.business_name}/></label>
        <label>Mobile number<input name="phone" type="tel" defaultValue={s.phone}/></label>
        <label>Email<input name="email" type="email" defaultValue={s.email}/></label>
        <label>GST number<input name="gst_number" defaultValue={s.gst_number}/></label>
        <label>Currency symbol<input name="currency_symbol" defaultValue={s.currency_symbol||'₹'}/></label>
        <label className="wide">Address<textarea name="address" defaultValue={s.address}/></label>
        <label className="wide">Logo
          <input name="logo" type="file" accept="image/webp" onChange={(e:any)=>{const f=e.target.files?.[0];setPreview(f?URL.createObjectURL(f):null)}}/>
          <small className="current-image-hint">WebP file, under 2 MB. Leave blank to keep the current logo.</small>
          {(preview||s.logo_path)&&<img className="logo-preview" src={preview||logoSrc(s.logo_path)||''} alt="Current logo"/>}
        </label>
      </div>
      <p className="muted">These details will be used when generating and printing bills.</p>
    </Form>
    <div className="form-actions">
      <button type="submit" form="settings-form-business" className="primary">Save changes</button>
      <Form onSubmit={(e:any)=>{if(!confirm('Reset Business Information to its default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
        <input type="hidden" name="action" value="settings_reset"/>
        <input type="hidden" name="group" value="business"/>
        <button type="submit" className="secondary">Reset to default settings</button>
      </Form>
    </div>
  </section>;
}
function OrderSettingsTab({s}:any){
  const format=s.order_number_format||'ORD-{seq}';
  return <section className="surface form-panel">
    <h2>Order Settings</h2>
    <Form id="settings-form-order">
      <input type="hidden" name="action" value="settings_save"/>
      <input type="hidden" name="group" value="order"/>
      <div className="form-grid">
        <label>Order number format<input name="order_number_format" defaultValue={format} placeholder="ORD-{seq}"/><small className="current-image-hint">Example: {format.replace('{seq}','1001')}</small></label>
        <label className="check"><input type="checkbox" name="order_number_auto" defaultChecked={s.order_number_auto!=='0'}/>Automatically generate order number</label>
        <label className="check"><input type="checkbox" name="allow_order_cancellation" defaultChecked={s.allow_order_cancellation!=='0'}/>Allow order cancellation</label>
        <label className="check"><input type="checkbox" name="require_cancellation_reason" defaultChecked={s.require_cancellation_reason!=='0'}/>Require cancellation reason</label>
        <label className="check"><input type="checkbox" name="auto_free_table_after_completion" defaultChecked={s.auto_free_table_after_completion!=='0'}/>Automatically free table after order completion</label>
      </div>
      <p className="muted">We strongly recommend keeping "Require cancellation reason" on — cancelled orders and bills are financial records.</p>
    </Form>
    <div className="form-actions">
      <button type="submit" form="settings-form-order" className="primary">Save changes</button>
      <Form onSubmit={(e:any)=>{if(!confirm('Reset Order Settings to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
        <input type="hidden" name="action" value="settings_reset"/>
        <input type="hidden" name="group" value="order"/>
        <button type="submit" className="secondary">Reset to default settings</button>
      </Form>
    </div>
  </section>;
}
function BillingSettingsTab({s}:any){
  const methods=String(s.payment_methods||'CASH,UPI').split(',');
  const format=s.bill_number_format||'BILL-{seq}';
  return <section className="surface form-panel">
    <h2>Billing & Payment</h2>
    <Form id="settings-form-billing">
      <input type="hidden" name="action" value="settings_save"/>
      <input type="hidden" name="group" value="billing"/>
      <div className="form-grid">
        <label>Bill number format<input name="bill_number_format" defaultValue={format} placeholder="BILL-{seq}"/><small className="current-image-hint">Example: {format.replace('{seq}','1001')}</small></label>
        <label className="check"><input type="checkbox" name="bill_number_auto" defaultChecked={s.bill_number_auto!=='0'}/>Automatically generate bill number</label>
        <label className="wide check"><input type="checkbox" name="payment_methods[]" value="CASH" defaultChecked={methods.includes('CASH')}/>Cash</label>
        <label className="wide check"><input type="checkbox" name="payment_methods[]" value="UPI" defaultChecked={methods.includes('UPI')}/>UPI</label>
      </div>
      <h3>Bill settings</h3>
      <div className="form-grid">
        <label className="check"><input type="checkbox" name="show_logo_on_bill" defaultChecked={s.show_logo_on_bill!=='0'}/>Show canteen logo on bill</label>
        <label className="check"><input type="checkbox" name="show_waiter_name" defaultChecked={s.show_waiter_name!=='0'}/>Show waiter name</label>
        <label className="check"><input type="checkbox" name="show_table_number" defaultChecked={s.show_table_number!=='0'}/>Show table number</label>
        <label className="check"><input type="checkbox" name="show_thank_you_message" defaultChecked={s.show_thank_you_message!=='0'}/>Show thank you message</label>
        <label className="wide">Thank you message<textarea name="thank_you_message" defaultValue={s.thank_you_message||'Thank you for visiting Niyati Canteen!'}/></label>
      </div>
    </Form>
    <div className="form-actions">
      <button type="submit" form="settings-form-billing" className="primary">Save changes</button>
      <Form onSubmit={(e:any)=>{if(!confirm('Reset Billing & Payment settings to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
        <input type="hidden" name="action" value="settings_reset"/>
        <input type="hidden" name="group" value="billing"/>
        <button type="submit" className="secondary">Reset to default settings</button>
      </Form>
    </div>
  </section>;
}
// ===== Printer settings: paper width, local agent address, auto-print,
// connection status, and a Test Print that never touches real bill data. =====
// 🟢/🟡/🔴 per the online/connecting/offline states this app already uses
// elsewhere — "online" is computed server-side purely from the bridge's own
// recent heartbeat (PageDataService::counters()), never guessed client-side.
function BridgeStatusPill({counter}:any){
  if(!counter)return <span className="printer-status-pill checking"><Info size={13}/> No counter selected yet</span>;
  if(counter.online)return <span className="printer-status-pill ok">🟢 Connected{counter.printers?.length?` — ${counter.printers.length} printer${counter.printers.length===1?'':'s'} reported`:''}</span>;
  // last_seen_at is a plain "Y-m-d H:i:s" written by MySQL's NOW() in the
  // server's own local timezone (matching PHP's date_default_timezone_set
  // in config/app.php) — not UTC, so it's parsed as a local wall-clock
  // string here (space swapped for "T", no "Z"), the one format every
  // browser accepts without misreading it as UTC.
  if(counter.bridge_code)return <span className="printer-status-pill down">🔴 Offline — last seen {counter.last_seen_at?new Date(counter.last_seen_at.replace(' ','T')).toLocaleString():'never'}</span>;
  return <span className="printer-status-pill down">🔴 No Print Bridge registered for this counter yet</span>;
}
// Legacy local-agent-only status pill (development compatibility path —
// see print-agent/README.md). Kept separate from BridgeStatusPill above so
// the two connection kinds are never visually conflated.
function PrinterStatusPill({agentUrl}:any){
  const [state,setState]=useState<'checking'|'ok'|'down'>('checking');
  const [info,setInfo]=useState<{printers:string[];error?:string}>({printers:[]});
  const check=async()=>{setState('checking');const r=await checkAgentStatus(agentUrl);setInfo({printers:r.printers,error:r.error});setState(r.ok?'ok':'down')};
  useEffect(()=>{check()},[agentUrl]);
  if(state==='checking')return <span className="printer-status-pill checking"><RefreshCw size={13} className="spin"/> Checking…</span>;
  if(state==='ok')return <span className="printer-status-pill ok">🟢 Agent connected{info.printers.length?` — ${info.printers.length} printer${info.printers.length===1?'':'s'} found`:' — no printers found on this PC'}</span>;
  return <span className="printer-status-pill down" title={info.error}>🔴 Agent not reachable</span>;
}
function BridgeTokenReveal(){
  const raw=boot.flash.bridge_token_created; if(!raw)return null;
  let info:any; try{info=JSON.parse(raw)}catch{return null}
  return <div className="alert success bridge-token-reveal">
    <b>Print Bridge registered — copy this token now, it will not be shown again:</b>
    <div className="bridge-token-value"><code>{info.token}</code></div>
    <small>{info.bridge_code} — paste this token into the Niyati Print Bridge's setup screen on the counter PC.</small>
  </div>;
}
function PrinterSettingsTab({s}:any){
  const counters=(boot.data as any)?.counters||[];
  const [counterId,setCounterId]=useState(s.printer_counter_id||'');
  const [paperWidth,setPaperWidth]=useState(s.printer_paper_width==='58'?'58':'80');
  const [autoPrint,setAutoPrint]=useState(s.printer_auto_print==='1');
  const [autoCut,setAutoCut]=useState(s.printer_auto_cut!=='0');
  const [printerName,setPrinterName]=useState(s.printer_name||'');
  const [agentUrl,setAgentUrl]=useState(s.printer_agent_url||'http://127.0.0.1:9123');
  const [testResult,setTestResult]=useState<{ok:boolean;message:string}|null>(null);
  const canManage=boot.user.role==='ADMIN'||(boot.user.permissions||[]).includes('settings');
  const selectedCounter=counters.find((c:any)=>String(c.id)===String(counterId))||null;
  const bridgePrinters:string[]=selectedCounter?.printers||[];
  const testHeader=()=>({canteenName:s.canteen_name||'Canteen',address:s.address||'',phone:s.phone||'',gstNumber:s.gst_number||'',billNumber:'TEST-PRINT',tableName:'Test Table',waiterName:boot.user.name,paymentMethod:'CASH',dateText:new Date().toLocaleString(),showTableNumber:true,showWaiterName:true,showThankYou:true,thankYouMessage:'This is a test print — no bill or payment was created.'});
  const testItems=()=>[{name:'Sample Item (Test)',quantity:2,rate:25,amount:50},{name:'Another Sample Item With A Longer Name',quantity:1,rate:75,amount:75}];
  const testTotals={subtotal:125,complementary:0,discount:0,grandTotal:125};
  // Test Print deliberately uses the fields as currently typed/selected on
  // screen, not the last-saved settings — that's the whole point of
  // testing before committing a change. Prefers the bridge (production
  // path) whenever a counter is actually selected; the legacy agent below
  // is a separate, explicitly-labeled button so the two are never confused.
  const runBridgeTestPrint=async()=>{
    setTestResult(null);
    if(!selectedCounter){setTestResult({ok:false,message:'Select a counter first.'});return}
    const bytes=buildEscPosBuffer(testHeader(),testItems(),testTotals,paperWidth as any,{cut:autoCut,feedLinesBeforeCut:3});
    const created=await createServerPrintJob('TEST',null,Number(selectedCounter.id),paperWidth,bytes);
    if(!created.ok||!created.jobId){setTestResult({ok:false,message:created.error||'Could not queue the test print.'});return}
    const final=await pollJobStatus(created.jobId);
    if(final.status==='PRINTED')setTestResult({ok:true,message:'Test print confirmed by the Print Bridge.'});
    else setTestResult({ok:false,message:final.error||(selectedCounter.online?'The Print Bridge did not confirm printing in time.':'This counter\'s Print Bridge is offline — start it on the counter PC and try again.')});
  };
  const runAgentTestPrint=async()=>{
    setTestResult(null);
    const bytes=buildEscPosBuffer(testHeader(),testItems(),testTotals,paperWidth as any,{cut:autoCut,feedLinesBeforeCut:3});
    const result=await sendToAgent(agentUrl.replace(/\/+$/,''),printerName,bytes);
    setTestResult(result.ok?{ok:true,message:'Test print sent to the local agent successfully.'}:{ok:false,message:result.error||'Test print failed.'});
  };
  // "Test print in browser" from this Settings tab has no real bill on screen
  // to print — .print-bill only exists on the Order page — so this just opens
  // the normal print dialog on the current page as a way to confirm the
  // browser's own print pipeline reaches the printer at all. The meaningful,
  // bill-shaped browser fallback already exists on the Order/Bills print
  // buttons wired to printOrderReceipt() above.
  const printTestInBrowser=()=>window.print();
  return <section className="settings-card" style={{marginTop:24}}>
    <div className="settings-card-head">
      <span className="settings-card-icon printer"><Printer size={22}/></span>
      <div><h2>Printer</h2><p>Configure the receipt printer used at the counter — 80mm thermal printers are the primary target, with 58mm supported too.</p></div>
    </div>
    <BridgeTokenReveal/>
    <Form id="settings-form-printer">
      <input type="hidden" name="action" value="settings_save"/>
      <input type="hidden" name="group" value="printer"/>
      <div className="settings-section">
        <p className="settings-section-title">Printer Bridge</p>
        <BridgeStatusPill counter={selectedCounter}/>
        <div className="settings-field-grid" style={{marginTop:14}}>
          <label>Counter<select name="printer_counter_id" value={counterId} onChange={e=>setCounterId(e.target.value)}><option value="">— No counter selected —</option>{counters.map((c:any)=><option value={c.id} key={c.id}>{c.name}</option>)}</select><small>Which till this browser prints receipts at.</small></label>
          <label>Available printers{bridgePrinters.length?<select name="printer_name" value={printerName} onChange={e=>setPrinterName(e.target.value)}>{bridgePrinters.map((p:string)=><option value={p} key={p}>{p}</option>)}</select>:<input name="printer_name" value={printerName} onChange={e=>setPrinterName(e.target.value)} placeholder="Printer will appear here once the Bridge connects" disabled={!selectedCounter}/>}<small>Reported automatically by the Niyati Print Bridge — nothing to type once it's connected.</small></label>
        </div>
        {canManage&&<div className="form-actions" style={{marginTop:14}}>
          <AsyncButton className="secondary" loadingText="Generating" onAction={async()=>{if(!counterId){alert('Select or add a counter first.');return}const fd=new FormData();fd.set('action','print_bridge_token_create');fd.set('_csrf',boot.csrf);fd.set('counter_id',String(counterId));const res=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',body:fd});const html=await res.text();const m=html.match(/window\.__CANTEEN__=(\{[\s\S]*?\});<\/script>/);if(m){Object.assign(boot,JSON.parse(m[1]));notifyBootChanged&&notifyBootChanged()}}}><KeyRound size={14}/> Generate Print Bridge token</AsyncButton>
          {selectedCounter?.bridge_id&&<AsyncButton className="danger" loadingText="Disconnecting" onAction={async()=>{if(!confirm('Disconnect this Print Bridge? The counter PC will need a new token.'))return;const fd=new FormData();fd.set('action','print_bridge_revoke');fd.set('_csrf',boot.csrf);fd.set('bridge_id',String(selectedCounter.bridge_id));await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',body:fd});location.reload()}}><XCircle size={14}/> Disconnect Bridge</AsyncButton>}
        </div>}
        <div className="info-box" style={{marginTop:12}}><Info size={15}/>Install the Niyati Print Bridge once on the counter PC and it starts automatically with Windows — no Node.js, no command line, no printer sharing to configure. <a href="/PRINTER_AGENT_SETUP.md" target="_blank" rel="noopener">Setup instructions</a>.</div>
      </div>
      <div className="settings-section">
        <p className="settings-section-title">Paper width</p>
        <div className="pill-select">
          <PillOption type="radio" name="printer_paper_width" value="80" checked={paperWidth==='80'} onChange={()=>setPaperWidth('80')}>80mm (recommended)</PillOption>
          <PillOption type="radio" name="printer_paper_width" value="58" checked={paperWidth==='58'} onChange={()=>setPaperWidth('58')}>58mm</PillOption>
        </div>
      </div>
      <div className="settings-section">
        <ToggleRow name="printer_auto_print" title="Print automatically after payment" hint="Sends the receipt to the Print Bridge the instant a bill is paid, with no button to click. Turn this on only after Test Print succeeds." checked={autoPrint} onChange={setAutoPrint}/>
        <ToggleRow name="printer_auto_cut" title="Auto-cut after printing" hint="Sends the paper-cut command for printers with an automatic cutter. Printers without one simply ignore it." checked={autoCut} onChange={setAutoCut}/>
      </div>
      <details className="printer-legacy-agent">
        <summary>Local agent (development only)</summary>
        <p className="muted" style={{marginTop:8}}>For developers running the app on their own PC before a Print Bridge is installed — see print-agent/README.md. Production counters should use the Printer Bridge above instead.</p>
        <div className="settings-field-grid" style={{marginTop:10}}>
          <label>Agent address<input name="printer_agent_url" value={agentUrl} onChange={e=>setAgentUrl(e.target.value)} placeholder="http://127.0.0.1:9123"/></label>
        </div>
        <div style={{marginTop:12}}><PrinterStatusPill agentUrl={agentUrl.replace(/\/+$/,'')}/></div>
      </details>
    </Form>
    <div className="settings-section">
      <p className="settings-section-title">Test print</p>
      <p className="muted" style={{marginTop:-6,marginBottom:10}}>Prints a sample receipt only — never a real bill, order, or payment.</p>
      <div className="form-actions" style={{marginTop:0}}>
        <AsyncButton className="primary" loadingText="Printing" onAction={runBridgeTestPrint}><Printer size={15}/> Test Print</AsyncButton>
        <AsyncButton className="secondary" loadingText="Printing" onAction={runAgentTestPrint}><Printer size={15}/> Test print via local agent</AsyncButton>
        <AsyncButton className="secondary" loadingText="Preparing" onAction={async()=>printTestInBrowser()}><Printer size={15}/> Test print in browser</AsyncButton>
      </div>
      {testResult&&<div className={'alert '+(testResult.ok?'success':'error')} style={{marginTop:12}}>{testResult.message}</div>}
    </div>
    <div className="form-actions">
      <button type="submit" form="settings-form-printer" className="primary">Save changes</button>
      <Form onSubmit={(e:any)=>{if(!confirm('Reset Printer settings to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
        <input type="hidden" name="action" value="settings_reset"/>
        <input type="hidden" name="group" value="printer"/>
        <button type="submit" className="secondary">Reset to default settings</button>
      </Form>
    </div>
  </section>;
}
const COMPLEMENTARY_REASONS=['Staff Meal','Owner/Management','Guest','Promotional','Customer Service','Other'];
function ToggleRow({title,hint,checked,onChange,name}:any){
  return <label className="toggle-row">
    <div><b>{title}</b>{hint&&<small>{hint}</small>}</div>
    <span className="toggle"><input type="checkbox" name={name} checked={checked} onChange={e=>onChange(e.target.checked)}/><span/></span>
  </label>;
}
function PillOption({checked,onChange,type='checkbox',name,value,children}:any){
  return <label className={'pill-option'+(checked?' selected':'')}>
    <input type={type} name={name} value={value} checked={checked} onChange={onChange}/>{children}
  </label>;
}
function DiscountComplimentarySettingsTab({s}:any){
  const allowedTypes=String(s.discount_allowed_types||'PERCENT,FIXED').split(',').filter(Boolean);
  const roles=String(s.complementary_roles||'ADMIN,MANAGER').split(',').filter(Boolean);
  const [discountEnabled,setDiscountEnabled]=useState(s.discount_enabled!=='0');
  const [types,setTypes]=useState<string[]>(allowedTypes);
  const [scope,setScope]=useState(s.discount_scope||'BOTH');
  const [compEnabled,setCompEnabled]=useState(s.complementary_enabled!=='0');
  const [compRequireReason,setCompRequireReason]=useState(s.complementary_require_reason!=='0');
  const [compRoles,setCompRoles]=useState<string[]>(roles);
  const toggleType=(t:string)=>setTypes(xs=>xs.includes(t)?xs.filter(x=>x!==t):[...xs,t]);
  const toggleRole=(r:string)=>setCompRoles(xs=>xs.includes(r)?xs.filter(x=>x!==r):[...xs,r]);
  return <>
    <section className="settings-card" style={{marginTop:24}}>
      <div className="settings-card-head">
        <span className="settings-card-icon discount"><Percent size={22}/></span>
        <div><h2>Discount Settings</h2><p>Control how much staff can discount, where, and when it needs sign-off.</p></div>
      </div>
      <Form id="settings-form-discount">
        <input type="hidden" name="action" value="settings_save"/>
        <input type="hidden" name="group" value="discount"/>
        <div className="settings-section">
          <ToggleRow name="discount_enabled" title="Enable discounts" hint="Turn off to hide discounts everywhere on the order screen." checked={discountEnabled} onChange={setDiscountEnabled}/>
        </div>
        {discountEnabled&&<>
          <div className="settings-section">
            <p className="settings-section-title">Discount type</p>
            <div className="pill-select">
              <PillOption name="discount_allowed_types[]" value="PERCENT" checked={types.includes('PERCENT')} onChange={()=>toggleType('PERCENT')}><Percent size={14}/>Percentage (%)</PillOption>
              <PillOption name="discount_allowed_types[]" value="FIXED" checked={types.includes('FIXED')} onChange={()=>toggleType('FIXED')}><IndianRupee size={14}/>Fixed amount</PillOption>
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-section-title">Maximum discount</p>
            <div className="settings-field-grid">
              {types.includes('PERCENT')&&<label>Maximum percentage discount<div className="amount-field"><input name="discount_max_percent" type="number" min="0" max="100" step="0.01" defaultValue={s.discount_max_percent||'20'}/><span>%</span></div><small>Staff cannot apply more than this off an order or item.</small></label>}
              {types.includes('FIXED')&&<label>Maximum fixed discount<div className="amount-field prefix"><span>₹</span><input name="discount_max_fixed" type="number" min="0" step="0.01" defaultValue={s.discount_max_fixed||'500'}/></div><small>Staff cannot knock off more than this rupee amount.</small></label>}
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-section-title">Allow discount on</p>
            <div className="pill-select">
              <PillOption type="radio" name="discount_scope" value="ORDER" checked={scope==='ORDER'} onChange={()=>setScope('ORDER')}>Entire order</PillOption>
              <PillOption type="radio" name="discount_scope" value="ITEM" checked={scope==='ITEM'} onChange={()=>setScope('ITEM')}>Individual item</PillOption>
              <PillOption type="radio" name="discount_scope" value="BOTH" checked={scope==='BOTH'} onChange={()=>setScope('BOTH')}>Both</PillOption>
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-section-title"><ShieldCheck size={14}/>Require approval above</p>
            <div className="info-box"><Info size={15}/>A discount at or below this limit is applied immediately. Above it, the bill is held until an administrator or manager approves it.</div>
            <div className="settings-field-grid" style={{marginTop:14}}>
              {types.includes('PERCENT')&&<label>Approval required above<div className="amount-field"><input name="discount_approval_threshold_percent" type="number" min="0" max="100" step="0.01" defaultValue={s.discount_approval_threshold_percent||'10'}/><span>%</span></div></label>}
              <label>Or a fixed amount<div className="amount-field prefix"><span>₹</span><input name="discount_approval_threshold_fixed" type="number" min="0" step="0.01" defaultValue={s.discount_approval_threshold_fixed||''}/></div><small>Optional — leave blank to only gate on the percentage above.</small></label>
            </div>
          </div>
        </>}
      </Form>
      <div className="form-actions">
        <button type="submit" form="settings-form-discount" className="primary">Save changes</button>
        <Form onSubmit={(e:any)=>{if(!confirm('Reset Discount settings to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
          <input type="hidden" name="action" value="settings_reset"/>
          <input type="hidden" name="group" value="discount"/>
          <button type="submit" className="secondary">Reset to default settings</button>
        </Form>
      </div>
    </section>
    <section className="settings-card">
      <div className="settings-card-head">
        <span className="settings-card-icon complementary"><Gift size={22}/></span>
        <div><h2>Complimentary Settings</h2><p>Decide who can comp an item and what proof of reason is required.</p></div>
      </div>
      <Form id="settings-form-complementary">
        <input type="hidden" name="action" value="settings_save"/>
        <input type="hidden" name="group" value="discount"/>
        <div className="settings-section">
          <ToggleRow name="complementary_enabled" title="Enable complimentary" hint="Turn off to hide the complimentary option on the order screen." checked={compEnabled} onChange={setCompEnabled}/>
        </div>
        {compEnabled&&<>
          <div className="settings-section">
            <p className="settings-section-title">Who can mark an order complimentary?</p>
            <div className="pill-select">
              <PillOption name="complementary_roles[]" value="ADMIN" checked={compRoles.includes('ADMIN')} onChange={()=>toggleRole('ADMIN')}>Admin</PillOption>
              <PillOption name="complementary_roles[]" value="MANAGER" checked={compRoles.includes('MANAGER')} onChange={()=>toggleRole('MANAGER')}>Manager</PillOption>
              <PillOption name="complementary_roles[]" value="WAITER" checked={compRoles.includes('WAITER')} onChange={()=>toggleRole('WAITER')}>Waiter</PillOption>
            </div>
            <div className="info-box" style={{marginTop:12}}><Info size={15}/>Administrators can always mark items complimentary regardless of this setting.</div>
          </div>
          <div className="settings-section">
            <ToggleRow name="complementary_require_reason" title="Require a reason" hint="Staff must pick or type a reason before saving a complimentary item." checked={compRequireReason} onChange={setCompRequireReason}/>
            <p className="settings-section-title" style={{marginTop:18}}>Reason options offered on the order screen</p>
            <div className="reason-pills">{COMPLEMENTARY_REASONS.map(r=><span key={r}>{r}</span>)}</div>
            <small style={{color:'var(--text-muted)',fontWeight:500,display:'block',marginTop:8}}>Selecting "Other" lets staff type a custom reason.</small>
          </div>
        </>}
      </Form>
      <div className="form-actions">
        <button type="submit" form="settings-form-complementary" className="primary">Save changes</button>
        <Form onSubmit={(e:any)=>{if(!confirm('Reset Complimentary settings to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
          <input type="hidden" name="action" value="settings_reset"/>
          <input type="hidden" name="group" value="complementary"/>
          <button type="submit" className="secondary">Reset to default settings</button>
        </Form>
      </div>
    </section>
  </>;
}
function PermissionUserCard({u,catalog}:any){
  return <article className="permission-card">
    <div className="permission-card-head"><b>{u.display_name}</b><RoleChip role={u.role}/>{!Number(u.active)&&<span className="category-inactive-badge">Disabled</span>}</div>
    {u.role==='ADMIN'?<div className="info-box" style={{marginTop:12}}><ShieldCheck size={15}/>Administrators always have full access to every section — there's nothing to configure here.</div>:<>
      <Form id={`permissions-form-${u.id}`}>
        <input type="hidden" name="action" value="user_permissions_save"/>
        <input type="hidden" name="user_id" value={u.id}/>
        <div className="permission-grid">
          {catalog.map((p:any)=><label className="check" key={p.code}><input type="checkbox" name="permissions[]" value={p.code} defaultChecked={u.permissions.includes(p.code)}/>{p.name}</label>)}
        </div>
      </Form>
      <div className="form-actions">
        <button type="submit" form={`permissions-form-${u.id}`} className="primary">Save permissions</button>
        <Form onSubmit={(e:any)=>{if(!confirm(`Reset "${u.display_name}"'s permissions to default (full access, same as admin)? This will overwrite their current permissions and cannot be undone.`))e.preventDefault()}}>
          <input type="hidden" name="action" value="user_permissions_save"/>
          <input type="hidden" name="user_id" value={u.id}/>
          {catalog.map((p:any)=><input type="hidden" name="permissions[]" value={p.code} key={p.code}/>)}
          <button type="submit" className="secondary">Reset to default settings</button>
        </Form>
      </div>
    </>}
  </article>;
}
function UserAccessTab({permissionUsers,permissionCatalog}:any){
  return <section className="surface form-panel">
    <h2>User Access Settings</h2>
    <p className="muted">New staff get full access by default, same as admin — uncheck a section below to restrict a specific manager or waiter. Every user added on the Users page appears here automatically.</p>
    <div className="permission-users">
      {permissionUsers.length?permissionUsers.map((u:any)=><PermissionUserCard u={u} catalog={permissionCatalog} key={u.id}/>):<p className="muted empty-state">No users yet.</p>}
    </div>
  </section>;
}
function SystemSettingsTab({s}:any){
  const [confirmCancelOrder,setConfirmCancelOrder]=useState(s.confirm_cancel_order!=='0');
  const [confirmCancelBill,setConfirmCancelBill]=useState(s.confirm_cancel_bill!=='0');
  const [confirmDisableUser,setConfirmDisableUser]=useState(s.confirm_disable_user!=='0');
  return <section className="settings-card" style={{marginTop:24}}>
    <div className="settings-card-head">
      <span className="settings-card-icon system"><Settings size={22}/></span>
      <div><h2>System Preferences</h2><p>Default statuses and confirmation prompts used across the app.</p></div>
    </div>
    <div className="settings-section">
      <p className="settings-section-title">Defaults</p>
      <div className="settings-field-grid">
        <label>Default order status<input value="New" disabled/><small>New orders always start as "New" until items are added.</small></label>
        <label>Default table status<select form="system-prefs-form" name="default_table_status" defaultValue={s.default_table_status||'AVAILABLE'}><option value="AVAILABLE">Available</option><option value="RESERVED">Reserved</option></select><small>Status a newly added table starts in.</small></label>
      </div>
    </div>
    <Form id="system-prefs-form">
      <input type="hidden" name="action" value="settings_save"/>
      <input type="hidden" name="group" value="system"/>
      <div className="settings-section" style={{marginTop:26,paddingTop:22,borderTop:'1px solid var(--border)'}}>
        <p className="settings-section-title">Confirmation prompts</p>
        <div style={{display:'grid',gap:12}}>
          <ToggleRow name="confirm_cancel_order" title="Confirm before cancelling an order" hint="Shows a confirmation dialog before an order is cancelled." checked={confirmCancelOrder} onChange={setConfirmCancelOrder}/>
          <ToggleRow name="confirm_cancel_bill" title="Confirm before cancelling a bill" hint="Shows a confirmation dialog before a paid bill is cancelled." checked={confirmCancelBill} onChange={setConfirmCancelBill}/>
          <ToggleRow name="confirm_disable_user" title="Confirm before disabling a user" hint="Shows a confirmation dialog before deactivating a staff account." checked={confirmDisableUser} onChange={setConfirmDisableUser}/>
        </div>
      </div>
    </Form>
    <div className="form-actions">
      <button type="submit" form="system-prefs-form" className="primary">Save changes</button>
      <Form onSubmit={(e:any)=>{if(!confirm('Reset System Preferences to their default values? This will overwrite the current settings and cannot be undone.'))e.preventDefault()}}>
        <input type="hidden" name="action" value="settings_reset"/>
        <input type="hidden" name="group" value="system"/>
        <button type="submit" className="secondary">Reset to default settings</button>
      </Form>
    </div>
  </section>;
}
function SettingsPage(){
  const d=boot.data;const s=d.settings||{};
  const isAdmin=boot.user.role==='ADMIN';
  // Business-configuration tabs require the 'settings' permission (same
  // check settings_save/settings_reset already enforce server-side); My
  // Profile never does. A user without it is pinned to 'profile' even if
  // the URL asks for another tab directly (?tab=business), so this is
  // enforced regardless of how the tab param got there, not just by
  // hiding the chip.
  const canManageSettings=isAdmin||(boot.user.permissions||[]).includes('settings');
  const [tab,setTab]=useState<string>(()=>new URLSearchParams(location.search).get('tab')||(canManageSettings?'business':'profile'));
  const activeTab=!canManageSettings?'profile':(tab==='access'&&!isAdmin?'business':tab);
  const changeTab=(t:string)=>{setTab(t);const url=new URL(location.href);url.searchParams.set('tab',t);history.replaceState(null,'',url.toString())};
  return <>
    <h2 className="page-heading">SETTINGS</h2>
    <SettingsTabs tab={activeTab} onChange={changeTab} isAdmin={isAdmin} canManageSettings={canManageSettings}/>
    {activeTab==='profile'&&<ProfileSettingsTab u={boot.user}/>}
    {activeTab==='business'&&<BusinessSettingsTab s={s}/>}
    {activeTab==='order'&&<OrderSettingsTab s={s}/>}
    {activeTab==='billing'&&<BillingSettingsTab s={s}/>}
    {activeTab==='discount'&&<DiscountComplimentarySettingsTab s={s}/>}
    {activeTab==='printer'&&<PrinterSettingsTab s={s}/>}
    {activeTab==='access'&&<UserAccessTab permissionUsers={d.permissionUsers||[]} permissionCatalog={d.permissionCatalog||[]}/>}
    {activeTab==='system'&&<SystemSettingsTab s={s}/>}
  </>;
}
const MODULE_BY_PAGE:Record<string,any>={dashboard:Dashboard,tables:Tables,parcels:Tables,order:Order,orders:OrdersPage,menu:Menu,categories:Categories,users:UsersPage,reports:Reports,audits:SimpleRecords,settings:SettingsPage,bills:BillsPage,cancelled:CancelledBillsPage,modified:ModifiedBillsPage};
// The one persistent root for the whole authenticated document: Shell (and
// everything in it — sidebar, logo, topbar, fullscreen button, account
// menu) is mounted exactly once here and never again for the life of the
// page. Module navigation only ever swaps which component renders as
// Shell's children (see clientNavigate/MODULE_BY_PAGE above), so it's a
// plain React re-render, never a remount of the shell itself and never a
// real document navigation — which is what lets Fullscreen API state
// (tied to the document) survive switching modules.
function AuthenticatedApp(){
  const [,setTick]=useState(0);
  const [navLoading,setNavLoading]=useState(false);
  const [navError,setNavError]=useState<string|null>(null);
  useEffect(()=>{
    notifyNav=(loading:boolean,error:string|null)=>{setNavLoading(loading);setNavError(error)};
    notifyBootChanged=()=>setTick(t=>t+1);
    const onPopState=()=>clientNavigate(location.pathname+location.search,undefined,false);
    window.addEventListener('popstate',onPopState);
    return()=>{notifyNav=null;notifyBootChanged=null;window.removeEventListener('popstate',onPopState)};
  },[]);
  const Module=MODULE_BY_PAGE[boot.page]||ListPage;
  return <Shell navLoading={navLoading} navError={navError} onRetry={()=>clientNavigate(lastNavUrl,undefined,false)}><Module/></Shell>;
}
if(boot){
  createRoot(document.getElementById('root')!).render(<><AuthenticatedApp/><InstallBanner/></>);
}else{
  const pwaRoot=document.getElementById('pwa-install-root');
  if(pwaRoot)createRoot(pwaRoot).render(<InstallBanner/>);
}
