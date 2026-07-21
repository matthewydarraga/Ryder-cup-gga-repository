(() => {
  'use strict';

  const STORAGE_KEY = 'gga-ryder-cup-v1';

  const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

  function makeMatches(count, teamSize) {
    return Array.from({ length: count }, () => ({
      id: uid('m'),
      a: Array(teamSize).fill(null),
      b: Array(teamSize).fill(null),
      result: null, // null | 'A' | 'B' | 'halve'
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

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
        if (touched) m.result = null;
      });
    });
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
        <div class="match-result">
          <button class="result-btn win-a ${match.result === 'A' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="A">${escapeHtml(state.teams.A.name)} win</button>
          <button class="result-btn halve ${match.result === 'halve' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="halve">Halve</button>
          <button class="result-btn win-b ${match.result === 'B' ? 'selected' : ''}" data-round="${round.id}" data-match="${match.id}" data-result="B">${escapeHtml(state.teams.B.name)} win</button>
        </div>
        ${uniqueWarn.length ? `<div class="match-warn">⚠ ${escapeHtml(uniqueWarn.join(', '))} scheduled in more than one match this round.</div>` : ''}
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
        let pill = '<span class="pill pending">Pending</span>';
        if (m.result === 'A') pill = `<span class="pill a">${escapeHtml(state.teams.A.name)}</span>`;
        else if (m.result === 'B') pill = `<span class="pill b">${escapeHtml(state.teams.B.name)}</span>`;
        else if (m.result === 'halve') pill = `<span class="pill halve">Halved</span>`;
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

      const resultBtn = e.target.closest('.result-btn');
      if (resultBtn) {
        const { round: roundId, match: matchId, result } = resultBtn.dataset;
        const round = state.rounds.find((r) => r.id === roundId);
        const match = round?.matches.find((m) => m.id === matchId);
        if (match) {
          match.result = match.result === result ? null : result;
          saveState();
          renderMatches();
          renderLeaderboard();
        }
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
    const bindText = (id, path) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        const [obj, key] = path;
        obj[key] = el.value;
        saveState();
      });
      el.addEventListener('blur', () => renderAll());
    };
    bindText('team-a-name', [state.teams.A, 'name']);
    bindText('team-b-name', [state.teams.B, 'name']);
    bindText('tournament-date', [state, 'tournamentDate']);
    bindText('tournament-location', [state, 'location']);

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
  });
})();
