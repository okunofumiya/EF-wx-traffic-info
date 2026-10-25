/* 通勤影響ダッシュボード v0.3.0（デモ） */
(() => {
  const LV_ORDER = { emergency: 4, danger: 3, warning: 2, advisory: 1 };
  const STATUS_TEXT = { ok: "平常運転", delay: "遅延", stop: "運転見合わせ" };
  const $ = (s) => document.querySelector(s);

  let current = "typhoon";
  // マイ設定は端末（ブラウザ）ごとに localStorage へ保存
  let view = localStorage.getItem("view") || "all";
  let activeOnly = localStorage.getItem("activeOnly") === "1";
  let tlArea = null; // 解除見込みで選択中の地域
  const pins = new Set(JSON.parse(localStorage.getItem("pins") || "[]"));
  const linePins = new Set(JSON.parse(localStorage.getItem("linePins") || "[]"));
  const expanded = new Set();
  const mine = () => view === "mine";
  const hasInfo = (s, a) => (s.warnings[a] || []).length > 0;
  const visibleAreas = () => AREA_GROUPS.flatMap((g) => g.areas).filter((a) => !mine() || pins.has(a));
  const visibleLines = () => TRAIN_LINES.filter((l) => !mine() || linePins.has(l.id));

  const maxLevel = (list) =>
    (list || []).reduce((m, w) => (LV_ORDER[w.level] > (LV_ORDER[m] || 0) ? w.level : m), null);

  function render() {
    const s = SCENARIOS[current];
    $("#updated-at").textContent = `最終更新 ${s.updated}`;
    renderHero(s);
    renderAreas(s);
    renderTrains(s);
    renderTimeline(s);
    renderEarly(s);
    renderBand(s);
  }

  function renderHero(s) {
    let warn = 0, adv = 0, top = null;
    visibleAreas().forEach((a) => {
      const lv = maxLevel(s.warnings[a]);
      if (!lv) return;
      if (LV_ORDER[lv] >= 2) warn++; else adv++;
      if (!top || LV_ORDER[lv] > LV_ORDER[top]) top = lv;
    });
    const lineStates = visibleLines().map((l) => s.trains[l.id] || { status: "ok" });
    const trainsHit = lineStates.filter((t) => t.status !== "ok").length;
    const stopped = lineStates.some((t) => t.status === "stop");

    let level = "ok", icon = "✅", title = "通勤に影響なし", text = "現在、対象地域に警報は出ていません。鉄道も平常どおり運転しています。";
    if (warn > 0 || stopped) {
      level = "alert"; icon = "🌀";
      title = top === "danger" || top === "emergency" ? "厳重警戒" : "通勤に影響あり";
      text = [warn > 0 ? `${warn}地域に警報が出ています。` : "", stopped ? "運転を見合わせている路線があります。" : trainsHit ? "遅れが出ている路線があります。" : "", "出勤の可否は早めに所属長へご連絡ください。"].join("");
    } else if (adv > 0 || trainsHit > 0) {
      level = "caution"; icon = "⚠️"; title = "注意";
      text = "注意報や列車の遅れが出ています。時間に余裕をもって出発してください。";
    }
    if (current === "snow" && level !== "ok") { icon = "❄️"; text = "雪の影響で警報や運転見合わせが出ています。路面の凍結にも注意し、無理のない通勤を心がけてください。"; }

    const hero = $("#hero");
    hero.dataset.level = level;
    $("#hero-icon").textContent = icon;
    $("#hero-title").textContent = title;
    $("#hero-text").textContent = text;
    countUp($("#stat-warn"), warn);
    countUp($("#stat-adv"), adv);
    countUp($("#stat-train"), trainsHit);
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

  function renderAreas(s) {
    const root = $("#area-groups");
    root.innerHTML = "";
    const scopeCount = visibleAreas().length;
    const infoCount = visibleAreas().filter((a) => hasInfo(s, a)).length;
    $("#area-count").textContent = (mine() ? `★ ${scopeCount}地域` : `全${scopeCount}地域`) + (activeOnly ? ` 中 ${infoCount}件` : "");
    let delay = 0;
    AREA_GROUPS.forEach((g) => {
      const areas = g.areas.filter((a) => (!mine() || pins.has(a)) && (!activeOnly || hasInfo(s, a)));
      if (!areas.length) return;
      const title = document.createElement("p");
      title.className = "group-title";
      title.textContent = g.name;
      const grid = document.createElement("div");
      grid.className = "area-grid";

      areas.forEach((a) => {
        const list = (s.warnings[a] || []).slice().sort((x, y) => LV_ORDER[y.level] - LV_ORDER[x.level]);
        const lv = maxLevel(list);
        const el = document.createElement("div");
        el.className = "area" + (expanded.has(a) ? " expanded" : "");
        el.id = `area-${a}`;
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        if (lv) el.dataset.lvl = lv;
        el.style.animationDelay = `${(delay++) * 25}ms`;
        el.innerHTML = `
          <div class="area-top">
            <span class="area-name">${a}</span>
            <button class="pin ${pins.has(a) ? "on" : ""}" aria-label="${a}をマイ地域に登録" data-pin="${a}">★</button>
          </div>
          <div class="tags">
            ${list.length ? list.map((w) => `<span class="tag tag-${w.level}">${w.type}</span>`).join("") : '<span class="tag-none">発表なし</span>'}
          </div>
          <div class="area-detail">
            ${list.length ? list.map((w) => `
              <div class="detail-item">
                <span class="tag tag-${w.level}">${w.type}</span>
                <dl>
                  <div class="detail-row"><dt>発表</dt><dd>${w.issued}</dd></div>
                  <div class="detail-row"><dt>ピーク</dt><dd>${w.peak}</dd></div>
                  <div class="detail-row"><dt>解除見込み</dt><dd>${w.outlook}</dd></div>
                </dl>
              </div>`).join("") : '<p class="tag-none">現在、発表中の警報・注意報はありません。</p>'}
          </div>`;
        el.addEventListener("click", (e) => {
          const pinBtn = e.target.closest("[data-pin]");
          if (pinBtn) {
            e.stopPropagation();
            pins.has(a) ? pins.delete(a) : pins.add(a);
            localStorage.setItem("pins", JSON.stringify([...pins]));
            toast(pins.has(a) ? `★ ${a} をマイ設定に追加しました` : `${a} をマイ設定から外しました`);
            renderAreas(SCENARIOS[current]);
            renderHero(SCENARIOS[current]);
            renderTimeline(SCENARIOS[current]);
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

  function renderTrains(s) {
    const scope = visibleLines();
    const lines = scope.filter((l) => !activeOnly || (s.trains[l.id] || {}).status && s.trains[l.id].status !== "ok");
    $("#train-count").textContent = (mine() ? `★ ${scope.length}路線` : `全${scope.length}路線`) + (activeOnly ? ` 中 ${lines.length}件` : "");
    if (!lines.length) {
      $("#train-list").innerHTML = activeOnly && scope.length
        ? '<p class="empty card all-clear">✅ すべて平常どおり運転しています</p>'
        : '<p class="empty card">全体表示で ★ をタップして、マイ路線を登録してください</p>';
      return;
    }
    $("#train-list").innerHTML = lines.map((l, i) => {
      const t = s.trains[l.id] || { status: "ok" };
      const cls = { ok: "status-ok", delay: "status-delay", stop: "status-stop" }[t.status];
      return `
        <article class="card train" id="train-${l.id}" style="--line:${l.color};animation-delay:${i * 60}ms">
          <span class="train-color"></span>
          <div class="train-body">
            <div class="train-head">
              <div>
                <div class="train-name">${l.name}</div>
                <div class="train-section">${l.section}</div>
              </div>
              <div class="train-right">
                <span class="status ${cls}">${t.label || STATUS_TEXT[t.status]}</span>
                <button class="pin ${linePins.has(l.id) ? "on" : ""}" aria-label="${l.name}をマイ路線に登録" data-line-pin="${l.id}">★</button>
              </div>
            </div>
            ${t.msg ? `<p class="train-msg">${t.msg}</p>` : ""}
            ${t.time ? `<p class="train-time">${t.time}</p>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  // 解除見込みに出す地域の候補
  //  マイ表示：★の地域（情報の出ている地域を先に）
  //  全体表示：警報・注意報の出ている地域（危険度の高い順）
  function timelineCandidates(s) {
    const sev = (a) => LV_ORDER[maxLevel(s.warnings[a])] || 0;
    let list;
    if (mine()) {
      list = visibleAreas().slice().sort((a, b) => sev(b) - sev(a));
    } else {
      list = visibleAreas().filter((a) => hasInfo(s, a)).sort((a, b) => sev(b) - sev(a));
    }
    if (activeOnly) list = list.filter((a) => hasInfo(s, a));
    return list;
  }

  // デモ用：警報データから時系列を仮に作る（本番では気象庁の時系列を使用）
  function buildRows(list, cols) {
    return list.map((w) => {
      const seed = [...w.type].reduce((n, c) => n + c.charCodeAt(0), 0) % 3;
      const pattern =
        w.level === "danger" || w.level === "emergency"
          ? [...Array(3 + seed).fill("danger"), ...Array(3).fill("warning"), "advisory", "advisory"]
          : w.level === "warning"
          ? [...Array(4 + seed).fill("warning"), "advisory", "advisory"]
          : Array(3 + seed).fill("advisory");
      const cells = Array.from({ length: cols }, (_, i) => pattern[i] || "");
      const label = w.type.replace(/（.*?）/g, "").replace(/(特別警報|危険警報|警報|注意報)$/, "");
      return { label, cells, summary: [w.type, w.outlook] };
    });
  }

  function renderTimeline(s) {
    const heads = s.timeline.heads;
    const tabs = $("#tl-tabs");
    const wrap = $("#timeline");
    const cands = timelineCandidates(s);
    if (!cands.includes(tlArea)) tlArea = cands[0] || null;

    tabs.innerHTML = cands.map((a) => {
      const lv = maxLevel(s.warnings[a]) || "none";
      const tag = pins.has(a) ? '<span class="star">★</span>' : "";
      return `<button class="tl-tab ${a === tlArea ? "active" : ""}" data-tl="${a}" role="tab"><i class="dot dot-${lv}"></i>${a}${tag}</button>`;
    }).join("");
    $("#tl-note").textContent = mine()
      ? "★を付けた地域を表示しています。※気象庁の「警報級の可能性」「時系列」をもとに表示する想定です。"
      : "警報・注意報が出ている地域を表示しています。※気象庁の「警報級の可能性」「時系列」をもとに表示する想定です。";

    if (!tlArea) {
      wrap.innerHTML = `<p class="empty">${mine() && !activeOnly ? "★で地域を登録すると、ここに表示されます" : "✅ 現在、警報・注意報の見込みはありません"}</p>`;
      return;
    }
    const list = (s.warnings[tlArea] || []).slice().sort((x, y) => LV_ORDER[y.level] - LV_ORDER[x.level]);
    if (!list.length) {
      wrap.innerHTML = `<p class="empty">✅ ${tlArea}には現在、警報・注意報の見込みはありません</p>`;
      return;
    }
    const rows = buildRows(list, heads.length);
    let html = `<div class="timeline" style="grid-template-columns:58px repeat(${heads.length},1fr)">`;
    html += `<span></span>` + heads.map(([d]) => `<span class="tl-head day">${d}</span>`).join("");
    html += `<span></span>` + heads.map(([, h]) => `<span class="tl-head">${h}時</span>`).join("");
    rows.forEach((r) => {
      html += `<span class="tl-label">${r.label}</span>`;
      html += r.cells.map((c, i) => `<span class="tl-cell ${c} ${i === 0 ? "now" : ""}"></span>`).join("");
    });
    html += `</div><div class="tl-summary">${rows.map(({ summary: [k, v] }) => `<div class="tl-sum-item"><b>${k}</b><span>${v}</span></div>`).join("")}</div>`;
    wrap.innerHTML = html;
  }

  function renderEarly(s) {
    let html = `<span></span>` + EARLY_DAYS.map((d) => `<span class="eg-head ${d.cls}"><b>${d.d}</b>${d.w}</span>`).join("");
    Object.entries(s.early).forEach(([k, vals]) => {
      html += `<span class="eg-label">${k}</span>`;
      html += vals.map((v) => `<span class="eg-cell ${v === "高" ? "high" : v === "中" ? "mid" : ""}">${v || "−"}</span>`).join("");
    });
    $("#early-grid").innerHTML = html;
  }

  function renderBand(s) {
    const root = $("#band-list");
    if (!s.band.length) {
      root.innerHTML = '<p class="empty card">本日の投稿はありません</p>';
      return;
    }
    root.innerHTML = s.band.map((p, i) => `
      <div class="band-post card" style="animation-delay:${i * 70}ms">
        <span class="band-avatar">BOT</span>
        <div class="band-bubble">
          <div class="band-meta"><span><span class="band-kind ${p.kind === "clear" ? "k-clear" : "k-issue"}">${p.kind === "clear" ? "解除・再開" : "発表"}</span>通勤情報bot</span><span>${p.time}</span></div>
          <p class="band-text">${p.text}</p>
        </div>
      </div>`).join("");
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // シナリオ切替
  document.querySelectorAll(".scenario-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".scenario-btn").forEach((x) => x.classList.toggle("active", x === b));
      current = b.dataset.scenario;
      expanded.clear();
      render();
    })
  );

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
      render();
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
    render();
    toast(activeOnly ? "⚠ 情報が出ている項目のみ表示しています" : "すべての項目を表示しています");
  });

  // 解除見込みタブの選択
  $("#tl-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tl]");
    if (!tab) return;
    tlArea = tab.dataset.tl;
    renderTimeline(SCENARIOS[current]);
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
    renderTrains(SCENARIOS[current]);
    renderHero(SCENARIOS[current]);
  });

  // 説明シート
  $("#view-edit").addEventListener("click", () => ($("#help-sheet").hidden = false));
  $("#help-close").addEventListener("click", () => ($("#help-sheet").hidden = true));
  $("#help-sheet").addEventListener("click", (e) => { if (e.target.id === "help-sheet") e.currentTarget.hidden = true; });

  applyView();
  applyActiveOnly();

  // 更新ボタン（デモ）
  $("#refresh-btn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.remove("spinning");
    void btn.offsetWidth;
    btn.classList.add("spinning");
    toast("最新の情報に更新しました（デモ）");
  });

  // 下部ナビのハイライト
  const navItems = document.querySelectorAll(".nav-item");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navItems.forEach((n) => n.classList.toggle("active", n.getAttribute("href") === `#${en.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("main .section").forEach((sec) => io.observe(sec));

  render();
})();
