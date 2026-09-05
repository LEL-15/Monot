(function () {
  const socket = io();
  const root = document.getElementById('app');

  const App = {
    screen: 'home',
    code: null,
    playerId: null,
    isHost: false,
    drawColor: '#000000',
    catChoices: {},
    drawSubmitted: false,
    catSubmitted: false,
    localTimerHandle: null,
    errorMsg: null,
    round: { round: 0, rounds: 0, word: null, phaseEndsAt: 0, wordPair: null, drawings: [] },
    lobbyPlayers: [],
    revealData: null,
    finalLeaderboard: [],
  };

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function setScreen(name) { App.screen = name; render(); }
  function showError(message) {
    const error = document.getElementById(`${root.dataset.page}Error`);
    if (error) error.innerHTML = `<div class="error-box">${esc(message)}</div>`;
  }
  function fadeCover() {
    const cover = document.getElementById('cover');
    if (!cover) return;

    setTimeout(() => {
      cover.classList.add('faded');
    }, 500);
  }

  // ---------------- rendering ----------------
  function render() {
    if (App.localTimerHandle) { clearInterval(App.localTimerHandle); App.localTimerHandle = null; }
    if (App.screen === 'home') return renderHome();
    if (App.screen === 'lobby') return renderLobby();
    if (App.screen === 'drawing') return renderDrawing();
    if (App.screen === 'categorizing') return renderCategorizing();
    if (App.screen === 'reveal') return renderReveal();
    if (App.screen === 'finished') return renderFinished();
  }

  function renderHome() {
    fadeCover();
  }

  function renderIntoTarget(targetId, content) {
    const target = document.getElementById(targetId);
    if (target) {
      target.innerHTML = content;
      return;
    }
    root.innerHTML = content;
  }

  async function loadView(viewName) {
    const viewHtml = await fetch(`/views/${viewName}.html`).then(r => {
      if (!r.ok) throw new Error(`Could not load ${viewName}`);
      return r.text();
    }).catch((err) => {
      console.error(err);
      return '<div class="status-msg">Unable to load view.</div>';
    });

    root.innerHTML = viewHtml;
    root.dataset.page = viewName;

    if (viewName === 'home') {
      document.querySelectorAll('[data-view]').forEach(button => {
        button.onclick = () => setScreen(button.dataset.view);
      });
      fadeCover();
      return;
    }

    if (viewName === 'host') {
      document.getElementById('hostForm').onsubmit = (event) => {
        event.preventDefault();
        const name = document.getElementById('name').value.trim() || 'Host';
        const gameCode = document.getElementById('gameCode').value.trim().toUpperCase();
        const rounds = parseInt(document.getElementById('rounds').value, 10) || 3;
        const roundSeconds = parseInt(document.getElementById('roundSeconds').value, 10) || 60;
        const catSeconds = parseInt(document.getElementById('catSeconds').value, 10) || 30;
        const difficulty = document.getElementById('difficulty').value || 'easy';
        const button = document.getElementById('createBtn');
        button.disabled = true;
        button.textContent = 'Creating...';
        socket.emit('host-game', { gameCode, name, rounds, roundSeconds, catSeconds, difficulty });
      };
      document.querySelectorAll('[data-view]').forEach(button => {
        button.onclick = () => setScreen(button.dataset.view);
      });
      return;
    }

    if (viewName === 'join') {
      document.getElementById('joinForm').onsubmit = (event) => {
        event.preventDefault();
        const code = document.getElementById('gameCode').value.trim().toUpperCase();
        const name = document.getElementById('name').value.trim();
        if (!code) return showError('Enter the game code.');
        if (!name) return showError('Enter your name.');
        const button = document.getElementById('joinConfirm');
        button.disabled = true;
        button.textContent = 'Joining...';
        socket.emit('join-game', { code, name });
      };
      document.querySelectorAll('[data-view]').forEach(button => {
        button.onclick = () => setScreen(button.dataset.view);
      });
      return;
    }

    if (viewName === 'lobby') {
      renderLobby();
      return;
    }

    if (viewName === 'categorizing' || viewName === 'reveal') {
      render();
      return;
    }
  }

  function setScreen(name) {
    App.screen = name;
    if (['home', 'host', 'join', 'lobby', 'categorizing', 'reveal'].includes(name)) {
      loadView(name);
      return;
    }
    render();
  }

  function renderLobby() {
    const players = App.lobbyPlayers;
    const lobbyCode = document.getElementById('lobbyCode');
    const rounds = document.getElementById('rounds');
    const roundSeconds = document.getElementById('roundSeconds');
    const catSeconds = document.getElementById('catSeconds');
    const difficulty = document.getElementById('difficulty');
    const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');
    const lobbyPlayerList = document.getElementById('lobbyPlayerList');
    const lobbyActions = document.getElementById('lobbyActions');

    if (lobbyCode) lobbyCode.textContent = App.code;
    if (rounds) rounds.textContent = String(App.config.rounds);
    if (roundSeconds) roundSeconds.textContent = String(App.config.roundSeconds);
    if (catSeconds) catSeconds.textContent = String(App.config.catSeconds);
    if (difficulty) difficulty.textContent = App.config.difficulty;
    if (lobbyPlayerCount) lobbyPlayerCount.textContent = String(players.length);
    if (lobbyPlayerList) {
      lobbyPlayerList.innerHTML = players.map(p => `<li>${esc(p.name)}</li>`).join('') || '<li>Waiting for players...</li>';
    }
    if (lobbyActions) {
      lobbyActions.innerHTML = App.isHost
        ? `<button class="btn-primary" id="startBtn" ${players.length < 2 ? 'disabled' : ''}>${players.length < 2 ? 'Need at least 2 players' : 'Start Game'}</button>`
        : `<div class="status-msg">Waiting for the host to start the game...</div>`;
    }

    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.disabled = players.length < 2;
      startBtn.textContent = players.length < 2 ? 'Need at least 2 players' : 'Start Game';
      startBtn.onclick = () => {
        const btn = document.getElementById('startBtn'); btn.disabled = true; btn.textContent = 'Starting...';
        socket.emit('start-game');
      };
    }

    fadeCover();
  }

  function startLocalCountdown(endsAt, elId, onExpire) {
    function tickFn() {
      const el = document.getElementById(elId);
      if (!el) return;
      const remain = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      el.textContent = remain + 's';
      el.classList.toggle('low', remain <= 10);
      if (remain <= 0) {
        clearInterval(App.localTimerHandle);
        App.localTimerHandle = null;
        onExpire && onExpire();
      }
    }
    if (App.localTimerHandle) clearInterval(App.localTimerHandle);
    App.localTimerHandle = setInterval(tickFn, 250);
    tickFn();
  }

  function renderDrawing() {
    const r = App.round;
    renderIntoTarget('drawScreen', `
      <div class="tagline" style="margin-bottom:6px;">Round ${r.round} of ${r.rounds}</div>
      <div class="timer" id="timer">--s</div>
      <div class="word-banner" style="background:var(--wordA); color:var(--wordA-ink);" id="wordBanner">Draw: ${esc(r.word)}</div>
      <div class="canvas-wrap"><canvas id="board" width="480" height="330"></canvas></div>
      <div class="toolbar">
        ${['#000000', '#950851', '#519508', '#f9cb34'].map(c => `<button class="swatch ${c === App.drawColor ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        <button id="clearBtn" class="btn-ghost" style="width:auto; margin:0; padding:8px 14px;">Clear</button>
      </div>
      <button class="btn-primary" id="submitDraw">Submit Drawing</button>
      <div class="small-note">Your word is private &mdash; only you can see it. Others will try to guess it from your drawing.</div>
    `);
    setupCanvas();
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.onclick = () => { App.drawColor = sw.dataset.color; document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active')); sw.classList.add('active'); };
    });
    document.getElementById('clearBtn').onclick = () => {
      const cv = document.getElementById('board'); const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    };
    document.getElementById('submitDraw').onclick = () => submitDrawing();
    startLocalCountdown(r.phaseEndsAt, 'timer', () => { if (!App.drawSubmitted) submitDrawing(); });
  }

  function setupCanvas() {
    const cv = document.getElementById('board');
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 6;
    let drawing = false, last = null;
    function pos(e) {
      const rect = cv.getBoundingClientRect();
      const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return; e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = App.drawColor;
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    }
    function end() { drawing = false; }
    cv.addEventListener('mousedown', start);
    cv.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    cv.addEventListener('touchstart', start, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', end);
  }

  function submitDrawing() {
    if (App.drawSubmitted) return;
    App.drawSubmitted = true;
    const cv = document.getElementById('board');
    const dataUrl = cv ? cv.toDataURL('image/png') : null;
    socket.emit('submit-drawing', { dataUrl });
    root.innerHTML = `<div class="status-msg">It's a masterpice! Waiting for other players to finish drawing...</div>`;
  }

  function renderCategorizing() {
    const r = App.round;
    const targets = r.drawings.filter(d => d.drawerId !== App.playerId);
    const pair = r.wordPair;

    if (targets.length === 0) {
      renderIntoTarget('sortScreen', '<div class="status-msg">No drawings to sort this round. Waiting...</div>');
      return;
    }

    const roundNumber = document.getElementById('sortRoundNumber');
    const drawingCards = document.getElementById('drawingCards');
    if (roundNumber) roundNumber.textContent = String(r.round);
    if (drawingCards) drawingCards.innerHTML = targets.map(t => `
        <div class="drawing-card">
          <img src="${t.dataUrl}" alt="drawing" />
          <div class="choice-row">
            <button class="choice-btn" data-target="${t.drawerId}" data-word="${esc(pair[0])}">${esc(pair[0])}</button>
            <button class="choice-btn" data-target="${t.drawerId}" data-word="${esc(pair[1])}">${esc(pair[1])}</button>
          </div>
        </div>
      `).join('');
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = () => {
        const t = btn.dataset.target, w = btn.dataset.word;
        App.catChoices[t] = w;
        document.querySelectorAll(`.choice-btn[data-target="${t}"]`).forEach(b => b.classList.remove('sel-a', 'sel-b'));
        const isFirst = w === pair[0];
        document.querySelectorAll(`.choice-btn[data-target="${t}"][data-word="${w}"]`).forEach(b => b.classList.add(isFirst ? 'sel-a' : 'sel-b'));
      };
    });
    document.getElementById('submitCat').onclick = () => submitCategorization();
    startLocalCountdown(r.phaseEndsAt, 'timer', () => { if (!App.catSubmitted) submitCategorization(); });
  }

  function submitCategorization() {
    if (App.catSubmitted) return;
    App.catSubmitted = true;
    socket.emit('submit-categorization', { guesses: App.catChoices });
    root.innerHTML = `<div class="status-msg">Answers locked in! Waiting for everyone else...</div>`;
  }

  function renderReveal() {
    const data = App.revealData;
    const roundNumberEl = document.getElementById('revealRoundNumber');
    const revealDetails = document.getElementById('revealDetails');

    if (!data) {
      if (roundNumberEl) roundNumberEl.textContent = '0';
      if (revealDetails) revealDetails.innerHTML = '<div class="status-msg">Tallying results...</div>';
      return;
    }

    if (roundNumberEl) roundNumberEl.textContent = String(data.round);
    if (revealDetails) {
      revealDetails.innerHTML = `
        ${data.details.map(d => `
          <div class="reveal-item">
            <span class="points-badge">+${d.pointsEarned}</span>
            <strong>${esc(d.drawerName)}</strong> was drawing <span class="pill ${d.word === data.wordPair[0] ? 'pill-a' : 'pill-b'}">${esc(d.word)}</span>
            <img src="${d.dataUrl}" alt="drawing"/>
            <div>${d.guesses.map(g => `<span class="guess-tag ${g.correct ? 'guess-right' : 'guess-wrong'}">${g.correct ? '\u2713' : '\u2717'} ${esc(g.guesserName)}</span>`).join('') || '<span class="hint">No one guessed this one.</span>'}</div>
          </div>
        `).join('')}
        <div class="card">
          <h2>Leaderboard</h2>
          <ul class="player-list">${data.leaderboard.map(p => `<li><span>${esc(p.name)}</span><span class="player-score">${p.score}</span></li>`).join('')}</ul>
        </div>
        ${App.isHost
          ? `<button class="btn-primary" id="continueBtn">${data.isLastRound ? 'See Final Results' : 'Start Next Round'}</button>`
          : `<div class="status-msg">Waiting for the host to continue...</div>`}
      `;
    }

    if (App.isHost) {
      document.getElementById('continueBtn').onclick = () => {
        const btn = document.getElementById('continueBtn'); btn.disabled = true; btn.textContent = 'Loading...';
        socket.emit('continue-after-reveal');
      };
    }
  }

  function renderFinished() {
    const players = App.finalLeaderboard;
    const topScore = players.length ? players[0].score : 0;
    const winners = players.filter(p => p.score === topScore);
    root.innerHTML = `
      <div class="trophy">\u{1F3C6}</div>
      <div class="winner-name">${winners.map(w => esc(w.name)).join(' & ')}</div>
      <div class="hint" style="margin-bottom:18px;">${winners.length > 1 ? 'tie for the win!' : 'wins the game!'}</div>
      <div class="card">
        <h2>Final Scores</h2>
        <ul class="player-list final-list">${players.map(p => `<li class="${p.score === topScore ? 'win' : ''}"><span>${esc(p.name)}</span><span class="player-score">${p.score}</span></li>`).join('')}</ul>
      </div>
      <button class="btn-primary" id="newGameBtn">Back to Home</button>
    `;
    fadeCover();
    document.getElementById('newGameBtn').onclick = () => { window.location.reload(); };
  }

  // ---------------- socket events ----------------
  socket.on('game-joined', ({ code, playerId, isHost, config }) => {
    App.code = code; 
    App.playerId = playerId; 
    App.isHost = isHost;
    App.config = config;
    setScreen('lobby');
  });
  socket.on('join-error', ({ message }) => {
    App.errorMsg = message;
    const btn = document.getElementById('joinConfirm');
    if (btn) { btn.disabled = false; btn.textContent = 'Join Game'; }
    showError(message);
  });

  socket.on('game-error', ({ message }) => { App.errorMsg = message; showError(message); });

  socket.on('lobby-update', ({ players }) => {
    App.lobbyPlayers = players;
    if (App.screen === 'lobby') renderLobby();
  });

  socket.on('phase-drawing', (payload) => {
    App.round = payload;
    App.drawSubmitted = false;
    App.catSubmitted = false;
    App.catChoices = {};
    setScreen('drawing');
  });

  socket.on('phase-categorizing', (payload) => {
    App.round = Object.assign({}, App.round, payload);
    App.catSubmitted = false;
    App.catChoices = {};
    setScreen('categorizing');
  });

  socket.on('phase-reveal', (payload) => {
    App.revealData = payload;
    setScreen('reveal');
  });

  socket.on('phase-finished', (payload) => {
    App.finalLeaderboard = payload.leaderboard;
    setScreen('finished');
  });

  socket.on('disconnect', () => {
    App.errorMsg = 'Lost connection to the server. Refresh to try rejoining.';
    showError(App.errorMsg);
  });

 function initializePage() {
   const page = root.dataset.page || 'home';

   if (page === 'lobby') {
     App.screen = 'lobby';
     renderLobby();
     return;
   }

   if (page === 'drawing') {
     App.screen = 'drawing';
     renderDrawing();
     return;
   }

   if (page === 'categorizing') {
     App.screen = 'categorizing';
     renderCategorizing();
     return;
   }

   if (page === 'reveal') {
     App.screen = 'reveal';
     renderReveal();
     return;
   }

   setScreen('home');
 }

 initializePage();
})();
