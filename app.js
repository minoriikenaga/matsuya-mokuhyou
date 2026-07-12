// ドラマー知識検定(仮称) パイロット版アプリロジック
// 広告表示は実際の広告SDKと未連携のプレースホルダー(仮実装)。
// 画像問題(illustration/notation)もアセット未調達のためプレースホルダー表示。

(function () {
  const STORAGE_KEY = "drumquiz_progress_v1";
  const AD_SECONDS = 5;

  const root = document.getElementById("app-root");

  // ---- 進捗の永続化 ----
  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }
  let progress = loadProgress();

  function getSubsetProgress(subsetId) {
    return progress[subsetId] || { bestScoreRaw: 0, bestScoreDisplay: 0, perfectCount: 0, tier: null };
  }

  function tierFromPerfectCount(count) {
    if (count >= 3) return "FANTASTIC";
    if (count >= 2) return "GREAT";
    if (count >= 1) return "GOOD";
    return null;
  }

  // ---- スコア計算(内部は正確な小数、表示のみ繰り上げ整数) ----
  function computeScore(correctCount, totalCount) {
    const raw = (correctCount * 100) / totalCount;
    const rounded = Math.round(raw * 1e6) / 1e6; // 浮動小数点誤差を除去
    const display = Math.ceil(rounded);
    return { raw: rounded, display };
  }

  // ---- 選択肢シャッフル(データ上は正解が常に0番目のため表示時にランダム化) ----
  function shuffledChoices(question) {
    const indices = question.choices.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
      choices: indices.map((i) => question.choices[i]),
      correctIndex: indices.indexOf(question.correctIndex)
    };
  }

  // ---- 全カテゴリのデータを集約 ----
  // 各カテゴリのデータファイルは window.SUBSETS_CATxx / QUESTIONS_CATxx / REFERENCES_CATxx を定義する。
  // cat_01 → "CAT01" のようにIDから接尾辞を決めて、読み込まれている全カテゴリ分を集約する。
  function categorySuffix(catId) {
    return catId.replace("cat_", "CAT"); // cat_01 -> CAT01
  }
  function collect(kind) {
    const out = [];
    (window.CATEGORIES || []).forEach((cat) => {
      const arr = window[kind + "_" + categorySuffix(cat.id)];
      if (Array.isArray(arr)) out.push.apply(out, arr);
    });
    return out;
  }
  function allSubsets() {
    return collect("SUBSETS");
  }
  function findReference(refId) {
    return collect("REFERENCES").find((r) => r.id === refId) || null;
  }
  function findQuestion(qId) {
    return collect("QUESTIONS").find((q) => q.id === qId) || null;
  }
  function findSubset(subsetId) {
    return allSubsets().find((s) => s.id === subsetId) || null;
  }
  function subsetsInOrder() {
    return allSubsets();
  }
  // データが実際に読み込まれているカテゴリのみ「利用可能」とみなす
  function categoryIsAvailable(cat) {
    const arr = window["SUBSETS_" + categorySuffix(cat.id)];
    return Array.isArray(arr) && arr.length > 0;
  }

  // ---- 画面状態 ----
  let currentQuizState = null; // { subsetId, order:[shuffled choice info per question], index, correctCount, questions }

  function render(html) {
    root.innerHTML = html;
  }

  function bannerAdHtml() {
    return '<div class="banner-ad-placeholder">広告(プレースホルダー) — バナー広告枠</div>';
  }

  // ---- インタースティシャル広告(プレースホルダー) ----
  function showInterstitial(onDone) {
    const overlay = document.createElement("div");
    overlay.className = "interstitial-overlay";
    overlay.innerHTML =
      '<div class="interstitial-box">' +
      '<div class="ad-label">広告(プレースホルダー) — インタースティシャル</div>' +
      '<div class="ad-timer" id="ad-timer">' + AD_SECONDS + "</div>" +
      '<button id="ad-close-btn" disabled>閉じる</button>' +
      "</div>";
    document.body.appendChild(overlay);

    let remaining = AD_SECONDS;
    const timerEl = overlay.querySelector("#ad-timer");
    const btn = overlay.querySelector("#ad-close-btn");
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        timerEl.textContent = "0";
        btn.disabled = false;
        btn.textContent = "はじめる";
      } else {
        timerEl.textContent = String(remaining);
      }
    }, 1000);

    btn.addEventListener("click", () => {
      document.body.removeChild(overlay);
      onDone();
    });
  }

  // ---- TOP画面(大枠選択) ----
  function renderTop() {
    const availableCount = window.CATEGORIES.filter(categoryIsAvailable).length;
    const cards = window.CATEGORIES.map((cat) => {
      const disabled = !categoryIsAvailable(cat);
      const catSubsets = subsetsInOrder().filter((s) => s.categoryId === cat.id);
      const answeredSubsets = catSubsets.filter((s) => getSubsetProgress(s.id).perfectCount > 0).length;
      const totalSubsets = catSubsets.length;
      const pct = totalSubsets ? Math.round((answeredSubsets / totalSubsets) * 100) : 0;
      return (
        '<div class="category-card ' + (disabled ? "disabled" : "") + '" ' +
        (disabled ? "" : 'onclick="DrumQuiz.openCategory(\'' + cat.id + "')\"") + ">" +
        (disabled ? '<div class="coming-soon-badge">近日公開</div>' : "") +
        '<div class="icon">' + cat.icon + "</div>" +
        '<div class="title">' + cat.title + "</div>" +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-label">' + (disabled ? "未実装" : answeredSubsets + " / " + totalSubsets + " 小枠で満点経験あり") + "</div>" +
        "</div>"
      );
    }).join("");

    render(
      '<div class="app-header"><h1>ドラマー知識検定(仮称)</h1><p>パイロット版 — ' + availableCount + " / " + window.CATEGORIES.length + "カテゴリ 公開中</p></div>" +
      '<div class="screen"><div class="category-grid">' + cards + "</div></div>" +
      bannerAdHtml()
    );
  }

  // ---- カテゴリ詳細(小枠一覧) ----
  function renderCategory(categoryId) {
    const cat = window.CATEGORIES.find((c) => c.id === categoryId);
    const subsets = subsetsInOrder().filter((s) => s.categoryId === categoryId);
    const groups = ["初級", "中級", "上級", "プロ"];
    const groupHtml = groups
      .map((diff) => {
        const list = subsets.filter((s) => s.difficulty === diff);
        if (!list.length) return "";
        const items = list
          .map((s) => {
            const p = getSubsetProgress(s.id);
            const tierClass = p.tier || "none";
            const tierLabel = p.tier || "未達成";
            return (
              '<div class="subset-card" onclick="DrumQuiz.startSubset(\'' + s.id + "')\">" +
              '<div class="subset-title">' + s.title + "</div>" +
              '<div class="subset-meta">' +
              "<span>ベスト: " + p.bestScoreDisplay + "点 / 満点" + p.perfectCount + "回</span>" +
              '<span class="tier-badge ' + tierClass + '">' + tierLabel + "</span>" +
              "</div></div>"
            );
          })
          .join("");
        return '<div class="difficulty-group"><h3>' + diff + '</h3><div class="subset-list">' + items + "</div></div>";
      })
      .join("");

    render(
      '<div class="app-header"><h1>' + cat.title + "</h1></div>" +
      '<div class="screen">' +
      '<button class="back-link" onclick="DrumQuiz.goTop()">← トップへ戻る</button>' +
      groupHtml +
      "</div>" +
      bannerAdHtml()
    );
  }

  // ---- 小枠プレイ開始(インタースティシャル→出題) ----
  function startSubset(subsetId) {
    showInterstitial(() => beginQuiz(subsetId));
  }

  function beginQuiz(subsetId) {
    const subset = findSubset(subsetId);
    const questions = subset.questionIds.map((qId) => findQuestion(qId));
    currentQuizState = {
      subsetId,
      questions,
      index: 0,
      correctCount: 0,
      shuffles: questions.map(shuffledChoices)
    };
    renderQuestion();
  }

  function renderQuestion() {
    const state = currentQuizState;
    const q = state.questions[state.index];
    const shuffle = state.shuffles[state.index];
    const curSubset = findSubset(state.subsetId);
    const curCat = curSubset ? window.CATEGORIES.find((c) => c.id === curSubset.categoryId) : null;
    const catTitle = curCat ? curCat.title : "";

    const mediaHtml = q.media
      ? '<div class="media-placeholder">🖼 画像素材未実装(プレースホルダー): ' + (q.media.altText || q.media.kind) + "</div>"
      : "";

    const choiceButtons = shuffle.choices
      .map(
        (c, i) =>
          '<button class="choice-btn" data-i="' + i + '" onclick="DrumQuiz.answer(' + i + ')">' + c + "</button>"
      )
      .join("");

    render(
      '<div class="screen">' +
      '<div class="question-card">' +
      '<div class="question-progress">問題 ' + (state.index + 1) + " / " + state.questions.length + "</div>" +
      '<div class="question-tag">' + catTitle + " / " + q.difficulty + "</div>" +
      '<div class="question-text">' + q.text + "</div>" +
      mediaHtml +
      '<div class="choice-list" id="choice-list">' + choiceButtons + "</div>" +
      '<div id="feedback-area"></div>' +
      "</div></div>" +
      bannerAdHtml()
    );
  }

  function answer(selectedIndex) {
    const state = currentQuizState;
    const q = state.questions[state.index];
    const shuffle = state.shuffles[state.index];
    const isCorrect = selectedIndex === shuffle.correctIndex;
    if (isCorrect) state.correctCount += 1;

    const buttons = document.querySelectorAll("#choice-list .choice-btn");
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === shuffle.correctIndex) btn.classList.add("correct");
      else if (i === selectedIndex) btn.classList.add("incorrect");
    });

    const ref = q.referenceId ? findReference(q.referenceId) : null;
    let refHtml = "";
    if (ref) {
      const rows = ref.rows
        .map((row) => "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>")
        .join("");
      refHtml =
        '<div class="reference-box"><strong>参考: ' + ref.title + "</strong>" +
        "<table><thead><tr>" + ref.columns.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>";
    }

    const isLast = state.index === state.questions.length - 1;
    document.getElementById("feedback-area").innerHTML =
      '<div class="feedback-box">' +
      '<div class="result-label">' + (isCorrect ? "正解!" : "不正解") + "</div>" +
      "<div>" + q.explanation + "</div>" +
      "</div>" +
      refHtml +
      '<button class="next-btn" onclick="DrumQuiz.nextQuestion()">' + (isLast ? "結果を見る" : "次の問題へ") + "</button>";
  }

  function nextQuestion() {
    const state = currentQuizState;
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    const state = currentQuizState;
    const subset = findSubset(state.subsetId);
    const score = computeScore(state.correctCount, state.questions.length);
    const isPerfect = state.correctCount === state.questions.length;

    const existing = getSubsetProgress(state.subsetId);
    const perfectCount = existing.perfectCount + (isPerfect ? 1 : 0);
    const tier = tierFromPerfectCount(perfectCount);
    const bestScoreRaw = Math.max(existing.bestScoreRaw, score.raw);
    const bestScoreDisplay = Math.max(existing.bestScoreDisplay, score.display);

    progress[state.subsetId] = { bestScoreRaw, bestScoreDisplay, perfectCount, tier };
    saveProgress(progress);

    // 結果はインタースティシャルで待たせず即表示し、広告は点数の下にインラインで同時表示する
    renderResult(state, score, isPerfect, perfectCount, tier);
  }

  function renderResult(state, score, isPerfect, perfectCount, tier) {
    const subsets = subsetsInOrder();
    const curIdx = subsets.findIndex((s) => s.id === state.subsetId);
    const hasNext = curIdx >= 0 && curIdx < subsets.length - 1 && subsets[curIdx + 1].categoryId === subsets[curIdx].categoryId;

    render(
      '<div class="screen"><div class="result-card">' +
      '<div class="result-score">' + score.display + "点</div>" +
      '<div class="result-count">' + state.correctCount + " / " + state.questions.length + " 問正解</div>" +
      (isPerfect
        ? '<div class="result-badge">🎉 満点達成!(累計 ' + perfectCount + "回) " + (tier ? "バッジ: " + tier : "") + "</div>"
        : '<div class="result-badge">満点まであと少し。もう一回挑戦してみましょう。</div>') +
      '<div class="result-ad-placeholder">広告(プレースホルダー) — 結果画面インライン広告</div>' +
      '<div class="result-buttons">' +
      '<button class="btn-top" onclick="DrumQuiz.goTop()">トップへ戻る</button>' +
      '<button class="btn-retry" onclick="DrumQuiz.retrySubset(\'' + state.subsetId + '\')">もう一回</button>' +
      '<button class="btn-next" ' + (hasNext ? "" : "disabled") + ' onclick="DrumQuiz.nextSubset(\'' + state.subsetId + '\')">次へ</button>' +
      "</div></div></div>" +
      bannerAdHtml()
    );
  }

  function retrySubset(subsetId) {
    startSubset(subsetId);
  }

  function nextSubset(currentSubsetId) {
    const subsets = subsetsInOrder();
    const curIdx = subsets.findIndex((s) => s.id === currentSubsetId);
    const next = subsets[curIdx + 1];
    if (next && next.categoryId === subsets[curIdx].categoryId) {
      startSubset(next.id);
    }
  }

  function goTop() {
    renderTop();
  }

  function openCategory(categoryId) {
    const cat = window.CATEGORIES.find((c) => c.id === categoryId);
    if (!categoryIsAvailable(cat)) return;
    renderCategory(categoryId);
  }

  window.DrumQuiz = {
    openCategory,
    startSubset,
    answer,
    nextQuestion,
    retrySubset,
    nextSubset,
    goTop
  };

  renderTop();
})();
