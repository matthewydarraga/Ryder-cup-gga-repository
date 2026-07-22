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
      result: null, // null | 'A' | 'B' | 'halve'
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
      commissionerPin: null,
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

  // ---------- Commissioner access (gates who can award Ryder Cup points) ----------
  // The PIN itself lives in synced state (anyone can attempt to unlock with
  // it), but whether *this* device is currently unlocked is local-only —
  // syncing that would unlock every device the moment one of them did.

  const UNLOCK_KEY = 'gga-ryder-cup-unlocked';

  function isUnlockedLocally() {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  }

  function isCommissioner() {
    return !state.commissionerPin || isUnlockedLocally();
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
          m.result = null;
          m.holes = Array(18).fill(null);
        }
      });
    });
  }

  // ---------- Hole-by-hole match play ----------

  function analyzeHoles(match) {
    const holes = match.holes || [];
    const played = holes.filter((h) => h !== null);
    const thru = played.length;
    let diff = 0;
    played.forEach((h) => {
      if (h === 'A') diff += 1;
      else if (h === 'B') diff -= 1;
    });
    const remaining = 18 - thru;
    const closedOut = thru > 0 && Math.abs(diff) > remaining;
    const finished = closedOut || thru >= 18;
    return { thru, diff, remaining, closedOut, finished };
  }

  // Anyone can tap in hole-by-hole progress — recordHole/undoHole never touch
  // match.result themselves. Only confirmMatchResult (commissioner-gated in
  // the UI) actually awards the Ryder Cup point for a match.
  function confirmMatchResult(match) {
    const info = analyzeHoles(match);
    if (!info.finished) return;
    match.result = info.diff > 0 ? 'A' : info.diff < 0 ? 'B' : 'halve';
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
    // Undoing implies something needs correcting — reopen the match so it
    // isn't left showing an awarded point that no longer matches the holes.
    match.result = null;
  }

  function holeStatus(info, teamAName, teamBName) {
    if (info.thru === 0) return { text: 'Not started', cls: 'not-started' };
    if (info.finished) {
      if (info.diff === 0) return { text: `Halved thru 18`, cls: 'closed' };
      const winner = info.diff > 0 ? teamAName : teamBName;
      if (info.closedOut) return { text: `${winner} wins ${Math.abs(info.diff)}&${info.remaining}`, cls: 'closed' };
      return { text: `${winner} wins, ${Math.abs(info.diff)} up`, cls: 'closed' };
    }
    if (info.diff === 0) return { text: `All Square thru ${info.thru}`, cls: '' };
    const leader = info.diff > 0 ? teamAName : teamBName;
    return { text: `${leader} ${Math.abs(info.diff)} UP thru ${info.thru}`, cls: '' };
  }

  function renderHolePips(match) {
    const holes = match.holes || Array(18).fill(null);
    return holes.map((h) => {
      const cls = h === 'A' ? 'a' : h === 'B' ? 'b' : h === 'halve' ? 'halve' : '';
      return `<span class="hole-pip ${cls}"></span>`;
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

    renderCommissionerIndicator();
  }

  function renderCommissionerIndicator() {
    const el = document.getElementById('commissioner-indicator');
    const label = document.getElementById('commissioner-label');
    if (!el || !label) return;
    if (!state.commissionerPin) { el.style.display = 'none'; return; }
    const unlocked = isUnlockedLocally();
    el.style.display = 'flex';
    el.className = `commissioner-indicator ${unlocked ? 'unlocked' : 'locked'}`;
    label.textContent = unlocked ? '🔓 You can confirm' : '🔒 View only';
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

    const info = analyzeHoles(match);
    const status = holeStatus(info, state.teams.A.name, state.teams.B.name);
    const commissioner = isCommissioner();
    // Once a point is officially awarded, hole entry freezes for everyone but
    // the commissioner — undoing a hole reopens the match (see undoHole).
    const holesLocked = match.result !== null && !commissioner;

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
        ${commissioner ? `
        <div class="match-result">
          <button class="result-btn win-a ${match.result === 'A' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="A">${escapeHtml(state.teams.A.name)} win</button>
          <button class="result-btn halve ${match.result === 'halve' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="halve">Halve</button>
          <button class="result-btn win-b ${match.result === 'B' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="B">${escapeHtml(state.teams.B.name)} win</button>
        </div>
        ` : ''}
        ${uniqueWarn.length ? `<div class="match-warn">⚠ ${escapeHtml(uniqueWarn.join(', '))} scheduled in more than one match this round.</div>` : ''}
        <div class="hole-tracker">
          <div class="hole-status-row">
            <span class="hole-status-text ${status.cls}">${escapeHtml(status.text)}</span>
            <button class="hole-btn undo" data-hole-action="undo" data-round="${round.id}" data-match="${match.id}" ${(info.thru === 0 || holesLocked) ? 'disabled' : ''}>↺ Undo last hole</button>
          </div>
          <div class="hole-controls">
            <button class="hole-btn" data-hole-action="A" data-round="${round.id}" data-match="${match.id}" ${(info.finished || holesLocked) ? 'disabled' : ''}>${escapeHtml(state.teams.A.name)} wins hole</button>
            <button class="hole-btn" data-hole-action="halve" data-round="${round.id}" data-match="${match.id}" ${(info.finished || holesLocked) ? 'disabled' : ''}>Halve</button>
            <button class="hole-btn" data-hole-action="B" data-round="${round.id}" data-match="${match.id}" ${(info.finished || holesLocked) ? 'disabled' : ''}>${escapeHtml(state.teams.B.name)} wins hole</button>
          </div>
          <div class="hole-pips">${renderHolePips(match)}</div>
          ${info.finished && !match.result ? (
            commissioner
              ? `<button class="confirm-result-btn" data-round="${round.id}" data-match="${match.id}">Confirm: ${escapeHtml(status.text)} → award the point</button>`
              : `<div class="awaiting-confirm">Match decided (${escapeHtml(status.text)}) — waiting for the commissioner to confirm the point.</div>`
          ) : ''}
        </div>
      </div>
    `;
  }

  // ---------- Rendering: leaderboard ----------

  function computeScores() {
    let a = 0, b = 0;
    const totalPoints = state.rounds.reduce((s, r) => s + r.matches.length, 0);
    const perRound = state.rounds.map((round) => {
      let ra = 0, rb = 0;
      round.matches.forEach((m) => {
        if (m.result === 'A') { a += 1; ra += 1; }
        else if (m.result === 'B') { b += 1; rb += 1; }
        else if (m.result === 'halve') { a += 0.5; b += 0.5; ra += 0.5; rb += 0.5; }
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
        const info = analyzeHoles(m);
        let pill = '<span class="pill pending">Pending</span>';
        if (m.result === 'A') pill = `<span class="pill a">${escapeHtml(state.teams.A.name)}</span>`;
        else if (m.result === 'B') pill = `<span class="pill b">${escapeHtml(state.teams.B.name)}</span>`;
        else if (m.result === 'halve') pill = `<span class="pill halve">Halved</span>`;
        else if (info.thru > 0) {
          const liveText = holeStatus(info, state.teams.A.name, state.teams.B.name).text;
          pill = `<span class="pill live">${escapeHtml(info.finished ? `${liveText} — awaiting confirmation` : liveText)}</span>`;
        }
        return `
          <tr>
            <td>Match ${idx + 1}</td>
            <td>${escapeHtml(playerNamesForSlots(m.a))}</td>
            <td>${escapeHtml(playerNamesForSlots(m.b))}</td>
            <td>${pill}</td>
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
        <thead><tr><th>Match</th><th>${escapeHtml(state.teams.A.name)}</th><th>${escapeHtml(state.teams.B.name)}</th><th>Result</th></tr></thead>
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
    renderCommissionerSettings();
  }

  function renderCommissionerSettings() {
    const pillEl = document.getElementById('commissioner-pill');
    const controls = document.getElementById('commissioner-controls');
    if (!pillEl || !controls) return;
    const hasPin = !!state.commissionerPin;
    const unlocked = isUnlockedLocally();

    if (!hasPin) {
      pillEl.className = 'sync-pill';
      pillEl.textContent = 'Open';
      controls.innerHTML = `
        <p class="sub">No PIN set yet — right now anyone can confirm a match and award its Ryder Cup point. Set a PIN to restrict that to just you; live hole-by-hole scoring stays open to everyone either way.</p>
        <form class="pin-form" data-action="set-pin">
          <input type="text" inputmode="numeric" maxlength="12" placeholder="Choose a PIN (e.g. 4271)" />
          <button type="submit" class="btn">Set PIN</button>
        </form>
      `;
    } else if (!unlocked) {
      pillEl.className = 'sync-pill offline';
      pillEl.textContent = 'Locked';
      controls.innerHTML = `
        <p class="sub">This device is view-only for final results — only a device unlocked with the commissioner PIN can confirm a match and award its point. Live hole-by-hole scoring stays open to everyone.</p>
        <form class="pin-form" data-action="unlock-pin">
          <input type="text" inputmode="numeric" maxlength="12" placeholder="Enter commissioner PIN" />
          <button type="submit" class="btn">Unlock this device</button>
        </form>
      `;
    } else {
      pillEl.className = 'sync-pill live';
      pillEl.textContent = 'Unlocked';
      controls.innerHTML = `
        <p class="sub">This device can confirm matches and award Ryder Cup points.</p>
        <div class="settings-actions">
          <button class="btn" data-action="lock-device">Lock this device</button>
        </div>
        <form class="pin-form" data-action="change-pin">
          <input type="text" inputmode="numeric" maxlength="12" placeholder="Set a new PIN" />
          <button type="submit" class="btn">Change PIN</button>
        </form>
      `;
    }
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
        if (match && !(match.result !== null && !isCommissioner())) {
          if (holeAction === 'undo') undoHole(match); else recordHole(match, holeAction);
          saveState();
          renderMatches();
          renderLeaderboard();
        }
        return;
      }

      const resultBtn = e.target.closest('.result-btn');
      if (resultBtn) {
        if (!isCommissioner()) return;
        const { round: roundId, match: matchId, result } = resultBtn.dataset;
        const round = state.rounds.find((r) => r.id === roundId);
        const match = round?.matches.find((m) => m.id === matchId);
        if (match) {
          match.result = match.result === result ? null : result;
          saveState();
          renderMatches();
          renderLeaderboard();
        }
        return;
      }

      const confirmBtn = e.target.closest('.confirm-result-btn');
      if (confirmBtn) {
        if (!isCommissioner()) return;
        const { round: roundId, match: matchId } = confirmBtn.dataset;
        const round = state.rounds.find((r) => r.id === roundId);
        const match = round?.matches.find((m) => m.id === matchId);
        if (match) {
          confirmMatchResult(match);
          saveState();
          renderMatches();
          renderLeaderboard();
        }
        return;
      }

      const lockBtn = e.target.closest('[data-action="lock-device"]');
      if (lockBtn) {
        localStorage.removeItem(UNLOCK_KEY);
        renderCommissionerSettings();
        renderCommissionerIndicator();
        renderMatches();
        return;
      }
    });

    main.addEventListener('submit', (e) => {
      const form = e.target.closest('.pin-form');
      if (!form) return;
      e.preventDefault();
      const input = form.querySelector('input');
      const value = (input.value || '').trim();
      const action = form.dataset.action;
      if (action === 'set-pin') {
        if (!value) return;
        state.commissionerPin = value;
        localStorage.setItem(UNLOCK_KEY, '1');
        saveState();
      } else if (action === 'unlock-pin') {
        if (!value) return;
        if (value === state.commissionerPin) {
          localStorage.setItem(UNLOCK_KEY, '1');
        } else {
          alert('Incorrect PIN.');
          return;
        }
      } else if (action === 'change-pin') {
        if (!value) return;
        state.commissionerPin = value;
        saveState();
      }
      renderCommissionerSettings();
      renderCommissionerIndicator();
      renderMatches();
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
