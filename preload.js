'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('brioAPI', {
  // Persistent storage (electron-store on disk)
  getStore:      (key)        => ipcRenderer.invoke('store:get', key),
  setStore:      (key, value) => ipcRenderer.invoke('store:set', key, value),

  // Steam API — proxied through main process to avoid CORS
  steamSearch:   (query)  => ipcRenderer.invoke('steam:search', query),
  steamDetails:  (appId)  => ipcRenderer.invoke('steam:appdetails', appId),

  // Game launch — steam:// URI or executable
  launchGame:    (game)   => ipcRenderer.invoke('game:launch', game),

  // Native file dialogs
  pickImage:     ()       => ipcRenderer.invoke('dialog:pick-image'),
  pickExe:       ()       => ipcRenderer.invoke('dialog:pick-exe'),

  // Scan installed games (Steam + Epic manifests)
  scanGames:     ()           => ipcRenderer.invoke('games:scan'),

  // System auto-start
  getAutoStart:  ()           => ipcRenderer.invoke('autostart:get'),
  setAutoStart:  (enabled)    => ipcRenderer.invoke('autostart:set', enabled),

  // Window controls
  winMinimize:   ()           => ipcRenderer.invoke('win:minimize'),
  winMaximize:   ()           => ipcRenderer.invoke('win:maximize'),
  winClose:      ()           => ipcRenderer.invoke('win:close'),

  // Auto-updater events
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', cb),
  onUpdateReady:     (cb) => ipcRenderer.on('update:ready',     cb),

  // Open URL in default browser
  openUrl:       (url)              => ipcRenderer.invoke('shell:openUrl', url),
  // Epic free games
  fetchEpicFree: ()                 => ipcRenderer.invoke('free:epic'),
  // Steam specials
  fetchSteamFree: ()                => ipcRenderer.invoke('free:steam'),
  // Public holidays
  fetchHolidays: (countryCode, yr)  => ipcRenderer.invoke('holidays:fetch', countryCode, yr),
})
