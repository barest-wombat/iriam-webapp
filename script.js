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

// ===== ランクグラデーション定義 =====
const RANK_GRADIENTS = {
    'rank-s': 'linear-gradient(135deg, #ff2060, #ff6a00)',
    'rank-a': 'linear-gradient(135deg, #ff1480, #ff4060)',
    'rank-b': 'linear-gradient(135deg, #7b3ec8, #b06ae8)',
    'rank-c': 'linear-gradient(135deg, #1a3ab8, #2b60e8)',
    'rank-d': 'linear-gradient(135deg, #546e7a, #90a4ae)',
};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
    const ranks = ['D', 'C1', 'C2', 'C3', 'C4', 'C5', 'B1', 'B2', 'B3', 'A1', 'A2', 'A3', 'S1', 'S2', 'S3'];

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

    // ランクセレクト
    const currentRankSelect = document.getElementById('currentRank');
    ranks.forEach(rank => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = rank;
        currentRankSelect.appendChild(opt);
    });

    // 開始日は常に今日（localStorage から復元しない）
    document.getElementById('startDate').value = todayStr();

    // localStorage から状態を復元（なければデフォルト）
    const saved = loadState();
    if (saved) {
        currentRankSelect.value = saved.rank || 'B2';
        document.getElementById('currentScore').value  = saved.score ?? 0;
        document.getElementById('daysLeft').value      = saved.daysLeft ?? 7;
        document.getElementById('skipPasses').value    = saved.skipPasses ?? 0;
        buildPlanTable(todayStr(), saved.planByDate || {});
    } else {
        currentRankSelect.value = 'B2';
        buildPlanTable(todayStr(), {});
    }

    // 計算ボタンの色を初期ランクに合わせる
    updateButtonGradient(currentRankSelect.value);

    // ランク変更でボタン色を更新
    currentRankSelect.addEventListener('change', () => {
        updateButtonGradient(currentRankSelect.value);
        saveState();
    });

    // 開始日変更（localStorage の全保存データ + 現在DOM行を合わせて引き継ぎ）
    document.getElementById('startDate').addEventListener('change', () => {
        const st = loadState();
        buildPlanTable(document.getElementById('startDate').value, st?.planByDate || {});
        saveState();
    });

    // 入力変更時の自動保存
    ['currentScore', 'daysLeft', 'skipPasses'].forEach(id => {
        document.getElementById(id).addEventListener('input', saveState);
    });

    // 計算ボタン
    document.getElementById('calculateButton').addEventListener('click', () => {
        calculateResults(ranks);
    });

    // デイリー残り時間を1分ごとに更新
    setInterval(refreshDailyTimeLeft, 60000);

    // PWA: Service Worker 登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
});

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

function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = midnight - now;
    return {
        hours: Math.floor(diff / 3600000),
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

function getNextRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    return idx === -1 ? rank : ranks[Math.min(idx + 1, ranks.length - 1)];
}

function getPrevRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    return idx === -1 ? rank : ranks[Math.max(idx - 1, 0)];
}

// ===== 計算ボタンのグラデーション更新 =====
function updateButtonGradient(rank) {
    const btn = document.getElementById('calculateButton');
    btn.className = getRankClass(rank);
}

// ===== localStorage =====
function saveState() {
    const startDateStr = document.getElementById('startDate').value;
    const planRows = document.getElementById('planTable').querySelector('tbody').rows;
    const planByDate = {};
    Array.from(planRows).forEach((row, i) => {
        // data-date がなければ開始日＋インデックスから計算（SW旧キャッシュ対策）
        const dateStr = row.cells[0].dataset.date || getDateStr(startDateStr, i);
        planByDate[dateStr] = {
            point: row.cells[1].querySelector('select').value,
            skip:  row.cells[2].querySelector('input[type="checkbox"]').checked,
        };
    });
    const state = {
        rank:       document.getElementById('currentRank').value,
        score:      document.getElementById('currentScore').value,
        daysLeft:   document.getElementById('daysLeft').value,
        skipPasses: document.getElementById('skipPasses').value,
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

// ===== 予定テーブル構築 =====
function buildPlanTable(startDateStr, planByDate) {
    const tbody = document.getElementById('planTable').querySelector('tbody');

    // 既存行の値を日付キーで収集（開始日変更時に日付をまたいで引き継ぎ）
    const merged = Object.assign({}, planByDate);
    Array.from(tbody.rows).forEach(row => {
        const dateStr = row.cells[0].dataset.date;
        if (dateStr) {
            merged[dateStr] = {
                point: row.cells[1].querySelector('select').value,
                skip:  row.cells[2].querySelector('input[type="checkbox"]').checked,
            };
        }
    });

    tbody.innerHTML = '';
    const possiblePoints = [0, 1, 2, 4, 6];

    for (let i = 0; i < 7; i++) {
        const dateStr = getDateStr(startDateStr, i);
        const saved = merged[dateStr];
        const tr = document.createElement('tr');

        // 日付セル（data-date に実日付を保持）
        const dayTd = document.createElement('td');
        dayTd.textContent = formatDateWithOffset(startDateStr, i);
        dayTd.dataset.date = dateStr;
        tr.appendChild(dayTd);

        // ポイントセル
        const pointTd = document.createElement('td');
        const sel = document.createElement('select');
        possiblePoints.forEach(pt => {
            const opt = document.createElement('option');
            opt.value = pt;
            opt.textContent = `+${pt}`;
            sel.appendChild(opt);
        });
        if (saved) sel.value = saved.point;
        sel.addEventListener('change', saveState);
        pointTd.appendChild(sel);
        tr.appendChild(pointTd);

        // スキップセル
        const skipTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        if (saved) cb.checked = saved.skip;
        cb.addEventListener('change', saveState);
        skipTd.appendChild(cb);
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

    const isSelect = focused.tagName === 'SELECT';
    const isCheckbox = focused.type === 'checkbox';

    // 数字キー（0,1,2,4,6）でポイント直接入力
    if (isSelect && ['0', '1', '2', '4', '6'].includes(e.key)) {
        focused.value = e.key;
        focused.dispatchEvent(new Event('change'));
        return;
    }

    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    const isEnter = e.key === 'Enter';
    if (!isArrow && !isEnter) return;
    if (isEnter && isCheckbox) return; // チェックボックスのSpaceはネイティブ

    e.preventDefault();

    const row = cell.parentElement;
    const rows = Array.from(row.parentElement.rows);
    const cols = Array.from(row.cells);
    const rowIdx = rows.indexOf(row);
    const colIdx = cols.indexOf(cell);

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowUp'    || (isEnter && e.shiftKey)) targetRow = Math.max(0, rowIdx - 1);
    if (e.key === 'ArrowDown'  || (isEnter && !e.shiftKey)) targetRow = Math.min(rows.length - 1, rowIdx + 1);
    if (e.key === 'ArrowLeft')  targetCol = Math.max(1, colIdx - 1); // col 0 は日付（スキップ）
    if (e.key === 'ArrowRight') targetCol = Math.min(cols.length - 1, colIdx + 1);

    const targetCell = rows[targetRow].cells[targetCol];
    const interactive = targetCell.querySelector('select, input');
    if (interactive) interactive.focus();
}

// ===== シミュレーション計算 =====
function calculateResults(ranks) {
    const startDateStr = document.getElementById('startDate').value;
    let currentRank  = document.getElementById('currentRank').value;
    let currentScore = parseInt(document.getElementById('currentScore').value, 10) || 0;
    let daysLeft     = parseInt(document.getElementById('daysLeft').value, 10) || 7;
    let skipPasses   = parseInt(document.getElementById('skipPasses').value, 10) || 0;

    daysLeft = Math.max(1, Math.min(7, daysLeft));

    const resultTbody = document.getElementById('resultTable').querySelector('tbody');
    resultTbody.innerHTML = '';

    const planRows = document.getElementById('planTable').querySelector('tbody').rows;
    const dayStates = [];

    for (let i = 0; i < planRows.length; i++) {
        const dailyPoints = parseInt(planRows[i].cells[1].querySelector('select').value, 10) || 0;
        const skipUsed    = planRows[i].cells[2].querySelector('input[type="checkbox"]').checked;

        if (skipUsed && skipPasses > 0) {
            skipPasses -= 1;
            daysLeft += 1;
        } else {
            currentScore += dailyPoints;
            daysLeft -= 1;
            if (daysLeft <= 0) {
                if (currentScore >= 18)      currentRank = getNextRank(currentRank, ranks);
                else if (currentScore < 12)  currentRank = getPrevRank(currentRank, ranks);
                currentScore = 0;
                daysLeft = 7;
            }
        }

        dayStates.push({ rank: currentRank, score: currentScore, daysLeft, dailyPoints, skipPasses, date: getDateStr(startDateStr, i) });

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        const cells = [
            formatDateWithOffset(startDateStr, i),
            `${currentScore}`,
            currentRank,
            `${skipPasses}`,
        ];
        cells.forEach((text, ci) => {
            const td = document.createElement('td');
            td.textContent = text;
            if (ci === 2) td.className = `rank-cell ${getRankClass(currentRank)}`;
            tr.appendChild(td);
        });

        resultTbody.appendChild(tr);
    }

    // 行クリックでカード更新
    Array.from(resultTbody.rows).forEach((tr, i) => {
        tr.addEventListener('click', () => {
            Array.from(resultTbody.rows).forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            const s = dayStates[i];
            updateRankCard(s.rank, s.score, s.daysLeft, s.dailyPoints, s.date);
        });
    });

    // 最終日のカードを表示
    const last = dayStates[dayStates.length - 1];
    updateRankCard(last.rank, last.score, last.daysLeft, last.dailyPoints, last.date);
}

// ===== ランクカード更新 =====
function updateRankCard(rank, currentScore, daysLeft, dailyPoints, dayDateStr) {
    document.getElementById('rankCard').className = `rank-card ${getRankClass(rank)}`;
    document.getElementById('rankLabel').textContent    = rank;
    document.getElementById('scoreDisplay').textContent = `${currentScore} / 18`;
    document.getElementById('daysInfo').textContent     = `残り${daysLeft}日でランクダウン`;
    document.getElementById('keepNeeded').textContent   = `あと+${Math.max(0, 12 - currentScore)}`;
    document.getElementById('upNeeded').textContent     = `あと+${Math.max(0, 18 - currentScore)}`;
    document.getElementById('dailyScore').textContent   = `+${dailyPoints}`;

    // 本日の行ならば残り時間を表示
    const timeEl = document.getElementById('dailyTimeLeft');
    if (dayDateStr && dayDateStr === todayStr()) {
        timeEl.dataset.isToday = 'true';
        const { hours, minutes } = getTimeUntilMidnight();
        timeEl.textContent = `あと ${hours}時間${minutes}分`;
        timeEl.style.display = '';
    } else {
        timeEl.dataset.isToday = 'false';
        timeEl.style.display = 'none';
    }
}

function refreshDailyTimeLeft() {
    const el = document.getElementById('dailyTimeLeft');
    if (el && el.dataset.isToday === 'true') {
        const { hours, minutes } = getTimeUntilMidnight();
        el.textContent = `あと ${hours}時間${minutes}分`;
    }
}
