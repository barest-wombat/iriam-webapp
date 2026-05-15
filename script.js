// IRIAMランク管理Webアプリのスクリプト
document.addEventListener('DOMContentLoaded', () => {
    // ランク一覧
    const ranks = [
        'D', 'C1', 'C2', 'C3', 'C4', 'C5',
        'B1', 'B2', 'B3',
        'A1', 'A2', 'A3',
        'S1', 'S2', 'S3'
    ];

    // 現在ランクのセレクトにランクを追加
    const currentRankSelect = document.getElementById('currentRank');
    ranks.forEach((rank) => {
        const option = document.createElement('option');
        option.value = rank;
        option.textContent = rank;
        currentRankSelect.appendChild(option);
    });
    // 初期値としてB2を選択しておく
    currentRankSelect.value = 'B2';

    // 予定表の行を生成
    const planTableBody = document.getElementById('planTable').querySelector('tbody');
    const possiblePoints = [0, 1, 2, 4, 6];
    for (let i = 0; i < 7; i++) {
        const tr = document.createElement('tr');
        // 日付列
        const dayTd = document.createElement('td');
        dayTd.textContent = `Day ${i + 1}`;
        tr.appendChild(dayTd);
        // ポイント選択列
        const pointTd = document.createElement('td');
        const select = document.createElement('select');
        possiblePoints.forEach(pt => {
            const opt = document.createElement('option');
            opt.value = pt;
            opt.textContent = `+${pt}`;
            select.appendChild(opt);
        });
        pointTd.appendChild(select);
        tr.appendChild(pointTd);
        // スキップ列
        const skipTd = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        skipTd.appendChild(checkbox);
        tr.appendChild(skipTd);
        planTableBody.appendChild(tr);
    }

    // ボタンのクリックイベント
    document.getElementById('calculateButton').addEventListener('click', () => {
        calculateResults(ranks);
    });
});

/**
 * 次のランクを取得
 * @param {string} rank
 * @param {Array<string>} ranks
 * @returns {string}
 */
function getNextRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    if (idx === -1) return rank;
    return ranks[Math.min(idx + 1, ranks.length - 1)];
}

/**
 * 前のランクを取得
 * @param {string} rank
 * @param {Array<string>} ranks
 * @returns {string}
 */
function getPrevRank(rank, ranks) {
    const idx = ranks.indexOf(rank);
    if (idx === -1) return rank;
    return ranks[Math.max(idx - 1, 0)];
}

/**
 * シミュレーションの実行と結果表示
 * @param {Array<string>} ranks
 */
function calculateResults(ranks) {
    const currentRankSelect = document.getElementById('currentRank');
    let currentRank = currentRankSelect.value;
    let currentScore = parseInt(document.getElementById('currentScore').value, 10) || 0;
    let daysLeft = parseInt(document.getElementById('daysLeft').value, 10) || 7;
    let skipPasses = parseInt(document.getElementById('skipPasses').value, 10) || 0;

    // 入力されていない場合はデフォルト値に調整
    if (daysLeft < 1) daysLeft = 1;
    if (daysLeft > 7) daysLeft = 7;

    // 結果テーブルのボディをクリア
    const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
    resultTableBody.innerHTML = '';

    // 予定テーブルの情報を取得
    const planRows = document.getElementById('planTable').querySelector('tbody').rows;
    // 最終日に使用したスコアやポイントを記録
    let finalDayScore = 0;
    for (let i = 0; i < planRows.length; i++) {
        const row = planRows[i];
        const pointsSelect = row.cells[1].querySelector('select');
        const skipCheckbox = row.cells[2].querySelector('input[type="checkbox"]');
        const dailyPoints = parseInt(pointsSelect.value, 10) || 0;
        const skipUsed = skipCheckbox.checked;
        let nextDayScore;
        let nextDayRank;
        let nextSkipPasses = skipPasses;

        if (skipUsed && skipPasses > 0) {
            // スキップパスを使う: 残り日数を延ばす、スコアも変わらない
            skipPasses -= 1;
            daysLeft += 1;
            nextDayScore = currentScore;
            nextDayRank = currentRank;
        } else {
            // スキップしない場合
            currentScore += dailyPoints;
            daysLeft -= 1;
            // ランクリセットのチェック
            if (daysLeft <= 0) {
                // 判定を行う
                if (currentScore >= 18) {
                    currentRank = getNextRank(currentRank, ranks);
                } else if (currentScore >= 12) {
                    // 現状維持
                } else {
                    currentRank = getPrevRank(currentRank, ranks);
                }
                // リセット
                currentScore = 0;
                daysLeft = 7;
            }
            nextDayScore = currentScore;
            nextDayRank = currentRank;
        }
        nextSkipPasses = skipPasses;
        // 結果行の作成
        const tr = document.createElement('tr');
        const tdDay = document.createElement('td');
        tdDay.textContent = `Day ${i + 1}`;
        tr.appendChild(tdDay);
        const tdScore = document.createElement('td');
        tdScore.textContent = `${nextDayScore}`;
        tr.appendChild(tdScore);
        const tdRank = document.createElement('td');
        tdRank.textContent = `${nextDayRank}`;
        tr.appendChild(tdRank);
        const tdSkip = document.createElement('td');
        tdSkip.textContent = `${nextSkipPasses}`;
        tr.appendChild(tdSkip);
        resultTableBody.appendChild(tr);
        // 最終日チェック用
        if (i === planRows.length - 1) {
            finalDayScore = dailyPoints;
        }
    }
    // 最終日（7日目）の状態でカードを更新
    updateRankCard(currentRank, currentScore, daysLeft, finalDayScore);
}

/**
 * ランクカードを更新する
 * @param {string} rank
 * @param {number} currentScore
 * @param {number} daysLeft
 * @param {number} dailyPoints
 */
function updateRankCard(rank, currentScore, daysLeft, dailyPoints) {
    const rankLabel = document.getElementById('rankLabel');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const daysInfo = document.getElementById('daysInfo');
    const keepNeeded = document.getElementById('keepNeeded');
    const upNeeded = document.getElementById('upNeeded');
    const dailyScoreElem = document.getElementById('dailyScore');
    const supportPointsElem = document.getElementById('supportPoints');

    rankLabel.textContent = rank;
    scoreDisplay.textContent = `${currentScore} / 18`;
    daysInfo.textContent = `残り${daysLeft}日でランクダウン`;
    // ランクキープ・アップまでの残りスコア
    const needKeep = Math.max(0, 12 - currentScore);
    const needUp = Math.max(0, 18 - currentScore);
    keepNeeded.textContent = `あと+${needKeep}`;
    upNeeded.textContent = `あと+${needUp}`;
    // デイリーランクスコア
    dailyScoreElem.textContent = `+${dailyPoints}`;
    // 応援ポイント: 目安としてポイント×100を表示
    supportPointsElem.textContent = `${dailyPoints * 100}`;
}