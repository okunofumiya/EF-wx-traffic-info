/* 通勤影響ダッシュボード v0.4.0-dev（気象：スナップショット対応／鉄道・BAND：準備中） */
(() => {
  const LV_ORDER = { emergency: 4, danger: 3, warning: 2, advisory: 1 };
  const LV_CLASS = ["none", "advisory", "warning", "danger", "emergency"];
  const $ = (s) => document.querySelector(s);

  let model = null; // adaptSnapshot の結果
  let view = localStorage.getItem("view") || "all";
  let activeOnly = localStorage.getItem("activeOnly") === "1";
  let tlArea = null; // 解除見込みで選択中の地域
  const pins = new Set(JSON.parse(localStorage.getItem("pins") || "[]"));
  const linePins = new Set(JSON.parse(localStorage.getItem("linePins") || "[]"));
  const expanded = new Set();
  const mine = () => view === "mine";
  const allAreas = () => model.groups.flatMap((g) => g.areas);
  const hasInfo = (a) => (model.warnings[a] || []).length > 0;
  const visibleAreas = () => allAreas().filter((a) => !mine() || pins.has(a));
  const visibleLines = () => TRAIN_LINES.filter((l) => !mine() || linePins.has(l.id));

  const maxLevel = (list) =>
    (list || []).reduce((m, w) => (LV_ORDER[w.level] > (LV_ORDER[m] || 0) ? w.level : m), null);
  // 現在の警報と、これからの見通しを合わせた危険度（0〜4）
  const severity = (a) =>
    Math.max(LV_ORDER[maxLevel(model.warnings[a])] || 0, ...(model.outlook[a] || []).map((h) => h.peakLevel - 1), 0);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render() {
    renderMeta();
    renderHero();
    renderAreas();
    renderTrains();
    renderTimeline();
    renderEarly();
    renderBand();
  }

  function renderMeta() {
    const ageMin = (Date.now() - Date.parse(model.generatedAt)) / 60000;
    const stale = !IS_SAMPLE && ageMin > STALE_MINUTES;
    $("#updated-at").textContent = `最終更新 ${model.updated}` + (stale ? "（古い可能性があります）" : "");
    $("#updated-at").classList.toggle("stale", stale);
    const badge = $("#src-badge");
    badge.textContent = IS_SAMPLE ? "SAMPLE" : "LIVE";
    badge.classList.toggle("live", !IS_SAMPLE);
  }

  function renderHero() {
    let warn = 0, adv = 0, top = null;
    visibleAreas().forEach((a) => {
      const lv = maxLevel(model.warnings[a]);
      if (!lv) return;
      if (LV_ORDER[lv] >= 2) warn++; else adv++;
      if (!top || LV_ORDER[lv] > LV_ORDER[top]) top = lv;
    });
    const trainNote = "鉄道の運行情報は、各社の公式ページでご確認ください。";
    let level = "ok", icon = "✅", title = "気象の影響なし", text = `現在、対象地域に警報・注意報は出ていません。${trainNote}`;
    if (warn > 0) {
      level = "alert"; icon = "🌀";
      title = top === "danger" || top === "emergency" ? "厳重警戒" : "通勤に影響あり";
      text = `${warn}地域に警報が出ています。出勤の可否は早めに所属長へご連絡ください。${trainNote}`;
    } else if (adv > 0) {
      level = "caution"; icon = "⚠️"; title = "注意";
      text = `${adv}地域に注意報が出ています。時間に余裕をもって出発してください。${trainNote}`;
    }
    const hero = $("#hero");
    hero.dataset.level = level;
    $("#hero-icon").textContent = icon;
    $("#hero-title").textContent = title;
    $("#hero-text").textContent = text;
    countUp($("#stat-warn"), warn);
    countUp($("#stat-adv"), adv);
    $("#stat-train").textContent = "−";
    document.documentElement.style.setProperty("--orb3", level === "alert" ? "#f43f5e" : level === "caution" ? "#f59e0b" : "#10b981");
  }

  function countUp(el, to) {
    const from = +el.textContent || 0;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 500);
      el.textContent = Math.round(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderAreas() {
    const root = $("#area-groups");
    root.innerHTML = "";
    const scopeCount = visibleAreas().length;
    const infoCount = visibleAreas().filter(hasInfo).length;
    $("#area-count").textContent = (mine() ? `★ ${scopeCount}地域` : `全${scopeCount}地域`) + (activeOnly ? ` 中 ${infoCount}件` : "");
    let delay = 0;
    model.groups.forEach((g) => {
      const areas = g.areas.filter((a) => (!mine() || pins.has(a)) && (!activeOnly || hasInfo(a)));
      if (!areas.length) return;
      const title = document.createElement("p");
      title.className = "group-title";
      title.textContent = g.name;
      const grid = document.createElement("div");
      grid.className = "area-grid";

      areas.forEach((a) => {
        const list = (model.warnings[a] || []).slice().sort((x, y) => LV_ORDER[y.level] - LV_ORDER[x.level]);
        const lv = maxLevel(list);
        const el = document.createElement("div");
        el.className = "area" + (expanded.has(a) ? " expanded" : "");
        el.id = `area-${model.codes[a]}`;
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        if (lv) el.dataset.lvl = lv;
        el.style.animationDelay = `${(delay++) * 25}ms`;
        el.innerHTML = `
          <div class="area-top">
            <span class="area-name">${esc(a)}</span>
            <span class="area-actions">
              <a class="yahoo-link" href="${yahooUrl(model.codes[a])}" target="_blank" rel="noopener" aria-label="${esc(a)}のYahoo!天気を開く">天気<span aria-hidden="true">↗</span></a>
              <button class="pin ${pins.has(a) ? "on" : ""}" aria-label="${esc(a)}をマイ地域に登録" data-pin="${esc(a)}">★</button>
            </span>
          </div>
          <div class="tags">
            ${list.length ? list.map((w) => `<span class="tag tag-${w.level}">${esc(w.type)}</span>`).join("") : '<span class="tag-none">発表なし</span>'}
          </div>
          <div class="area-detail">
            ${list.length ? list.map((w) => `
              <div class="detail-item">
                <span class="tag tag-${w.level}">${esc(w.type)}</span>
                <dl>
                  <div class="detail-row"><dt>最終発表</dt><dd>${esc(w.issued)}</dd></div>
                  <div class="detail-row"><dt>見込み期間</dt><dd>${esc(w.peak)}</dd></div>
                  <div class="detail-row"><dt>解除見込み</dt><dd>${esc(w.outlook)}</dd></div>
                </dl>
              </div>`).join("") : '<p class="tag-none">現在、発表中の警報・注意報はありません。</p>'}
          </div>`;
        el.addEventListener("click", (e) => {
          if (e.target.closest("a")) return; // Yahoo!天気へのリンクは開閉しない
          const pinBtn = e.target.closest("[data-pin]");
          if (pinBtn) {
            e.stopPropagation();
            pins.has(a) ? pins.delete(a) : pins.add(a);
            localStorage.setItem("pins", JSON.stringify([...pins]));
            toast(pins.has(a) ? `★ ${a} をマイ設定に追加しました` : `${a} をマイ設定から外しました`);
            renderAreas();
            renderHero();
            renderTimeline();
            return;
          }
          expanded.has(a) ? expanded.delete(a) : expanded.add(a);
          el.classList.toggle("expanded");
        });
        grid.appendChild(el);
      });
      root.append(title, grid);
    });
    if (!root.children.length) {
      root.innerHTML = activeOnly && scopeCount
        ? '<p class="empty card all-clear">✅ 現在、警報・注意報が出ている地域はありません</p>'
        : '<p class="empty card">全体表示で ★ をタップして、マイ地域を登録してください</p>';
    }
  }

  // 鉄道は準備中。路線の一覧と、公式の運行情報ページへのリンクだけを出す
  function renderTrains() {
    const scope = visibleLines();
    $("#train-count").textContent = mine() ? `★ ${scope.length}路線` : `全${scope.length}路線`;
    if (!scope.length) {
      $("#train-list").innerHTML = '<p class="empty card">全体表示で ★ をタップして、マイ路線を登録してください</p>';
      return;
    }
    $("#train-list").innerHTML =
      '<p class="note train-note">運行情報の自動取得は準備中です。各社の公式ページでご確認ください。</p>' +
      scope.map((l, i) => `
        <article class="card train" id="train-${l.id}" style="--line:${l.color};animation-delay:${i * 60}ms">
          <span class="train-color"></span>
          <div class="train-body">
            <div class="train-head">
              <div>
                <div class="train-name">${l.name}</div>
                <div class="train-section">${l.section}</div>
              </div>
              <div class="train-right">
                <span class="status status-na">準備中</span>
                <button class="pin ${linePins.has(l.id) ? "on" : ""}" aria-label="${l.name}をマイ路線に登録" data-line-pin="${l.id}">★</button>
              </div>
            </div>
            <a class="train-link" href="${l.url}" target="_blank" rel="noopener">公式の運行情報を見る ↗</a>
          </div>
        </article>`).join("");
  }

  // 解除見込みに出す地域の候補（現在の警報＋これからの見通しの危険度が高い順）
  //  マイ表示：★の地域　／　全体表示：警報や見通しのある地域（危険度順）
  function timelineCandidates() {
    let list;
    if (mine()) {
      list = visibleAreas().slice().sort((a, b) => severity(b) - severity(a));
    } else {
      list = visibleAreas().filter((a) => severity(a) > 0).sort((a, b) => severity(b) - severity(a));
    }
    if (activeOnly) list = list.filter(hasInfo);
    return list;
  }

  function slotHeads(slots) {
    let prevDay = "";
    return slots.map((s) => {
      const day = String(+s.start.slice(8, 10));
      const head = [day !== prevDay ? `${day}日` : "", String(+s.start.slice(11, 13))];
      prevDay = day;
      return head;
    });
  }

  function renderTimeline() {
    const tabs = $("#tl-tabs");
    const wrap = $("#timeline");
    const cands = timelineCandidates();
    if (!cands.includes(tlArea)) tlArea = cands[0] || null;

    tabs.innerHTML = cands.map((a) => {
      const tag = pins.has(a) ? '<span class="star">★</span>' : "";
      return `<button class="tl-tab ${a === tlArea ? "active" : ""}" data-tl="${esc(a)}" role="tab"><i class="dot dot-${LV_CLASS[severity(a)]}"></i>${esc(a)}${tag}</button>`;
    }).join("");
    $("#tl-note").textContent =
      "気象庁の時系列（明日までの見通し）で、危険度が注意報級以上になる時間帯を表示します。解除の見込みは、危険度が基準を下回る時刻から推定したもので、気象庁が解除を予告するものではありません。";

    if (!tlArea) {
      wrap.innerHTML = `<p class="empty">${mine() && !activeOnly ? "★で地域を登録すると、ここに表示されます" : "✅ 現在、警報・注意報の見込みはありません"}</p>`;
      return;
    }
    const hazards = model.outlook[tlArea] || [];
    const yahoo = `<a class="yahoo-link wide" href="${yahooUrl(model.codes[tlArea])}" target="_blank" rel="noopener">${esc(tlArea)}のYahoo!天気を開く ↗</a>`;
    if (!hazards.length) {
      wrap.innerHTML = `<p class="empty">✅ ${esc(tlArea)}は、明日までの見通しで注意報級になる予報はありません</p>${yahoo}`;
      return;
    }
    const heads = slotHeads(hazards[0].slots);
    const nowIdx = hazards[0].slots.findIndex((s) => s.start <= model.generatedAt && model.generatedAt < s.end);
    let html = `<div class="timeline" style="grid-template-columns:44px repeat(${heads.length},minmax(0,1fr))">`;
    html += `<span></span>` + heads.map(([d]) => `<span class="tl-head day">${d}</span>`).join("");
    html += `<span></span>` + heads.map(([, h]) => `<span class="tl-head">${h}</span>`).join("");
    hazards.forEach((h) => {
      html += `<span class="tl-label">${esc(h.hazard)}</span>`;
      html += h.slots.map((s, i) => `<span class="tl-cell ${s.level >= 4 ? "danger" : s.level === 3 ? "warning" : s.level === 2 ? "advisory" : ""} ${i === nowIdx ? "now" : ""}"></span>`).join("");
    });
    html += `</div><div class="tl-summary">${hazards.map((h) => {
      const note = h.additions.length ? `（${h.additions.join("・")}）` : "";
      const end = h.clearsAt ? `${fmtHour(h.clearsAt)}ごろに下回る見込み` : "見通し期間内は継続の見込み";
      return `<div class="tl-sum-item"><b>${esc(h.hazard)}${esc(note)}</b><span>${fmtHour(h.start)}から${esc(h.peakLevelName)}級${h.peakLevel > 2 ? "以上" : ""} → ${end}</span></div>`;
    }).join("")}</div>${yahoo}`;
    wrap.innerHTML = html;
  }

  function renderEarly() {
    const { days, rows, text } = model.early;
    let html = `<span></span>` + days.map((d) => `<span class="eg-head ${d.cls}"><b>${d.d}</b>${d.w}</span>`).join("");
    Object.entries(rows).forEach(([k, vals]) => {
      html += `<span class="eg-label">${esc(k)}</span>`;
      html += vals.map((v) => `<span class="eg-cell ${v === "高" ? "high" : v === "中" ? "mid" : ""}">${v || "−"}</span>`).join("");
    });
    $("#early-grid").innerHTML = html;
    $("#early-text").textContent = text || "";
  }

  function renderBand() {
    $("#band-list").innerHTML = '<p class="empty card">BAND への自動投稿は準備中です</p>';
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // スナップショットの読み込み
  async function load({ manual = false } = {}) {
    try {
      const res = await fetch(SNAPSHOT_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 503 ? "データの準備ができていません" : `HTTP ${res.status}`);
      model = adaptSnapshot(await res.json());
      $("#load-error").hidden = true;
      render();
      if (manual) toast("最新の情報に更新しました");
    } catch (e) {
      $("#load-error").hidden = false;
      $("#load-error-text").textContent = `データを読み込めませんでした（${e.message}）。電波の状態を確認して、もう一度更新してください。`;
      if (manual) toast("更新に失敗しました");
    }
  }

  // 表示範囲（全体／マイ）
  function applyView() {
    document.querySelectorAll(".view-btn").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
    document.body.classList.toggle("mine", mine());
  }
  document.querySelectorAll(".view-btn").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      localStorage.setItem("view", view);
      applyView();
      if (model) render();
      toast(mine() ? "★ マイ設定の地域・路線だけ表示しています" : "すべての地域・路線を表示しています");
    })
  );

  // 「情報ありのみ」切替
  function applyActiveOnly() {
    $("#active-only").setAttribute("aria-pressed", activeOnly);
  }
  $("#active-only").addEventListener("click", () => {
    activeOnly = !activeOnly;
    localStorage.setItem("activeOnly", activeOnly ? "1" : "0");
    applyActiveOnly();
    if (model) render();
    toast(activeOnly ? "⚠ 情報が出ている項目のみ表示しています" : "すべての項目を表示しています");
  });

  // 解除見込みタブの選択
  $("#tl-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tl]");
    if (!tab) return;
    tlArea = tab.dataset.tl;
    renderTimeline();
  });

  // 路線の★
  $("#train-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-line-pin]");
    if (!btn) return;
    const id = btn.dataset.linePin;
    const name = TRAIN_LINES.find((l) => l.id === id).name;
    linePins.has(id) ? linePins.delete(id) : linePins.add(id);
    localStorage.setItem("linePins", JSON.stringify([...linePins]));
    toast(linePins.has(id) ? `★ ${name} をマイ設定に追加しました` : `${name} をマイ設定から外しました`);
    renderTrains();
  });

  // 説明シート
  $("#view-edit").addEventListener("click", () => ($("#help-sheet").hidden = false));
  $("#help-close").addEventListener("click", () => ($("#help-sheet").hidden = true));
  $("#help-sheet").addEventListener("click", (e) => { if (e.target.id === "help-sheet") e.currentTarget.hidden = true; });

  applyView();
  applyActiveOnly();

  // 更新ボタン
  $("#refresh-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.remove("spinning");
    void btn.offsetWidth;
    btn.classList.add("spinning");
    load({ manual: true });
  });
  $("#load-retry").addEventListener("click", () => load({ manual: true }));

  // 下部ナビのハイライト
  const navItems = document.querySelectorAll(".nav-item");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navItems.forEach((n) => n.classList.toggle("active", n.getAttribute("href") === `#${en.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main .section").forEach((sec) => io.observe(sec));

  load();
  if (!IS_SAMPLE) setInterval(load, 5 * 60 * 1000); // 5分ごとに自動更新
})();
