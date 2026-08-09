const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('shitiSync',{getInfo:()=>ipcRenderer.invoke('shiti-sync-info')});
