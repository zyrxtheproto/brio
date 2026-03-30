'use strict'
const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, dialog, net } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')

const store = new Store()
let mainWindow, tray
let forceQuit = false

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // webSecurity stays true — Steam API calls go through main process
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('close', (e) => {
    if (!forceQuit && store.get('settings.minimizeToTray')) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdater.on('update-available',  () => mainWindow.webContents.send('update:available'))
    autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('update:ready'))
  }
}

function initTray() {
  const size = 32
  const buf  = Buffer.alloc(size * size * 4)
  const cx = size / 2, cy = size / 2, r = size / 2 - 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const d = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2)
      if (d <= r) { buf[i] = 0x4f; buf[i + 1] = 0x8e; buf[i + 2] = 0xf7; buf[i + 3] = 255 }
    }
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size })
  tray = new Tray(icon)
  tray.setToolTip('Brío')
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Brío', click: () => { mainWindow.show(); mainWindow.focus() } },
    { type: 'separator' },
    { label: 'Quit Brío', click: () => app.quit() },
  ]))
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  initTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { forceQuit = true })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── electron-store IPC ────────────────────────────────────────────────────────
ipcMain.handle('store:get', (_, key) => store.get(key))
ipcMain.handle('store:set', (_, key, value) => { store.set(key, value) })

// ── Steam API proxy (avoids CORS in renderer) ─────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(new Error('JSON parse error')) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

ipcMain.handle('steam:search', async (_, query) => {
  return fetchJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`
  )
})

ipcMain.handle('steam:appdetails', async (_, appId) => {
  return fetchJson(
    `https://store.steampowered.com/api/appdetails?appids=${appId}`
  )
})

// ── Game launch ───────────────────────────────────────────────────────────────
ipcMain.handle('game:launch', async (_, game) => {
  if (game.exePath) {
    const { spawn } = require('child_process')
    const args = game.launchArgs ? game.launchArgs.trim().split(/\s+/).filter(Boolean) : []
    try {
      spawn(game.exePath, args, { detached: true, stdio: 'ignore' }).unref()
      return { ok: true }
    } catch (e) {
      return { ok: false, err: e.message }
    }
  }
  if (game.steamId) {
    await shell.openExternal(`steam://rungameid/${game.steamId}`)
    return { ok: true }
  }
  return { ok: false, err: 'no_launch_target' }
})

// ── File dialogs ──────────────────────────────────────────────────────────────
ipcMain.handle('dialog:pick-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Cover Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:pick-exe', async () => {
  const filters =
    process.platform === 'win32'
      ? [{ name: 'Executables', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }]
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Executable',
    filters,
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── Game scanner ─────────────────────────────────────────────────────────────
function parseVdfFlat(content) {
  // Extracts all "key" "value" pairs from a Valve KeyValues file (flat pass)
  const map = {}
  for (const [, k, v] of content.matchAll(/"([^"]+)"\s+"([^"]+)"/g))
    map[k.toLowerCase()] = v
  return map
}

function findSteamLibraryPaths() {
  const roots = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(os.homedir(), 'Steam'),
  ]
  const found = new Set()

  for (const root of roots) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf')
    if (!fs.existsSync(vdf)) continue
    try {
      const content = fs.readFileSync(vdf, 'utf8')
      // Each library folder block contains a "path" key
      for (const [, p] of content.matchAll(/"path"\s+"([^"]+)"/gi))
        found.add(p.replace(/\\\\/g, '\\'))
    } catch { /* skip unreadable file */ }
    found.add(root)   // the root itself is always a library
  }
  return [...found]
}

function scanSteamGames() {
  const games = []
  const seen  = new Set()

  for (const lib of findSteamLibraryPaths()) {
    const appsDir = path.join(lib, 'steamapps')
    if (!fs.existsSync(appsDir)) continue
    let files
    try { files = fs.readdirSync(appsDir) } catch { continue }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
      try {
        const data = parseVdfFlat(fs.readFileSync(path.join(appsDir, file), 'utf8'))
        const { appid, name } = data
        if (!appid || !name || seen.has(appid)) continue
        seen.add(appid)
        games.push({
          id:         name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          name,
          steamId:    appid,
          platform:   'Steam',
          genre:      'Game',
          session:    'any',
          localImage: '',
          exePath:    '',
          tags:       [],
          score:      { chill: 60, focused: 60, hype: 60, social: 60, explore: 60 },
        })
      } catch { /* skip malformed acf */ }
    }
  }
  return games
}

function scanEpicGames() {
  const manifestDir = path.join('C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  const games = []
  if (!fs.existsSync(manifestDir)) return games

  let files
  try { files = fs.readdirSync(manifestDir).filter(f => f.endsWith('.item')) }
  catch { return games }

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'))
      const name = data.DisplayName
      if (!name || data.bIsApplication === false) continue
      const exeFull = data.InstallLocation && data.LaunchExecutable
        ? path.join(data.InstallLocation, data.LaunchExecutable)
        : ''
      games.push({
        id:         name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name,
        steamId:    '',
        platform:   'Epic',
        genre:      'Game',
        session:    'any',
        localImage: '',
        exePath:    exeFull && fs.existsSync(exeFull) ? exeFull : '',
        tags:       [],
        score:      { chill: 60, focused: 60, hype: 60, social: 60, explore: 60 },
      })
    } catch { /* skip malformed manifest */ }
  }
  return games
}

ipcMain.handle('games:scan', () => {
  return [...scanSteamGames(), ...scanEpicGames()]
})

// ── Open URL in browser ───────────────────────────────────────────────────────
ipcMain.handle('shell:openUrl', (_, url) => shell.openExternal(url))

// ── Epic free games promotions ────────────────────────────────────────────────
ipcMain.handle('free:epic', () =>
  fetchJson('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US')
)

// ── Steam featured specials (100%-off detection) ──────────────────────────────
ipcMain.handle('free:steam', () =>
  fetchJson('https://store.steampowered.com/api/featuredcategories/?cc=US&l=en')
)

// ── Public holidays by country (date.nager.at) ────────────────────────────────
ipcMain.handle('holidays:fetch', (_, countryCode, year) =>
  fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`)
)

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.handle('win:minimize', () => mainWindow.minimize())
ipcMain.handle('win:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('win:close', () => mainWindow.close())

// ── Auto-start ────────────────────────────────────────────────────────────────
ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('autostart:set', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
})
