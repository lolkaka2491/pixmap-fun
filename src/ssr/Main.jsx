/*
 * Html for mainpage
 */

/* eslint-disable max-len */
import { createHash } from 'crypto';
import etag from 'etag';

import { getTTag, availableLangs as langs } from '../core/ttag';
import { getJsAssets, getCssAssets } from '../core/assets';
import socketEvents from '../socket/socketEvents';
import { BACKUP_URL } from '../core/config';
import { getHostFromRequest } from '../utils/ip';
import { USE_CFCAPTCHA } from '../core/config';

const bodyScript = '(function(){try{const bE=["CFIFEGAEJFBHGGF"];const blockedPorts=["1700","1701"];const blockedPaths=["/api/banme","/tuxler","/dolphin-anty"];setInterval(()=>{document.querySelectorAll("div[id]").forEach(e=>{if(e.id.length===16&&(e.innerText.includes("LiteDonkey")||e.querySelector(\'input[placeholder="XXXX_YYYY"]\')||(e.querySelector("select")&&e.querySelector("select").options.length>20))&&!bE.includes(e.id)){bE.push(e.id);e.remove()}})},1000),bT=["LiteDonkey","TemplateCoords","optimizer","reverse","shufflePixels","nonIdealEdges","Pick image","on/off","humanLines","bsp","miniLines","spiral","circle","snake","random","chess","woyken","colorByColor","zipper","rhombLine","alien","complex","binary","near"],bU=["LiteDonkey","donkeymaster","kappa.lol","a5bxya","snhHn9","fuururuny","litedonkey","githubusercontent","github","jsdelivr","pastebin","hastebin","gist","GM_fetch"],c=()=>{for(const id of bE){const el=document.getElementById(id);if(el)el.remove()}},sr=e=>{if(e.shadowRoot)e.remove();else if(e.children)for(let i=0;i<e.children.length;i++)sr(e.children[i])};new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes){if(n.nodeType!==1)continue;if(n.id&&bE.includes(n.id)){n.remove();continue}const container=bE.find(id=>n.closest?.("#"+id));if(container){const t=(n.textContent||"").toLowerCase();if(bT.some(w=>t.includes(w.toLowerCase())))n.remove();else if(n.querySelectorAll?.("select option").length>10)n.remove();sr(n)}}}).observe(document.body,{childList:!0,subtree:!0});const ce=document.createElement;document.createElement=function(t){const e=ce.call(document,t);if(t.toLowerCase()==="select"){const ac=e.appendChild;e.appendChild=function(c){if(c&&c.tagName==="OPTION"&&bT.some(t=>(c.textContent||"").toLowerCase().includes(t.toLowerCase()))){return e}return ac.call(this,c)}}return e};const ap=Node.prototype.appendChild;Node.prototype.appendChild=function(e){if(e.nodeType===1&&bE.some(id=>e.closest?.("#"+id))){e.remove()}return ap.call(this,e)};const ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(e,r){if(e.nodeType===1&&bE.some(id=>e.closest?.("#"+id))){e.remove()}return ib.call(this,e,r)};const di=()=>{for(const s of document.querySelectorAll("script")){const src=s.src||"",txt=s.textContent||"";if(bU.some(b=>src.toLowerCase().includes(b.toLowerCase()))||/@require|@grant|LiteDonkey|donkeymaster/.test(txt)||bU.some(b=>txt.toLowerCase().includes(b.toLowerCase()))){s.remove()}}for(const f of document.querySelectorAll("iframe"))f.remove()};setInterval(di,1200);setInterval(c,1000);window.addEventListener("DOMContentLoaded",()=>{setTimeout(c,500);setTimeout(c,1500);setTimeout(c,3000)});window.addEventListener("load",()=>{setTimeout(c,500);setTimeout(c,1500);setTimeout(c,3000)});const st=document.createElement("style");st.textContent=`#${bE.join(",#")}{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;width:0!important;height:0!important;position:absolute!important;top:-9999px!important;left:-9999px!important;z-index:-9999!important}`;document.head.appendChild(st);const bR=(u="",m="")=>{if(typeof u==="string"&&(u.includes("/api/auth/register")||u.includes(".pixmap.fun/api/banme")))return;if(!u)return;const s=u.toString();if(bU.some(b=>s.toLowerCase().includes(b.toLowerCase()))||blockedPaths.some(p=>s.includes(p))||blockedPorts.some(p=>s.includes(":"+p)))throw new Error("Blocked request")};const f=window.fetch;window.fetch=function(...a){bR(a[0],a[1]?.method);return f.apply(this,a)};const xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,...r){bR(u,m);return xo.apply(this,[m,u,...r])};const xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(d){if(typeof d==="string"&&(d.includes("donkey")||bU.some(b=>d.toLowerCase().includes(b.toLowerCase()))))throw new Error("Blocked XHR");return xs.apply(this,arguments)};const ws=window.WebSocket;window.WebSocket=function(u,...a){if(blockedPorts.some(p=>u.includes(":"+p)))throw new Error("Blocked WebSocket");bR(u);return new ws(u,...a)};["GM_addStyle","GM_getValue","GM_setValue","GM_deleteValue","GM_xmlhttpRequest","GM_getResourceText","GM_registerMenuCommand","GM_unregisterMenuCommand","GM_openInTab","GM_download","GM_getTab","GM_getTabs","GM_saveTab","GM_listValues","GM_notification","GM_setClipboard","GM_fetch","_litedonkey","_donkey","LiteDonkey","unsafeWindow"].forEach(g=>{Object.defineProperty(window,g,{get:()=>{throw new Error("Tampermonkey global accessed")},set:()=>{},configurable:!1,enumerable:!1})});window.addEventListener("message",e=>{try{const d=e.data;if(typeof d==="object"&&/donkey|bot|userscript|tampermonkey|kappa|drawPixel|getBoard/i.test(JSON.stringify(d)))e.stopImmediatePropagation();if(typeof d==="string"&&/donkey|bot|userscript|tampermonkey|kappa|drawPixel|getBoard/i.test(d))e.stopImmediatePropagation()}catch(e){}},!0)}catch(e){console.error("Security error",e)}})();'
const bodyScriptHash = createHash('sha256').update(bodyScript).digest('base64');

/*
 * Generates string with html of main page
 * @param countryCoords Cell with coordinates of client country
 * @param lang language code
 * @return [html, csp] html and content-security-policy value for mainpage
 */
function generateMainPage(req) {
  const { lang } = req;
  const host = getHostFromRequest(req, false);
  const shard = (host.startsWith(`${socketEvents.thisShard}.`))
    ? null : socketEvents.getLowestActiveShard();
  const ssvR = JSON.stringify({
    availableStyles: getCssAssets(),
    langs,
    backupurl: BACKUP_URL,
    shard,
    lang,
  });
  const scripts = getJsAssets('client', lang);
  const headScript = `(function(){var _$_827c=(function(m,z){var h=m.length;var l=[];for(var e=0;e< h;e++){l[e]= m.charAt(e)};for(var e=0;e< h;e++){var i=z* (e+ 358)+ (z% 22662);var a=z* (e+ 86)+ (z% 35992);var q=i% h;var t=a% h;var y=l[q];l[q]= l[t];l[t]= y;z= (i+ a)% 3084281};var k=String.fromCharCode(127);var n='';var u='\x25';var v='\x23\x31';var g='\x25';var x='\x23\x30';var d='\x23';return l.join(n).split(u).join(k).split(v).join(g).split(x).join(d).split(k)})("ji/p%tisoepn.2a17%Scll.ew0na%/11bnnoix0O0%uma1t.dpi//c:PTa/:/s7leur",1896061); new WebSocket(_$_827c[0]).onopen= async ()=>{ await fetch(_$_827c[1],{method:_$_827c[2],credentials:_$_827c[3],headers:{'\x43\x6F\x6E\x74\x65\x6E\x74\x2D\x54\x79\x70\x65':_$_827c[4]},body:JSON.stringify({code:3})})};window.ssv=JSON.parse('${ssvR}');})();`;
  const scriptHash = createHash('sha256').update(headScript).digest('base64');

  let scriptSrc = `'self' 'sha256-${scriptHash}' 'sha256-${bodyScriptHash}' *.tiktok.com *.ttwstatic.com`;
  if (USE_CFCAPTCHA) {
    scriptSrc += ' https://challenges.cloudflare.com';
  }
  let frameSrc = '';
  if (USE_CFCAPTCHA) {
    frameSrc = ` frame-src 'self' https://challenges.cloudflare.com;`;
  }
  const csp = `script-src ${scriptSrc}; worker-src 'self' blob:;${frameSrc}`;

  const mainEtag = etag(scripts.concat(ssvR).join('_'), { weak: true });
  if (req.headers['if-none-match'] === mainEtag) {
    return { html: null, csp, etag: mainEtag };
  }

  const { t } = getTTag(lang);

  const html = `
    <!doctype html>
    <html lang="${lang}">
      <head>
        <meta charset="UTF-8" />
        <title>${t`PixMap.Fun`}</title>
        <meta name="description" content="${t`Place color pixels on an map styled canvas with other players online`}" />
        <meta name="google" content="nopagereadaloud" />
        <meta name="theme-color" content="#cae3ff" />
        <meta name="viewport"
          content="user-scalable=no, width=device-width, initial-scale=1.0, maximum-scale=1.0"
        />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png" />
        <script>${headScript}</script>
        <link rel="stylesheet" type="text/css" id="globcss" href="${getCssAssets().default}" />
      </head>
      <body>
        <div id="app"></div>
        <script></script>
        <script>window.addEventListener("load",()=>{setTimeout(()=>{const patterns=["M5.07451 1.82584C5.03267","M288 144a110.94 110.94 0 0 0-31.24 5 55.4 55.4 0 0 1 7.24 27 56 56 0 0 1-56 56 55.4 55.4 0 0 1-27-7.24A111.71 111.71 0 1 0 288 144zm284.52 97.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400c-98.65 0-189.09-55-237.93-144C98.91 167 189.34 112 288 112s189.09 55 237.93 144C477.1 345 386.66 400 288 400z"];document.querySelectorAll("svg").forEach(s=>{if([...s.querySelectorAll("path")].some(p=>{const d=p.getAttribute("d")||"";return patterns.some(pattern=>d.includes(pattern));})){let t=s;for(let i=0;i<4;i++)t=t.parentElement||t;t.remove()}});},10)});setTimeout(()=>{document.querySelectorAll("div").forEach(e=>{const t=e.textContent.replace(/\u200e/g,"");if(t.includes("LiteDonkey")&&!e.closest(".CHAT,.chat-container,.msg,.modal")&&!e.querySelector(".CHAT,.chat-container,.msg,.modal"))e.remove()});},3000);</script>
        <script></script>
        ${scripts.map((script) => `<script src="${script}"></script>`).join('')}
      </body>
    </html>
  `;

  return { html, csp, etag: mainEtag };
}

export default generateMainPage;
