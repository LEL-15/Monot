const RECONNECT_KEY = 'monot-reconnect';
const PROFILE_KEY = 'monot-profile';

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function getReconnectSession() { return readJson(RECONNECT_KEY); }
export function getStoredProfile() { return readJson(PROFILE_KEY); }

export function saveProfile(name, code, settings = {}) {
  const profile = getStoredProfile() || {};
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, name, code, ...settings }));
}

export function saveReconnectSession(session) {
  localStorage.setItem(RECONNECT_KEY, JSON.stringify(session));
}

export function clearReconnectSession() {
  localStorage.removeItem(RECONNECT_KEY);
}

export function prefillProfile() {
  const profile = getStoredProfile();
  if (!profile) return;
  document.getElementById('name').value = profile.name || '';
  document.getElementById('gameCode').value = profile.code || '';
  if (document.getElementById('rounds') && profile.rounds) document.getElementById('rounds').value = profile.rounds;
  if (document.getElementById('roundSeconds') && profile.roundSeconds > 0) document.getElementById('roundSeconds').value = profile.roundSeconds;
  if (document.getElementById('catSeconds') && profile.catSeconds > 0) document.getElementById('catSeconds').value = profile.catSeconds;
  if (document.getElementById('difficulty') && profile.difficulty) document.getElementById('difficulty').value = profile.difficulty;
}
