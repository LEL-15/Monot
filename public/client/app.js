import { App, boardState } from './modules/state.js';
import { clearReconnectSession, getReconnectSession, getStoredProfile, prefillProfile, saveProfile, saveReconnectSession } from './modules/storage.js';
import { renderDrawing } from './modules/drawing.js';
import { renderCategorizing } from './modules/categorizing.js';
import { renderFinished, renderReveal } from './modules/results.js';
import { bindSocketEvents } from './modules/socket.js';

const socket = io();
const root = document.getElementById('app');
let lobbySettingsSaveTimer = null;

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

  if (viewName === 'host' || viewName === 'join') prefillProfile();

  if (viewName === 'home') {
    document.querySelectorAll('[data-view]').forEach(button => {
      button.onclick = () => setScreen(button.dataset.view);
    });
    const howToPlayButton = document.getElementById('howToPlayButton');
    const howToPlayModal = document.getElementById('howToPlayModal');
    const gotItHowToPlay = document.getElementById('gotItHowToPlay');
    const closeHowToPlayModal = () => {
      howToPlayModal.hidden = true;
      howToPlayButton.focus();
    };
    howToPlayButton.onclick = () => {
      howToPlayModal.hidden = false;
      gotItHowToPlay.focus();
    };
    gotItHowToPlay.onclick = closeHowToPlayModal;
    howToPlayModal.onclick = event => {
      if (event.target === howToPlayModal) closeHowToPlayModal();
    };
    howToPlayModal.onkeydown = event => {
      if (event.key === 'Escape') closeHowToPlayModal();
    };
    fadeCover();
    return;
  }

  if (viewName === 'host') {
    document.getElementById('hostForm').onsubmit = event => {
      event.preventDefault();
      const name = document.getElementById('name').value.trim() || 'Host';
      const gameCode = document.getElementById('gameCode').value.trim().toUpperCase();
      const profile = getStoredProfile() || {};
      const difficulty = ['Easy', 'Medium', 'Hard'].includes(profile.difficulty) ? profile.difficulty : 'Hard';
      const config = {
        rounds: Number(profile.rounds) || 3,
        roundSeconds: Number(profile.roundSeconds) || 20,
        catSeconds: Number(profile.catSeconds) || 60,
        difficulty,
        hiddenWords: profile.hiddenWords ?? true,
      };
      const button = document.getElementById('createBtn');
      button.disabled = true;
      button.textContent = 'Creating...';
      saveProfile(name, gameCode, config);
      saveReconnectSession({ code: gameCode, name, reconnectToken: getReconnectSession()?.reconnectToken || null });
      socket.emit('host-game', { gameCode, name, ...config });
    };
    bindNavigationButtons();
    return;
  }

  if (viewName === 'join') {
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
  const settingsForm = document.getElementById('lobbySettingsForm');
  const count = document.getElementById('lobbyPlayerCount');
  const list = document.getElementById('lobbyPlayerList');
  const actions = document.getElementById('lobbyActions');

  if (lobbyCode) lobbyCode.textContent = App.code;
  if (settingsForm) {
    const initialized = settingsForm.dataset.initialized === 'true';
    const roundsInput = document.getElementById('lobbyRounds');
    const roundSecondsInput = document.getElementById('lobbyRoundSeconds');
    const catSecondsInput = document.getElementById('lobbyCatSeconds');
    const difficultyInput = document.getElementById('lobbyDifficulty');
    const hiddenWordsInput = document.getElementById('lobbyHiddenWords');
    if (!App.isHost || !initialized) {
      roundsInput.value = App.config.rounds;
      roundSecondsInput.value = App.config.roundSeconds;
      catSecondsInput.value = App.config.catSeconds;
      difficultyInput.value = App.config.difficulty;
      hiddenWordsInput.checked = App.config.hiddenWords;
    }
    [roundsInput, roundSecondsInput, catSecondsInput, difficultyInput, hiddenWordsInput]
      .forEach(input => { input.disabled = !App.isHost; });
    settingsForm.dataset.initialized = 'true';
    settingsForm.onsubmit = event => event.preventDefault();
    const saveSettings = () => {
      if (lobbySettingsSaveTimer) clearTimeout(lobbySettingsSaveTimer);
      lobbySettingsSaveTimer = null;
      socket.emit('update-game-settings', {
        rounds: document.getElementById('lobbyRounds').value,
        roundSeconds: document.getElementById('lobbyRoundSeconds').value,
        catSeconds: document.getElementById('lobbyCatSeconds').value,
        difficulty: document.getElementById('lobbyDifficulty').value,
        hiddenWords: document.getElementById('lobbyHiddenWords').checked,
      });
    };
    settingsForm.oninput = event => {
      if (event.target.type !== 'number') return;
      if (lobbySettingsSaveTimer) clearTimeout(lobbySettingsSaveTimer);
      lobbySettingsSaveTimer = setTimeout(saveSettings, 300);
    };
    settingsForm.onchange = event => {
      if (event.target.type === 'number' || event.target.type === 'checkbox' || event.target.tagName === 'SELECT') {
        saveSettings();
      }
    };
  }
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
      socket.emit('start-game', {
        rounds: document.getElementById('lobbyRounds').value,
        roundSeconds: document.getElementById('lobbyRoundSeconds').value,
        catSeconds: document.getElementById('lobbyCatSeconds').value,
        difficulty: document.getElementById('lobbyDifficulty').value,
        hiddenWords: document.getElementById('lobbyHiddenWords').checked,
      });
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
