(() => {
  'use strict';

  const STORAGE_KEY = 'gga-ryder-cup-v1';
  const ROOM_KEY = 'gga-ryder-cup-room';
  const DEFAULT_ROOM = 'lake-charles-2026';

  const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

  function makeMatches(count, teamSize) {
    return Array.from({ length: count }, () => ({
      id: uid('m'),
      a: Array(teamSize).fill(null),
      b: Array(teamSize).fill(null),
      holes: Array(18).fill(null), // null | 'A' | 'B' | 'halve' per hole
    }));
  }

  function defaultPlayers() {
    return Array.from({ length: 12 }, (_, i) => ({
      id: uid('p'),
      name: `Golfer ${i + 1}`,
      team: null,
    }));
  }

  function defaultState() {
    return {
      theme: 'cream',
      tournamentDate: '2026-08-01',
      location: 'Lake Charles, LA',
      teams: {
        A: { name: 'Team Talons' },
        B: { name: 'Team Beaks' },
      },
      players: defaultPlayers(),
      rounds: [
        { id: 'r1', title: 'Round 1 — Singles', format: '1v1 Match Play', teamSize: 1, matches: makeMatches(6, 1) },
        { id: 'r2', title: 'Round 2 — Scramble', format: '2v2 Scramble Match Play', teamSize: 2, matches: makeMatches(3, 2) },
        { id: 'r3', title: 'Round 3 — Shamble', format: '2v2 Shamble Match Play', teamSize: 2, matches: makeMatches(3, 2) },
      ],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.teams || !parsed.rounds) return defaultState();
      return parsed;
    } catch (e) {
      console.warn('Failed to load saved state, starting fresh.', e);
      return defaultState();
    }
  }

  let state = loadState();

  // ---------- Room code (which synced document this device points at) ----------

  function getRoomCode() {
    return localStorage.getItem(ROOM_KEY) || DEFAULT_ROOM;
  }

  function setRoomCode(code) {
    const clean = (code || '').trim().toLowerCase().replace(/\s+/g, '-') || DEFAULT_ROOM;
    localStorage.setItem(ROOM_KEY, clean);
    return clean;
  }


  // ---------- Live sync (Firebase Realtime Database, optional) ----------

  const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {};
  const SYNC_ENABLED = !!(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.apiKey !== 'REPLACE_ME' &&
    FIREBASE_CONFIG.databaseURL &&
    !String(FIREBASE_CONFIG.databaseURL).includes('REPLACE_ME') &&
    typeof firebase !== 'undefined'
  );

  let dbRef = null;
  let lastPushedJSON = null;
  let pushTimer = null;

  // Firebase Realtime Database treats `null` as "delete this key," which would
  // silently wipe out every unplayed hole, unpicked match slot, and undrafted
  // player's `team` field on the round trip. Swap `null` for a sentinel before
  // writing, and back again on read, so those stay real nulls locally.
  const NULL_SENTINEL = '__GGA_NULL__';

  function encodeForFirebase(value) {
    if (value === null) return NULL_SENTINEL;
    if (Array.isArray(value)) return value.map(encodeForFirebase);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((k) => { out[k] = encodeForFirebase(value[k]); });
      return out;
    }
    return value;
  }

  function decodeFromFirebase(value) {
    if (value === NULL_SENTINEL) return null;
    if (Array.isArray(value)) return value.map(decodeFromFirebase);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((k) => { out[k] = decodeFromFirebase(value[k]); });
      return out;
    }
    return value;
  }

  function setSyncStatus(status, detail) {
    const indicator = document.getElementById('sync-indicator');
    const label = document.getElementById('sync-label');
    const pillSettings = document.getElementById('sync-pill-settings');
    const text = { offline: 'Local only', connecting: 'Connecting…', live: 'Live' }[status] || 'Local only';
    if (indicator) {
      indicator.className = `sync-indicator ${status}`;
      indicator.title = detail || text;
    }
    if (label) label.textContent = text;
    if (pillSettings) {
      pillSettings.className = `sync-pill ${status}`;
      pillSettings.textContent = text;
    }
  }

  function renderSyncSetupNote() {
    const note = document.getElementById('sync-setup-note');
    if (!note) return;
    note.textContent = SYNC_ENABLED
      ? 'Connected — anyone using this same room code sees updates within a second or two.'
      : 'Not connected yet. Add your Firebase project details to firebase-config.js to turn this on for every phone at once (see README.md, "Enable live sync").';
  }

  function attachRoomListener() {
    if (!SYNC_ENABLED) return;
    if (dbRef) dbRef.off();
    setSyncStatus('connecting');
    const room = getRoomCode();
    dbRef = firebase.database().ref(`tournaments/${room}`);
    dbRef.on('value', (snap) => {
      const remoteRaw = snap.val();
      if (remoteRaw === null) {
        // Nothing in this room yet. Seed it atomically so two devices opening
        // a brand-new room at the same moment can't clobber one another —
        // only one seed wins, and the loser adopts what actually landed.
        dbRef.transaction((current) => (current === null ? encodeForFirebase(state) : current))
          .then((result) => {
            if (result.committed) {
              lastPushedJSON = JSON.stringify(result.snapshot.val());
            } else if (result.snapshot.exists()) {
              state = decodeFromFirebase(result.snapshot.val());
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
              renderAll();
            }
            setSyncStatus('live');
          })
          .catch((e) => { console.warn('Seed transaction failed:', e); setSyncStatus('offline', e && e.message); });
        return;
      }
      const remoteRawJSON = JSON.stringify(remoteRaw);
      if (remoteRawJSON === lastPushedJSON) { setSyncStatus('live'); return; }
      state = decodeFromFirebase(remoteRaw);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      setSyncStatus('live');
    }, (err) => {
      console.warn('Firebase sync error:', err);
      setSyncStatus('offline', err && err.message);
    });
  }

  function pushToRemote(force) {
    if (!dbRef) return;
    const encoded = encodeForFirebase(state);
    const json = JSON.stringify(encoded);
    if (!force && json === lastPushedJSON) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      lastPushedJSON = json;
      dbRef.set(encoded).catch((e) => console.warn('Sync push failed:', e));
    }, 250);
  }

  function initSync() {
    renderSyncSetupNote();
    if (!SYNC_ENABLED) { setSyncStatus('offline'); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      attachRoomListener();
    } catch (e) {
      console.warn('Firebase init failed:', e);
      setSyncStatus('offline', e && e.message);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushToRemote();
  }

  function playerById(id) {
    return state.players.find((p) => p.id === id) || null;
  }

  function rosterFor(team) {
    return state.players.filter((p) => p.team === team);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------- Cleanup helpers ----------

  function purgePlayerFromMatches(playerId) {
    state.rounds.forEach((round) => {
      round.matches.forEach((m) => {
        let touched = false;
        m.a = m.a.map((id) => {
          if (id === playerId) { touched = true; return null; }
          return id;
        });
        m.b = m.b.map((id) => {
          if (id === playerId) { touched = true; return null; }
          return id;
        });
        if (touched) {
          m.holes = Array(18).fill(null);
        }
      });
    });
  }

  // ---------- Hole-by-hole match play ----------

  // Every Ryder Cup point is a pure calculation from the 18 holes — nobody
  // edits a point directly, ever. Three segments are scored independently
  // off the same hole-by-hole record: the front 9 (1 pt), the back 9 (1 pt),
  // and the full 18 (2 pts) — 4 points per match, same as a standard
  // front/back/overall member-guest format. Each segment locks in the
  // instant it's mathematically decided — a 5-0 lead after 5 holes clinches
  // the front 9 right there (5 up, 4 to play), well before the back 9 even
  // starts. Undoing a hole un-decides whichever segment(s) it affects.

  const SEGMENTS = [
    { key: 'front', label: 'Front 9', abbrev: 'F9', start: 0, end: 9, points: 1 },
    { key: 'back', label: 'Back 9', abbrev: 'B9', start: 9, end: 18, points: 1 },
    { key: 'full', label: 'Full Match', abbrev: '18', start: 0, end: 18, points: 2 },
  ];

  function analyzeSegment(holes, start, end) {
    const slice = holes.slice(start, end);
    const total = end - start;
    const played = slice.filter((h) => h !== null);
    const thru = played.length;
    let diff = 0;
    played.forEach((h) => {
      if (h === 'A') diff += 1;
      else if (h === 'B') diff -= 1;
    });
    const remaining = total - thru;
    const closedOut = thru > 0 && Math.abs(diff) > remaining;
    const finished = closedOut || thru >= total;
    return { thru, diff, remaining, closedOut, finished, total };
  }

  function analyzeMatch(match) {
    const holes = match.holes || Array(18).fill(null);
    const result = {};
    SEGMENTS.forEach((seg) => { result[seg.key] = analyzeSegment(holes, seg.start, seg.end); });
    return result;
  }

  // null while undecided, else 'A' | 'B' | 'halve'
  function segmentResult(info) {
    if (!info.finished) return null;
    if (info.diff > 0) return 'A';
    if (info.diff < 0) return 'B';
    return 'halve';
  }

  function recordHole(match, winner) {
    if (!match.holes) match.holes = Array(18).fill(null);
    const idx = match.holes.findIndex((h) => h === null);
    if (idx === -1) return;
    match.holes[idx] = winner;
  }

  function undoHole(match) {
    if (!match.holes) match.holes = Array(18).fill(null);
    let idx = -1;
    for (let i = match.holes.length - 1; i >= 0; i--) {
      if (match.holes[i] !== null) { idx = i; break; }
    }
    if (idx === -1) return;
    match.holes[idx] = null;
  }

  function segmentStatusText(info, teamAName, teamBName) {
    if (info.thru === 0) return { text: 'Not started', cls: 'not-started' };
    if (info.finished) {
      if (info.diff === 0) return { text: `Halved thru ${info.total}`, cls: 'closed' };
      const winner = info.diff > 0 ? teamAName : teamBName;
      if (info.closedOut) return { text: `${winner} wins ${Math.abs(info.diff)}&${info.remaining}`, cls: 'closed' };
      return { text: `${winner} wins, ${Math.abs(info.diff)} up`, cls: 'closed' };
    }
    if (info.diff === 0) return { text: `All Square thru ${info.thru}`, cls: '' };
    const leader = info.diff > 0 ? teamAName : teamBName;
    return { text: `${leader} ${Math.abs(info.diff)} UP thru ${info.thru}`, cls: '' };
  }

  function segmentPill(info, points, teamAName, teamBName) {
    const res = segmentResult(info);
    if (res === 'A') return `<span class="pill a">${escapeHtml(teamAName)} +${fmtScore(points)}</span>`;
    if (res === 'B') return `<span class="pill b">${escapeHtml(teamBName)} +${fmtScore(points)}</span>`;
    if (res === 'halve') return `<span class="pill halve">Halved (+${fmtScore(points / 2)} each)</span>`;
    if (info.thru > 0) return `<span class="pill live">${escapeHtml(segmentStatusText(info, teamAName, teamBName).text)}</span>`;
    return `<span class="pill pending">Pending</span>`;
  }

  function renderHolePips(match) {
    const holes = match.holes || Array(18).fill(null);
    return holes.map((h, i) => {
      const cls = h === 'A' ? 'a' : h === 'B' ? 'b' : h === 'halve' ? 'halve' : '';
      const divider = i === 9 ? '<span class="hole-pip-divider"></span>' : '';
      return `${divider}<span class="hole-pip ${cls}"></span>`;
    }).join('');
  }

  // ---------- Rendering: header ----------

  function renderHeader() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const wordmark = document.getElementById('wordmark-img');
    wordmark.src = state.theme === 'navy' ? 'assets/gga-logo-navy.png' : 'assets/gga-logo-cream.png';

    const dateEl = document.getElementById('meta-date');
    const d = state.tournamentDate ? new Date(`${state.tournamentDate}T00:00:00`) : null;
    const dateStr = d && !isNaN(d) ? d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    dateEl.textContent = [dateStr, state.location].filter(Boolean).join(' · ');
  }

  // ---------- Rendering: draft board ----------

  function renderDraft() {
    const picksMade = state.players.filter((p) => p.team).length;
    const clockEl = document.getElementById('draft-clock');
    if (picksMade >= state.players.length && state.players.length > 0) {
      clockEl.className = 'draft-clock done';
      clockEl.innerHTML = `Draft complete — good luck out there!`;
    } else {
      const onClock = picksMade % 2 === 0 ? 'A' : 'B';
      clockEl.className = 'draft-clock';
      clockEl.innerHTML = `On the clock: <strong>${escapeHtml(state.teams[onClock].name)}</strong> <span class="pick-num">— Pick ${picksMade + 1} of ${state.players.length}</span>`;
    }

    renderTeamCard('A');
    renderTeamCard('B');
    renderPool();
  }

  function renderTeamCard(team) {
    const card = document.getElementById(`roster-${team}`);
    const roster = rosterFor(team);
    card.innerHTML = `
      <h3>${escapeHtml(state.teams[team].name)} <span class="count">${roster.length}/6</span></h3>
      <ul class="roster-list">
        ${roster.map((p) => `
          <li class="player-chip" data-pid="${p.id}">
            <input class="chip-name-input name-input" data-pid="${p.id}" value="${escapeHtml(p.name)}" style="border:none;background:transparent;font-weight:600;color:inherit;font-family:inherit;font-size:14px;flex:1;min-width:0;" />
            <button class="chip-btn" data-action="return" data-pid="${p.id}" title="Return to pool">↩</button>
            <button class="chip-btn" data-action="delete" data-pid="${p.id}" title="Remove golfer">✕</button>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function renderPool() {
    const list = document.getElementById('pool-list');
    const pool = state.players.filter((p) => !p.team);
    const aFull = rosterFor('A').length >= 6;
    const bFull = rosterFor('B').length >= 6;
    list.innerHTML = pool.map((p) => `
      <div class="pool-chip" data-pid="${p.id}">
        <input class="chip-name-input name-input" data-pid="${p.id}" value="${escapeHtml(p.name)}" style="border:none;background:transparent;font-weight:600;color:inherit;font-family:inherit;font-size:14px;flex:1;min-width:0;" />
        <div class="actions">
          <button class="chip-btn" data-action="assign-A" data-pid="${p.id}" ${aFull ? 'disabled' : ''}>→ A</button>
          <button class="chip-btn" data-action="assign-B" data-pid="${p.id}" ${bFull ? 'disabled' : ''}>→ B</button>
          <button class="chip-btn" data-action="delete" data-pid="${p.id}">✕</button>
        </div>
      </div>
    `).join('');
  }

  // ---------- Rendering: matches ----------

  function roundUsageMap(round) {
    const usage = {};
    round.matches.forEach((m) => {
      [...m.a, ...m.b].forEach((id) => {
        if (!id) return;
        usage[id] = (usage[id] || 0) + 1;
      });
    });
    return usage;
  }

  function renderMatches() {
    const container = document.getElementById('rounds-container');
    const rosterA = rosterFor('A');
    const rosterB = rosterFor('B');

    container.innerHTML = state.rounds.map((round) => {
      const usage = roundUsageMap(round);
      const totalPts = round.matches.length;
      return `
        <div class="round-block">
          <div class="round-title">
            <h3>${escapeHtml(round.title)}</h3>
            <span class="fmt-badge">${escapeHtml(round.format)}</span>
          </div>
          <p class="round-sub">${totalPts} match${totalPts === 1 ? '' : 'es'} · ${totalPts} point${totalPts === 1 ? '' : 's'} on the board</p>
          <div class="match-list">
            ${round.matches.map((m, idx) => renderMatchCard(round, m, idx, rosterA, rosterB, usage)).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function slotSelect(round, match, side, slotIdx, roster, usage) {
    const otherIdxVals = match[side].filter((_, i) => i !== slotIdx);
    const current = match[side][slotIdx];
    const options = roster.map((p) => {
      const disabled = otherIdxVals.includes(p.id) && p.id !== current;
      return `<option value="${p.id}" ${p.id === current ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(p.name)}${usage[p.id] > 1 ? ' •' : ''}</option>`;
    }).join('');
    return `
      <select data-round="${round.id}" data-match="${match.id}" data-side="${side}" data-slot="${slotIdx}">
        <option value="">— select —</option>
        ${options}
      </select>
    `;
  }

  function renderMatchCard(round, match, idx, rosterA, rosterB, usage) {
    const warnNames = [...match.a, ...match.b]
      .filter((id) => id && usage[id] > 1)
      .map((id) => playerById(id))
      .filter(Boolean)
      .map((p) => p.name);
    const uniqueWarn = [...new Set(warnNames)];

    const segs = analyzeMatch(match);
    const fullFinished = segs.full.finished;

    return `
      <div class="match-card" data-round="${round.id}" data-match="${match.id}">
        <div class="match-top">
          <div class="match-side side-a">
            ${match.a.map((_, i) => slotSelect(round, match, 'a', i, rosterA, usage)).join('')}
          </div>
          <div class="vs-label">Match ${idx + 1}<br/>VS</div>
          <div class="match-side side-b">
            ${match.b.map((_, i) => slotSelect(round, match, 'b', i, rosterB, usage)).join('')}
          </div>
        </div>
        ${uniqueWarn.length ? `<div class="match-warn">⚠ ${escapeHtml(uniqueWarn.join(', '))} scheduled in more than one match this round.</div>` : ''}
        <div class="segment-grid">
          ${SEGMENTS.map((seg) => `
            <div class="segment-row">
              <span class="segment-name">${seg.label} <span class="segment-pts">(${seg.points} pt${seg.points === 1 ? '' : 's'})</span></span>
              ${segmentPill(segs[seg.key], seg.points, state.teams.A.name, state.teams.B.name)}
            </div>
          `).join('')}
        </div>
        <div class="hole-tracker">
          <div class="hole-status-row">
            <span class="hole-status-text">${segs.full.thru} of 18 holes recorded</span>
            <button class="hole-btn undo" data-hole-action="undo" data-round="${round.id}" data-match="${match.id}" ${segs.full.thru === 0 ? 'disabled' : ''}>↺ Undo last hole</button>
          </div>
          <div class="hole-controls">
            <button class="hole-btn" data-hole-action="A" data-round="${round.id}" data-match="${match.id}" ${fullFinished ? 'disabled' : ''}>${escapeHtml(state.teams.A.name)} wins hole</button>
            <button class="hole-btn" data-hole-action="halve" data-round="${round.id}" data-match="${match.id}" ${fullFinished ? 'disabled' : ''}>Halve</button>
            <button class="hole-btn" data-hole-action="B" data-round="${round.id}" data-match="${match.id}" ${fullFinished ? 'disabled' : ''}>${escapeHtml(state.teams.B.name)} wins hole</button>
          </div>
          <div class="hole-pips">${renderHolePips(match)}</div>
        </div>
      </div>
    `;
  }

  // ---------- Rendering: leaderboard ----------

  function computeScores() {
    let a = 0, b = 0;
    const totalPoints = state.rounds.reduce((s, r) => s + r.matches.length * 4, 0);
    const perRound = state.rounds.map((round) => {
      let ra = 0, rb = 0;
      round.matches.forEach((m) => {
        const segs = analyzeMatch(m);
        SEGMENTS.forEach((seg) => {
          const res = segmentResult(segs[seg.key]);
          if (res === 'A') { a += seg.points; ra += seg.points; }
          else if (res === 'B') { b += seg.points; rb += seg.points; }
          else if (res === 'halve') { a += seg.points / 2; b += seg.points / 2; ra += seg.points / 2; rb += seg.points / 2; }
        });
      });
      return { round, ra, rb };
    });
    return { a, b, totalPoints, perRound };
  }

  function fmtScore(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function playerNamesForSlots(ids) {
    const names = ids.map((id) => (id ? playerById(id)?.name : null)).filter(Boolean);
    return names.length ? names.join(' & ') : '—';
  }

  function renderLeaderboard() {
    const { a, b, totalPoints, perRound } = computeScores();
    const remaining = totalPoints - a - b;
    const container = document.getElementById('leaderboard-container');
    const majority = totalPoints / 2;

    let banner = '';
    if (a > majority) banner = `🏆 ${escapeHtml(state.teams.A.name)} wins the Cup!`;
    else if (b > majority) banner = `🏆 ${escapeHtml(state.teams.B.name)} wins the Cup!`;
    else if (remaining === 0 && a === b) banner = `🤝 All square — the Cup is shared!`;

    const pctA = totalPoints ? (a / totalPoints) * 100 : 0;
    const pctB = totalPoints ? (b / totalPoints) * 100 : 0;
    const pctRem = 100 - pctA - pctB;

    const rows = perRound.map(({ round, ra, rb }) => `
      <tr class="lb-round-header"><td colspan="4">${escapeHtml(round.title)} <span style="opacity:.6;font-weight:500;">(${escapeHtml(round.format)})</span></td></tr>
      ${round.matches.map((m, idx) => {
        const segs = analyzeMatch(m);
        const pointsCell = SEGMENTS.map((seg) => `
          <div class="segment-cell">
            <span class="segment-cell-label">${seg.abbrev}</span>
            ${segmentPill(segs[seg.key], seg.points, state.teams.A.name, state.teams.B.name)}
          </div>
        `).join('');
        return `
          <tr>
            <td>Match ${idx + 1}</td>
            <td>${escapeHtml(playerNamesForSlots(m.a))}</td>
            <td>${escapeHtml(playerNamesForSlots(m.b))}</td>
            <td class="segment-cell-group">${pointsCell}</td>
          </tr>
        `;
      }).join('')}
      <tr><td colspan="4" style="text-align:right;font-weight:700;opacity:.7;">Round points: ${fmtScore(ra)} — ${fmtScore(rb)}</td></tr>
    `).join('');

    container.innerHTML = `
      <div class="scoreboard">
        <div class="score-team"><div class="team-name">${escapeHtml(state.teams.A.name)}</div><div class="team-score">${fmtScore(a)}</div></div>
        <div class="score-divider">–</div>
        <div class="score-team"><div class="team-name">${escapeHtml(state.teams.B.name)}</div><div class="team-score">${fmtScore(b)}</div></div>
      </div>
      <div class="progress-bar">
        <div class="seg-a" style="width:${pctA}%"></div>
        <div class="seg-b" style="width:${pctB}%"></div>
        <div class="seg-rem" style="width:${pctRem}%"></div>
      </div>
      <div class="progress-caption">
        <span>${fmtScore(a + b)} of ${totalPoints} points decided</span>
        <span>${fmtScore(remaining)} remaining</span>
      </div>
      ${banner ? `<div class="clinch-banner">${banner}</div>` : ''}
      <table class="lb-table">
        <thead><tr><th>Match</th><th>${escapeHtml(state.teams.A.name)}</th><th>${escapeHtml(state.teams.B.name)}</th><th>Points (F9 · B9 · 18)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ---------- Rendering: settings ----------

  function renderSettings() {
    document.getElementById('team-a-name').value = state.teams.A.name;
    document.getElementById('team-b-name').value = state.teams.B.name;
    document.getElementById('tournament-date').value = state.tournamentDate || '';
    document.getElementById('tournament-location').value = state.location || '';
    document.getElementById('room-code').value = getRoomCode();
    renderSyncSetupNote();
  }

  function renderAll() {
    renderHeader();
    renderDraft();
    renderMatches();
    renderLeaderboard();
    renderSettings();
  }

  // ---------- Event wiring ----------

  function setupTabs() {
    document.getElementById('tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.target}`).classList.add('active');
    });
  }

  function setupThemeToggle() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
      state.theme = state.theme === 'navy' ? 'cream' : 'navy';
      saveState();
      renderHeader();
    });
  }

  function setupDraftEvents() {
    const main = document.getElementById('main');

    main.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (btn) {
        const pid = btn.dataset.pid;
        const action = btn.dataset.action;
        if (action === 'assign-A' || action === 'assign-B') {
          const team = action.slice(-1);
          if (rosterFor(team).length < 6) {
            const p = playerById(pid);
            if (p) p.team = team;
            saveState();
            renderDraft();
            renderMatches();
            renderLeaderboard();
          }
        } else if (action === 'return') {
          const p = playerById(pid);
          if (p) p.team = null;
          purgePlayerFromMatches(pid);
          saveState();
          renderDraft();
          renderMatches();
          renderLeaderboard();
        } else if (action === 'delete') {
          state.players = state.players.filter((p) => p.id !== pid);
          purgePlayerFromMatches(pid);
          saveState();
          renderDraft();
          renderMatches();
          renderLeaderboard();
        }
        return;
      }

      const holeBtn = e.target.closest('.hole-btn');
      if (holeBtn) {
        const { round: roundId, match: matchId, holeAction } = holeBtn.dataset;
        const round = state.rounds.find((r) => r.id === roundId);
        const match = round?.matches.find((m) => m.id === matchId);
        if (match) {
          if (holeAction === 'undo') undoHole(match); else recordHole(match, holeAction);
          saveState();
          renderMatches();
          renderLeaderboard();
        }
        return;
      }
    });

    // Name edits: update state live, full re-render on blur so other views sync.
    main.addEventListener('input', (e) => {
      if (e.target.classList.contains('name-input')) {
        const p = playerById(e.target.dataset.pid);
        if (p) {
          p.name = e.target.value;
          saveState();
        }
      }
    });
    main.addEventListener('blur', (e) => {
      if (e.target.classList && e.target.classList.contains('name-input')) {
        const p = playerById(e.target.dataset.pid);
        if (p && !p.name.trim()) p.name = 'Unnamed Golfer';
        saveState();
        renderDraft();
        renderMatches();
        renderLeaderboard();
      }
    }, true);

    main.addEventListener('change', (e) => {
      if (e.target.tagName === 'SELECT' && e.target.dataset.round) {
        const { round: roundId, match: matchId, side, slot } = e.target.dataset;
        const round = state.rounds.find((r) => r.id === roundId);
        const match = round?.matches.find((m) => m.id === matchId);
        if (match) {
          match[side][Number(slot)] = e.target.value || null;
          saveState();
          renderMatches();
          renderLeaderboard();
        }
      }
    });

    document.getElementById('add-player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('new-player-name');
      const name = input.value.trim();
      if (!name) return;
      state.players.push({ id: uid('p'), name, team: null });
      input.value = '';
      saveState();
      renderDraft();
    });
  }

  function setupSettingsEvents() {
    // Setters close over the live `state` variable rather than capturing a
    // reference to today's state.teams.A — a remote sync can replace `state`
    // wholesale at any moment, which would otherwise orphan a captured object
    // and silently swallow edits typed right after that happens.
    const bindText = (id, setter) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        setter(el.value);
        saveState();
      });
      el.addEventListener('blur', () => renderAll());
    };
    bindText('team-a-name', (v) => { state.teams.A.name = v; });
    bindText('team-b-name', (v) => { state.teams.B.name = v; });
    bindText('tournament-date', (v) => { state.tournamentDate = v; });
    bindText('tournament-location', (v) => { state.location = v; });

    const roomInput = document.getElementById('room-code');
    roomInput.addEventListener('change', () => {
      setRoomCode(roomInput.value);
      roomInput.value = getRoomCode();
      attachRoomListener();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gga-ryder-cup-backup-${state.tournamentDate || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('import-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed.teams || !parsed.rounds || !parsed.players) throw new Error('bad shape');
          state = parsed;
          saveState();
          renderAll();
        } catch (err) {
          alert('That file does not look like a valid GGA Ryder Cup backup.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('This will erase the draft, matches, and leaderboard on this device. Continue?')) {
        state = defaultState();
        saveState();
        renderAll();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupThemeToggle();
    setupDraftEvents();
    setupSettingsEvents();
    renderAll();
    initSync();
  });
})();
