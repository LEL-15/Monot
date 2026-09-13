import { App, boardState } from './modules/state.js';
import { clearReconnectSession, getReconnectSession, prefillProfile, saveProfile, saveReconnectSession } from './modules/storage.js';
import { renderDrawing } from './modules/drawing.js';
import { renderCategorizing } from './modules/categorizing.js';
import { renderFinished, renderReveal } from './modules/results.js';
import { bindSocketEvents } from './modules/socket.js';

const socket = io();
const root = document.getElementById('app');

function esc(value) {
  const element = document.createElement('div');
  element.textContent = value == null ? '' : String(value);
  return element.innerHTML;
}

function showError(message) {
  const error = document.getElementById(`${root.dataset.page}Error`);
  if (error) error.innerHTML = `<div class="error-box">${esc(message)}</div>`;
}

function fadeCover() {
  const cover = document.getElementById('cover');
  if (!cover) return;
  setTimeout(() => cover.classList.add('faded'), 500);
}

function startLocalCountdown(endsAt, elementId, onExpire) {
  function tick() {
    const element = document.getElementById(elementId);
    if (!element) return;
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    element.textContent = `${remaining}s`;
    element.classList.toggle('low', remaining <= 10);
    if (remaining <= 0) {
      clearInterval(App.localTimerHandle);
      App.localTimerHandle = null;
      if (onExpire) onExpire();
    }
  }
  if (App.localTimerHandle) clearInterval(App.localTimerHandle);
  App.localTimerHandle = setInterval(tick, 250);
  tick();
}

function render() {
  if (App.localTimerHandle) {
    clearInterval(App.localTimerHandle);
    App.localTimerHandle = null;
  }
  if (App.screen === 'home') return fadeCover();
  if (App.screen === 'lobby') return renderLobby();
  if (App.screen === 'drawing') return renderDrawing({ App, boardState, socket, startLocalCountdown });
  if (App.screen === 'categorizing') return renderCategorizing({ App, root, socket, esc, startLocalCountdown });
  if (App.screen === 'reveal') return renderReveal({ App, root, socket, esc });
  if (App.screen === 'finished') return renderFinished({ App, root, socket, esc, clearReconnectSession });
}

function renderIntoTarget(targetId, content) {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = content;
  else root.innerHTML = content;
}

async function loadView(viewName) {
  const viewHtml = await fetch(`/views/${viewName}.html`).then(response => {
    if (!response.ok) throw new Error(`Could not load ${viewName}`);
    return response.text();
  }).catch(error => {
    console.error(error);
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
    prefillProfile();
    document.getElementById('hostForm').onsubmit = event => {
      event.preventDefault();
      const name = document.getElementById('name').value.trim() || 'Host';
      const gameCode = document.getElementById('gameCode').value.trim().toUpperCase();
      const rounds = parseInt(document.getElementById('rounds').value, 10) || 3;
      const roundSeconds = parseInt(document.getElementById('roundSeconds').value, 10) || 60;
      const catSeconds = parseInt(document.getElementById('catSeconds').value, 10) || 30;
      const difficulty = document.getElementById('difficulty').value || 'easy';
      const hiddenWords = document.getElementById('hiddenWords').checked;
      const button = document.getElementById('createBtn');
      button.disabled = true;
      button.textContent = 'Creating...';
      saveProfile(name, gameCode, { rounds, roundSeconds, catSeconds, difficulty, hiddenWords });
      saveReconnectSession({ code: gameCode, name, reconnectToken: getReconnectSession()?.reconnectToken || null });
      socket.emit('host-game', { gameCode, name, rounds, roundSeconds, catSeconds, difficulty, hiddenWords });
    };
    bindNavigationButtons();
    return;
  }

  if (viewName === 'join') {
    prefillProfile();
    document.getElementById('joinForm').onsubmit = event => {
      event.preventDefault();
      const code = document.getElementById('gameCode').value.trim().toUpperCase();
      const name = document.getElementById('name').value.trim();
      if (!code) return showError('Enter the game code.');
      if (!name) return showError('Enter your name.');
      const button = document.getElementById('joinConfirm');
      button.disabled = true;
      button.textContent = 'Joining...';
      saveProfile(name, code);
      saveReconnectSession({ code, name, reconnectToken: getReconnectSession()?.reconnectToken || null });
      socket.emit('join-game', { code, name, reconnectToken: getReconnectSession()?.reconnectToken });
    };
    bindNavigationButtons();
    return;
  }

  if (viewName === 'lobby') renderLobby();
  if (['drawing', 'categorizing', 'reveal'].includes(viewName)) render();
}

function bindNavigationButtons() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => setScreen(button.dataset.view);
  });
}

function setScreen(name) {
  App.screen = name;
  if (['home', 'host', 'join', 'lobby', 'drawing', 'categorizing', 'reveal'].includes(name)) {
    loadView(name);
  } else {
    render();
  }
}

function renderLobby() {
  const players = App.lobbyPlayers;
  const lobbyCode = document.getElementById('lobbyCode');
  const rounds = document.getElementById('rounds');
  const roundSeconds = document.getElementById('roundSeconds');
  const catSeconds = document.getElementById('catSeconds');
  const difficulty = document.getElementById('difficulty');
  const hiddenWords = document.getElementById('hiddenWords');
  const count = document.getElementById('lobbyPlayerCount');
  const list = document.getElementById('lobbyPlayerList');
  const actions = document.getElementById('lobbyActions');

  if (lobbyCode) lobbyCode.textContent = App.code;
  if (rounds) rounds.textContent = String(App.config.rounds);
  if (roundSeconds) roundSeconds.textContent = String(App.config.roundSeconds);
  if (catSeconds) catSeconds.textContent = String(App.config.catSeconds);
  if (difficulty) difficulty.textContent = App.config.difficulty;
  if (hiddenWords) hiddenWords.textContent = App.config.hiddenWords ? 'Yes' : 'No';
  if (count) count.textContent = String(players.length);
  if (list) list.innerHTML = players.map(player => `<li>${esc(player.name)}</li>`).join('') || '<li>Waiting for players...</li>';
  if (actions) {
    actions.innerHTML = App.isHost
      ? `<button class="btn-primary" id="startBtn" ${players.length < 2 ? 'disabled' : ''}>${players.length < 2 ? 'Need at least 2 players' : 'Start Game'}</button>`
      : '<div class="status-msg">Waiting for the host to start the game...</div>';
  }

  const startButton = document.getElementById('startBtn');
  if (startButton) {
    startButton.disabled = players.length < 2;
    startButton.textContent = players.length < 2 ? 'Need at least 2 players' : 'Start Game';
    startButton.onclick = () => {
      startButton.disabled = true;
      startButton.textContent = 'Starting...';
      socket.emit('start-game');
    };
  }

  const leaveButton = document.getElementById('leaveBtn');
  if (leaveButton) leaveButton.onclick = () => {
    leaveButton.disabled = true;
    leaveButton.textContent = 'Leaving...';
    socket.emit('leave-game');
  };
  fadeCover();
}

function initializePage() {
  const page = root.dataset.page || 'home';
  if (['lobby', 'drawing', 'categorizing', 'reveal'].includes(page)) {
    App.screen = page;
    render();
    return;
  }
  setScreen('home');
}

bindSocketEvents({ socket, App, setScreen, renderLobby, showError });
initializePage();
