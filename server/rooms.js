const EASY_WORDS = require('./easyWordPairs');
const HARD_WORDS = require('./hardWordPairs');

// All active games live in memory, keyed by 4-letter room code.
// This is intentional: games are short-lived and don't need a database.
const rooms = new Map();

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createRoom({ code, hostId, hostName, rounds, roundSeconds, catSeconds, difficulty }) {
  const pairsPool = shuffled(difficulty === 'Hard' ? HARD_WORDS : EASY_WORDS);
  const roundWords = [];
  for (let i = 0; i < rounds; i++) roundWords.push(pairsPool[i % pairsPool.length]);

  const room = {
    code,
    hostId,
    phase: 'lobby',
    rounds,
    roundSeconds,
    catSeconds,
    difficulty,
    currentRound: 0,
    roundWords,
    players: new Map(), // playerId -> { id, name, score }
    assignments: {},    // round -> { playerId: word }
    drawings: {},       // round -> { playerId: { word, dataUrl } }
    categorizations: {},// round -> { playerId: { guesses: { targetId: word } } }
    results: {},        // round -> result object
    timer: null,
    phaseEndsAt: null,
  };
  room.players.set(hostId, { id: hostId, name: hostName, score: 0 });
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code);
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (room && room.timer) clearTimeout(room.timer);
  rooms.delete(code);
}

function addPlayer(room, playerId, name) {
  room.players.set(playerId, { id: playerId, name, score: 0 });
}

function removePlayer(room, playerId) {
  room.players.delete(playerId);
}

function lobbyPlayers(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));
}

function leaderboard(room) {
  return Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function assignWordsForRound(room, roundIdx) {
  const pair = room.roundWords[roundIdx - 1];
  const ids = shuffled(Array.from(room.players.keys()));
  const assignment = {};
  ids.forEach((id, i) => { assignment[id] = pair[Math.round(Math.random())] });
  room.assignments[roundIdx] = assignment;
  return assignment;
}

function computeRoundResults(room, roundIdx) {
  const assignments = room.assignments[roundIdx] || {};
  const drawings = room.drawings[roundIdx] || {};
  const cats = room.categorizations[roundIdx] || {};

  const drawPoints = {};
  const guessPoints = {};
  room.players.forEach((p, id) => { drawPoints[id] = 0; });
  room.players.forEach((p, id) => { guessPoints[id] = 0; });

  const details = {};
  for (const drawerId of Object.keys(drawings)) {
    const drawing = drawings[drawerId];
    if (!drawing) continue;
    const trueWord = assignments[drawerId];
    const guesses = [];
    for (const guesserId of Object.keys(cats)) {
      if (guesserId === drawerId) continue;
      const entry = cats[guesserId];
      const guess = entry && entry.guesses ? entry.guesses[drawerId] : undefined;
      if (guess === undefined || guess === null) continue;
      const correct = guess === trueWord;
      if (correct) {
        drawPoints[drawerId] = (drawPoints[drawerId] || 0) + 1;
        guessPoints[guesserId] = (guessPoints[guesserId] || 0) + 1;
      }
      const guesser = room.players.get(guesserId);
      guesses.push({ guesserId, guesserName: guesser ? guesser.name : '???', guess, correct });
    }
    const drawer = room.players.get(drawerId);
    details[drawerId] = {
      drawerId,
      drawerName: drawer ? drawer.name : '???',
      word: trueWord,
      dataUrl: drawing.dataUrl,
      guesses,
      drawPoints: drawPoints[drawerId] || 0,
    };
  }

  for (const drawerId of Object.keys(drawings)) {
    details[drawerId]['guessPoints'] = guessPoints[drawerId] || 0;
  }

  room.players.forEach((p, id) => { p.score += drawPoints[id] + guessPoints[id] });

  console.log("Details are " + JSON.stringify(details));

  const result = { details, drawPoints: drawPoints, guessPoints: guessPoints, wordPair: room.roundWords[roundIdx - 1] };
  room.results[roundIdx] = result;
  return result;
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  deleteRoom,
  addPlayer,
  removePlayer,
  lobbyPlayers,
  leaderboard,
  assignWordsForRound,
  computeRoundResults,
};
