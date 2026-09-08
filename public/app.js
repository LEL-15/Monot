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

  const boardState = {
    canvasElement: null,
    context: null,
    strokes: [],
    drawing: false,
    location: null,
    currentStroke: null,
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

    if (viewName === 'drawing' || viewName === 'categorizing' || viewName === 'reveal') {
      render();
      return;
    }
  }

  function setScreen(name) {
    App.screen = name;
    if (['home', 'host', 'join', 'lobby', 'drawing', 'categorizing', 'reveal'].includes(name)) {
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
    const roundNumber = document.getElementById('drawRoundNumber');
    const totalRounds = document.getElementById('drawTotalRounds');
    const wordText = document.getElementById('drawWord');
    const swatches = document.querySelectorAll('.swatch');
    const undoBtn = document.getElementById('undoBtn');
    const submitBtn = document.getElementById('submitDraw');
    const board = document.getElementById('board');

    if (roundNumber) roundNumber.textContent = String(r.round);
    if (totalRounds) totalRounds.textContent = String(r.rounds);
    if (wordText) wordText.textContent = r.word || '...';

    if (board && !board.dataset.ready) {
      setupCanvas();
      board.dataset.ready = 'true';
    }

    const previewActive = r.previewEndsAt && Date.now() < r.previewEndsAt;
    if (boardState.canvasElement) {
      boardState.canvasElement.style.display = previewActive ? 'none' : 'block';
    }
    if (previewActive) {
      startLocalCountdown(r.previewEndsAt, 'timer', () => {
        renderDrawing();
      });
      return;
    }

    swatches.forEach(sw => {
      const isActive = sw.dataset.color === App.drawColor;
      sw.classList.toggle('active', isActive);
      sw.onclick = () => {
        App.drawColor = sw.dataset.color;
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      };
    });

    if (undoBtn) {
      undoBtn.onclick = undoBoardStroke;
    }

    if (submitBtn) {
      submitBtn.onclick = () => submitDrawing();
    }

    startLocalCountdown(r.phaseEndsAt, 'timer', () => { if (!App.drawSubmitted) submitDrawing(); });
  }

  function redrawBoard() {
    const { canvasElement: cv, context: ctx, strokes } = boardState;
    if (!cv || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    strokes.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    });
  }

  function undoBoardStroke() {
    if (!boardState.strokes.length) return;
    boardState.strokes.pop();
    redrawBoard();
  }

  function setupCanvas() {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    boardState.canvasElement = canvas;
    boardState.context = ctx;
    boardState.strokes = [];
    boardState.drawing = false;
    boardState.location = null;
    boardState.currentStroke = null;

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 6;

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
    }
    function start(e) {
      e.preventDefault();
      boardState.drawing = true;
      boardState.location = pos(e);
      boardState.currentStroke = { color: App.drawColor, points: [boardState.location] };
    }
    function move(e) {
      if (!boardState.drawing) return; e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = boardState.currentStroke.color;
      ctx.beginPath(); ctx.moveTo(boardState.location.x, boardState.location.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      boardState.currentStroke.points.push(p);
      boardState.location = p;
    }
    function end() {
      if (boardState.drawing && boardState.currentStroke && boardState.currentStroke.points.length > 1) {
        boardState.strokes.push(boardState.currentStroke);
      }
      boardState.drawing = false;
      boardState.location = null;
      boardState.currentStroke = null;
    }
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
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
      fetch('/views/drawing-score-card.html').then(r => r.text()).then(template => {
        const cards = Object.values(data.details).map(d => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = template.trim();
          const card = wrapper.firstElementChild;

          const drawerEl = card.querySelector('.score-card-drawer');
          const wordEl = card.querySelector('.score-card-word');
          const drawingPointsEl = card.querySelector('.drawing-card-points');
          const guessingPointsEl = card.querySelector('.guessing-card-points');
          const imgEl = card.querySelector('.score-card-image');
          const guessesEl = card.querySelector('.score-card-guesses');

          if (drawerEl) drawerEl.textContent = d.drawerName;
          if (wordEl) {
            wordEl.textContent = d.word;
            // apply pill class for A/B coloring
            if (d.word === data.wordPair[0]) {
              wordEl.classList.add('pill-a');
            } else if (d.word === data.wordPair[1]) {
              wordEl.classList.add('pill-b');
            }
          }
          if (drawingPointsEl) drawingPointsEl.textContent = `+${d.drawPoints}`;
          if (guessingPointsEl) guessingPointsEl.textContent = `+${d.guessPoints}`;
          if (imgEl) imgEl.src = d.dataUrl || '';

          if (guessesEl) {
            if (d.guesses && d.guesses.length) {
              guessesEl.innerHTML = d.guesses.map(g => `<span class="guess-tag ${g.correct ? 'guess-right' : 'guess-wrong'}">${g.correct ? '\u2713' : '\u2717'} ${esc(g.guesserName)}</span>`).join('');
            } else {
              guessesEl.innerHTML = '<span class="hint">No guesses submitted for drawing.</span>';
            }
          }

          return card.outerHTML;
        }).join('');

        const leaderboardHtml = `
          <div class="card">
            <h2>Leaderboard</h2>
            <ul class="player-list">${data.leaderboard.map(p => `<li><span>${esc(p.name)}</span><span class="player-score">${p.score}</span></li>`).join('')}</ul>
          </div>
        `;

        const hostHtml = App.isHost
          ? `<button class="btn-primary" id="continueBtn">${data.isLastRound ? 'See Final Results' : 'Start Next Round'}</button>`
          : `<div class="status-msg">Waiting for the host to continue...</div>`;

        revealDetails.innerHTML = cards + leaderboardHtml + hostHtml;

        if (App.isHost) {
          const continueBtn = document.getElementById('continueBtn');
          if (continueBtn) {
            continueBtn.onclick = () => {
              const btn = continueBtn; btn.disabled = true; btn.textContent = 'Loading...';
              socket.emit('continue-after-reveal');
            };
          }
        }
      }).catch(err => {
        console.error('Failed loading score card template', err);
        revealDetails.innerHTML = '<div class="status-msg">Tallying results...</div>';
      });
    }

  }

  function renderFinished() {
    const players = App.finalLeaderboard;
    const topScore = players.length ? players[0].score : 0;
    const winners = players.filter(p => p.score === topScore);
    fetch('/views/finished.html').then(r => r.text()).then(template => {
      root.innerHTML = template;

      document.getElementById('winnerName').textContent = winners.map(w => w.name).join(' & ');
      document.getElementById('winnerHint').textContent = winners.length > 1 ? 'tie for the win!' : 'wins the game!';
      document.getElementById('finalScores').innerHTML = players.map(p =>
        `<li class="${p.score === topScore ? 'win' : ''}"><span>${esc(p.name)}</span><span class="player-score">${p.score}</span></li>`
      ).join('');

      fadeCover();
      document.getElementById('newGameBtn').onclick = () => { window.location.reload(); };
    }).catch(err => {
      console.error('Failed loading finished view', err);
      root.innerHTML = '<div class="status-msg">Unable to load final results.</div>';
    });
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
