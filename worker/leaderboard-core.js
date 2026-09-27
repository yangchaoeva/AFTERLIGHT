export const TRACK_IDS = Object.freeze(['coast', 'harbor', 'mountain']);
export const REGIONS = Object.freeze(['CN', 'NA', 'EU', 'OTHER']);
export const MODES = Object.freeze(['race', 'time']);
export const THEMES = Object.freeze(['day', 'night']);
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
export const VEHICLE_IDS = Object.freeze(['aurora', 'kasumi', 'vesper', 'nightslash', 'tempest']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const intIn = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function parseBoardFilters(url) {
  const q = new URL(url).searchParams;
  const rulesetVersion = q.get('rulesetVersion') || 'classic-v1';
  if (rulesetVersion !== 'classic-v1') throw new Error('该规则版本暂不支持排行榜');
  const trackId = q.get('track') || 'harbor';
  // `time_trial` is the public V0.1 filter value; keep the existing DB value `time`.
  const requestedMode = q.get('mode') || 'time_trial';
  const mode = requestedMode === 'time_trial' ? 'time' : requestedMode;
  const region = q.get('region') || 'global';
  const playerId = q.get('playerId') || null;
  if (!TRACK_IDS.includes(trackId)) throw new Error('赛道无效');
  if (!MODES.includes(mode)) throw new Error('模式无效');
  if (region !== 'global' && !REGIONS.includes(region)) throw new Error('地区无效');
  if (playerId && !UUID.test(playerId)) throw new Error('车手 ID 无效');
  return { trackId, mode, region, playerId, rulesetVersion };
}

export function normalizeScore(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('成绩数据无效');
  const { runId, playerId, nickname, region, trackId, mode, theme, difficulty, vehicleId, elapsedMs, placement, bestLapMs, penaltyMs } = input;
  if ((input.rulesetVersion || 'classic-v1') !== 'classic-v1') throw new Error('该规则版本暂不支持排行榜');
  if (!UUID.test(runId || '') || !UUID.test(playerId || '')) throw new Error('匿名车手或比赛 ID 无效');
  if (!TRACK_IDS.includes(trackId)) throw new Error('玩家赛道暂不支持全球排行');
  if (!MODES.includes(mode) || !THEMES.includes(theme) || !REGIONS.includes(region)) throw new Error('比赛条件无效');
  if (!DIFFICULTIES.includes(difficulty)) throw new Error('难度无效');
  if (!VEHICLE_IDS.includes(vehicleId)) throw new Error('车辆无效');
  if (!intIn(elapsedMs, 10000, 1800000)) throw new Error('完赛用时超出有效范围');
  if (!intIn(penaltyMs, 0, 300000)) throw new Error('罚时无效');
  if (mode === 'race' && placement !== null && !intIn(placement, 1, 8)) throw new Error('竞速最终名次无效');
  if (mode === 'time' && placement !== null) throw new Error('单圈计时不记录竞速名次');
  if (bestLapMs !== null && !intIn(bestLapMs, 3000, elapsedMs)) throw new Error('最快圈时间无效');
  if (mode === 'time' && bestLapMs === null) throw new Error('计时挑战成绩缺少有效圈速');
  if (mode === 'race' && bestLapMs === null) throw new Error('竞速成绩缺少有效圈速');
  const cleanName = String(nickname || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || '匿名车手';
  return { runId, playerId, nickname: cleanName, region, trackId, mode, theme, difficulty, vehicleId, elapsedMs, placement: mode === 'race' ? placement : null, bestLapMs, penaltyMs };
}

export function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(String(allowedOrigins || '').split(',').map(s => s.trim()).filter(Boolean));
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
