export type SessionRecord = {
  date: string;
  totalReps: number;
  moderateReps: number;
  deepReps: number;
  shallowAttempts: number;
};

const SESSION_STORAGE_KEY = "workoutSessions";

export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: SessionRecord) {
  const updated = [...loadSessions(), session];
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
}

export function clearSessions() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}