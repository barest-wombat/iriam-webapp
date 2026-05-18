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
        document.getElementById('daysLeftSlider').value     = Math.min(6,  Math.max(0, saved.daysLeft ?? 6));
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
    });

    // スコアスライダー
    document.getElementById('currentScoreSlider').addEventListener('input', e => {
        updateScoreLabel();
        updateSliderFill(e.target);
        saveState();
    });

    // 残り日数スライダー
    document.getElementById('daysLeftSlider').addEventListener('input', e => {
        updateDaysLeftLabel();
        updateSliderFill(e.target);
        saveState();
    });

    // スキップパスラダー
    document.getElementById('skipPassesSlider').addEventListener('input', e => {
        updateSkipPassesLabel();
        updateSliderFill(e.target);
        saveState();
    });

    // 開始日変更（その日付の行にスクロール）
    document.getElementById('startDate').addEventListener('change', e => {
        e.target.value = normalizeStartDate(e.target.value);
        scrollToDate(e.target.value);
        saveState();
    });

    // ストレージクリアボタン
    document.getElementById('clearStorageBtn').addEventListener('click', () => {
        if (confirm('このアプリの入力データはあなたのスマホ・PCの中にだけ保存されています。\nリセットすると入力した内容がすべて消えてしまいます。\n本当にリセットしますか？')) {
            localStorage.removeItem('iriam-state');
            location.reload();
        }
    });

    // 計算ボタン
    document.getElementById('calculateButton').addEventListener('click', calculateResults);

    // 数字キーによるスライダー直接入力
    addNumericKeyInput('currentScoreSlider', 0, 18);
    addNumericKeyInput('daysLeftSlider',     0, 6);
    addNumericKeyInput('skipPassesSlider',   0, 10);

    // デイリー残り時間を1分ごとに更新
    setInterval(refreshDailyTimeLeft, 60000);

    // PWA: Service Worker 登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    updateButtonGradient(rank);
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

    if (skipUsed && skipPasses > 0) {
        skipPasses -= 1;
        daysLeft   = Math.min(6, daysLeft + 1);
    } else {
        score += dailyPoints;
        if (score >= 18) {
            rank     = getNextRank(rank);
            score    = 0;
            daysLeft = 6;
        } else {
            daysLeft -= 1;
            if (daysLeft < 0) {
                if (score < 12) rank = getPrevRank(rank);
                score    = 0;
                daysLeft = 6;
            }
        }
    }

    skipPasses = grantWeeklySkipPassIfNeeded(date, skipPasses, dailyPointsByDate);
    return { rank, score, daysLeft, skipPasses };
}

function calculateRankStates(initialState, plans, startDateStr) {
    const startIndex = plans.findIndex(plan => plan.date === startDateStr);
    if (startIndex === -1) return null;

    const dailyPointsByDate = Object.fromEntries(
        plans.map(plan => [plan.date, plan.dailyPoints])
    );
    const dayStates = [{
        ...initialState,
        dailyPoints: undefined,
        pre: false,
        isCurrent: true,
    }];
    let current = { ...initialState };

    plans.slice(0, startIndex).forEach(plan => {
        dayStates.push({ date: plan.date, pre: true });
    });

    plans.slice(startIndex).forEach(plan => {
        current = applyDailyRankChange(current, plan, dailyPointsByDate);
        dayStates.push({
            ...current,
            dailyPoints: plan.dailyPoints,
            date: plan.date,
            pre: false,
            isCurrent: false,
        });
    });

    return dayStates;
}

// ===== 計算ボタンのグラデーション更新 =====
function updateButtonGradient(rank) {
    document.getElementById('calculateButton').className = getRankClass(rank);
}

// ===== localStorage =====
function saveState() {
    const allRows = document.getElementById('planTable').querySelector('tbody').rows;
    const planByDate = {};
    Array.from(allRows).forEach(row => {
        const dateStr = row.dataset.date;
        if (!dateStr) return;
        const slider = row.cells[1].querySelector('input[type="range"]');
        planByDate[dateStr] = {
            point: slider ? POINT_VALUES[parseInt(slider.value, 10)] : 0,
            skip:  row.cells[2].querySelector('input[type="checkbox"]').checked,
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

function loadState() {
    try {
        const s = localStorage.getItem('iriam-state');
        return s ? JSON.parse(s) : null;
    } catch { return null; }
}

// ===== カレンダー形式の予定テーブル構築（今日＋未来30日、一度だけ生成） =====
function buildCalendarTable(planByDate) {
    const tbody = document.getElementById('planTable').querySelector('tbody');
    tbody.innerHTML = '';

    const today    = todayStr();
    const baseDate = new Date(today + 'T00:00:00');
    const FUTURE = 30;

    for (let i = 0; i <= FUTURE; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        const dateStr    = toLocalDateStr(d);
        const savedEntry = planByDate[dateStr];
        const isToday    = dateStr === today;

        const tr = document.createElement('tr');
        tr.dataset.date = dateStr;
        if (isToday) tr.classList.add('today-row');

        // 日付セル
        const dayTd = document.createElement('td');
        dayTd.textContent = formatDateStr(dateStr);
        tr.appendChild(dayTd);

        // ポイントスライダーセル
        const pointTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'plan-slider-wrap';

        const pointSlider = document.createElement('input');
        pointSlider.type  = 'range';
        pointSlider.min   = 0;
        pointSlider.max   = POINT_VALUES.length - 1;
        pointSlider.step  = 1;

        const savedIdx = savedEntry ? Math.max(0, POINT_VALUES.indexOf(Number(savedEntry.point))) : 1;
        pointSlider.value = savedIdx >= 0 ? savedIdx : 1;
        updateSliderFill(pointSlider);

        const pointLabel = document.createElement('span');
        pointLabel.className = 'plan-slider-label';
        pointLabel.textContent = `+${POINT_VALUES[pointSlider.value]}`;

        pointSlider.addEventListener('input', () => {
            pointLabel.textContent = `+${POINT_VALUES[parseInt(pointSlider.value, 10)]}`;
            updateSliderFill(pointSlider);
            saveState();
        });

        wrap.appendChild(pointSlider);
        wrap.appendChild(pointLabel);
        pointTd.appendChild(wrap);
        tr.appendChild(pointTd);

        // スキップセル（チケットアイコントグル）
        const skipTd = document.createElement('td');
        const label = document.createElement('label');
        label.className = 'skip-ticket';
        label.tabIndex = 0;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'skip-cb';
        if (savedEntry) cb.checked = savedEntry.skip;
        cb.addEventListener('change', saveState);

        const icon = document.createElement('span');
        icon.className = 'ticket-icon';
        icon.innerHTML = `<svg viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0.75" y="0.75" width="18.5" height="10.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="0.75" x2="5.5" y2="11.25" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5"/></svg>`;

        label.appendChild(cb);
        label.appendChild(icon);
        skipTd.appendChild(label);
        tr.appendChild(skipTd);

        tbody.appendChild(tr);
    }

    setupArrowKeyNav();
}

// ===== 矢印キーナビゲーション =====
function setupArrowKeyNav() {
    const tbody = document.getElementById('planTable').querySelector('tbody');
    tbody.removeEventListener('keydown', handleArrowKey);
    tbody.addEventListener('keydown', handleArrowKey);
}

function handleArrowKey(e) {
    const focused = document.activeElement;
    const cell = focused.closest('td');
    if (!cell) return;

    const isRange  = focused.type === 'range';
    const isTicket = focused.classList.contains('skip-ticket');

    // Space で skip-ticket をトグル
    if (isTicket && e.key === ' ') {
        e.preventDefault();
        const cb = focused.querySelector('.skip-cb');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
    }

    // 数字キー (0,1,2,4,6) でポイント直接入力
    if (isRange && ['0', '1', '2', '4', '6'].includes(e.key)) {
        const idx = POINT_VALUES.indexOf(parseInt(e.key, 10));
        if (idx >= 0) {
            focused.value = idx;
            focused.dispatchEvent(new Event('input'));
        }
        return;
    }

    // range の左右キーはネイティブ動作（値変更）に任せる
    if (isRange && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    const isEnter = e.key === 'Enter';
    if (!isArrow && !isEnter) return;

    e.preventDefault();

    const row  = cell.parentElement;
    const rows = Array.from(row.parentElement.rows);
    const cols = Array.from(row.cells);
    const rowIdx = rows.indexOf(row);
    const colIdx = cols.indexOf(cell);

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowUp'   || (isEnter && e.shiftKey))  targetRow = Math.max(0, rowIdx - 1);
    if (e.key === 'ArrowDown' || (isEnter && !e.shiftKey)) targetRow = Math.min(rows.length - 1, rowIdx + 1);
    if (e.key === 'ArrowLeft')  targetCol = Math.max(1, colIdx - 1);
    if (e.key === 'ArrowRight') targetCol = Math.min(cols.length - 1, colIdx + 1);

    const targetCell = rows[targetRow].cells[targetCol];
    const interactive = targetCell.querySelector('input[type="range"], label.skip-ticket');
    if (interactive) interactive.focus();
}

// ===== 日付指定スクロールアニメーション（表内のみ、ページはスクロールしない） =====
function scrollToDate(dateStr) {
    const container = document.querySelector('.plan-section .table-scroll');
    const tbody = document.getElementById('planTable').querySelector('tbody');
    const row = Array.from(tbody.rows).find(r => r.dataset.date === dateStr);
    if (!row || !container) return;

    // コンテナ内の相対位置だけスクロール（ページ全体には影響しない）
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const theadHeight = document.querySelector('#planTable thead').offsetHeight;
    container.scrollBy({ top: rowRect.top - containerRect.top - theadHeight, behavior: 'smooth' });

    Array.from(tbody.rows).forEach(r => r.classList.remove('scroll-target'));
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
    const resultTbody = document.getElementById('resultTable').querySelector('tbody');
    resultTbody.innerHTML = '';

    const allRows = Array.from(document.getElementById('planTable').querySelector('tbody').rows);
    const plans = allRows.map(row => {
        const slider = row.cells[1].querySelector('input[type="range"]');
        return {
            date: row.dataset.date,
            dailyPoints: slider ? POINT_VALUES[parseInt(slider.value, 10)] : 0,
            skipUsed: row.cells[2].querySelector('input[type="checkbox"]').checked,
        };
    });
    const initialState = {
        rank: getRank(),
        score: getScore(),
        daysLeft: Math.max(0, Math.min(6, getDaysLeft())),
        skipPasses: getSkipPasses(),
    };
    const dayStates = calculateRankStates(initialState, plans, startDateStr);
    if (!dayStates) {
        alert('開始日が表の範囲外です。表示範囲内（今日〜未来30日）で設定してください。');
        return;
    }

    // テーブル行を構築
    dayStates.forEach(s => {
        const tr = document.createElement('tr');
        if (s.date) tr.dataset.date = s.date;
        if (s.isCurrent) tr.dataset.state = 'current';
        if (s.date === todayStr()) tr.classList.add('today-row');

        if (s.pre) {
            [formatDateStr(s.date), '--', '--', '--'].forEach(text => {
                const td = document.createElement('td');
                td.textContent = text;
                tr.appendChild(td);
            });
        } else {
            tr.style.cursor = 'pointer';
            const dateLabel = s.isCurrent ? '現在' : formatDateStr(s.date);
            [dateLabel, s.rank, `${s.score}`, `${s.skipPasses}`].forEach((text, ci) => {
                const td = document.createElement('td');
                td.textContent = text;
                if (ci === 1) td.className = `rank-cell ${getRankClass(s.rank)}`;
                tr.appendChild(td);
            });
        }
        resultTbody.appendChild(tr);
    });

    // 行クリックでカード更新（シミュレーション行のみ）
    Array.from(resultTbody.rows).forEach((tr, i) => {
        const s = dayStates[i];
        if (s.pre) return;
        tr.addEventListener('click', () => {
            Array.from(resultTbody.rows).forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            updateRankCard(s.rank, s.score, s.daysLeft, s.dailyPoints, s.date, s.isCurrent);
        });
    });

    // デフォルトは現在の状態を表示
    const simStates = dayStates.filter(s => !s.pre);
    if (simStates.length > 0) {
        const first = simStates[0];
        updateRankCard(first.rank, first.score, first.daysLeft, first.dailyPoints, first.date, first.isCurrent);
        const currentRow = Array.from(resultTbody.rows).find(r => r.dataset.state === 'current');
        if (currentRow) currentRow.classList.add('selected-row');
    }

    // 計算後は先頭の現在行へ戻す
    setTimeout(scrollResultToCurrent, 0);
}

function scrollResultToCurrent() {
    const container = document.querySelector('.result-section .table-scroll');
    if (!container) return;
    container.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 計算結果表の日付指定スクロール =====
function scrollResultToDate(dateStr) {
    const container = document.querySelector('.result-section .table-scroll');
    const tbody = document.getElementById('resultTable').querySelector('tbody');
    const row = Array.from(tbody.rows).find(r => r.dataset.date === dateStr);
    if (!row || !container) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const theadHeight = document.querySelector('#resultTable thead').offsetHeight;
    container.scrollBy({ top: rowRect.top - containerRect.top - theadHeight, behavior: 'smooth' });
}

// ===== ランクカード更新 =====
function updateRankCard(rank, currentScore, daysLeft, dailyPoints, dayDateStr, isCurrent = false) {
    document.querySelector('.card-section h2').textContent =
        isCurrent ? '現在カード' : '予測カード';
    document.getElementById('rankCard').className    = `rank-card ${getRankClass(rank)}`;
    document.getElementById('rankLabel').textContent = rank;
    document.getElementById('scoreDisplay').textContent = `${currentScore} / 18`;

    const suffix     = currentScore >= 12 ? 'リセット' : 'ランクダウン';
    const daysInfoEl = document.getElementById('daysInfo');
    if (daysLeft === 0 && isCurrent) {
        const { hours, minutes } = getTimeUntilMidnight();
        daysInfoEl.textContent       = `あと${hours}時間${minutes}分で${suffix}`;
        daysInfoEl.dataset.timeMode  = 'true';
        daysInfoEl.dataset.suffix    = suffix;
    } else {
        daysInfoEl.textContent      = `残り${daysLeft}日で${suffix}`;
        daysInfoEl.dataset.timeMode = 'false';
    }

    document.getElementById('keepNeeded').textContent = `あと+${Math.max(0, 12 - currentScore)}`;
    document.getElementById('upNeeded').textContent   = `あと+${Math.max(0, 18 - currentScore)}`;

    const dailyScoreContainer = document.querySelector('.rank-card .daily-score');
    document.getElementById('dailyScore').textContent = `+${dailyPoints ?? 0}`;
    const timeEl = document.getElementById('dailyTimeLeft');
    if (isCurrent) {
        dailyScoreContainer.style.display = 'none';
        timeEl.dataset.isToday = 'false';
        timeEl.style.display   = 'none';
    } else {
        dailyScoreContainer.style.display = '';
    }

    if (!isCurrent && dayDateStr && dayDateStr === todayStr()) {
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
        daysInfoEl.textContent = `あと${hours}時間${minutes}分で${daysInfoEl.dataset.suffix}`;
    }
}
