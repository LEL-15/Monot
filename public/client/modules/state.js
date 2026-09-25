export const App = {
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
  victoryPlayed: false,
  defeatPlayed: false,
  config: { rounds: 0, roundSeconds: 0, catSeconds: 0, difficulty: '' },
};

export const boardState = {
  canvasElement: null,
  context: null,
  strokes: [],
  drawing: false,
  location: null,
  currentStroke: null,
};
