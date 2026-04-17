const { contextBridge, ipcRenderer } = require('electron');

// Basic bridge for communication if needed in the future
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
