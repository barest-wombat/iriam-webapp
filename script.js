// ===== テーマ管理 =====
(function initTheme() {
    const saved = localStorage.getItem('iriam-theme') || 'auto';
    applyTheme(saved);

    // システムの配色変更を監視（autoのときのみ反映）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('iriam-theme') || 'auto') === 'auto') {
            applyTheme('auto');
        }
    });
})();

function applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolved);
}

// IRIAMランク管理Webアプリのスクリプト
document.addEventListener('DOMContentLoaded', () => {
    // テーマ切り替えボタン
    const savedTheme = localStorage.getItem('iriam-theme') || 'auto';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.value === savedTheme) btn.classList.add('active');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const t = btn.dataset.value;
            localStorage.setItem('iriam-theme', t);
            applyTheme(t);
        });
    });
    const ranks = [
        'D', 'C1', 'C2', 'C3', 'C4', 'C5',
        'B1', 'B2', 'B3',
        'A1', 'A2', 'A3',
        'S1', 'S2', 'S3'
    ];

    // ランクセレクトに選択肢を追加
    const currentRankSelect = document.getElementById('currentRank');
    ranks.forEach((rank) => {
        const option = document.createElement('option');
        option.value = rank;
        option.textContent = rank;
        currentRankSelect.appendChild(option);
    });
    currentRankSelect.value = 'B2';

    // 開始日を今日に設定
    const startDateInput = document.getElementById('startDate');
    const today = new Date();
    startDateInput.value = today.toISOString().split('T')[0];

    // 予定テーブル行を生成
    buildPlanTable(startDateInput.value);

    // 開始日変更時に予定テーブルの日付を更新
    startDateInput.addEventListener('change', () => {
        buildPlanTable(startDateInput.value);
    });

    document.getElementById('calculateButton').addEventListener('click', () => {
        calculateResults(ranks);
    });
});

/**
 * 日付文字列（YYYY-MM-DD）にオフセット日数を加算してフォーマット
 * @param {string} baseDateStr
 * @param {number} offset
 * @returns {string} 例: "5/15（木）"
 */
function formatDateWithOffset(baseDateStr, offset) {
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(baseDateStr + 'T00:00:00');
    date.setDate(date.getDate() + offset);
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const dow = dayNames[date.getDay()];
    return `${m}/${d}（${dow}）`;
}

/**
 * ランク文字列からCSSクラス名を返す
 * @param {string} rank
 * @returns {string}
 */
function getRankClass(rank) {
    if (rank.startsWith('S')) return 'rank-s';
    if (rank.startsWith('A')) return 'rank-a';
    if (rank.startsWith('B')) return 'rank-b';
    if (rank.startsWith('C')) return 'rank-c';
    return 'rank-d';
}

/**
 * 予定テーブルを（再）構築する
 * @param {string} startDateStr
 */
function buildPlanTable(startDateStr) {
    const planTableBody = document.getElementById('planTable').querySelector('tbody');
    // 既存の入力値を保持してから再構築
    const prevValues = [];
    Array.from(planTableBody.rows).forEach(row => {
        prevValues.push({
            point: row.cells[1].querySelector('select').value,
            skip: row.cells[2].querySelector('input[type="checkbox"]').checked,
        });
    });

    planTableBody.innerHTML = '';
    const possiblePoints = [0, 1, 2, 4, 6];

    for (let i = 0; i < 7; i++) {
        const tr = document.createElement('tr');

        const dayTd = document.createElement('td');
        dayTd.textContent = formatDateWithOffset(startDateStr, i);
        tr.appendChild(dayTd);

        const pointTd = document.createElement('td');
        const select = document.createElement('select');
        possiblePoints.forEach(pt => {
            const opt = document.createElement('option');
            opt.value = pt;
            opt.textContent = `+${pt}`;
            select.appendChild(opt);
        });
        if (prevValues[i]) select.value = prevValues[i].point;
        pointTd.appendChild(select);
        tr.appendChild(pointTd);

        const skipTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        if (prevValues[i]) checkbox.checked = prevValues[i].skip;
        skipTd.appendChild(checkbox);
        tr.appendChild(skipTd);

        planTableBody.appendChild(tr);
    }
}

function getNextRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    if (idx === -1) return rank;
    return ranks[Math.min(idx + 1, ranks.length - 1)];
}

function getPrevRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    if (idx === -1) return rank;
    return ranks[Math.max(idx - 1, 0)];
}

/**
 * シミュレーション実行
 * @param {Array<string>} ranks
 */
function calculateResults(ranks) {
    const startDateStr = document.getElementById('startDate').value;
    let currentRank = document.getElementById('currentRank').value;
    let currentScore = parseInt(document.getElementById('currentScore').value, 10) || 0;
    let daysLeft = parseInt(document.getElementById('daysLeft').value, 10) || 7;
    let skipPasses = parseInt(document.getElementById('skipPasses').value, 10) || 0;

    if (daysLeft < 1) daysLeft = 1;
    if (daysLeft > 7) daysLeft = 7;

    const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
    resultTableBody.innerHTML = '';

    const planRows = document.getElementById('planTable').querySelector('tbody').rows;

    // 各日の状態を保存しておく（行クリック時に使用）
    const dayStates = [];

    for (let i = 0; i < planRows.length; i++) {
        const row = planRows[i];
        const dailyPoints = parseInt(row.cells[1].querySelector('select').value, 10) || 0;
        const skipUsed = row.cells[2].querySelector('input[type="checkbox"]').checked;

        if (skipUsed && skipPasses > 0) {
            skipPasses -= 1;
            daysLeft += 1;
        } else {
            currentScore += dailyPoints;
            daysLeft -= 1;
            if (daysLeft <= 0) {
                if (currentScore >= 18) {
                    currentRank = getNextRank(currentRank, ranks);
                } else if (currentScore < 12) {
                    currentRank = getPrevRank(currentRank, ranks);
                }
                currentScore = 0;
                daysLeft = 7;
            }
        }

        const state = {
            rank: currentRank,
            score: currentScore,
            daysLeft,
            dailyPoints,
            skipPasses,
        };
        dayStates.push(state);

        const dateLabel = formatDateWithOffset(startDateStr, i);
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.dayIndex = i;

        const tdDay = document.createElement('td');
        tdDay.textContent = dateLabel;
        tr.appendChild(tdDay);

        const tdScore = document.createElement('td');
        tdScore.textContent = `${currentScore}`;
        tr.appendChild(tdScore);

        const tdRank = document.createElement('td');
        tdRank.textContent = currentRank;
        tdRank.className = `rank-cell ${getRankClass(currentRank)}`;
        tr.appendChild(tdRank);

        const tdSkip = document.createElement('td');
        tdSkip.textContent = `${skipPasses}`;
        tr.appendChild(tdSkip);

        resultTableBody.appendChild(tr);
    }

    // 行クリックでカード更新
    Array.from(resultTableBody.rows).forEach((tr, i) => {
        tr.addEventListener('click', () => {
            // 選択状態のハイライト
            Array.from(resultTableBody.rows).forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            const s = dayStates[i];
            updateRankCard(s.rank, s.score, s.daysLeft, s.dailyPoints);
        });
    });

    // 最終日の状態でカードを初期表示
    const last = dayStates[dayStates.length - 1];
    updateRankCard(last.rank, last.score, last.daysLeft, last.dailyPoints);
}

/**
 * ランクカードを更新する
 */
function updateRankCard(rank, currentScore, daysLeft, dailyPoints) {
    const card = document.getElementById('rankCard');

    // ランク色クラスを付け替え
    card.className = `rank-card ${getRankClass(rank)}`;

    document.getElementById('rankLabel').textContent = rank;
    document.getElementById('scoreDisplay').textContent = `${currentScore} / 18`;
    document.getElementById('daysInfo').textContent = `残り${daysLeft}日でランクダウン`;

    const needKeep = Math.max(0, 12 - currentScore);
    const needUp = Math.max(0, 18 - currentScore);
    document.getElementById('keepNeeded').textContent = `あと+${needKeep}`;
    document.getElementById('upNeeded').textContent = `あと+${needUp}`;
    document.getElementById('dailyScore').textContent = `+${dailyPoints}`;
    document.getElementById('supportPoints').textContent = `${dailyPoints * 100}`;
}
