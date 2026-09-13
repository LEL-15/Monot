export function renderReveal({ App, root, socket, esc }) {
  const data = App.revealData;
  const roundNumber = document.getElementById('revealRoundNumber');
  const revealDetails = document.getElementById('revealDetails');
  if (!data) {
    if (roundNumber) roundNumber.textContent = '0';
    if (revealDetails) revealDetails.innerHTML = '<div class="status-msg">Tallying results...</div>';
    return;
  }
  if (!revealDetails) return;
  fetch('/views/drawing-score-card.html').then(response => response.text()).then(template => {
    const cards = Object.values(data.details).map(detail => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = template.trim();
      const card = wrapper.firstElementChild;
      const drawer = card.querySelector('.score-card-drawer');
      const word = card.querySelector('.score-card-word');
      const drawingPoints = card.querySelector('.drawing-card-points');
      const guessingPoints = card.querySelector('.guessing-card-points');
      const image = card.querySelector('.score-card-image');
      const guesses = card.querySelector('.score-card-guesses');
      if (drawer) drawer.textContent = detail.drawerName;
      if (word) {
        word.textContent = detail.word;
        if (detail.word === data.wordPair[0]) word.classList.add('pill-a');
        if (detail.word === data.wordPair[1]) word.classList.add('pill-b');
      }
      if (drawingPoints) drawingPoints.textContent = `+${detail.drawPoints}`;
      if (guessingPoints) guessingPoints.textContent = `+${detail.guessPoints}`;
      if (image) image.src = detail.dataUrl || '';
      if (guesses) guesses.innerHTML = detail.guesses && detail.guesses.length
        ? detail.guesses.map(guess => `<span class="guess-tag ${guess.correct ? 'guess-right' : 'guess-wrong'}">${guess.correct ? '\\u2713' : '\\u2717'} ${esc(guess.guesserName)}</span>`).join('')
        : '<span class="hint">No guesses submitted for drawing.</span>';
      return card.outerHTML;
    }).join('');
    const leaderboard = `<div class="card"><h2>Leaderboard</h2><ul class="player-list">${data.leaderboard.map(player => `<li><span>${esc(player.name)}</span><span class="player-score">${player.score}</span></li>`).join('')}</ul></div>`;
    const hostAction = App.isHost
      ? `<button class="btn-primary" id="continueBtn">${data.isLastRound ? 'See Final Results' : 'Start Next Round'}</button>`
      : '<div class="status-msg">Waiting for the host to continue...</div>';
    revealDetails.innerHTML = cards + leaderboard + hostAction;
    if (App.isHost) {
      const continueButton = document.getElementById('continueBtn');
      if (continueButton) continueButton.onclick = () => {
        continueButton.disabled = true;
        continueButton.textContent = 'Loading...';
        socket.emit('continue-after-reveal');
      };
    }
  }).catch(error => {
    console.error('Failed loading score card template', error);
    revealDetails.innerHTML = '<div class="status-msg">Tallying results...</div>';
  });
}

export function renderFinished({ App, root, socket, esc, clearReconnectSession }) {
  const players = App.finalLeaderboard;
  const topScore = players.length ? players[0].score : 0;
  const winners = players.filter(player => player.score === topScore);
  fetch('/views/finished.html').then(response => response.text()).then(template => {
    root.innerHTML = template;
    document.getElementById('winnerName').textContent = winners.map(winner => winner.name).join(' & ');
    document.getElementById('winnerHint').textContent = winners.length > 1 ? 'tie for the win!' : 'wins the game!';
    document.getElementById('finalScores').innerHTML = players.map(player =>
      `<li class="${player.score === topScore ? 'win' : ''}"><span>${esc(player.name)}</span><span class="player-score">${player.score}</span></li>`
    ).join('');
    const playAgain = document.getElementById('playAgainBtn');
    if (playAgain) {
      if (!App.isHost) playAgain.remove();
      else playAgain.onclick = () => {
        playAgain.disabled = true;
        playAgain.textContent = 'Starting...';
        socket.emit('play-again');
      };
    }
    document.getElementById('newGameBtn').onclick = event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Leaving...';
      socket.emit('leave-game');
    };
  }).catch(error => {
    console.error('Failed loading finished view', error);
    root.innerHTML = '<div class="status-msg">Unable to load final results.</div>';
  });
}
