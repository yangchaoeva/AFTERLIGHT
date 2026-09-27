import { neon } from '@neondatabase/serverless';
import { corsHeaders, normalizeScore, parseBoardFilters } from './leaderboard-core.js';

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status,
  headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function readBoard(sql, filters) {
  const { trackId, mode, region, playerId } = filters;
  return sql`
    WITH eligible AS (
      SELECT run_id, player_id, nickname, region, track_id, mode, theme, difficulty, vehicle_id,
        elapsed_ms, placement, best_lap_ms, penalty_ms, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY player_id
          ORDER BY elapsed_ms ASC, created_at ASC, run_id ASC
        ) AS personal_order
      FROM afterlight_leaderboard_runs
      WHERE track_id = ${trackId} AND mode = ${mode}
        AND (${region === 'global'} OR region = ${region})
    ), best_per_player AS (
      SELECT * FROM eligible WHERE personal_order = 1
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        ORDER BY elapsed_ms ASC, created_at ASC, player_id ASC
      ) AS rank
      FROM best_per_player
    )
    SELECT run_id, player_id, nickname, region, track_id, mode, theme, difficulty, vehicle_id,
      elapsed_ms, placement, best_lap_ms, penalty_ms, created_at, rank
    FROM ranked
    WHERE rank <= 25 OR (${playerId !== null} AND player_id = ${playerId}::uuid)
    ORDER BY rank ASC
  `;
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env.ALLOWED_ORIGINS);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'afterlight-leaderboard' }, 200, headers);
    if (!['GET', 'POST'].includes(request.method) || !url.pathname.startsWith('/api/')) return json({ error: '接口不存在' }, 404, headers);
    if (!headers['Access-Control-Allow-Origin']) return json({ error: '来源未获允许' }, 403, headers);
    if (!env.DATABASE_URL) return json({ error: '排行榜数据库尚未配置' }, 503, headers);

    try {
      const sql = neon(env.DATABASE_URL);
      if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
        const filters = parseBoardFilters(request.url);
        const rows = await readBoard(sql, filters);
        return json({ rows: rows.filter(r => Number(r.rank) <= 25), mine: rows.find(r => filters.playerId && r.player_id === filters.playerId) || null, filters }, 200, headers);
      }
      if (request.method === 'POST' && url.pathname === '/api/scores') {
        const length = Number(request.headers.get('Content-Length') || 0);
        if (length > 4096) return json({ error: '成绩数据过大' }, 413, headers);
        const raw = await request.json();
        const score = normalizeScore(raw);
        if (raw.final !== true) return json({ error: '比赛结果尚未最终确认' }, 400, headers);
        const saved = await sql`
          INSERT INTO afterlight_leaderboard_runs
            (run_id, player_id, nickname, region, track_id, mode, theme, difficulty, vehicle_id,
             elapsed_ms, placement, best_lap_ms, penalty_ms)
          VALUES (${score.runId}::uuid, ${score.playerId}::uuid, ${score.nickname}, ${score.region},
            ${score.trackId}, ${score.mode}, ${score.theme}, ${score.difficulty}, ${score.vehicleId}, ${score.elapsedMs},
            ${score.placement}, ${score.bestLapMs}, ${score.penaltyMs})
          ON CONFLICT (run_id) DO NOTHING
          RETURNING run_id
        `;
        return json({ ok: true, duplicate: saved.length === 0, runId: score.runId }, 201, headers);
      }
      return json({ error: '接口不存在' }, 404, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求处理失败';
      const expected = /无效|不一致|暂不支持|尚未最终/.test(message);
      return json({ error: expected ? message : '排行榜服务暂时不可用' }, expected ? 400 : 500, headers);
    }
  },
};

export { readBoard };
