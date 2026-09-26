import { clearReconnectSession, getReconnectSession, saveProfile, saveReconnectSession } from './storage.js';
import { playDefeatSound, playVictorySound } from './audio.js';

export function bindSocketEvents({ socket, App, setScreen, renderLobby, showError }) {
  
  socket.on('game-joined', ({ code, playerId, isHost, config, reconnectToken }) => {
    App.code = code;
    App.playerId = playerId;
    App.isHost = isHost;
    App.config = config;
    saveProfile(getReconnectSession()?.name || '', code);
    saveReconnectSession({ code, name: getReconnectSession()?.name || '', reconnectToken });
    setScreen('lobby');
  });

  
  socket.on('join-error', ({ message }) => {
    const button = document.getElementById('joinConfirm');
    if (button) { button.disabled = false; button.textContent = 'Join Game'; }
    showError(message);
  });

  
  socket.on('game-error', ({ message }) => {
    const button = document.getElementById('createBtn');
    if (button) { button.disabled = false; button.textContent = 'Create Game'; }
    const startButton = document.getElementById('startBtn');
    if (startButton) {
      startButton.disabled = App.lobbyPlayers.length < 2;
      startButton.textContent = startButton.disabled ? 'Need at least 2 players' : 'Start Game';
    }
    showError(message);
  });

  
  socket.on('game-left', () => {
    clearReconnectSession();
    App.code = null;
    App.playerId = null;
    App.isHost = false;
    setScreen('home');
  });
  
  socket.on('game-closed', () => {
    clearReconnectSession();
    App.code = null;
    App.playerId = null;
    App.isHost = false;
    setScreen('home');
  });

  
  socket.on('lobby-update', ({ players }) => {
    App.lobbyPlayers = players;
    if (App.screen === 'lobby') renderLobby();
  });

  socket.on('lobby-settings-updated', ({ config }) => {
    App.config = config;
    if (App.isHost) saveProfile(getReconnectSession()?.name || '', App.code, config);
    if (App.screen !== 'lobby' || App.isHost) return;
    const settingsForm = document.getElementById('lobbySettingsForm');
    if (!settingsForm) {
      renderLobby();
      return;
    }
    document.getElementById('lobbyRounds').value = config.rounds;
    document.getElementById('lobbyRoundSeconds').value = config.roundSeconds;
    document.getElementById('lobbyCatSeconds').value = config.catSeconds;
    document.getElementById('lobbyDifficulty').value = config.difficulty;
    document.getElementById('lobbyHiddenWords').checked = config.hiddenWords;
  });
  
  socket.on('game-restarted', ({ config, players }) => {
    App.config = config;
    App.lobbyPlayers = players;
    App.victoryPlayed = false;
    App.defeatPlayed = false;
    setScreen('lobby');
  });
  
  socket.on('phase-drawing', payload => {
    App.round = payload;
    App.drawSubmitted = false;
    App.catSubmitted = false;
    App.catChoices = {};
    setScreen('drawing');
  });
  
  socket.on('phase-categorizing', payload => {
    App.round = Object.assign({}, App.round, payload);
    App.catSubmitted = false;
    App.catChoices = {};
    setScreen('categorizing');
  });
  
  socket.on('phase-reveal', payload => {
    App.revealData = payload;
    setScreen('reveal');
  });
  
  socket.on('phase-finished', payload => {
    App.finalLeaderboard = payload.leaderboard;
    const topScore = payload.leaderboard.length ? payload.leaderboard[0].score : null;
    const bottomScore = payload.leaderboard.length ? payload.leaderboard[payload.leaderboard.length - 1].score : null;
    const playerResult = payload.leaderboard.find(player => player.id === App.playerId);
    const isWinner = Boolean(playerResult && playerResult.score === topScore);
    const isLoser = Boolean(playerResult && playerResult.score === bottomScore);

    if (isWinner && !App.victoryPlayed) {
      App.victoryPlayed = true;
      playVictorySound();
    }

    if (isLoser && !App.defeatPlayed) {
      App.defeatPlayed = true;
      playDefeatSound();
    }

    setScreen('finished');
  });
  
  socket.on('disconnect', () => showError('Lost connection to the server. Refresh to try rejoining.'));
  
  socket.on('connect', () => {
    const session = getReconnectSession();
    if (session && session.code && session.name) socket.emit('join-game', session);
  });
}
