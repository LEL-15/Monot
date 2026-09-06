const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rooms = require('./rooms');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

function clampInt(val, min, max, fallback) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------- phase transitions (server-authoritative) ----------

function startDrawingPhase(room, roundIdx) {
  if (room.timer) clearTimeout(room.timer);
  room.currentRound = roundIdx;
  rooms.assignWordsForRound(room, roundIdx);
  room.phase = 'drawing';
  room.phaseEndsAt = Date.now() + room.roundSeconds * 1000;
  room.drawings[roundIdx] = room.drawings[roundIdx] || {};

  room.players.forEach((player, playerId) => {
    const word = room.assignments[roundIdx][playerId];
    io.to(playerId).emit('phase-drawing', {
      round: roundIdx,
      rounds: room.rounds,
      word,
      phaseEndsAt: room.phaseEndsAt,
    });
  });

  room.timer = setTimeout(() => startCategorizingPhase(room), room.roundSeconds * 1000 + 500);
}

function startCategorizingPhase(room) {
  if (room.timer) clearTimeout(room.timer);
  const roundIdx = room.currentRound;
  room.phase = 'categorizing';
  room.phaseEndsAt = Date.now() + room.catSeconds * 1000;
  room.categorizations[roundIdx] = room.categorizations[roundIdx] || {};

  const drawings = room.drawings[roundIdx] || {};
  const drawingList = Object.keys(drawings).map(drawerId => ({
    drawerId,
    dataUrl: drawings[drawerId].dataUrl,
  }));

  io.to(room.code).emit('phase-categorizing', {
    round: roundIdx,
    rounds: room.rounds,
    wordPair: room.roundWords[roundIdx - 1],
    drawings: drawingList,
    phaseEndsAt: room.phaseEndsAt,
  });

  room.timer = setTimeout(() => finishCategorizing(room), room.catSeconds * 1000);
}

function finishCategorizing(room) {
  if (room.timer) clearTimeout(room.timer);
  const roundIdx = room.currentRound;
  const result = rooms.computeRoundResults(room, roundIdx);
  room.phase = 'reveal';

  io.to(room.code).emit('phase-reveal', {
    round: roundIdx,
    rounds: room.rounds,
    details: result.details,
    wordPair: result.wordPair,
    leaderboard: rooms.leaderboard(room),
    isLastRound: roundIdx >= room.rounds,
  });
}

function finishGame(room) {
  room.phase = 'finished';
  io.to(room.code).emit('phase-finished', {
    leaderboard: rooms.leaderboard(room),
  });
}

function checkAllDrawn(room) {
  const roundIdx = room.currentRound;
  const submitted = Object.keys(room.drawings[roundIdx] || {}).length;
  if (room.phase === 'drawing' && submitted >= room.players.size && room.players.size > 0) {
    startCategorizingPhase(room);
  }
}

function checkAllCategorized(room) {
  const roundIdx = room.currentRound;
  const submitted = Object.keys(room.categorizations[roundIdx] || {}).length;
  if (room.phase === 'categorizing' && submitted >= room.players.size && room.players.size > 0) {
    finishCategorizing(room);
  }
}

// ---------- socket wiring ----------

io.on('connection', (socket) => {
  socket.data.code = null;

  socket.on('host-game', ({ gameCode, name, rounds, roundSeconds, catSeconds, difficulty }) => {
    const cleanName = (name || 'Host').toString().trim().slice(0, 18) || 'Host';
    const room = rooms.createRoom({
      code: gameCode,
      hostId: socket.id,
      hostName: cleanName,
      rounds: clampInt(rounds, 1, 10, 3),
      roundSeconds: clampInt(roundSeconds, 15, 180, 60),
      catSeconds: clampInt(catSeconds, 10, 120, 30),
      difficulty
    });
    socket.data.code = room.code;
    socket.join(room.code);
    socket.emit('game-joined', { code: room.code, playerId: socket.id, isHost: true, config: {
      rounds: room.rounds,
      roundSeconds: room.roundSeconds,
      catSeconds: room.catSeconds,
      difficulty: room.difficulty
    } });
    io.to(room.code).emit('lobby-update', { players: rooms.lobbyPlayers(room) });
  });

  socket.on('join-game', ({ code, name }) => {
    const room = rooms.getRoom(code);
    if (!room) return socket.emit('join-error', { message: 'No game found with that code.' });
    if (room.phase !== 'lobby') return socket.emit('join-error', { message: 'That game has already started.' });
    const cleanName = (name || 'Player').toString().trim().slice(0, 18) || 'Player';
    rooms.addPlayer(room, socket.id, cleanName);
    socket.data.code = room.code;
    socket.join(room.code);
    socket.emit('game-joined', { code: room.code, playerId: socket.id, isHost: false, config: {
      rounds: room.rounds,
      roundSeconds: room.roundSeconds,
      catSeconds: room.catSeconds,
      difficulty: room.difficulty
    } });
    io.to(room.code).emit('lobby-update', { players: rooms.lobbyPlayers(room) });
  });

  socket.on('start-game', () => {
    const room = rooms.getRoom(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.size < 2) return socket.emit('game-error', { message: 'Need at least 2 players.' });
    startDrawingPhase(room, 1);
  });

  socket.on('submit-drawing', ({ dataUrl }) => {
    const room = rooms.getRoom(socket.data.code);
    if (!room || room.phase !== 'drawing') return;
    const roundIdx = room.currentRound;
    const word = room.assignments[roundIdx] ? room.assignments[roundIdx][socket.id] : null;
    room.drawings[roundIdx] = room.drawings[roundIdx] || {};
    room.drawings[roundIdx][socket.id] = { word, dataUrl, submittedAt: Date.now() };
    checkAllDrawn(room);
  });

  socket.on('submit-categorization', ({ guesses }) => {
    const room = rooms.getRoom(socket.data.code);
    if (!room || room.phase !== 'categorizing') return;
    const roundIdx = room.currentRound;
    room.categorizations[roundIdx] = room.categorizations[roundIdx] || {};
    room.categorizations[roundIdx][socket.id] = { guesses: guesses || {}, submittedAt: Date.now() };
    checkAllCategorized(room);
  });

  socket.on('continue-after-reveal', () => {
    const room = rooms.getRoom(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'reveal') return;
    if (room.currentRound < room.rounds) {
      startDrawingPhase(room, room.currentRound + 1);
    } else {
      finishGame(room);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms.getRoom(socket.data.code);
    if (!room) return;
    rooms.removePlayer(room, socket.id);
    if (room.players.size === 0) {
      rooms.deleteRoom(room.code);
      return;
    }
    if (room.phase === 'lobby') {
      io.to(room.code).emit('lobby-update', { players: rooms.lobbyPlayers(room) });
    } else if (room.phase === 'drawing') {
      checkAllDrawn(room);
    } else if (room.phase === 'categorizing') {
      checkAllCategorized(room);
    }
    // Note: if the host disconnects mid-game, the game currently has no
    // host-reassignment logic, so no one can advance past the "reveal"
    // screen. Worth adding host-migration if this matters for your use case.
  });
});

server.listen(PORT, () => {
  console.log(`Monot server listening on port ${PORT}`);
});
