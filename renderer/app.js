'use strict'
// ── Image helpers ─────────────────────────────────────────────────────────────
const STEAM_IMG = id => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`
const STEAM_CAP = id => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_231x87.jpg`

function fileUrl(p) {
  if (!p) return ''
  const normalized = p.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

/** Best available image for a game. type: 'header' | 'cap' */
function gameImg(g, type = 'header') {
  if (g.localImage) return fileUrl(g.localImage)
  if (g.steamId)    return type === 'cap' ? STEAM_CAP(g.steamId) : STEAM_IMG(g.steamId)
  return null
}

// ── Holidays (loaded from API or defaults) ────────────────────────────────────
let HOLIDAYS = [] // populated in init() from API or cache

const HOLIDAYS_DEFAULT = [
  { date: '2026-01-01', name: 'New Year\'s Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
]

const COUNTRIES = [
  {code:'AR',name:'Argentina'},{code:'AU',name:'Australia'},{code:'AT',name:'Austria'},
  {code:'BE',name:'Belgium'},{code:'BR',name:'Brazil'},{code:'CA',name:'Canada'},
  {code:'CL',name:'Chile'},{code:'CN',name:'China'},{code:'CO',name:'Colombia'},
  {code:'HR',name:'Croatia'},{code:'CZ',name:'Czech Republic'},{code:'DK',name:'Denmark'},
  {code:'FI',name:'Finland'},{code:'FR',name:'France'},{code:'DE',name:'Germany'},
  {code:'GR',name:'Greece'},{code:'HU',name:'Hungary'},{code:'IN',name:'India'},
  {code:'IE',name:'Ireland'},{code:'IL',name:'Israel'},{code:'IT',name:'Italy'},
  {code:'JP',name:'Japan'},{code:'MX',name:'Mexico'},{code:'NL',name:'Netherlands'},
  {code:'NZ',name:'New Zealand'},{code:'NO',name:'Norway'},{code:'PE',name:'Peru'},
  {code:'PL',name:'Poland'},{code:'PT',name:'Portugal'},{code:'RO',name:'Romania'},
  {code:'RU',name:'Russia'},{code:'ZA',name:'South Africa'},{code:'KR',name:'South Korea'},
  {code:'ES',name:'Spain'},{code:'SE',name:'Sweden'},{code:'CH',name:'Switzerland'},
  {code:'TR',name:'Turkey'},{code:'UA',name:'Ukraine'},{code:'GB',name:'United Kingdom'},
  {code:'US',name:'United States'},
]

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isHoliday(d)  { return HOLIDAYS.find(h => h.date === fmtDate(d)) || null }
function daysUntil(ds) { return Math.round((new Date(ds + 'T12:00:00') - new Date()) / 864e5) }
function nextHolidays() {
  const t = fmtDate(new Date())
  return HOLIDAYS.filter(h => h.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
}

// ── Default game library ──────────────────────────────────────────────────────
const GAMES_DEFAULT = [
  {
    id: 'minecraft', name: 'Minecraft', platform: 'Other', genre: 'Sandbox', session: 'any',
    steamId: '', localImage: '', exePath: '', launchArgs: '',
    tags: ['creative', 'open world', 'relaxing'],
    score: { chill: 95, explore: 90, social: 70, focused: 40, hype: 30 },
  },
  {
    // Epic-only install: no steamId. Set exePath in Manage to launch.
    id: 'rocketleague', name: 'Rocket League', platform: 'Epic', genre: 'Competitive', session: 'short',
    steamId: '', localImage: '', exePath: '', launchArgs: '',
    tags: ['fast', 'competitive', 'skill'],
    score: { hype: 95, focused: 85, chill: 30, social: 60, explore: 20 },
  },
  {
    id: 'amongus', name: 'Among Us', platform: 'Steam', genre: 'Social', session: 'short',
    steamId: '945360', localImage: '', exePath: '', launchArgs: '',
    tags: ['party', 'social', 'fun'],
    score: { social: 98, hype: 75, chill: 50, focused: 20, explore: 30 },
  },
  {
    id: 'cs2', name: 'CS2', platform: 'Steam', genre: 'FPS', session: 'medium',
    steamId: '730', localImage: '', exePath: '', launchArgs: '',
    tags: ['competitive', 'tactical', 'intense'],
    score: { hype: 90, focused: 92, social: 55, chill: 15, explore: 20 },
  },
  {
    // 668580 is Atomic Heart — wrong. Verify the correct App ID on Steam and set it in Manage.
    id: 'arcraiders', name: 'Arc Raiders', platform: 'Steam', genre: 'Extraction', session: 'long',
    steamId: '', localImage: '', exePath: '', launchArgs: '',
    tags: ['survival', 'team', 'tense'],
    score: { focused: 88, explore: 82, hype: 70, social: 50, chill: 20 },
  },
  {
    id: 'bloons', name: 'Bloons TD 6', platform: 'Steam', genre: 'Strategy', session: 'any',
    steamId: '960090', localImage: '', exePath: '', launchArgs: '',
    tags: ['casual', 'strategy', 'relaxing'],
    score: { chill: 88, focused: 80, hype: 40, social: 30, explore: 50 },
  },
  {
    id: 'vrchat', name: 'VRChat', platform: 'Steam', genre: 'Social', session: 'any',
    steamId: '438100', localImage: '', exePath: '', launchArgs: '',
    tags: ['virtual', 'social', 'creative'],
    score: { social: 95, explore: 85, chill: 70, hype: 50, focused: 20 },
  },
]

// ── In-memory state (hydrated from disk on init) ──────────────────────────────
let GAMES    = []
let SESSIONS = []
let SETTINGS = { minimizeToTray: false, accentColor: '#4f8ef7', startPage: 'discover', defaultMood: '', country: '', showHolidays: true, locationSetup: false, holidaysCache: null }

const ACCENT_COLORS = [
  '#4f8ef7', // blue (default)
  '#a78bfa', // purple
  '#34d399', // green
  '#fbbf24', // amber
  '#f87171', // red
  '#f472b6', // pink
]

function applyAccent(hex) {
  const r = parseInt(hex.slice(1,3), 16)
  const g = parseInt(hex.slice(3,5), 16)
  const b = parseInt(hex.slice(5,7), 16)
  document.documentElement.style.setProperty('--accent', hex)
  document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`)
}

function saveSettings() {
  window.brioAPI.setStore('settings', SETTINGS)
}

// ── Session helpers ───────────────────────────────────────────────────────────
function saveSessions(s) {
  SESSIONS = s
  window.brioAPI.setStore('sessions_v3', s)
}

function logSession(gameId, gameName, mood) {
  const s = [...SESSIONS]
  s.push({ gameId, gameName, mood, ts: Date.now(), dow: new Date().getDay(), hour: new Date().getHours() })
  if (s.length > 300) s.splice(0, s.length - 300)
  saveSessions(s)
}

function getFatigue() {
  const c = {}
  SESSIONS.filter(x => Date.now() - x.ts < 7 * 864e5).forEach(x => { c[x.gameId] = (c[x.gameId] || 0) + 1 })
  return c
}

function getStreaks() {
  const byDow = {}
  SESSIONS.forEach(x => {
    byDow[x.dow] = byDow[x.dow] || {}
    const sl = x.hour < 17 ? 'day' : 'evening'
    byDow[x.dow][sl] = (byDow[x.dow][sl] || 0) + 1
  })
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], res = []
  Object.keys(byDow).forEach(d =>
    Object.keys(byDow[d]).forEach(sl => {
      if (byDow[d][sl] >= 2) res.push({ day: days[d], slot: sl, count: byDow[d][sl] })
    })
  )
  return res.sort((a, b) => b.count - a.count).slice(0, 4)
}

function getHeatmap() {
  const g = {}
  SESSIONS.forEach(x => { const k = `${x.dow}-${Math.floor(x.hour/6)}`; g[k] = (g[k] || 0) + 1 })
  return g
}

function getMoodHist() {
  const c = {}
  SESSIONS.forEach(x => { if (x.mood) c[x.mood] = (c[x.mood] || 0) + 1 })
  return c
}

// ── Game persistence ──────────────────────────────────────────────────────────
function saveGames() {
  window.brioAPI.setStore('games_v3', GAMES)
}

// ── Context helpers ───────────────────────────────────────────────────────────
function getCtx() {
  const now = new Date(), h = now.getHours(), day = now.getDay()
  const isWeekend = day === 0 || day === 6, hol = isHoliday(now), isFreeDay = isWeekend || !!hol
  const tom = new Date(now); tom.setDate(tom.getDate() + 1)
  const holTom = isHoliday(tom), freeTom = tom.getDay() === 0 || tom.getDay() === 6 || !!holTom
  let period, session
  if      (h >= 6  && h < 12) { period = 'Morning';    session = '30–60min' }
  else if (h >= 12 && h < 17) { period = 'Afternoon';  session = '1–2h' }
  else if (h >= 17 && h < 22) { period = 'Evening';    session = '1–2h' }
  else                         { period = 'Late night'; session = '~30min' }
  return { h, day, period, isWeekend, isFreeDay, hol, freeTom, holTom, session, now }
}

function getAutoMood() {
  const { period, isFreeDay } = getCtx()
  if (period === 'Morning')                    return 'chill'
  if (period === 'Afternoon' && isFreeDay)     return 'explore'
  if (period === 'Afternoon')                  return 'focused'
  return 'hype'
}

function rankGames(mood) {
  const ctx = getCtx(), fat = getFatigue()
  return [...GAMES].sort((a, b) => {
    let sa = a.score[mood] || 0, sb = b.score[mood] || 0
    if (ctx.isFreeDay) { sa *= a.session === 'long' ? 1.12 : 1; sb *= b.session === 'long' ? 1.12 : 1 }
    if (ctx.period === 'Morning' || ctx.period === 'Late night') {
      sa *= (a.session === 'short' || a.session === 'any') ? 1.1 : .85
      sb *= (b.session === 'short' || b.session === 'any') ? 1.1 : .85
    }
    const fa = fat[a.id] || 0, fb = fat[b.id] || 0
    if (fa >= 3) sa *= Math.max(.4, 1 - fa * .12)
    if (fb >= 3) sb *= Math.max(.4, 1 - fb * .12)
    return sb - sa
  })
}

function moodReason(g, mood, ctx) {
  const fat = getFatigue(), fc = fat[g.id] || 0
  if (fc >= 4) return `You've launched ${g.name} ${fc}x this week — still a strong match, but maybe mix it up?`
  const R = {
    chill:   { minecraft: 'Low-pressure building. Perfect for zoning out and relaxing.', bloons: 'Light strategy, zero stress. A great pick for unwinding.', vrchat: 'Wander worlds or just vibe somewhere quiet.' },
    hype:    { rocketleague: `${ctx.isFreeDay ? 'Free day energy' : 'Post-grind adrenaline'} — Rocket League delivers instant action.`, cs2: 'Time to frag. Get your warmup in and climb the ladder.', amongus: 'Get the squad together. Maximum chaos incoming.' },
    focused: { cs2: 'Peak tactical mode. Time to focus and rank up.', arcraiders: 'Rewards patience and map knowledge. Great session ahead.', bloons: "Grind those harder maps you've been putting off." },
    social:  { amongus: 'Built for social mode. Get a lobby going right now.', vrchat: 'Best virtual hangout. Explore worlds with friends.', rocketleague: 'Queue with friends — 2v2 or 3v3 hits different.' },
    explore: { minecraft: "New world or new modpack — just go see what's out there.", arcraiders: 'Big map, lots to discover. Take your time.', vrchat: 'Hundreds of worlds waiting. Pick a random one.' },
  }
  const base = R[mood] && R[mood][g.id]
  let reason = base || `${g.name} is a solid ${mood} pick${ctx.isFreeDay ? ' on this free day' : ''}.`
  if (ctx.hol)                      reason += ` Today is ${ctx.hol.name} — enjoy the free day!`
  else if (ctx.freeTom && ctx.holTom) reason += ` Tomorrow is ${ctx.holTom.name} — no need to hold back on session length.`
  return reason
}

// ── Discover page ─────────────────────────────────────────────────────────────
let currentMood = null, skipped = []

function setMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  currentMood = btn.dataset.mood
  skipped = []
  renderDiscover()
}

function renderDiscover() {
  if (!GAMES.length) return
  const mood = currentMood || getAutoMood(), ctx = getCtx(), fat = getFatigue()
  const ranked = rankGames(mood).filter(g => !skipped.includes(g.id))
  if (!ranked.length) { skipped = []; renderDiscover(); return }

  const hero = ranked[0], fc = fat[hero.id] || 0
  document.getElementById('hero-badge').textContent = `Best match · ${mood} mode`
  document.getElementById('hero-name').textContent  = hero.name
  document.getElementById('hero-reason').textContent = moodReason(hero, mood, ctx)

  const tagsEl = document.getElementById('hero-tags')
  tagsEl.innerHTML = hero.tags.map(t => `<span class="htag">${t}</span>`).join('')
  if (fc >= 3) tagsEl.innerHTML += `<span class="htag warn">${fc}x this week</span>`

  // Background art
  const bg  = document.getElementById('hero-bg')
  const img = gameImg(hero, 'header')
  if (img) { bg.style.backgroundImage = `url(${img})`; bg.style.opacity = '.22' }
  else     bg.style.opacity = '0'

  document.getElementById('fatigue-badge').style.display = fc >= 4 ? 'inline-block' : 'none'

  // Up-next mini cards
  const mini = document.getElementById('mini-list'); mini.innerHTML = ''
  ranked.slice(1, 5).forEach(g => {
    const pct = Math.round(g.score[mood] || 0), gfc = fat[g.id] || 0
    const capImg = gameImg(g, 'cap'), headerImg = gameImg(g, 'header')
    const d = document.createElement('div'); d.className = 'mini-card'
    if (headerImg) d.innerHTML += `<div class="mini-bg" style="background-image:url(${headerImg})"></div>`
    if (capImg)    d.innerHTML += `<img class="mini-thumb" src="${capImg}" onerror="this.style.display='none'">`
    else           d.innerHTML += `<div class="mini-thumb" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--muted)">${g.name[0]}</div>`
    d.innerHTML += `<div class="mini-info"><div class="mini-name">${g.name}</div><div class="mini-sub">${g.genre} · ${g.platform}${gfc >= 3 ? `<span class="mini-fatigue">${gfc}x this week</span>` : ''}</div></div><div class="mini-pct">${pct}%</div>`
    d.onclick = () => {
      skipped = skipped.filter(x => x !== g.id)
      const idx = ranked.indexOf(g)
      for (let i = 0; i < idx; i++) if (!skipped.includes(ranked[i].id)) skipped.push(ranked[i].id)
      renderDiscover()
    }
    mini.appendChild(d)
  })

  renderDiscoverInsights(ctx, fat)
}

function renderDiscoverInsights(ctx, fat) {
  const row = document.getElementById('discover-insights'); row.innerHTML = ''
  const cards = []
  if (SETTINGS.showHolidays !== false) {
    if (ctx.hol)                        cards.push({ icon: '🎉', cls: 'purple', text: `Today is <strong>${ctx.hol.name}</strong> — free day! Longer sessions boosted.` })
    else if (ctx.freeTom && ctx.holTom) cards.push({ icon: '🗓', cls: 'blue',   text: `Tomorrow is <strong>${ctx.holTom.name}</strong> — go late if you want.` })
    else if (ctx.isWeekend)             cards.push({ icon: '🗓', cls: 'blue',   text: `Weekend — longer games ranked higher today.` })
  }
  const streaks = getStreaks(), days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], today = days[ctx.day]
  const ts = streaks.find(s => s.day === today)
  if (ts) cards.push({ icon: '🔥', cls: 'amber', text: `You usually play <strong>${today} ${ts.slot}s</strong> — your streak window!` })
  const hf = Object.entries(fat).filter(([, v]) => v >= 4)
  if (hf.length) {
    const gn = hf.map(([id]) => GAMES.find(g => g.id === id)?.name || id).join(', ')
    cards.push({ icon: '⚠', cls: 'amber', text: `Fatigue on <strong>${gn}</strong> — variety suggested.` })
  }
  if (!cards.length) cards.push({ icon: '🎮', cls: 'blue', text: `<strong>${ctx.period}</strong> on a ${ctx.isWeekend ? 'weekend' : 'weekday'} — recommendations adjusted.` })
  cards.slice(0, 3).forEach(c => {
    const d = document.createElement('div'); d.className = 'insight-card'
    d.innerHTML = `<div class="insight-icon ${c.cls}">${c.icon}</div><div class="insight-text">${c.text}</div>`
    row.appendChild(d)
  })
}

function reroll() {
  const mood = currentMood || getAutoMood(), ranked = rankGames(mood).filter(g => !skipped.includes(g.id))
  if (ranked.length) skipped.push(ranked[0].id)
  renderDiscover()
}

async function doLaunch() {
  const name = document.getElementById('hero-name').textContent
  const mood = currentMood || getAutoMood()
  const g    = GAMES.find(x => x.name === name)
  if (!g) return

  const res = await window.brioAPI.launchGame(g)
  if (res.ok) {
    logSession(g.id, g.name, mood)
    toast(`Launching ${name}…`)
    setTimeout(() => renderDiscover(), 400)
  } else if (res.err === 'no_launch_target') {
    toast(`Set an exe path for ${name} in Manage`, true)
  } else {
    toast(`Launch failed: ${res.err}`, true)
  }
}

// ── Library page ──────────────────────────────────────────────────────────────
let libFilter = 'all'

function renderLibrary() {
  const q = (document.getElementById('lib-search').value || '').toLowerCase()
  const fat = getFatigue()
  const grid = document.getElementById('lib-grid'); grid.innerHTML = ''
  GAMES
    .filter(g => (libFilter === 'all' || g.platform === libFilter) && (!q || g.name.toLowerCase().includes(q)))
    .forEach(g => {
      const fc = fat[g.id] || 0, fp = Math.min(100, fc * 20)
      const d = document.createElement('div'); d.className = 'lib-card'
      const img = gameImg(g, 'header')
      if (img) d.innerHTML += `<img class="lib-img" src="${img}" onerror="this.outerHTML='<div class=lib-img-ph><span style=font-size:26px;color:var(--muted)>${g.name[0]}</span></div>'">`
      else     d.innerHTML += `<div class="lib-img-ph"><span style="font-size:26px;color:var(--muted)">${g.name[0]}</span></div>`
      d.innerHTML += `<span class="platform-badge">${g.platform}</span>`
      if (fp > 0) d.innerHTML += `<div class="fatigue-bar" style="width:${fp}%"></div>`
      d.innerHTML += `<div class="lib-body"><div class="lib-name">${g.name}</div><div class="lib-meta">${g.genre} · ${fc > 0 ? fc + 'x this week' : 'not played yet'}</div><div class="lib-tags">${g.tags.map(t => `<span class="ltag">${t}</span>`).join('')}</div></div>`
      const editBtn = document.createElement('button')
      editBtn.className = 'lib-edit-btn'
      editBtn.title = 'Configure game'
      editBtn.innerHTML = '⚙'
      editBtn.onclick = (e) => { e.stopPropagation(); openEditModal(g.id) }
      d.appendChild(editBtn)
      d.onclick = async () => {
        const res = await window.brioAPI.launchGame(g)
        if (res.ok) { logSession(g.id, g.name, currentMood || getAutoMood()); toast(`Launching ${g.name}…`) }
        else if (res.err === 'no_launch_target') toast(`Set an exe path for ${g.name} in Manage`, true)
        else toast(`Launch failed: ${res.err}`, true)
      }
      grid.appendChild(d)
    })
}

function setFilter(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  libFilter = btn.dataset.filter
  renderLibrary()
}

// ── Insights page ─────────────────────────────────────────────────────────────
function renderInsightsPage() {
  const grid = document.getElementById('insights-grid'); grid.innerHTML = ''
  const fat = getFatigue(), streaks = getStreaks(), mh = getMoodHist(), hmap = getHeatmap()
  const upcoming = nextHolidays()
  const tg = Object.entries(fat).sort((a, b) => b[1] - a[1])[0]
  const tm = Object.entries(mh).sort((a, b) => b[1] - a[1])[0]

  let h = `<div class="ins-block"><h3>Session stats</h3>`
  ;[
    ['Total launches',   SESSIONS.length || '—'],
    ['Unique games',     new Set(SESSIONS.map(s => s.gameId)).size || '—'],
    ['Most played (7d)', tg ? (GAMES.find(g => g.id === tg[0])?.name || tg[0]) + ` (${tg[1]}x)` : '—'],
    ['Favourite mood',   tm ? tm[0] : '—'],
  ].forEach(([k, v]) => { h += `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>` })

  h += `</div><div class="ins-block"><h3>Your patterns</h3>`
  if (streaks.length) streaks.forEach(s => { h += `<div class="streak-item"><div class="streak-dot"></div><span class="streak-text">${s.day} ${s.slot}s</span><span class="streak-count">${s.count}x</span></div>` })
  else h += `<div style="font-size:12px;color:var(--muted2);padding:10px 0">Launch some games to start detecting your play patterns.</div>`

  const countryLabel = SETTINGS.country
    ? (COUNTRIES.find(c => c.code === SETTINGS.country)?.name || SETTINGS.country)
    : 'Local'
  h += `</div><div class="ins-block"><h3>Upcoming free days · ${countryLabel}</h3>`
  upcoming.forEach(hd => {
    const d = daysUntil(hd.date)
    h += `<div class="holiday-row"><span class="holiday-date">${hd.date.slice(5).replace('-','/')}</span><span style="flex:1;color:var(--text)">${hd.name}</span>${d <= 3 ? `<span class="holiday-soon">in ${d}d</span>` : d <= 14 ? `<span style="font-size:10px;color:var(--muted2)">${d}d</span>` : ''}</div>`
  })

  h += `</div><div class="ins-block"><h3>Play heatmap</h3>`
  ;['Night','Morn','Aftn','Eve'].forEach((sl, si) => {
    h += `<div class="heatmap-row"><span class="heatmap-label">${sl}</span><div class="heatmap-cells">`
    ;[0,1,2,3,4,5,6].forEach(di => {
      const v = hmap[`${di}-${si}`] || 0
      const cls = v === 0 ? '' : v === 1 ? 'l1' : v <= 3 ? 'l2' : 'l3'
      h += `<div class="hcell ${cls}" title="${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][di]} ${sl}: ${v}"></div>`
    })
    h += '</div></div>'
  })
  h += `<div style="display:flex;gap:6px;align-items:center;margin-top:12px"><span style="font-size:10px;color:var(--muted)">less</span>${['','l1','l2','l3'].map(c => `<div class="hcell ${c}"></div>`).join('')}<span style="font-size:10px;color:var(--muted)">more</span></div></div>`
  grid.innerHTML = h
}

// ── Add Game — Steam name search ──────────────────────────────────────────────
let pendingSearch = null, searchMoods = ['chill', 'explore']
let pendingAppId  = null, appidMoods  = ['chill', 'explore']

async function searchByName() {
  const q = document.getElementById('search-name-inp').value.trim(); if (!q) return
  const btn = document.getElementById('btn-search-name')
  const st  = document.getElementById('search-status')
  const rl  = document.getElementById('search-results-list')
  btn.disabled = true; btn.textContent = 'Searching…'; st.textContent = ''
  rl.innerHTML = ''
  document.getElementById('search-preview').classList.remove('show')
  try {
    const data  = await window.brioAPI.steamSearch(q)
    const items = (data.items || []).slice(0, 5)
    if (!items.length) { st.textContent = 'No results found.'; st.className = 'status-msg status-err'; return }
    st.textContent = `${items.length} result${items.length > 1 ? 's' : ''} — pick one:`; st.className = 'status-msg status-ok'
    items.forEach(item => {
      const d = document.createElement('div')
      d.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);cursor:pointer;margin-bottom:5px;transition:border .15s'
      d.innerHTML = `<img src="${STEAM_IMG(item.id)}" style="width:64px;height:30px;border-radius:4px;object-fit:cover;background:var(--border)"><div><div style="font-family:Rajdhani,sans-serif;font-size:14px;font-weight:600">${item.name}</div><div style="font-size:10px;color:var(--muted2)">App ID: ${item.id}</div></div>`
      d.onmouseenter = () => d.style.borderColor = 'var(--border2)'
      d.onmouseleave = () => d.style.borderColor = 'var(--border)'
      d.onclick = () => {
        pendingSearch = buildSteamGame(item.name, String(item.id))
        rl.innerHTML = ''; st.textContent = ''
        document.getElementById('search-preview').classList.add('show')
        document.getElementById('preview-img').src  = STEAM_IMG(item.id)
        document.getElementById('preview-name').textContent = item.name
        document.getElementById('preview-sub').textContent  = `Steam · App ID ${item.id}`
        renderMoodChecks('preview-moods', searchMoods, m => { searchMoods = m; if (pendingSearch) updateScores(pendingSearch, m) })
        updateScores(pendingSearch, searchMoods)
      }
      rl.appendChild(d)
    })
  } catch (e) {
    st.textContent = 'Search failed — check your internet or try App ID.'; st.className = 'status-msg status-err'
  } finally {
    btn.disabled = false; btn.textContent = 'Search'
  }
}

function confirmAddSearch() {
  if (!pendingSearch) return
  if (GAMES.find(g => g.id === pendingSearch.id)) { toast('Already in library!'); return }
  GAMES.push(pendingSearch); saveGames(); renderLibrary(); renderDiscover(); renderManage()
  toast(`${pendingSearch.name} added!`)
  document.getElementById('search-preview').classList.remove('show')
  document.getElementById('search-name-inp').value = ''
  pendingSearch = null
}

// ── Add Game — Steam App ID ───────────────────────────────────────────────────
async function fetchByAppId() {
  const id = document.getElementById('appid-inp').value.trim(); if (!id) return
  const btn = document.getElementById('btn-appid')
  const st  = document.getElementById('appid-status')
  btn.disabled = true; btn.textContent = 'Fetching…'; st.textContent = ''
  document.getElementById('appid-preview').classList.remove('show')
  try {
    const data = await window.brioAPI.steamDetails(id)
    const info = data[id]
    if (!info || !info.success) { st.textContent = 'App ID not found.'; st.className = 'status-msg status-err'; return }
    const dd = info.data
    pendingAppId = buildSteamGame(
      dd.name, String(id),
      dd.genres ? dd.genres[0].description : 'Game',
      dd.categories ? dd.categories.slice(0, 3).map(c => c.description.toLowerCase()) : []
    )
    st.textContent = 'Found!'; st.className = 'status-msg status-ok'
    document.getElementById('appid-preview').classList.add('show')
    document.getElementById('appid-img').src  = STEAM_IMG(id)
    document.getElementById('appid-name').textContent = dd.name
    document.getElementById('appid-sub').textContent  = `${dd.genres ? dd.genres.map(g => g.description).join(', ') : 'Game'} · Steam`
    renderMoodChecks('appid-moods', appidMoods, m => { appidMoods = m; if (pendingAppId) updateScores(pendingAppId, m) })
    updateScores(pendingAppId, appidMoods)
  } catch (e) {
    st.textContent = 'Fetch failed — check the App ID and your connection.'; st.className = 'status-msg status-err'
  } finally {
    btn.disabled = false; btn.textContent = 'Fetch'
  }
}

function confirmAddAppId() {
  if (!pendingAppId) return
  if (GAMES.find(g => g.id === pendingAppId.id)) { toast('Already in library!'); return }
  GAMES.push(pendingAppId); saveGames(); renderLibrary(); renderDiscover(); renderManage()
  toast(`${pendingAppId.name} added!`)
  document.getElementById('appid-preview').classList.remove('show')
  document.getElementById('appid-inp').value = ''
  document.getElementById('appid-status').textContent = ''
  pendingAppId = null
}

// ── Add Game — custom / non-Steam ─────────────────────────────────────────────
let customMoods   = ['chill', 'explore']
let customExePath = ''
let customImgPath = ''

async function browseExe() {
  const p = await window.brioAPI.pickExe()
  if (p) { customExePath = p; document.getElementById('custom-exe-disp').value = p }
}

async function browseCustomImg() {
  const p = await window.brioAPI.pickImage()
  if (p) { customImgPath = p; document.getElementById('custom-img-disp').value = p }
}

function addCustomGame() {
  const name = document.getElementById('custom-name-inp').value.trim()
  const st   = document.getElementById('custom-status')
  if (!name) { st.textContent = 'Enter a game name.'; st.className = 'status-msg status-err'; return }
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  if (GAMES.find(g => g.id === id)) { st.textContent = 'Already in library!'; st.className = 'status-msg status-err'; return }

  const platform = document.getElementById('custom-platform-sel').value
  const genre    = document.getElementById('custom-genre-inp').value.trim() || 'Game'
  const launchArgs = document.getElementById('custom-args-inp').value.trim()
  const scores   = { chill: 30, focused: 30, hype: 30, social: 30, explore: 30 }
  customMoods.forEach(m => { scores[m] = 85 })

  GAMES.push({
    id, name, platform, genre,
    session:    'any',
    steamId:    '',
    localImage: customImgPath,
    exePath:    customExePath,
    launchArgs,
    tags:       genre ? [genre.toLowerCase()] : [],
    score:      scores,
  })
  saveGames(); renderLibrary(); renderDiscover(); renderManage()
  toast(`${name} added!`)

  // Reset form
  document.getElementById('custom-name-inp').value = ''
  document.getElementById('custom-genre-inp').value = ''
  document.getElementById('custom-exe-disp').value  = ''
  document.getElementById('custom-args-inp').value  = ''
  document.getElementById('custom-img-disp').value  = ''
  customExePath = ''; customImgPath = ''; customMoods = ['chill', 'explore']
  renderMoodChecks('custom-moods', customMoods, m => { customMoods = m })
  st.textContent = ''; st.className = 'status-msg'
}

// ── Shared helpers for Add Game ───────────────────────────────────────────────
function buildSteamGame(name, steamId, genre = 'Game', tags = []) {
  return {
    id:         name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name, steamId, genre, tags,
    platform:   'Steam',
    session:    'any',
    localImage: '',
    exePath:    '',
    score:      { chill: 60, focused: 60, hype: 60, social: 60, explore: 60 },
  }
}

function updateScores(g, moods) {
  const b = { chill: 20, focused: 20, hype: 20, social: 20, explore: 20 }
  moods.forEach(m => { b[m] = 85 })
  g.score = b
}

function renderMoodChecks(elId, active, onChange) {
  const el = document.getElementById(elId); if (!el) return
  el.innerHTML = ''
  ;['chill','focused','hype','social','explore'].forEach(m => {
    const s = document.createElement('span')
    s.className = 'mcheck' + (active.includes(m) ? ' on' : '')
    s.textContent = m
    s.onclick = () => {
      let a = [...active]
      a.includes(m) ? a = a.filter(x => x !== m) : a.push(m)
      onChange(a)
      renderMoodChecks(elId, a, onChange)
    }
    el.appendChild(s)
  })
}

// ── Manage page ───────────────────────────────────────────────────────────────
function renderManage() {
  const ml = document.getElementById('manage-list')
  if (!ml) return
  ml.innerHTML = ''
  GAMES.forEach(g => {
    const row = document.createElement('div'); row.className = 'manage-item'
    const img = gameImg(g, 'cap')
    row.innerHTML += img
      ? `<img src="${img}" onerror="this.style.visibility='hidden'">`
      : `<div style="width:36px;height:17px;background:var(--border);border-radius:3px"></div>`
    const hasLaunch = !!(g.steamId || g.exePath)
    row.innerHTML += `<span class="manage-name">${g.name}${!hasLaunch ? ' <span style="color:var(--amber);font-size:10px">⚠ no launch</span>' : ''}</span>`
    row.innerHTML += `<span style="font-size:10px;color:var(--muted);margin-right:4px">${g.platform}</span>`
    const delBtn = document.createElement('button'); delBtn.className = 'btn-del'; delBtn.textContent = '×'
    delBtn.title = 'Remove from library'
    delBtn.onclick = () => { GAMES = GAMES.filter(x => x.id !== g.id); saveGames(); renderManage(); renderLibrary(); renderDiscover() }
    row.appendChild(delBtn)
    ml.appendChild(row)
  })
}

// ── Library card edit modal ───────────────────────────────────────────────────
let editingGameId = null

function openEditModal(gameId) {
  const g = GAMES.find(x => x.id === gameId)
  if (!g) return
  editingGameId = gameId
  document.getElementById('em-title').textContent = `Configure: ${g.name}`
  document.getElementById('em-exe').value     = g.exePath    || ''
  document.getElementById('em-steamid').value = g.steamId    || ''
  document.getElementById('em-args').value    = g.launchArgs || ''
  document.getElementById('em-img').value     = g.localImage || ''
  document.getElementById('em-status').textContent = ''
  document.getElementById('edit-modal').classList.add('show')
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('show')
  editingGameId = null
}

async function emBrowseExe() {
  const p = await window.brioAPI.pickExe()
  if (p) document.getElementById('em-exe').value = p
}

async function emBrowseImg() {
  const p = await window.brioAPI.pickImage()
  if (p) document.getElementById('em-img').value = p
}

function saveEditModal() {
  const idx = GAMES.findIndex(x => x.id === editingGameId)
  if (idx === -1) return
  GAMES[idx].exePath    = document.getElementById('em-exe').value.trim()
  GAMES[idx].steamId    = document.getElementById('em-steamid').value.trim()
  GAMES[idx].launchArgs = document.getElementById('em-args').value.trim()
  GAMES[idx].localImage = document.getElementById('em-img').value.trim()
  saveGames(); renderLibrary(); renderDiscover()
  document.getElementById('em-status').textContent = 'Saved!'
  document.getElementById('em-status').className = 'status-msg status-ok'
  setTimeout(closeEditModal, 800)
}

function deleteEditGame() {
  if (!editingGameId) return
  if (!confirm(`Remove this game from your library?`)) return
  GAMES = GAMES.filter(x => x.id !== editingGameId)
  saveGames(); renderLibrary(); renderDiscover(); renderManage()
  closeEditModal()
  toast('Game removed')
}

// ── Free Games page ───────────────────────────────────────────────────────────
function showFreeNotif()  { document.getElementById('free-notif-dot')?.classList.add('show') }
function clearFreeNotif() { document.getElementById('free-notif-dot')?.classList.remove('show') }

function parseEpicFree(data) {
  const now = Date.now()
  return (data?.data?.Catalog?.searchStore?.elements || []).filter(el => {
    const offers = el?.promotions?.promotionalOffers?.[0]?.promotionalOffers || []
    return offers.some(o => {
      const s = new Date(o.startDate).getTime(), e = new Date(o.endDate).getTime()
      return s <= now && now <= e && o.discountSetting?.discountPercentage === 0
    })
  })
}

function parseSteamFree(data) {
  return (data?.specials?.items || []).filter(g => g.final_price === 0 && g.original_price > 0)
}

async function checkForFreeGames() {
  try {
    const [epicData, steamData] = await Promise.all([
      window.brioAPI.fetchEpicFree(),
      window.brioAPI.fetchSteamFree(),
    ])
    if (parseEpicFree(epicData).length + parseSteamFree(steamData).length > 0) showFreeNotif()
  } catch { /* silent */ }
}

async function renderFreePage() {
  clearFreeNotif()

  // ── Epic section ──
  const epicGrid = document.getElementById('free-epic-grid')
  const epicSt   = document.getElementById('free-epic-status')
  epicGrid.innerHTML = ''; epicSt.textContent = 'Loading…'; epicSt.className = 'status-msg'

  // ── Steam section ──
  const steamGrid = document.getElementById('free-steam-grid')
  const steamSt   = document.getElementById('free-steam-status')
  steamGrid.innerHTML = ''; steamSt.textContent = 'Loading…'; steamSt.className = 'status-msg'

  // fetch both in parallel
  const [epicData, steamData] = await Promise.allSettled([
    window.brioAPI.fetchEpicFree(),
    window.brioAPI.fetchSteamFree(),
  ])

  // render Epic
  try {
    const free = parseEpicFree(epicData.value)
    if (!free.length) {
      epicSt.textContent = 'No free games on Epic right now. Check back soon!'; epicSt.className = 'status-msg'
    } else {
      epicSt.textContent = `${free.length} game${free.length > 1 ? 's' : ''} free on Epic:`; epicSt.className = 'status-msg status-ok'
      free.forEach(el => {
        const offer   = el.promotions.promotionalOffers[0].promotionalOffers[0]
        const endDate = new Date(offer.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric' })
        const img  = el.keyImages?.find(i => i.type === 'Thumbnail' || i.type === 'DieselGameBoxTall')?.url || ''
        const slug = el.catalogNs?.mappings?.[0]?.pageSlug || el.productSlug || el.urlSlug || ''
        const url  = slug ? `https://store.epicgames.com/p/${slug}` : 'https://store.epicgames.com/free-games'
        const d = document.createElement('div'); d.className = 'free-card'
        d.innerHTML = `<span class="free-badge">FREE until ${endDate}</span>
          ${img ? `<img class="lib-img" src="${img}" onerror="this.style.display='none'" alt="">` : `<div class="lib-img-ph"><span style="font-size:26px;color:var(--muted)">${el.title[0]}</span></div>`}
          <div class="lib-body"><div class="lib-name">${el.title}</div><div class="lib-meta">Epic Games · Free until ${endDate}</div></div>`
        d.onclick = () => window.brioAPI.openUrl(url)
        epicGrid.appendChild(d)
      })
    }
  } catch(e) { epicSt.textContent = `Could not load Epic games: ${e.message}`; epicSt.className = 'status-msg status-err' }

  // render Steam
  try {
    const free = parseSteamFree(steamData.value)
    if (!free.length) {
      steamSt.textContent = 'No Steam specials at 100% off right now.'; steamSt.className = 'status-msg'
    } else {
      steamSt.textContent = `${free.length} game${free.length > 1 ? 's' : ''} free on Steam:`; steamSt.className = 'status-msg status-ok'
      free.forEach(g => {
        const origPrice = `$${(g.original_price / 100).toFixed(2)}`
        const d = document.createElement('div'); d.className = 'free-card'
        d.innerHTML = `<span class="free-badge">FREE (was ${origPrice})</span>
          ${g.header_image ? `<img class="lib-img" src="${g.header_image}" onerror="this.style.display='none'" alt="">` : `<div class="lib-img-ph"><span style="font-size:26px;color:var(--muted)">${g.name[0]}</span></div>`}
          <div class="lib-body"><div class="lib-name">${g.name}</div><div class="lib-meta">Steam · Was ${origPrice}</div></div>`
        d.onclick = () => window.brioAPI.openUrl(`https://store.steampowered.com/app/${g.id}`)
        steamGrid.appendChild(d)
      })
    }
  } catch(e) { steamSt.textContent = `Could not load Steam specials: ${e.message}`; steamSt.className = 'status-msg status-err' }
}

// ── Welcome / location modal ──────────────────────────────────────────────────
function populateCountrySelects() {
  ;['welcome-country-sel', 'country-sel'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return
    const keep = sel.options[0]
    sel.innerHTML = ''
    sel.appendChild(keep)
    COUNTRIES.forEach(c => {
      const o = document.createElement('option'); o.value = c.code; o.textContent = c.name
      sel.appendChild(o)
    })
    sel.value = SETTINGS.country || ''
  })
}

function showWelcomeModal() {
  populateCountrySelects()
  document.getElementById('welcome-modal').classList.add('show')
}

function dismissWelcomeModal() {
  document.getElementById('welcome-modal').classList.remove('show')
  SETTINGS.locationSetup = true
  saveSettings()
}

async function confirmWelcomeLocation() {
  const sel = document.getElementById('welcome-country-sel')
  const cc  = sel?.value
  if (!cc) { toast('Please select a country first', true); return }
  SETTINGS.country = cc
  SETTINGS.locationSetup = true
  saveSettings()
  document.getElementById('welcome-modal').classList.remove('show')
  await refreshHolidays(cc)
  toast('Location set — holidays updated!')
}

async function refreshHolidays(countryCode) {
  try {
    const year = new Date().getFullYear()
    const [h1, h2] = await Promise.all([
      window.brioAPI.fetchHolidays(countryCode, year),
      window.brioAPI.fetchHolidays(countryCode, year + 1),
    ])
    const all = [...(Array.isArray(h1) ? h1 : []), ...(Array.isArray(h2) ? h2 : [])]
    HOLIDAYS = all.map(h => ({ date: h.date, name: h.localName || h.name }))
    SETTINGS.holidaysCache = HOLIDAYS
    saveSettings()
  } catch(e) {
    HOLIDAYS = HOLIDAYS_DEFAULT
  }
}

async function setCountry(cc) {
  SETTINGS.country = cc
  SETTINGS.holidaysCache = null
  saveSettings()
  if (cc) await refreshHolidays(cc)
  else HOLIDAYS = []
  toast(cc ? 'Country updated — holidays refreshed' : 'Country removed')
}

function setShowHolidays(val) {
  SETTINGS.showHolidays = val
  saveSettings()
  renderDiscover()
}

async function toggleAutoStart(enabled) {
  await window.brioAPI.setAutoStart(enabled)
  toast(enabled ? 'Auto-start enabled' : 'Auto-start disabled')
}

function setMinimizeToTray(enabled) {
  SETTINGS.minimizeToTray = enabled
  saveSettings()
  toast(enabled ? 'Close button minimizes to tray' : 'Close button quits the app')
}

function setAccentColor(hex) {
  SETTINGS.accentColor = hex
  applyAccent(hex)
  saveSettings()
  renderSettings()
}

function setStartPage(val) {
  SETTINGS.startPage = val
  saveSettings()
}

function setDefaultMood(val) {
  SETTINGS.defaultMood = val
  saveSettings()
}

function resetLibrary() {
  if (!confirm('Remove all games and session history? This cannot be undone.')) return
  GAMES = []; SESSIONS = []
  saveGames()
  window.brioAPI.setStore('sessions_v3', [])
  renderLibrary(); renderDiscover(); renderManage()
  toast('Library reset')
}

function renderSettings() {
  // Accent swatches
  const sw = document.getElementById('accent-swatches')
  if (sw) {
    sw.innerHTML = ''
    ACCENT_COLORS.forEach(hex => {
      const s = document.createElement('button')
      s.className = 'accent-swatch' + (SETTINGS.accentColor === hex ? ' active' : '')
      s.style.background = hex
      s.title = hex
      s.onclick = () => setAccentColor(hex)
      sw.appendChild(s)
    })
  }
  // Selects
  const sp = document.getElementById('start-page-sel')
  if (sp) sp.value = SETTINGS.startPage
  const dm = document.getElementById('default-mood-sel')
  if (dm) dm.value = SETTINGS.defaultMood
  // Tray toggle
  const tt = document.getElementById('tray-toggle')
  if (tt) tt.checked = SETTINGS.minimizeToTray
  // Country select
  populateCountrySelects()
  // Show-holidays toggle
  const sh = document.getElementById('show-holidays-toggle')
  if (sh) sh.checked = SETTINGS.showHolidays !== false
}

// ── Navigation ────────────────────────────────────────────────────────────────
let activePage = 'discover'

function goPage(id, btn) {
  const cur  = document.getElementById(`page-${activePage}`)
  const next = document.getElementById(`page-${id}`)
  if (!next || activePage === id) return
  cur.classList.add('exit')
  setTimeout(() => cur.classList.remove('active', 'exit'), 280)
  next.classList.add('active')
  activePage = id
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
  if (id === 'library')  renderLibrary()
  if (id === 'settings') { renderManage(); renderSettings() }
  if (id === 'discover') renderDiscover()
  if (id === 'insights') renderInsightsPage()
  if (id === 'free') renderFreePage()
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, isErr = false) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className   = isErr ? 'err show' : 'show'
  setTimeout(() => t.classList.remove('show'), 2600)
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function tick() {
  const now = new Date()
  const h   = String(now.getHours()).padStart(2, '0')
  const m   = String(now.getMinutes()).padStart(2, '0')
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  ;['clock-d','clock-l','clock-i'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = `${h}:${m}` })
  const dd = document.getElementById('day-d')
  if (dd) dd.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`
}

// ── Scan installed games ──────────────────────────────────────────────────────
let scanResults = []   // games found but not yet imported

async function runScan() {
  const btn = document.getElementById('btn-scan')
  const st  = document.getElementById('scan-status')
  const box = document.getElementById('scan-results')
  btn.disabled = true; btn.textContent = 'Scanning…'
  st.textContent = ''; st.className = 'status-msg'
  box.innerHTML = ''

  let found
  try {
    found = await window.brioAPI.scanGames()
  } catch (e) {
    st.textContent = `Scan failed: ${e.message}`; st.className = 'status-msg status-err'
    btn.disabled = false; btn.textContent = 'Scan now'
    return
  }

  // Filter out games already in the library (match by steamId or by id slug)
  const existingIds     = new Set(GAMES.map(g => g.id))
  const existingSteam   = new Set(GAMES.map(g => g.steamId).filter(Boolean))
  scanResults = found.filter(g =>
    !existingIds.has(g.id) && !(g.steamId && existingSteam.has(g.steamId))
  )

  btn.disabled = false; btn.textContent = 'Scan now'

  if (!scanResults.length) {
    st.textContent = found.length
      ? `All ${found.length} detected games are already in your library.`
      : 'No installed Steam or Epic games found. Make sure they are installed.'
    st.className = 'status-msg status-ok'
    return
  }

  st.textContent = `Found ${scanResults.length} new game${scanResults.length > 1 ? 's' : ''} — select which to import:`
  st.className = 'status-msg status-ok'
  renderScanResults()
}

function renderScanResults() {
  const box = document.getElementById('scan-results')
  box.innerHTML = ''

  // Select-all row
  const hdr = document.createElement('div')
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px'
  const selAll = document.createElement('label')
  selAll.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted2);cursor:pointer'
  const selAllCb = document.createElement('input'); selAllCb.type = 'checkbox'; selAllCb.checked = true
  selAllCb.onchange = () => {
    box.querySelectorAll('input[type=checkbox][data-gid]').forEach(cb => { cb.checked = selAllCb.checked })
  }
  selAll.appendChild(selAllCb); selAll.append('Select all')

  const importBtn = document.createElement('button')
  importBtn.className = 'btn-primary'
  importBtn.style.cssText = 'font-size:13px;padding:8px 20px'
  importBtn.textContent = 'Import selected'
  importBtn.onclick = importSelected

  hdr.appendChild(selAll); hdr.appendChild(importBtn)
  box.appendChild(hdr)

  // Game rows
  const list = document.createElement('div')
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto'

  scanResults.forEach(g => {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);cursor:pointer;transition:border .15s'
    row.onmouseenter = () => row.style.borderColor = 'var(--border2)'
    row.onmouseleave = () => row.style.borderColor = 'var(--border)'

    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true
    cb.dataset.gid = g.id; cb.style.flexShrink = '0'

    const img = document.createElement('img')
    img.style.cssText = 'width:64px;height:30px;border-radius:4px;object-fit:cover;background:var(--border);flex-shrink:0'
    if (g.steamId) img.src = STEAM_IMG(g.steamId)
    img.onerror = () => { img.style.display = 'none' }

    const info = document.createElement('div'); info.style.flex = '1'
    info.innerHTML = `<div style="font-family:Rajdhani,sans-serif;font-size:14px;font-weight:600">${g.name}</div><div style="font-size:11px;color:var(--muted2)">${g.platform}${g.exePath ? ' · exe found' : g.steamId ? ' · Steam' : ''}</div>`

    row.appendChild(cb); row.appendChild(img); row.appendChild(info)
    list.appendChild(row)
  })
  box.appendChild(list)
}

function importSelected() {
  const box = document.getElementById('scan-results')
  const st  = document.getElementById('scan-status')
  const checked = new Set([...box.querySelectorAll('input[data-gid]:checked')].map(cb => cb.dataset.gid))
  const toAdd = scanResults.filter(g => checked.has(g.id))
  if (!toAdd.length) { toast('Nothing selected', true); return }

  // Deduplicate against current library one more time (in case user added manually between scan and import)
  const existingIds   = new Set(GAMES.map(g => g.id))
  const existingSteam = new Set(GAMES.map(g => g.steamId).filter(Boolean))
  let added = 0
  for (const g of toAdd) {
    if (existingIds.has(g.id) || (g.steamId && existingSteam.has(g.steamId))) continue
    GAMES.push(g); added++
  }
  saveGames(); renderLibrary(); renderDiscover(); renderManage()
  toast(`Imported ${added} game${added !== 1 ? 's' : ''}!`)
  box.innerHTML = ''; scanResults = []
  st.textContent = `${added} game${added !== 1 ? 's' : ''} added to your library.`
  st.className = 'status-msg status-ok'
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load persisted data
  const savedGames    = await window.brioAPI.getStore('games_v3')
  const savedSessions = await window.brioAPI.getStore('sessions_v3')
  const savedSettings = await window.brioAPI.getStore('settings')
  GAMES    = savedGames    || GAMES_DEFAULT
  SESSIONS = savedSessions || []
  if (savedSettings) Object.assign(SETTINGS, savedSettings)

  // Patch known bad defaults that may have been persisted from an earlier run
  const BAD_IDS = { rocketleague: '252950', arcraiders: '668580' }
  let patched = false
  GAMES.forEach(g => {
    if (BAD_IDS[g.id] && g.steamId === BAD_IDS[g.id]) { g.steamId = ''; patched = true }
  })
  if (patched) saveGames()

  // Load or fetch holidays
  if (SETTINGS.country && SETTINGS.holidaysCache?.length) {
    HOLIDAYS = SETTINGS.holidaysCache
  } else if (SETTINGS.country) {
    await refreshHolidays(SETTINGS.country)
  } else {
    HOLIDAYS = HOLIDAYS_DEFAULT
  }

  // Apply accent color
  applyAccent(SETTINGS.accentColor)

  // Apply default mood (or auto-detect)
  const am = SETTINGS.defaultMood || getAutoMood()
  const ab = document.querySelector(`[data-mood="${am}"]`)
  if (ab) ab.classList.add('active')
  currentMood = am

  // Mood checks for custom game form
  renderMoodChecks('custom-moods', customMoods, m => { customMoods = m })

  // Clock + initial render
  tick()
  setInterval(tick, 15000)

  // Navigate to start page
  const startBtn = document.getElementById(`nb-${SETTINGS.startPage}`)
  if (SETTINGS.startPage !== 'discover' && startBtn) {
    goPage(SETTINGS.startPage, startBtn)
  } else {
    renderDiscover()
  }

  // Auto-start toggle
  const autoOn = await window.brioAPI.getAutoStart()
  const toggle = document.getElementById('autostart-toggle')
  if (toggle) toggle.checked = autoOn

  // First-run location prompt
  if (!SETTINGS.locationSetup) showWelcomeModal()

  // Background check for free games — shows notif dot if any found
  checkForFreeGames()
}

init()
