export const LEADERBOARD_PROFILE_KEY = 'afterlight.leaderboard.profile.v1';
const REGIONS = ['CN', 'NA', 'EU', 'OTHER'];
const uuid = () => crypto.randomUUID();
const apiBase = () => String(import.meta.env.VITE_LEADERBOARD_API_URL || '').trim().replace(/\/$/, '');

export function getLeaderboardProfile(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(LEADERBOARD_PROFILE_KEY) || 'null');
    if (saved && /^[0-9a-f-]{36}$/i.test(saved.playerId) && REGIONS.includes(saved.region)) return saved;
  } catch { /* use a new local anonymous identity */ }
  const playerId = uuid();
  const profile = { playerId, nickname: `COAST-${playerId.slice(0, 4).toUpperCase()}`, region: 'OTHER' };
  try { storage.setItem(LEADERBOARD_PROFILE_KEY, JSON.stringify(profile)); } catch { /* profile remains available in memory */ }
  return profile;
}

export function saveLeaderboardProfile(input, storage = localStorage) {
  const old = getLeaderboardProfile(storage);
  const nickname = String(input.nickname || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || old.nickname;
  const region = REGIONS.includes(input.region) ? input.region : old.region;
  const profile = { ...old, nickname, region };
  try { storage.setItem(LEADERBOARD_PROFILE_KEY, JSON.stringify(profile)); } catch { /* the current tab can still use the profile */ }
  return profile;
}

export function leaderboardApiUrl() { return apiBase(); }

export async function requestLeaderboard(filters, profile, fetchImpl = fetch) {
  if (filters.rulesetVersion && filters.rulesetVersion !== 'classic-v1') throw new Error('该规则版本暂不支持排行榜');
  const base = apiBase();
  if (!base) throw new Error('在线排行榜 API 尚未配置');
  const mode = filters.mode === 'time' ? 'time_trial' : filters.mode;
  const query = new URLSearchParams({ track: filters.track, mode, region: filters.region, rulesetVersion: filters.rulesetVersion || 'classic-v1', playerId: profile.playerId });
  const response = await fetchImpl(`${base}/api/leaderboard?${query}`, { headers: { Accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '读取排行榜失败');
  return body;
}

export async function submitLeaderboardScore(score, profile, fetchImpl = fetch) {
  if ((score.rulesetVersion || 'classic-v1') !== 'classic-v1') throw new Error('Boost 成绩不能提交到 classic 排行榜');
  const base = apiBase();
  if (!base) throw new Error('在线排行榜 API 尚未配置');
  const response = await fetchImpl(`${base}/api/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...score, playerId: profile.playerId, nickname: profile.nickname, region: profile.region, final: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '提交成绩失败');
  return body;
}
