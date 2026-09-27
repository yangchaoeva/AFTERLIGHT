const TEXT_ENTRY_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

export function canFastRetry({ state, mode, resultVisible, activeElement = null }) {
  return state === 'finished' && mode === 'time' && resultVisible &&
    !TEXT_ENTRY_TAGS.has(activeElement?.tagName) && !activeElement?.isContentEditable;
}

export function captureRetryContext({ trackId, vehicleId, paint, mode, difficulty, theme, driftBoostEnabled = false }) {
  return Object.freeze({ trackId, vehicleId, paint, mode, difficulty, theme, driftBoostEnabled });
}

export function retryCountdownNumber(elapsedSeconds) {
  if (elapsedSeconds < 1) return 3;
  if (elapsedSeconds < 2) return 2;
  if (elapsedSeconds < 3) return 1;
  return 0;
}
