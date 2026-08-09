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
function loadToken(){let p=path.join(app.getPath('userData'),'sync-token.txt');try{authToken=fs.readFileSync(p,'utf8').trim();}catch{}if(!authToken){authToken=crypto.randomBytes(18).toString('hex');try{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,authToken,'utf8');}catch{}}}
function saveStore(){try{fs.mkdirSync(path.dirname(storePath()),{recursive:true});fs.writeFileSync(storePath(),JSON.stringify(syncState,null,2),'utf8');}catch{}}
function reply(res,code,payload){res.writeHead(code,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-shiti-token','content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(payload));}
function mergeState(incoming){let done={...syncState.done};for(let [date,ids] of Object.entries(incoming.done||{}))done[date]=[...new Set([...(done[date]||[]),...(Array.isArray(ids)?ids:[])])];syncState={...syncState,...incoming,sync:{...syncState.sync,...(incoming.sync||{})},plan:{...syncState.plan,...(incoming.plan||{})},dayPlan:{...syncState.dayPlan,...(incoming.dayPlan||{})},questions:Array.isArray(incoming.questions)?incoming.questions:syncState.questions,done,assets:Array.isArray(incoming.assets)?incoming.assets:syncState.assets,subjectConfig:incoming.subjectConfig||syncState.subjectConfig};saveStore();return syncState;}
function syncUrls(){let ips=[];for(let list of Object.values(os.networkInterfaces()))for(let item of list||[])if(item&&item.family==='IPv4'&&!item.internal)ips.push(item.address);return [...new Set(ips)].map(ip=>`http://${ip}:${SYNC_PORT}`);}
function startSyncServer(){const server=http.createServer((req,res)=>{if(req.method==='OPTIONS'){reply(res,204,{});return;}if(req.headers['x-shiti-token']!==authToken){reply(res,401,{error:'unauthorized'});return;}if(req.method==='GET'){reply(res,200,syncState);return;}if(req.method==='POST'){let body='';req.on('data',chunk=>{body+=chunk;if(body.length>30_000_000)req.destroy();});req.on('end',()=>{let data={};try{data=body?JSON.parse(body):{}}catch{reply(res,400,{error:'invalid json'});return;}reply(res,200,mergeState(data));});return;}reply(res,405,{error:'method not allowed'});});server.listen(SYNC_PORT,'0.0.0.0');}
function create(){const w=new BrowserWindow({width:1440,height:920,minWidth:960,minHeight:650,backgroundColor:'#f7f8f5',webPreferences:{contextIsolation:true,preload:path.join(__dirname,'preload.js')}});w.loadFile(path.join(__dirname,'index.html'));}

ipcMain.handle('shiti-sync-info',()=>({port:SYNC_PORT,loopback:`http://127.0.0.1:${SYNC_PORT}`,lanUrls:syncUrls(),token:authToken}));

app.whenReady().then(()=>{loadStore();loadToken();startSyncServer();create();app.on('activate',()=>BrowserWindow.getAllWindows().length||create());});
app.on('before-quit',saveStore);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
