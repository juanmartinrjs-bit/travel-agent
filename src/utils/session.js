// Maneja el estado de la conversación por usuario
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      messages: [],
      travelInfo: null,
      searchResults: null,
      createdAt: Date.now()
    });
  }
  return sessions.get(userId);
}

function updateSession(userId, updates) {
  const session = getSession(userId);
  Object.assign(session, updates);
  sessions.set(userId, session);
}

function clearSession(userId) {
  sessions.delete(userId);
}

module.exports = { getSession, updateSession, clearSession };
