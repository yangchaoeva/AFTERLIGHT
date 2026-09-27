import { CIRCUITS } from './circuits.js';
import { getLeaderboardProfile, leaderboardApiUrl, requestLeaderboard, saveLeaderboardProfile } from './leaderboard-client.js';
import './leaderboard.css';

const regionNames = { global: 'GLOBAL / 全球', CN: 'CHINA / 中国', NA: 'N. AMERICA / 北美', EU: 'EUROPE / 欧洲', OTHER: 'OTHER / 其他地区' };
const vehicleNames = { aurora: 'AURORA GT', kasumi: 'KASUMI R', vesper: 'VESPER X', nightslash: 'NIGHTSLASH', tempest: 'TEMPEST' };
const regions = ['global', 'CN', 'NA', 'EU', 'OTHER'];
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = ms => {
  const n = Math.max(0, Number(ms) || 0), m = Math.floor(n / 60000), s = Math.floor(n / 1000) % 60, milli = Math.floor(n % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
};

export class LeaderboardScreen {
  constructor({ onBack, storage = localStorage } = {}) {
    this.storage = storage; this.onBack = onBack; this.region = 'global'; this.requestId = 0;
    this.profile = getLeaderboardProfile(storage);
    document.getElementById('app').insertAdjacentHTML('beforeend', `
      <section id="leaderboard-screen" hidden aria-label="全球排行榜">
        <header class="lb-header"><div><small>AFTERLIGHT / WORLD RECORDS</small><h1>逐光榜</h1></div><div class="lb-header-meta"><span>ANONYMOUS DRIVER · V0.1</span><button id="leaderboard-back" class="secondary">← 返回海岸</button></div></header>
        <div class="lb-layout">
          <section class="lb-board">
            <div class="lb-filter-row">
              <label>赛道<select id="lb-track">${Object.values(CIRCUITS).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></label>
              <label>模式<select id="lb-mode"><option value="time_trial">单圈计时 · 最快完赛</option><option value="race">八车竞速 · 最快完赛</option></select></label>
              <button id="lb-refresh" class="secondary">刷新 ↻</button>
            </div>
            <nav class="lb-regions" aria-label="排行榜地区">${regions.map((r, i) => `<button data-lb-region="${r}" class="${i === 0 ? 'active' : ''}">${regionNames[r]}</button>`).join('')}</nav>
            <div class="lb-caption"><span id="lb-board-title">GLOBAL / 全球榜</span><span id="lb-count">读取中…</span></div>
            <div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>全球 / 地区排名</th><th>车手</th><th>地区</th><th>车辆</th><th>完赛时间</th><th>最终名次</th><th>最快圈</th><th>日期</th></tr></thead><tbody id="lb-rows"></tbody></table></div>
            <div id="lb-empty" class="lb-empty" hidden></div>
            <div id="lb-mine" class="lb-mine" hidden></div>
            <p id="lb-status" class="lb-status" role="status"></p>
          </section>
          <aside class="lb-profile"><small>YOUR LOCAL DRIVER</small><h2>匿名车手资料</h2><p>无需注册。匿名 ID 保存在此浏览器中，换设备或清除数据后会变更。</p>
            <label>显示名称<input id="lb-nickname" maxlength="20" autocomplete="nickname"></label>
            <label>地区<select id="lb-profile-region"><option value="CN">中国 / China</option><option value="NA">北美 / North America</option><option value="EU">欧洲 / Europe</option><option value="OTHER">其他地区 / Other</option></select></label>
            <div class="lb-id"><small>ANONYMOUS ID</small><code id="lb-player-id"></code></div>
            <button id="lb-save-profile" class="primary">保存车手资料</button>
            <div class="lb-profile-note">全球榜展示全部地区；地区榜按车手自行选择的地区筛选。昵称和地区仅影响之后提交的成绩。</div>
          </aside>
        </div>
      </section>`);
    this.ui = document.getElementById('leaderboard-screen');
    this.$('leaderboard-back').onclick = onBack;
    for (const id of ['lb-track', 'lb-mode']) this.$(id).onchange = () => this.load();
    this.$('lb-mode').onchange = () => { this.syncMode(); this.load(); };
    this.$('lb-refresh').onclick = () => this.load();
    this.ui.querySelectorAll('[data-lb-region]').forEach(button => button.onclick = () => {
      this.region = button.dataset.lbRegion;
      this.ui.querySelectorAll('[data-lb-region]').forEach(b => b.classList.toggle('active', b === button));
      this.load();
    });
    this.$('lb-save-profile').onclick = () => {
      this.profile = saveLeaderboardProfile({ nickname: this.$('lb-nickname').value, region: this.$('lb-profile-region').value }, this.storage);
      this.fillProfile(); this.status('车手资料已保存。');
    };
  }
  $(id) { return this.ui.querySelector(`#${id}`); }
  status(text, error = false) { const node = this.$('lb-status'); node.textContent = text; node.classList.toggle('error', error); }
  fillProfile() {
    this.$('lb-nickname').value = this.profile.nickname;
    this.$('lb-profile-region').value = this.profile.region;
    this.$('lb-player-id').textContent = this.profile.playerId;
  }
  syncMode() {
    return this.$('lb-mode').value === 'time_trial';
  }
  open({ track = 'harbor', mode = 'time' } = {}) {
    this.profile = getLeaderboardProfile(this.storage); this.fillProfile();
    this.$('lb-track').value = Object.hasOwn(CIRCUITS, track) ? track : 'harbor';
    this.$('lb-mode').value = mode === 'race' ? 'race' : 'time_trial';
    this.syncMode(); this.ui.hidden = false; this.ui.scrollTop = 0; this.load(); this.$('leaderboard-back').focus();
  }
  close() { this.ui.hidden = true; }
  async load() {
    const current = ++this.requestId;
    this.$('lb-board-title').textContent = `${regionNames[this.region]} / ${this.$('lb-mode').value === 'race' ? 'RACE' : 'TIME ATTACK'}`;
    this.$('lb-rows').innerHTML = '';
    this.$('lb-empty').hidden = true; this.$('lb-mine').hidden = true;
    if (!leaderboardApiUrl()) {
      this.$('lb-count').textContent = 'API 未配置';
      this.$('lb-empty').hidden = false;
      this.$('lb-empty').innerHTML = '<strong>在线排行榜尚未连接</strong><span>设置 VITE_LEADERBOARD_API_URL 并部署 Worker 后，这里会显示 Neon 全球成绩。</span>';
      this.status('本机个人历史记录仍可在首页“历史记录”查看。');
      return;
    }
    this.$('lb-count').textContent = '读取中…'; this.status('正在读取 Neon 排行榜…');
    try {
      const body = await requestLeaderboard({ track: this.$('lb-track').value, mode: this.$('lb-mode').value, region: this.region }, this.profile);
      if (current !== this.requestId) return;
      const rows = body.rows || [];
      this.$('lb-count').textContent = `${rows.length} 位车手`;
      this.$('lb-rows').innerHTML = rows.map(row => `<tr class="${row.player_id === this.profile.playerId ? 'mine' : ''}"><td class="lb-rank">${String(row.rank).padStart(2, '0')}</td><td class="lb-driver">${escapeHtml(row.nickname)}${row.player_id === this.profile.playerId ? '<small>YOU</small>' : ''}</td><td>${regionNames[row.region] || 'OTHER'}</td><td>${vehicleNames[row.vehicle_id] || '—'}</td><td class="lb-time">${formatTime(row.elapsed_ms)}</td><td>${row.placement == null ? '—' : `第 ${row.placement} 名`}</td><td>${row.best_lap_ms ? formatTime(row.best_lap_ms) : '—'}</td><td>${new Date(row.created_at).toLocaleDateString('zh-CN')}</td></tr>`).join('');
      if (!rows.length) { this.$('lb-empty').hidden = false; this.$('lb-empty').innerHTML = '<strong>这条赛道还没有成绩</strong><span>完成一场比赛，成为榜上的第一位车手。</span>'; }
      if (body.mine && !rows.some(row => row.player_id === this.profile.playerId)) {
        const mine = body.mine;
        this.$('lb-mine').hidden = false;
        this.$('lb-mine').innerHTML = `你的最佳成绩：第 <b>${mine.rank}</b> 名 · ${formatTime(mine.elapsed_ms)}${mine.mode === 'race' ? ` · P${mine.placement}` : ''}`;
      }
      this.status('全球榜与地区榜均按同赛道、同模式的完赛总用时升序排名；竞速名次仅作附加信息。');
    } catch (error) {
      if (current !== this.requestId) return;
      this.$('lb-count').textContent = '连接失败'; this.$('lb-empty').hidden = false;
      this.$('lb-empty').innerHTML = '<strong>暂时无法读取排行榜</strong><span>请检查网络或稍后重试；你的本地比赛记录仍保存在本机。</span>';
      this.status(error.message || '排行榜读取失败。', true);
    }
  }
}
