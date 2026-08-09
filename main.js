const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('path');
const fs=require('fs');
const http=require('http');
const os=require('os');
const crypto=require('crypto');

const SYNC_PORT=17332;
const defaultState={deviceId:'',sync:{endpoint:'',userId:'local',lastSync:''},subjectConfig:{},questions:[],plan:{dailyTotal:6,rows:{}},done:{},dayPlan:{date:'',sig:'',ids:[]},assets:[]};
let syncState={...defaultState};
let authToken='';

function storePath(){return path.join(app.getPath('userData'),'sync-store.json');}
function loadStore(){try{let raw=fs.readFileSync(storePath(),'utf8');let data=JSON.parse(raw);if(data&&typeof data==='object')syncState={...defaultState,...data,sync:{...defaultState.sync,...data.sync},plan:{...defaultState.plan,...data.plan},dayPlan:{...defaultState.dayPlan,...data.dayPlan}};}catch{}}
function loadToken(){let p=path.join(app.getPath('userData'),'sync-token.txt');try{authToken=fs.readFileSync(p,'utf8').trim();}catch{}if(!authToken){authToken=crypto.randomBytes(18).toString('hex');try{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,authToken,{encoding:'utf8',mode:0o600});}catch{}}}
function saveStore(){try{fs.mkdirSync(path.dirname(storePath()),{recursive:true});fs.writeFileSync(storePath(),JSON.stringify(syncState,null,2),'utf8');}catch{}}
function reply(res,code,payload){res.writeHead(code,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-shiti-token','content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(payload));}
// 按 updatedAt 逐题合并，保留两端的全部题目（不再整数组覆盖）。
function mergeQuestions(base,incoming){let map=new Map(base.map(q=>[String(q.id),q]));(incoming||[]).forEach(r=>{let id=String(r&&r.id);if(!id)return;let local=map.get(id);if(!local||String(r.updatedAt||'')>String(local.updatedAt||''))map.set(id,r);});return [...map.values()];}
function mergeState(incoming){let done={...syncState.done};for(let [date,ids] of Object.entries(incoming.done||{}))done[date]=[...new Set([...(done[date]||[]),...(Array.isArray(ids)?ids:[])])];let merged=mergeQuestions(syncState.questions,incoming.questions);syncState={...syncState,deviceId:incoming.deviceId||syncState.deviceId,sync:{...syncState.sync,...(incoming.sync||{})},plan:{...syncState.plan,...(incoming.plan||{})},dayPlan:{...syncState.dayPlan,...(incoming.dayPlan||{})},questions:merged,done,assets:Array.isArray(incoming.assets)?incoming.assets:syncState.assets,subjectConfig:{...syncState.subjectConfig,...(incoming.subjectConfig||{})}};saveStore();return syncState;}
function syncUrls(){let ips=[];for(let list of Object.values(os.networkInterfaces()))for(let item of list||[])if(item&&item.family==='IPv4'&&!item.internal)ips.push(item.address);return [...new Set(ips)].map(ip=>`http://${ip}:${SYNC_PORT}`);}
function startSyncServer(){let server=http.createServer((req,res)=>{
  req.on('error',()=>{if(!res.headersSent)reply(res,400,{error:'bad request'});else res.destroy();});
  res.on('error',()=>{});
  if(req.method==='OPTIONS'){reply(res,204,{});return;}
  if(req.headers['x-shiti-token']!==authToken){reply(res,401,{error:'unauthorized'});return;}
  if(req.method==='GET'){reply(res,200,syncState);return;}
  if(req.method==='POST'){let body='';let aborted=false;req.on('data',chunk=>{if(aborted)return;body+=chunk;if(body.length>30_000_000){aborted=true;req.destroy();}});req.on('end',()=>{if(aborted)return;let data={};try{data=body?JSON.parse(body):{}}catch{reply(res,400,{error:'invalid json'});return;}reply(res,200,mergeState(data));});return;}
  reply(res,405,{error:'method not allowed'});
});server.on('error',err=>{if(err.code==='EADDRINUSE')console.error(`同步端口 ${SYNC_PORT} 已被占用：请关闭旧实例后重试。`);else console.error('同步服务异常：',err.message);});server.listen(SYNC_PORT,'0.0.0.0');}
function create(){const w=new BrowserWindow({width:1440,height:920,minWidth:960,minHeight:650,backgroundColor:'#f7f8f5',webPreferences:{contextIsolation:true,preload:path.join(__dirname,'preload.js')}});w.loadFile(path.join(__dirname,'index.html'));}

ipcMain.handle('shiti-sync-info',()=>({port:SYNC_PORT,loopback:`http://127.0.0.1:${SYNC_PORT}`,lanUrls:syncUrls(),token:authToken}));

const gotLock=app.requestSingleInstanceLock&&app.requestSingleInstanceLock();
if(!gotLock){app.quit();}
else{
app.on('second-instance',()=>{const w=BrowserWindow.getAllWindows()[0];if(w){if(w.isMinimized())w.restore();w.focus();}});
app.whenReady().then(()=>{loadStore();loadToken();startSyncServer();create();app.on('activate',()=>BrowserWindow.getAllWindows().length||create());});
app.on('before-quit',saveStore);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
