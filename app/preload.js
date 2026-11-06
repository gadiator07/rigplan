const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rigplanApp', {
  isApp: true,
  share: {
    login: (user, password) => ipcRenderer.invoke('share:login', user, password),
    list: () => ipcRenderer.invoke('share:list'),
    cached: () => ipcRenderer.invoke('share:cached'),
    download: rid => ipcRenderer.invoke('share:download', rid),
  },
});
