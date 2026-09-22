// ===== テーマ管理 =====
(function initTheme() {
    const saved = localStorage.getItem('iriam-theme') || 'auto';
    applyTheme(saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('iriam-theme') || 'auto') === 'auto') applyTheme('auto');
    });
})();

function applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolved);
}

// ===== 定数 =====
const RANK_VALUES  = ['D','C1','C2','C3','C4','C5','B1','B2','B3','A1','A2','A3','S1','S2','S3'];
const POINT_VALUES = [0, 1, 2, 4, 6];

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
    // テーマボタン
    const savedTheme = localStorage.getItem('iriam-theme') || 'auto';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.value === savedTheme) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const t = btn.dataset.value;
            localStorage.setItem('iriam-theme', t);
            applyTheme(t);
        });
    });

    // 開始日は今日以降のみ
    const startDateInput = document.getElementById('startDate');
    startDateInput.min = todayStr();
    startDateInput.value = todayStr();

    // localStorage から状態を復元（なければデフォルト）
    const saved = loadState();
    if (saved) {
        const rankIdx = Math.max(0, RANK_VALUES.indexOf(saved.rank || 'B2'));
        document.getElementById('currentRankSlider').value  = rankIdx;
        document.getElementById('currentScoreSlider').value = Math.min(18, Math.max(0, saved.score ?? 0));
        document.getElementById('daysLeftSlider').value     = Math.min(16, Math.max(0, saved.daysLeft ?? 6));
        document.getElementById('skipPassesSlider').value   = Math.min(10, Math.max(0, saved.skipPasses ?? 0));
        startDateInput.value = normalizeStartDate(saved.startDate);
        buildCalendarTable(saved.planByDate || {});
    } else {
        document.getElementById('currentRankSlider').value  = RANK_VALUES.indexOf('B2');
        document.getElementById('currentScoreSlider').value = 0;
        document.getElementById('daysLeftSlider').value     = 6;
        document.getElementById('skipPassesSlider').value   = 0;
        buildCalendarTable({});
    }
    // 初期表示は今日の行にスクロール
    setTimeout(() => scrollToDate(todayStr()), 0);
    calculateResults();

    // 初期ラベルを更新
    updateRankLabel();
    updateScoreLabel();
    updateDaysLeftLabel();
    updateSkipPassesLabel();

    // 初期スライダー塗りを適用
    ['currentRankSlider', 'currentScoreSlider', 'daysLeftSlider', 'skipPassesSlider'].forEach(id => {
        updateSliderFill(document.getElementById(id));
    });

    // ランクスライダー
    document.getElementById('currentRankSlider').addEventListener('input', e => {
        updateRankLabel();
        updateSliderFill(e.target);
        saveState();
        calculateResults();
    });

    // スコアスライダー
    document.getElementById('currentScoreSlider').addEventListener('input', e => {
        updateScoreLabel();
        updateSliderFill(e.target);
        saveState();
        calculateResults();
    });

    // 公式表示の「あと○日」スライダー
    document.getElementById('daysLeftSlider').addEventListener('input', e => {
        updateDaysLeftLabel();
        updateSliderFill(e.target);
        saveState();
        calculateResults();
    });

    // スキップパスラダー
    document.getElementById('skipPassesSlider').addEventListener('input', e => {
        updateSkipPassesLabel();
        updateSliderFill(e.target);
        saveState();
        calculateResults();
    });

    // 開始日変更（その日付の行にスクロール）
    document.getElementById('startDate').addEventListener('change', e => {
        e.target.value = normalizeStartDate(e.target.value);
        saveState();
        calculateResults();
        scrollToDate(e.target.value);
    });

    // ストレージクリアボタン
    document.getElementById('clearStorageBtn').addEventListener('click', () => {
        if (confirm('このアプリの入力データはあなたのスマホ・PCの中にだけ保存されています。\nリセットすると入力した内容がすべて消えてしまいます。\n本当にリセットしますか？')) {
            localStorage.removeItem('iriam-state');
            location.reload();
        }
    });

    // 数字キーによるスライダー直接入力
    addNumericKeyInput('currentScoreSlider', 0, 18);
    addNumericKeyInput('daysLeftSlider',     0, 16);
    addNumericKeyInput('skipPassesSlider',   0, 10);

    // デイリー残り時間を1分ごとに更新
    setInterval(refreshDailyTimeLeft, 60000);

    // PWA: Service Worker 登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service Worker の登録に失敗しました', err));
    }
});

// ===== フォーム値ゲッター =====
function getRank()       { return RANK_VALUES[parseInt(document.getElementById('currentRankSlider').value, 10)]; }
function getScore()      { return parseInt(document.getElementById('currentScoreSlider').value, 10) || 0; }
function getDaysLeft()   { const v = parseInt(document.getElementById('daysLeftSlider').value, 10); return Number.isFinite(v) ? v : 6; }
function getSkipPasses() { return parseInt(document.getElementById('skipPassesSlider').value, 10) || 0; }

// ===== スライダー塗り更新 =====
function updateSliderFill(slider) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--fill-pct', pct + '%');
}

// ===== スライダーラベル更新 =====
function updateRankLabel() {
    const rank = getRank();
    document.getElementById('currentRankValue').textContent = rank;
}

function updateScoreLabel() {
    document.getElementById('currentScoreValue').textContent = getScore();
}

function updateDaysLeftLabel() {
    document.getElementById('daysLeftValue').textContent = getDaysLeft();
}

function updateSkipPassesLabel() {
    document.getElementById('skipPassesValue').textContent = getSkipPasses();
}

// ===== 日付ユーティリティ（すべてローカル時刻で統一） =====
function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function todayStr() {
    return toLocalDateStr(new Date());
}

function normalizeStartDate(dateStr) {
    const today = todayStr();
    return dateStr && dateStr >= today ? dateStr : today;
}

function formatDateWithOffset(baseDateStr, offset) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(baseDateStr + 'T00:00:00');
    date.setDate(date.getDate() + offset);
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${m}/${d}（${dayNames[date.getDay()]}）`;
}

function getDateStr(baseDateStr, offset) {
    const date = new Date(baseDateStr + 'T00:00:00');
    date.setDate(date.getDate() + offset);
    return toLocalDateStr(date);
}

function isMonday(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay() === 1;
}

function getPreviousWeekRange(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    const daysSinceMonday = (day + 6) % 7;
    const thisMonday = new Date(date);
    thisMonday.setDate(date.getDate() - daysSinceMonday);

    const previousMonday = new Date(thisMonday);
    previousMonday.setDate(thisMonday.getDate() - 7);

    const previousSunday = new Date(previousMonday);
    previousSunday.setDate(previousMonday.getDate() + 6);

    return {
        start: toLocalDateStr(previousMonday),
        end:   toLocalDateStr(previousSunday),
    };
}

function hasStreamedInPreviousWeek(dateStr, dailyPointsByDate) {
    const { start, end } = getPreviousWeekRange(dateStr);
    return Object.entries(dailyPointsByDate).some(([date, points]) => {
        return date >= start && date <= end && points > 0;
    });
}

function grantWeeklySkipPassIfNeeded(dateStr, skipPasses, dailyPointsByDate) {
    if (!isMonday(dateStr)) return skipPasses;
    if (!hasStreamedInPreviousWeek(dateStr, dailyPointsByDate)) return skipPasses;
    return Math.min(10, skipPasses + 1);
}

function formatDateStr(dateStr) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
}

function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = midnight - now;
    return {
        hours:   Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
    };
}

// ===== ランクユーティリティ =====
function getRankClass(rank) {
    if (rank.startsWith('S')) return 'rank-s';
    if (rank.startsWith('A')) return 'rank-a';
    if (rank.startsWith('B')) return 'rank-b';
    if (rank.startsWith('C')) return 'rank-c';
    return 'rank-d';
}

function getNextRank(rank) {
    const idx = RANK_VALUES.indexOf(rank);
    return idx === -1 ? rank : RANK_VALUES[Math.min(idx + 1, RANK_VALUES.length - 1)];
}

function getPrevRank(rank) {
    const idx = RANK_VALUES.indexOf(rank);
    return idx === -1 ? rank : RANK_VALUES[Math.max(idx - 1, 0)];
}

function applyDailyRankChange(state, plan, dailyPointsByDate) {
    let { rank, score, daysLeft, skipPasses } = state;
    const { date, dailyPoints, skipUsed } = plan;
    let event = null;

    // 月曜の配布は使用より先。開始日の枚数には受取済み分を入力する。
    if (!plan.isStartDate) {
        skipPasses = grantWeeklySkipPassIfNeeded(date, skipPasses, dailyPointsByDate);
    }
    if (skipUsed) {
        if (skipPasses <= 0) throw new Error(`${formatDateStr(date)}のスキップパスが不足しています。予定か開始日の枚数を見直してください。`);
        skipPasses -= 1;
        // 集計後の状態なので、延長した1日と経過した1日が相殺される。
    } else {
        score += dailyPoints;
        if (score >= 18) {
            const nextRank = getNextRank(rank);
            event = nextRank === rank ? 'リセット' : 'ランクアップ';
            rank = nextRank;
            score = 0;
            daysLeft = 6;
        } else {
            daysLeft -= 1;
            if (daysLeft < 0) {
                const nextRank = score < 12 ? getPrevRank(rank) : rank;
                event = nextRank === rank ? 'リセット' : 'ランクダウン';
                rank = nextRank;
                score = 0;
                daysLeft = 6;
            }
        }
    }
    return { rank, score, daysLeft, skipPasses, skipUsed: Boolean(skipUsed), event };
}

function calculateRankStates(initialState, plans, startDateStr) {
    const startIndex = plans.findIndex(plan => plan.date === startDateStr);
    if (startIndex === -1) return null;
    const dailyPointsByDate = Object.fromEntries(
        plans.map(plan => [plan.date, plan.skipUsed ? 0 : plan.dailyPoints])
    );
    const dayStates = [{ ...initialState, dailyPoints: undefined, pre: false, isCurrent: true }];
    let current = { ...initialState };
    plans.slice(0, startIndex).forEach(plan => {
        dayStates.push({ date: plan.date, pre: true });
    });
    plans.slice(startIndex).forEach(plan => {
        current = applyDailyRankChange(current, { ...plan, isStartDate: plan.date === startDateStr }, dailyPointsByDate);
        dayStates.push({
            ...current,
            dailyPoints: plan.skipUsed ? 0 : plan.dailyPoints,
            date: plan.date,
            pre: false,
            isCurrent: false,
        });
    });
    // 入力された予定の範囲内で、各行より後に起きる最初の変動を探す。
    dayStates.forEach((state, index) => {
        if (state.pre) return;
        const next = dayStates.slice(index + 1).find(candidate => candidate.event);
        if (!next) {
            state.forecast = '予定内に変動なし';
            return;
        }
        const baseDate = state.isCurrent ? startDateStr : state.date;
        const days = Math.round((Date.parse(next.date) - Date.parse(baseDate)) / 86400000);
        state.forecast = days === 0
            ? `本日の集計で${next.event}`
            : `あと${days}日で${next.event}`;
    });
    return dayStates;
}

// ===== localStorage =====
function saveState() {
    const planByDate = {};
    getDayRows().forEach(row => {
        planByDate[row.dataset.date] = {
            point: Number(row.querySelector('.plan-select').value),
            skip:  row.querySelector('.skip-cb').checked,
        };
    });
    const state = {
        rank:       getRank(),
        score:      getScore(),
        daysLeft:   getDaysLeft(),
        skipPasses: getSkipPasses(),
        startDate:  normalizeStartDate(document.getElementById('startDate').value),
        planByDate,
    };
    localStorage.setItem('iriam-state', JSON.stringify(state));
}

// 予定入力を持つ日付行（「現在」行を除く）
function getDayRows() {
    return Array.from(document.querySelectorAll('#resultTable tbody tr[data-date]'));
}

function loadState() {
    try {
        const s = localStorage.getItem('iriam-state');
        return s ? JSON.parse(s) : null;
    } catch { return null; }
}

// ===== カレンダー形式の予定テーブル構築（今日＋未来30日、一度だけ生成） =====
function buildCalendarTable(planByDate) {
    const tbody = document.getElementById('resultTable').querySelector('tbody');
    tbody.innerHTML = '';

    // 「現在」行（開始日の集計前の状態。予定入力なし）
    const currentTr = document.createElement('tr');
    currentTr.dataset.state = 'current';
    currentTr.tabIndex = 0;
    currentTr.appendChild(createCell('現在', '日', 'day-cell'));
    currentTr.appendChild(createCell('—', '予定', 'plan-cell'));
    const currentSkipTd = createCell('', 'スキパ', 'skip-cell');
    currentSkipTd.appendChild(createSkipWrap());
    currentTr.appendChild(currentSkipTd);
    appendResultCells(currentTr);
    tbody.appendChild(currentTr);

    const today    = todayStr();
    const baseDate = new Date(today + 'T00:00:00');
    const FUTURE = 30;

    for (let i = 0; i <= FUTURE; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const dateStr    = toLocalDateStr(d);
        const savedEntry = planByDate[dateStr];

        const tr = document.createElement('tr');
        tr.dataset.date = dateStr;
        if (dateStr === today) tr.classList.add('today-row');

        tr.appendChild(createCell(formatDateStr(dateStr), '日', 'day-cell'));

        // 予定(+)セレクト
        const pointTd = createCell('', '予定', 'plan-cell');
        const select = document.createElement('select');
        select.className = 'plan-select';
        select.setAttribute('aria-label', `${formatDateStr(dateStr)}の予定スコア`);
        POINT_VALUES.forEach(point => {
            const option = document.createElement('option');
            option.value = point;
            option.textContent = `+${point}`;
            select.appendChild(option);
        });
        const savedPoint = savedEntry ? Number(savedEntry.point) : 1;
        select.value = POINT_VALUES.includes(savedPoint) ? savedPoint : 1;
        select.addEventListener('change', () => { saveState(); calculateResults(); });

        const skipNote = document.createElement('span');
        skipNote.className = 'plan-skip-note';
        skipNote.textContent = '対象外';

        pointTd.appendChild(select);
        pointTd.appendChild(skipNote);
        tr.appendChild(pointTd);

        // スキップセル（チケットアイコントグル）
        const skipTd = createCell('', 'スキパ', 'skip-cell');
        const label = document.createElement('label');
        label.className = 'skip-ticket';
        label.tabIndex = 0;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'skip-cb';
        if (savedEntry) cb.checked = savedEntry.skip;
        cb.tabIndex = -1;
        cb.setAttribute('aria-hidden', 'true');
        label.setAttribute('role', 'checkbox');
        label.setAttribute('aria-label', `${formatDateStr(dateStr)}のスキップパス`);
        const updateSkipInput = () => {
            // スキップ日はスコア集計対象外。選んだ予定値は保持し、解除時に戻す
            select.hidden = cb.checked;
            skipNote.hidden = !cb.checked;
            label.setAttribute('aria-checked', String(cb.checked));
            tr.classList.toggle('skip-planned', cb.checked);
        };
        cb.addEventListener('change', () => { updateSkipInput(); saveState(); calculateResults(); });
        updateSkipInput();

        const icon = document.createElement('span');
        icon.className = 'ticket-icon';
        icon.innerHTML = `<svg viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.75" y="0.75" width="18.5" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="0.75" x2="5.5" y2="11.25" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/></svg>`;

        label.appendChild(cb);
        label.appendChild(icon);
        const skipWrap = createSkipWrap();
        skipWrap.prepend(label);
        skipTd.appendChild(skipWrap);
        tr.appendChild(skipTd);

        appendResultCells(tr);
        tbody.appendChild(tr);
    }

    // 行のクリック・フォーカスで予測カードを切り替える
    Array.from(tbody.rows).forEach(tr => {
        tr.addEventListener('click', () => selectResultRow(tr));
        tr.addEventListener('focusin', () => selectResultRow(tr));
        tr.addEventListener('keydown', e => {
            if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectResultRow(tr); }
        });
    });

    setupArrowKeyNav();
}

function createCell(text, label, className) {
    const td = document.createElement('td');
    td.textContent = text;
    td.dataset.label = label;
    td.className = className;
    return td;
}

// スキパ列: チケットアイコン（日付行のみ）と集計後の残り枚数を1セルに並べる
function createSkipWrap() {
    const wrap = document.createElement('div');
    wrap.className = 'skip-wrap';
    const count = document.createElement('span');
    count.className = 'pass-count';
    count.textContent = '--';
    wrap.appendChild(count);
    return wrap;
}

function appendResultCells(tr) {
    tr.appendChild(createCell('--', 'ランク', 'rank-cell'));
    tr.appendChild(createCell('--', 'スコア', 'score-cell'));
    tr.appendChild(createCell('--', '次の変動', 'forecast-cell'));
}

// ===== 矢印キーナビゲーション =====
function setupArrowKeyNav() {
    const tbody = document.getElementById('resultTable').querySelector('tbody');
    tbody.removeEventListener('keydown', handleArrowKey);
    tbody.addEventListener('keydown', handleArrowKey);
}

function handleArrowKey(e) {
    const focused = document.activeElement;
    const isSelect = focused.classList.contains('plan-select');
    const isTicket = focused.classList.contains('skip-ticket');
    if (!isSelect && !isTicket) return;

    // Space で skip-ticket をトグル
    if (isTicket && e.key === ' ') {
        e.preventDefault();
        const cb = focused.querySelector('.skip-cb');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
    }

    // 数字キー (0,1,2,4,6) でポイント直接入力
    if (isSelect && ['0', '1', '2', '4', '6'].includes(e.key)) {
        e.preventDefault();
        focused.value = e.key;
        focused.dispatchEvent(new Event('change'));
        return;
    }

    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    const isEnter = e.key === 'Enter';
    if (!isArrow && !isEnter) return;

    e.preventDefault();

    const rows = getDayRows();
    const rowIdx = rows.indexOf(focused.closest('tr'));
    let targetRow = rowIdx;
    let targetIsTicket = isTicket;

    if (e.key === 'ArrowUp'   || (isEnter && e.shiftKey))  targetRow = Math.max(0, rowIdx - 1);
    if (e.key === 'ArrowDown' || (isEnter && !e.shiftKey)) targetRow = Math.min(rows.length - 1, rowIdx + 1);
    if (e.key === 'ArrowLeft')  targetIsTicket = false;
    if (e.key === 'ArrowRight') targetIsTicket = true;

    const row = rows[targetRow];
    const select = row.querySelector('.plan-select');
    const target = (targetIsTicket || select.hidden) ? row.querySelector('.skip-ticket') : select;
    target.focus();
}

// ===== 日付指定スクロールアニメーション（表内のみ、ページはスクロールしない） =====
function scrollToDate(dateStr) {
    const container = document.querySelector('.result-section .table-scroll');
    const row = getDayRows().find(r => r.dataset.date === dateStr);
    if (!row || !container) return;

    // コンテナ内の相対位置だけスクロール（ページ全体には影響しない）
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const theadHeight = document.querySelector('#resultTable thead').offsetHeight;
    container.scrollBy({ top: rowRect.top - containerRect.top - theadHeight, behavior: 'smooth' });

    getDayRows().forEach(r => r.classList.remove('scroll-target'));
    row.classList.add('scroll-target');
    row.addEventListener('animationend', () => row.classList.remove('scroll-target'), { once: true });
}

// ===== 数字キーによるスライダー直接入力 =====
function addNumericKeyInput(sliderId, min, max) {
    const slider = document.getElementById(sliderId);
    let buffer = '';
    let timer  = null;
    slider.addEventListener('keydown', e => {
        if (!/^\d$/.test(e.key)) return;
        e.preventDefault();
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 800);
        const val = parseInt(buffer, 10);
        if (val > max) {
            // 入力が範囲外なら最後の1桁で再評価
            buffer = e.key;
            const single = parseInt(buffer, 10);
            if (single >= min && single <= max) {
                slider.value = single;
                slider.dispatchEvent(new Event('input'));
            }
        } else if (val >= min) {
            slider.value = val;
            slider.dispatchEvent(new Event('input'));
        }
    });
}

// ===== シミュレーション計算 =====
function calculateResults() {
    const startDateStr = document.getElementById('startDate').value;
    const tbody = document.getElementById('resultTable').querySelector('tbody');
    const errorEl = document.getElementById('planError');
    errorEl.textContent = '';

    const dayRows = getDayRows();
    const plans = dayRows.map(row => ({
        date: row.dataset.date,
        dailyPoints: Number(row.querySelector('.plan-select').value),
        skipUsed: row.querySelector('.skip-cb').checked,
    }));
    const initialState = {
        rank: getRank(),
        score: getScore(),
        daysLeft: Math.max(0, Math.min(16, getDaysLeft())),
        skipPasses: getSkipPasses(),
    };
    let dayStates = null;
    try {
        dayStates = calculateRankStates(initialState, plans, startDateStr);
        if (!dayStates) errorEl.textContent = '開始日が表の範囲外です。表示範囲内（今日〜未来30日）で設定してください。';
    } catch (error) {
        errorEl.textContent = error.message;
    }

    // 計算できない場合は結果欄を空にし、カードを隠す
    const rows = Array.from(tbody.rows);
    if (!dayStates) {
        rows.forEach(tr => {
            delete tr.dayState;
            fillResultCells(tr, null);
        });
        document.querySelector('.card-section').hidden = true;
        return;
    }
    document.querySelector('.card-section').hidden = false;

    // dayStates は「現在」＋日付行と同じ順序
    rows.forEach((tr, i) => {
        const state = dayStates[i];
        tr.dayState = state.pre ? null : state;
        fillResultCells(tr, tr.dayState);
    });

    // 選択中の行を維持し、計算できない行なら「現在」に戻す
    const selected = rows.find(tr => tr.classList.contains('selected-row') && tr.dayState);
    selectResultRow(selected || rows[0]);
}

function fillResultCells(tr, state) {
    const [rankTd, scoreTd, forecastTd] = Array.from(tr.cells).slice(3);
    const passCount = tr.querySelector('.pass-count');
    tr.classList.toggle('pre-row', !state);
    if (!state) {
        [rankTd, scoreTd, forecastTd, passCount].forEach(el => { el.textContent = '--'; });
        passCount.removeAttribute('aria-label');
        rankTd.className = 'rank-cell';
        tr.classList.remove('selected-row');
        return;
    }
    rankTd.textContent = state.rank;
    rankTd.className = `rank-cell ${getRankClass(state.rank)}`;
    scoreTd.textContent = `${state.score}`;
    passCount.textContent = `残${state.skipPasses}`;
    passCount.setAttribute('aria-label', `残りパス${state.skipPasses}枚`);
    forecastTd.textContent = state.forecast;
    if (state.skipUsed) {
        const note = document.createElement('small');
        note.textContent = 'スキパ使用（締切を1日延長）';
        forecastTd.appendChild(note);
    }
    if (state.event) {
        const note = document.createElement('small');
        note.textContent = `この日の集計：${state.event}`;
        forecastTd.appendChild(note);
    }
}

function selectResultRow(tr) {
    const s = tr.dayState;
    if (!s) return;
    Array.from(tr.parentElement.rows).forEach(r => r.classList.remove('selected-row'));
    tr.classList.add('selected-row');
    updateRankCard(s.rank, s.score, s.daysLeft, s.dailyPoints, s.date, s.isCurrent, s.skipUsed, s.forecast);
}



// ===== ランクカード更新 =====
function updateRankCard(rank, currentScore, daysLeft, dailyPoints, dayDateStr, isCurrent = false, skipUsed = false, forecast = '') {
    document.querySelector('.card-section h2').textContent =
        isCurrent ? '現在カード' : '予測カード';
    document.getElementById('rankCard').className    = `rank-card ${getRankClass(rank)}`;
    document.getElementById('rankLabel').textContent = rank;
    document.getElementById('scoreDisplay').textContent = `${currentScore} / 18`;

    const daysInfoEl = document.getElementById('daysInfo');
    daysInfoEl.textContent = forecast;
    daysInfoEl.dataset.timeMode = 'false';

    document.getElementById('keepNeeded').textContent = `あと +${Math.max(0, 12 - currentScore)}`;
    document.getElementById('upNeeded').textContent   = `あと +${Math.max(0, 18 - currentScore)}`;

    const dailyScoreContainer = document.querySelector('.rank-card .daily-score');
    const dailyScoreTitleEl = document.getElementById('dailyScoreTitle');
    const dailyScoreEl = document.getElementById('dailyScore');
    const skipActiveEl = document.getElementById('skipActive');
    dailyScoreEl.textContent = `+${dailyPoints ?? 0}`;
    const timeEl = document.getElementById('dailyTimeLeft');
    if (isCurrent) {
        dailyScoreContainer.style.display = 'none';
        timeEl.dataset.isToday = 'false';
        timeEl.style.display   = 'none';
        dailyScoreTitleEl.style.display = '';
        dailyScoreEl.style.display = '';
        skipActiveEl.style.display = 'none';
        skipActiveEl.dataset.isActive = 'false';
    } else if (skipUsed) {
        dailyScoreContainer.style.display = '';
        timeEl.dataset.isToday = 'false';
        timeEl.style.display   = 'none';
        dailyScoreTitleEl.style.display = 'none';
        dailyScoreEl.style.display = 'none';
        skipActiveEl.style.display = '';
        skipActiveEl.dataset.isActive = 'true';
    } else {
        dailyScoreContainer.style.display = '';
        dailyScoreTitleEl.style.display = '';
        dailyScoreEl.style.display = '';
        skipActiveEl.style.display = 'none';
        skipActiveEl.dataset.isActive = 'false';
    }

    if (!isCurrent && !skipUsed && dayDateStr && dayDateStr === todayStr()) {
        const { hours, minutes } = getTimeUntilMidnight();
        timeEl.dataset.isToday = 'true';
        timeEl.textContent     = `あと ${hours}時間${minutes}分`;
        timeEl.style.display   = '';
    } else if (!isCurrent) {
        timeEl.dataset.isToday = 'false';
        timeEl.style.display   = 'none';
    }
}

function refreshDailyTimeLeft() {
    const timeEl = document.getElementById('dailyTimeLeft');
    if (timeEl?.dataset.isToday === 'true') {
        const { hours, minutes } = getTimeUntilMidnight();
        timeEl.textContent = `あと ${hours}時間${minutes}分`;
    }
    const daysInfoEl = document.getElementById('daysInfo');
    if (daysInfoEl?.dataset.timeMode === 'true') {
        const { hours, minutes } = getTimeUntilMidnight();
        daysInfoEl.textContent = `あと ${hours}時間${minutes}分で${daysInfoEl.dataset.suffix}`;
    }
}
