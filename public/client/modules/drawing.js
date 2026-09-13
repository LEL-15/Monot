export function renderDrawing({ App, boardState, socket, startLocalCountdown }) {
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
    setupCanvas({ App, boardState });
    board.dataset.ready = 'true';
  }

  const previewActive = r.previewEndsAt && Date.now() < r.previewEndsAt;
  if (boardState.canvasElement) boardState.canvasElement.style.display = previewActive ? 'none' : 'block';

  swatches.forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === App.drawColor);
    sw.onclick = () => {
      App.drawColor = sw.dataset.color;
      document.querySelectorAll('.swatch').forEach(swatch => swatch.classList.remove('active'));
      sw.classList.add('active');
    };
  });

  if (previewActive) {
    startLocalCountdown(r.previewEndsAt, 'timer', () => renderDrawing({ App, boardState, socket, startLocalCountdown }));
    return;
  }

  if (undoBtn) undoBtn.onclick = () => undoBoardStroke(boardState);
  if (submitBtn) submitBtn.onclick = () => submitDrawing({ App, boardState, root: document.getElementById('app'), socket });
  startLocalCountdown(r.phaseEndsAt, 'timer', () => { if (!App.drawSubmitted) submitDrawing({ App, boardState, root: document.getElementById('app'), socket }); });
}

function redrawBoard(boardState) {
  const { canvasElement, context, strokes } = boardState;
  if (!canvasElement || !context) return;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvasElement.width, canvasElement.height);
  strokes.forEach(stroke => {
    context.strokeStyle = stroke.color;
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.stroke();
  });
}

function undoBoardStroke(boardState) {
  if (!boardState.strokes.length) return;
  boardState.strokes.pop();
  redrawBoard(boardState);
}

function setupCanvas({ App, boardState }) {
  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  boardState.canvasElement = canvas;
  boardState.context = context;
  boardState.strokes = [];
  boardState.drawing = false;
  boardState.location = null;
  boardState.currentStroke = null;

  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineJoin = 'round'; context.lineCap = 'round'; context.lineWidth = 6;

  function position(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = event.touches ? event.touches[0] : event;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  }
  function start(event) {
    event.preventDefault();
    boardState.drawing = true;
    boardState.location = position(event);
    boardState.currentStroke = { color: App.drawColor, points: [boardState.location] };
  }
  function move(event) {
    if (!boardState.drawing) return;
    event.preventDefault();
    const point = position(event);
    context.strokeStyle = boardState.currentStroke.color;
    context.beginPath(); context.moveTo(boardState.location.x, boardState.location.y); context.lineTo(point.x, point.y); context.stroke();
    boardState.currentStroke.points.push(point);
    boardState.location = point;
  }
  function end() {
    if (boardState.drawing && boardState.currentStroke && boardState.currentStroke.points.length > 1) boardState.strokes.push(boardState.currentStroke);
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

export function submitDrawing({ App, boardState, root, socket }) {
  if (App.drawSubmitted) return;
  App.drawSubmitted = true;
  const canvas = document.getElementById('board');
  socket.emit('submit-drawing', { dataUrl: canvas ? canvas.toDataURL('image/png') : null });
  root.innerHTML = "<div class=\"status-msg\">It's a masterpice! Waiting for other players to finish drawing...</div>";
}
