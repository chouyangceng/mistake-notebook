const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shitiSync", {
  getInfo: () => ipcRenderer.invoke("shiti-sync-info"),
  generateExam: (payload) => ipcRenderer.invoke("shiti-generate-exam", payload),
  getExamHistory: () => ipcRenderer.invoke("shiti-exam-history"),
  openExamFile: (filePath) =>
    ipcRenderer.invoke("shiti-open-exam-file", filePath),
});
