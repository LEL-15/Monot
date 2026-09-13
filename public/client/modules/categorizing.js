export function renderCategorizing({ App, root, socket, esc, startLocalCountdown }) {
  const r = App.round;
  const targets = r.drawings.filter(d => d.drawerId !== App.playerId);
  const pair = r.wordPair;
  const userWord = r.word;

  if (targets.length === 0) {
    renderIntoTarget(root, 'sortScreen', '<div class="status-msg">No drawings to sort this round. Waiting...</div>');
    return;
  }

  const roundNumber = document.getElementById('sortRoundNumber');
  const drawingCards = document.getElementById('drawingCards');
  if (roundNumber) roundNumber.textContent = String(r.round);
  if (drawingCards) drawingCards.innerHTML = targets.map(t => {
    const otherWord = userWord === pair[0] ? pair[1] : pair[0];
    const otherLabel = App.config.hiddenWords ? 'Other word' : otherWord;
    return `
        <div class="drawing-card">
          <img src="${t.dataUrl}" alt="drawing" />
          <div class="choice-row">
            <button class="choice-btn" data-target="${t.drawerId}" data-word="${esc(userWord)}">${esc(userWord)}</button>
            <button class="choice-btn" data-target="${t.drawerId}" data-word="${esc(otherWord)}">${esc(otherLabel)}</button>
          </div>
        </div>
      `;
  }).join('');
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.target;
      const word = btn.dataset.word;
      App.catChoices[targetId] = word;
      document.querySelectorAll(`.choice-btn[data-target="${targetId}"]`).forEach(button => button.classList.remove('selected'));
      document.querySelectorAll(`.choice-btn[data-target="${targetId}"][data-word="${word}"]`).forEach(button => button.classList.add('selected'));
    };
  });
  document.getElementById('submitCat').onclick = () => submitCategorization({ App, root, socket });
  startLocalCountdown(r.phaseEndsAt, 'timer', () => { if (!App.catSubmitted) submitCategorization({ App, root, socket }); });
}

function renderIntoTarget(root, targetId, content) {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = content;
  else root.innerHTML = content;
}

export function submitCategorization({ App, root, socket }) {
  if (App.catSubmitted) return;
  App.catSubmitted = true;
  socket.emit('submit-categorization', { guesses: App.catChoices });
  root.innerHTML = '<div class="status-msg">Answers locked in! Waiting for everyone else...</div>';
}
