const victoryAudio = new Audio('/sounds/victory.mp3');
const defeatAudio = new Audio('/sounds/defeat.mp3');

export function playVictorySound() {
  victoryAudio.currentTime = 0;
  victoryAudio.play().catch(() => {});
}

export function playDefeatSound() {
  defeatAudio.currentTime = 0;
  defeatAudio.play().catch(() => {});
}
