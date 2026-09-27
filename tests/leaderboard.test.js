import test from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, normalizeScore, parseBoardFilters } from '../worker/leaderboard-core.js';
import worker, { readBoard } from '../worker/index.js';

const runId = '1f4a671e-e9d2-4b33-8560-e89bd290e14a';
const playerId = 'ca164d32-76cc-4d1a-a279-1f56f940fc78';

test('V0.1 filters use track, mode and region only; courses stay separate', () => {
  const harbor = parseBoardFilters('https://api.test/api/leaderboard?track=harbor&mode=time_trial&theme=day&difficulty=easy&vehicle=aurora&region=CN&playerId=' + playerId);
  const coast = parseBoardFilters('https://api.test/api/leaderboard?track=coast&mode=time_trial&theme=night&difficulty=hard&region=CN&playerId=' + playerId);
  assert.equal(harbor.trackId, 'harbor');
  assert.equal(coast.trackId, 'coast');
  assert.equal(harbor.region, 'CN');
  assert.deepEqual(harbor, { trackId: 'harbor', mode: 'time', region: 'CN', playerId });
  const race = parseBoardFilters(`https://api.test/api/leaderboard?track=mountain&mode=race&theme=night&difficulty=hard&region=NA&playerId=${playerId}`);
  assert.deepEqual(race, { trackId: 'mountain', mode: 'race', region: 'NA', playerId });
  assert.throws(() => parseBoardFilters('https://api.test/api/leaderboard?track=custom-something'), /赛道无效/);
});

test('score normalization accepts the actual time-attack and race result shapes', () => {
  const time = normalizeScore({ runId, playerId, nickname: '  A<driver>  ', region: 'CN', trackId: 'coast', mode: 'time', theme: 'day', difficulty: 'normal', vehicleId: 'aurora', elapsedMs: 82000, placement: null, bestLapMs: 79000, penaltyMs: 3000 });
  const race = normalizeScore({ runId, playerId, nickname: 'NIGHT', region: 'NA', trackId: 'harbor', mode: 'race', theme: 'night', difficulty: 'hard', vehicleId: 'nightslash', elapsedMs: 360000, placement: 2, bestLapMs: 171000, penaltyMs: 0 });
  assert.equal(time.nickname, 'Adriver');
  assert.equal(time.placement, null);
  assert.equal(race.placement, 2);
  assert.equal(race.trackId, 'harbor');
});

test('score validation rejects fake tracks, invalid regions, impossible placement and out-of-range time', () => {
  const base = { runId, playerId, nickname: 'Driver', region: 'CN', trackId: 'coast', mode: 'time', theme: 'day', difficulty: 'normal', vehicleId: 'aurora', elapsedMs: 82000, placement: null, bestLapMs: 82000, penaltyMs: 0 };
  assert.throws(() => normalizeScore({ ...base, trackId: 'custom-user-track' }), /暂不支持/);
  assert.throws(() => normalizeScore({ ...base, region: 'Mars' }), /比赛条件无效/);
  assert.throws(() => normalizeScore({ ...base, elapsedMs: 2 }), /用时/);
  assert.throws(() => normalizeScore({ ...base, vehicleId: 'imaginary' }), /车辆无效/);
  assert.throws(() => normalizeScore({ ...base, mode: 'race', placement: 9 }), /名次/);
});

test('board SQL scopes by track and region and orders personal/global race ranks by elapsed time', async () => {
  let captured;
  const fakeSql = async (parts, ...values) => { captured = { query: parts.join('?'), values }; return []; };
  await readBoard(fakeSql, { trackId: 'coast', mode: 'time', region: 'CN', playerId });
  assert.match(captured.query, /track_id = \?/);
  assert.match(captured.query, /region = \?/);
  assert.match(captured.query, /PARTITION BY player_id/);
  assert.ok(captured.values.includes('coast'));
  assert.ok(captured.values.includes('CN'));
  await readBoard(fakeSql, { trackId: 'harbor', mode: 'race', region: 'NA', playerId });
  assert.ok(captured.values.includes('harbor'));
  assert.ok(captured.values.includes('NA'));
  assert.match(captured.query, /ORDER BY elapsed_ms ASC, created_at ASC, run_id ASC/);
  assert.match(captured.query, /ORDER BY elapsed_ms ASC, created_at ASC, player_id ASC/);
  assert.doesNotMatch(captured.query, /ORDER BY CASE WHEN mode = 'race' THEN placement/);
});

test('CORS only reflects explicitly allowed game origins', () => {
  const allowed = corsHeaders(new Request('https://api.test', { headers: { Origin: 'https://yangchaoeva.github.io' } }), 'https://yangchaoeva.github.io,http://localhost:5173');
  const denied = corsHeaders(new Request('https://api.test', { headers: { Origin: 'https://attacker.test' } }), 'https://yangchaoeva.github.io');
  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://yangchaoeva.github.io');
  assert.equal(denied['Access-Control-Allow-Origin'], undefined);
});

test('worker health is public and a board request reports missing Neon setup clearly', async () => {
  const health = await worker.fetch(new Request('https://api.test/health'), { ALLOWED_ORIGINS: '' });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const board = await worker.fetch(new Request('https://api.test/api/leaderboard?track=coast', { headers: { Origin: 'https://yangchaoeva.github.io' } }), {
    ALLOWED_ORIGINS: 'https://yangchaoeva.github.io',
  });
  assert.equal(board.status, 503);
  assert.match((await board.json()).error, /数据库尚未配置/);
});
