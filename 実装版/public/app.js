/* 気象・交通状況ダッシュボード v0.12.0-dev（4ページタブ切替対応／気象：スナップショット対応／鉄道4路線運行情報連携／道路交通情報・マイルート複数登録対応） */
(() => {
  const LV_ORDER = { emergency: 4, danger: 3, warning: 2, advisory: 1 };
  const LV_CLASS = ["none", "advisory", "warning", "danger", "emergency"];
  const $ = (s) => document.querySelector(s);

  let activePage = "summary"; // "summary" | "weather" | "trains" | "roads"
  let model = null; // adaptSnapshot の結果
  let shintetsuStatus = null; // parseShintetsuStatus の結果
  let railData = null; // 4路線統合運行情報 (/api/rail)
  let trafficData = null; // 道路交通情報
  let trafficDirection = "both"; // "both" (両方向) | "south_east" (南行・東行) | "north_west" (北行・西行)
  let trafficViewMode = "map"; // "map" | "list"
  let commuteRoutes = (() => {
    try {
      const list = JSON.parse(localStorage.getItem("commuteRoutes") || "null");
      if (Array.isArray(list)) return list;
      // 旧単一データ (commuteRoute) からの自動引き継ぎ
      const legacy = JSON.parse(localStorage.getItem("commuteRoute") || "null");
      if (legacy && legacy.home && legacy.work) {
        const migrated = [{ id: "r_" + Date.now(), label: "通勤ルート", home: legacy.home, work: legacy.work, via: legacy.via || "" }];
        localStorage.setItem("commuteRoutes", JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch (_e) {
      return [];
    }
  })();
  let commuteFormOpen = false; // 登録・編集ボタンを押した時のみ true
  let editingRouteId = null; // 編集中のルートID（新規追加時は null）

  const saveCommuteRoutes = () => {
    localStorage.setItem("commuteRoutes", JSON.stringify(commuteRoutes));
  };

  const buildCommuteMapsUrl = (origin, destination, via) => {
    const params = new URLSearchParams({
      api: "1",
      origin: String(origin || "").trim(),
      destination: String(destination || "").trim(),
      travelmode: "driving",
    });
    if (via && String(via).trim()) {
      params.set("waypoints", String(via).trim());
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };
  let view = localStorage.getItem("view") || "all";
  let activeOnly = localStorage.getItem("activeOnly") === "1";
  let tlArea = null; // 解除見込みで選択中の地域
  const pins = new Set(JSON.parse(localStorage.getItem("pins") || "[]"));
  const linePins = new Set(JSON.parse(localStorage.getItem("linePins") || "[]"));
  // 以前の神鉄路線ID（shintetsu-ao / shintetsu-arima）をお気に入り登録していた場合の自動引き継ぎ
  if (linePins.has("shintetsu-ao") || linePins.has("shintetsu-arima")) {
    linePins.add("shintetsu");
    linePins.delete("shintetsu-ao");
    linePins.delete("shintetsu-arima");
    localStorage.setItem("linePins", JSON.stringify([...linePins]));
  }
  const expanded = new Set();
  const mine = () => view === "mine";
  const allAreas = () => model.groups.flatMap((g) => g.areas);
  const hasInfo = (a) => (model.warnings[a] || []).length > 0;
  const visibleAreas = () => allAreas().filter((a) => !mine() || pins.has(a));

  const getLineStatus = (lineId) => {
    const normalizedId = lineId.startsWith("shintetsu-") ? "shintetsu" : lineId;
    if (railData && railData.lines && railData.lines[normalizedId]) {
      return parseRailLineStatus(railData.lines[normalizedId], normalizedId);
    }
    if (normalizedId === "shintetsu" && shintetsuStatus) {
      return shintetsuStatus;
    }
    return parseRailLineStatus(null, normalizedId);
  };

  const visibleLines = () =>
    TRAIN_LINES.filter((l) => {
      if (mine() && !linePins.has(l.id)) return false;
      if (activeOnly) {
        return getLineStatus(l.id).hasAlert;
      }
      return true;
    });

  const maxLevel = (list) =>
    (list || []).reduce((m, w) => (LV_ORDER[w.level] > (LV_ORDER[m] || 0) ? w.level : m), null);
  // 現在の警報と、これからの見通しを合わせた危険度（0〜4）
  const severity = (a) =>
    Math.max(LV_ORDER[maxLevel(model.warnings[a])] || 0, ...(model.outlook[a] || []).map((h) => h.peakLevel - 1), 0);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTrafficCheckedAt = (iso) => {
    if (!iso) return "取得時刻不明";
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return "取得時刻不明";
    const jst = new Date(ms + 9 * 3600 * 1000);
    const m = jst.getUTCMonth() + 1;
    const d = jst.getUTCDate();
    const hh = String(jst.getUTCHours()).padStart(2, "0");
    const mm = String(jst.getUTCMinutes()).padStart(2, "0");
    return `${m}月${d}日 ${hh}:${mm} 現在の情報`;
  };

  function render() {
    renderMeta();
    renderHero();
    renderAreas();
    renderTrains();
    renderRoads();
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

    // 鉄道の運行影響路線数をカウント（表示対象のスコープ内）
    const trainScope = TRAIN_LINES.filter((l) => !mine() || linePins.has(l.id));
    const trainAlertLines = trainScope.filter((l) => getLineStatus(l.id).hasAlert);
    const trainAlertCount = trainAlertLines.length;
    const trainAlertNames = trainAlertLines.map((l) => l.name).join("・");

    // 道路の遅延区間数をカウント（遅延3分以上）
    const roadSections = trafficData?.sections || [];
    const roadDelayed = roadSections.filter((s) => s.delayMin >= 3);
    const roadDelayCount = roadDelayed.length;

    let trafficNote = "";
    if (trainAlertCount > 0 && roadDelayCount > 0) {
      trafficNote = `${trainAlertNames}で運行情報、道路で${roadDelayCount}区間に遅れが出ています。`;
    } else if (trainAlertCount > 0) {
      trafficNote = `${trainAlertNames}で運行情報が出ています。運行情報ページをご確認ください。`;
    } else if (roadDelayCount > 0) {
      const heavy = roadDelayed.filter((s) => s.status === "heavy");
      if (heavy.length > 0) {
        trafficNote = `幹線道路（${heavy[0].roadName}など）で渋滞・大幅な遅延（+${heavy[0].delayMin}分）が発生しています。`;
      } else {
        trafficNote = `幹線道路で一部混雑（${roadDelayCount}区間で遅れ）が発生しています。時間に余裕をもってお出かけください。`;
      }
    } else {
      trafficNote = "鉄道・主要幹線道路ともに順調です。";
    }

    let level = "ok", icon = "✅", title = "影響なし", text = `現在、対象地域に警報・注意報はなく、${trafficNote}`;
    if (warn > 0) {
      level = "alert"; icon = "🌀";
      title = top === "danger" || top === "emergency" ? "厳重警戒" : "通勤に影響あり";
      text = `${warn}地域に警報が出ています。出勤の可否は早めに所属長へご連絡ください。${trafficNote}`;
    } else if (adv > 0) {
      level = "caution"; icon = "⚠️"; title = "注意";
      text = `${adv}地域に注意報が出ています。時間に余裕をもって出発してください。${trafficNote}`;
    } else if (trainAlertCount > 0 || roadDelayCount >= 3) {
      level = "caution"; icon = "🚗"; title = "交通影響あり";
      text = `交通機関・幹線道路で混雑や遅延が発生しています。${trafficNote}`;
    } else if (roadDelayCount > 0) {
      level = "ok"; icon = "🚗"; title = "一部混雑あり";
      text = `気象警報はありません。${trafficNote}`;
    }

    const hero = $("#hero"); if (hero) { hero.dataset.level = level; $("#hero-icon").textContent = icon; $("#hero-title").textContent = title; $("#hero-text").textContent = text; countUp($("#stat-warn"), warn); countUp($("#stat-adv"), adv); countUp($("#stat-train"), trainAlertCount); countUp($("#stat-road"), roadDelayCount); }








    document.documentElement.style.setProperty("--orb3", level === "alert" ? "#f43f5e" : level === "caution" ? "#f59e0b" : "#10b981");

    renderSummaryCards(warn, adv, trainAlertCount, roadDelayCount, roadDelayed);
  }

  // 概要ページの各サマリーカードのバッジ・テキスト更新
  function renderSummaryCards(warn, adv, trainAlertCount, roadDelayCount, roadDelayed) {
    const areas = visibleAreas();
    const warnAreas = [];
    const advAreas = [];
    areas.forEach((a) => {
      const list = (model.warnings[a] || []).slice().sort((x, y) => LV_ORDER[y.level] - LV_ORDER[x.level]);
      const lv = maxLevel(list);
      if (!lv) return;
      if (LV_ORDER[lv] >= 2) warnAreas.push({ area: a, level: lv, list });
      else advAreas.push({ area: a, level: lv, list });
    });

    // 1. 気象情報サマリーカード
    const wCard = $("#sc-card-weather");
    const wBadge = $("#sc-weather-badge");
    const wBody = $("#sc-weather-body");
    if (wCard && wBadge && wBody) {
      if (warnAreas.length > 0) {
        wCard.dataset.status = "alert";
        wBadge.className = "sc-badge status-alert";
        wBadge.textContent = `警報 ${warnAreas.length}地域`;
      } else if (advAreas.length > 0) {
        wCard.dataset.status = "caution";
        wBadge.className = "sc-badge status-caution";
        wBadge.textContent = `注意報 ${advAreas.length}地域`;
      } else {
        wCard.dataset.status = "ok";
        wBadge.className = "sc-badge status-ok";
        wBadge.textContent = "発表なし";
      }

      // 明日までの見通しと5日先までの警報級の可能性を集計
      const outlookWarn = areas.filter((a) => (model.outlook[a] || []).some((h) => h.peakLevel >= 3));
      const outlookAdv = areas.filter((a) => (model.outlook[a] || []).some((h) => h.peakLevel === 2));
      let outlookSummary = "注意報級以上の予報なし";
      if (outlookWarn.length > 0) {
        outlookSummary = `警報級の見込みあり（${outlookWarn.slice(0, 3).join("・")}${outlookWarn.length > 3 ? `ほか${outlookWarn.length - 3}地域` : ""}）`;
      } else if (outlookAdv.length > 0) {
        outlookSummary = `注意報級の見込みあり（${outlookAdv.slice(0, 3).join("・")}${outlookAdv.length > 3 ? `ほか${outlookAdv.length - 3}地域` : ""}）`;
      }

      const earlyHighMid = [];
      Object.entries(model.early?.rows || {}).forEach(([type, vals]) => {
        vals.forEach((v, idx) => {
          if (v === "高" || v === "中") {
            const d = model.early.days[idx];
            if (d) earlyHighMid.push(`${d.d}日(${d.w}) ${type}[${v}]`);
          }
        });
      });
      const earlySummary = earlyHighMid.length > 0
        ? earlyHighMid.slice(0, 3).join("、") + (earlyHighMid.length > 3 ? " ほか" : "")
        : "［高・中］の発表なし";

      let currentHtml = "";
      if (warnAreas.length > 0 || advAreas.length > 0) {
        const lines = [];
        if (warnAreas.length > 0) {
          const wText = warnAreas
            .slice(0, 4)
            .map((x) => `${esc(x.area)}（${x.list.map((w) => esc(w.type)).join("・")}）`)
            .join("、") + (warnAreas.length > 4 ? ` ほか${warnAreas.length - 4}地域` : "");
          lines.push(`<div class="sc-info-line"><span class="sc-info-label">🚨 警報</span><span><b>${wText}</b></span></div>`);
          const firstOutlook = warnAreas[0]?.list[0]?.outlook;
          if (firstOutlook) {
            lines.push(`<div class="sc-info-line"><span class="sc-info-label">⏳ 見込み</span><span>${esc(warnAreas[0].area)}：${esc(firstOutlook)}</span></div>`);
          }
        }
        if (advAreas.length > 0) {
          const advTypes = [...new Set(advAreas.flatMap((x) => x.list.map((w) => w.type)))];
          const aNames = advAreas.slice(0, 4).map((x) => esc(x.area)).join("・") + (advAreas.length > 4 ? `ほか${advAreas.length - 4}地域` : "");
          lines.push(`<div class="sc-info-line"><span class="sc-info-label">⚠️ 注意報</span><span>${aNames}（${advTypes.slice(0, 4).map(esc).join("・")}）</span></div>`);
        }
        currentHtml = `<div class="sc-info-box ${warnAreas.length ? "alert" : "caution"}">${lines.join("")}</div>`;
      } else {
        currentHtml = `<p class="sc-desc">✅ 現在、対象地域に発表中の気象警報・注意報はありません。</p>`;
      }

      wBody.innerHTML = `
        <div class="sc-stat-row">
          <span class="sc-stat-pill ${warnAreas.length ? "is-alert" : ""}">警報 <b>${warnAreas.length}</b> 地域</span>
          <span class="sc-stat-pill ${advAreas.length ? "is-caution" : ""}">注意報 <b>${advAreas.length}</b> 地域</span>
          <span class="sc-stat-scope">${mine() ? `★マイ ${areas.length}地域` : `全${areas.length}地域`}</span>
        </div>
        ${currentHtml}
        <div class="sc-info-box">
          <div class="sc-info-line"><span class="sc-info-label">📅 明日まで</span><span>${esc(outlookSummary)}</span></div>
          <div class="sc-info-line"><span class="sc-info-label">📊 5日先まで</span><span>${esc(earlySummary)}</span></div>
        </div>
      `;
    }

    // 2. 電車の運行状況サマリーカード（4路線すべてリアルタイム反映）
    const tCard = $("#sc-card-train");
    const tBadge = $("#sc-train-badge");
    const tBody = $("#sc-train-body");
    if (tCard && tBadge && tBody) {
      const scopedLines = TRAIN_LINES.filter((l) => !mine() || linePins.has(l.id));
      const displayLines = scopedLines.length > 0 ? scopedLines : TRAIN_LINES;
      const lineStates = displayLines.map((l) => ({ line: l, st: getLineStatus(l.id) }));
      const alertLines = lineStates.filter((x) => x.st.hasAlert);
      const okLines = lineStates.filter((x) => x.st.status === "ok");

      if (alertLines.length > 0) {
        tCard.dataset.status = "alert";
        tBadge.className = "sc-badge status-alert";
        tBadge.textContent = `運行情報 ${alertLines.length}路線`;
      } else if (okLines.length > 0) {
        tCard.dataset.status = "ok";
        tBadge.className = "sc-badge status-ok";
        tBadge.textContent = "平常運転";
      } else {
        tCard.dataset.status = "ok";
        tBadge.className = "sc-badge status-na";
        tBadge.textContent = "確認中";
      }

      tBody.innerHTML = `
        <div class="sc-train-list">
          ${lineStates
            .map(
              ({ line, st }) => `
            <div class="sc-train-row ${st.hasAlert ? "is-alert" : ""}">
              <span class="sc-train-dot" style="background:${line.color}"></span>
              <span class="sc-train-name">${esc(line.name)}</span>
              <span class="sc-train-sub">${esc(st.hasAlert ? "遅延・運転見合わせ等の情報あり" : line.section)}</span>
              <span class="sc-train-st ${st.hasAlert ? "alert" : st.status === "ok" ? "ok" : "link"}">${esc(st.label)}</span>
            </div>`
            )
            .join("")}
        </div>
      `;
    }

    // 3. 道路情報サマリーカード
    const rCard = $("#sc-card-road");
    const rBadge = $("#sc-road-badge");
    const rBody = $("#sc-road-body");
    if (rCard && rBadge && rBody) {
      const roadSections = trafficData?.sections || [];
      const heavySecs = roadSections.filter((s) => s.status === "heavy");
      const crowdedSecs = roadSections.filter((s) => s.status === "crowded");
      const delayedSecs = roadSections.filter((s) => s.delayMin >= 2).sort((a, b) => b.delayMin - a.delayMin);

      if (heavySecs.length > 0) {
        rCard.dataset.status = "alert";
        rBadge.className = "sc-badge status-alert";
        rBadge.textContent = `渋滞 ${heavySecs.length}区間`;
      } else if (crowdedSecs.length > 0) {
        rCard.dataset.status = "caution";
        rBadge.className = "sc-badge status-caution";
        rBadge.textContent = `混雑 ${crowdedSecs.length}区間`;
      } else if (delayedSecs.length > 0) {
        rCard.dataset.status = "ok";
        rBadge.className = "sc-badge status-ok";
        rBadge.textContent = `おおむね順調`;
      } else {
        rCard.dataset.status = "ok";
        rBadge.className = "sc-badge status-ok";
        rBadge.textContent = "順調";
      }

      const shortRoadName = {
        r175: "国道175号",
        higashiharima: "東播磨道",
        bypass: "加古川・姫路BP",
        meiki: "明姫幹線",
      };

      const gridHtml = ROAD_LINES.map((rl) => {
        const lSecs = roadSections.filter((s) => s.road === rl.id);
        const maxD = lSecs.reduce((m, s) => Math.max(m, s.delayMin || 0), 0);
        const st = lSecs.some((s) => s.status === "heavy")
          ? "heavy"
          : lSecs.some((s) => s.status === "crowded")
            ? "crowded"
            : "normal";
        const stLabel =
          st === "heavy"
            ? `🔴 渋滞 +${maxD}分`
            : st === "crowded"
              ? `🟡 混雑 +${maxD}分`
              : maxD >= 2
                ? `🟢 順調 (+${maxD}分)`
                : "🟢 順調";
        return `
          <div class="sc-road-cell status-${st}">
            <span class="sc-road-name"><i class="sc-train-dot" style="background:${rl.color}"></i>${esc(shortRoadName[rl.id] || rl.name)}</span>
            <span class="sc-road-val status-${st}">${stLabel}</span>
          </div>
        `;
      }).join("");

      let delayDetailHtml = "";
      if (delayedSecs.length > 0) {
        const items = delayedSecs.slice(0, 3).map((s) => {
          const icon = s.status === "heavy" ? "🔴" : s.status === "crowded" ? "🟡" : "⏱";
          return `<div class="sc-info-line"><span class="sc-info-label">${icon} ${esc(shortRoadName[s.road] || s.roadName)}</span><span>${esc(s.name)}：<b>${s.durationInTrafficMin}分</b>（通常+${s.delayMin}分）</span></div>`;
        }).join("");
        const more = delayedSecs.length > 3 ? `<div class="sc-info-line"><span class="sc-info-label"></span><span>ほか ${delayedSecs.length - 3} 区間で軽微な遅れ</span></div>` : "";
        const boxCls = heavySecs.length ? "alert" : crowdedSecs.length ? "caution" : "";
        delayDetailHtml = `<div class="sc-info-box ${boxCls}">${items}${more}</div>`;
      } else {
        delayDetailHtml = `<p class="sc-desc">✅ 全${roadSections.length || 18}区間で遅れはなく、スムーズに流れています。</p>`;
      }

      let commuteBarHtml = "";
      if (commuteRoutes.length > 0) {
        const rows = commuteRoutes
          .map((r, idx) => {
            const toWorkUrl = buildCommuteMapsUrl(r.home, r.work, r.via);
            const toHomeUrl = buildCommuteMapsUrl(r.work, r.home, r.via);
            const title = r.label || `ルート${idx + 1}（${r.home}⇄${r.work}）`;
            return `
              <div class="sc-commute-bar">
                <span class="sc-commute-label">🗺 ${esc(title)}：</span>
                <a href="${esc(toWorkUrl)}" target="_blank" rel="noopener noreferrer" class="sc-commute-link">▶ 行き ↗</a>
                <a href="${esc(toHomeUrl)}" target="_blank" rel="noopener noreferrer" class="sc-commute-link">◀ 帰り ↗</a>
              </div>
            `;
          })
          .join("");
        commuteBarHtml = rows;
      }

      rBody.innerHTML = `
        <div class="sc-stat-row">
          <span class="sc-stat-pill">🕒 ${esc(fmtTrafficCheckedAt(trafficData?.checkedAt))}</span>
          <span class="sc-stat-scope">${trafficData?.isMock ? "基準時間（テスト）" : "リアルタイム"}</span>
        </div>
        <div class="sc-road-grid">${gridHtml}</div>
        ${delayDetailHtml}
        ${commuteBarHtml}
      `;
    }
  }
  function renderSummaryCards_OLD(warn, adv, trainAlertCount, roadDelayCount, roadDelayed) {
    // 1. 気象サマリー
    const wBadge = $("#sc-weather-badge");
    const wDesc = $("#sc-weather-desc");
    if (wBadge && wDesc) {
      if (warn > 0) {
        wBadge.className = "sc-badge status-alert";
        wBadge.textContent = `警報 ${warn}地域`;
        wDesc.textContent = `対象地域に警報が発表されています。解除見込みと今後の推移を確認してください。`;
      } else if (adv > 0) {
        wBadge.className = "sc-badge status-caution";
        wBadge.textContent = `注意報 ${adv}地域`;
        wDesc.textContent = `注意報が発表されています。見込み・注意期間をご確認ください。`;
      } else {
        wBadge.className = "sc-badge status-ok";
        wBadge.textContent = "発表なし";
        wDesc.textContent = "現在、対象地域に発表中の気象警報・注意報はありません。";
      }
    }

    // 2. 電車サマリー
    const tBadge = $("#sc-train-badge");
    const tDesc = $("#sc-train-desc");
    if (tBadge && tDesc) {
      if (trainAlertCount > 0) {
        tBadge.className = "sc-badge status-alert";
        tBadge.textContent = "運行情報あり";
        tDesc.textContent = "神戸電鉄で運転見合わせまたは遅れが発生しています。公式情報をご確認ください。";
      } else {
        tBadge.className = "sc-badge status-ok";
        tBadge.textContent = "平常運転";
        tDesc.textContent = "神戸電鉄は平常通り運行しています（JR・山陽等は各社公式リンク参照）。";
      }
    }

    // 3. 道路サマリー
    const rBadge = $("#sc-road-badge");
    const rDesc = $("#sc-road-desc");
    if (rBadge && rDesc) {
      if (roadDelayCount > 0) {
        const heavyCount = roadDelayed.filter((s) => s.status === "heavy").length;
        if (heavyCount > 0) {
          rBadge.className = "sc-badge status-alert";
          rBadge.textContent = `渋滞 ${heavyCount}件`;
          rDesc.textContent = `主要幹線道路（加古川バイパス等）で渋滞が発生しています。路線図をご確認ください。`;
        } else {
          rBadge.className = "sc-badge status-caution";
          rBadge.textContent = `遅れ ${roadDelayCount}区間`;
          rDesc.textContent = `幹線道路で一部混雑が発生しています。路線図・所要時間をご確認ください。`;
        }
      } else {
        rBadge.className = "sc-badge status-ok";
        rBadge.textContent = "順調";
        rDesc.textContent = "主要幹線道路（175号・東播磨道・バイパス・明姫幹線）は通常通り順調です。";
      }
    }
  }

  // ページ切り替え（０．概要 / １．気象情報と見込み / ２．電車の運行状況 / ３．道路情報）
  function switchPage(pageId) {
    const validPages = ["summary", "weather", "trains", "roads"];
    if (!validPages.includes(pageId)) pageId = "summary";
    activePage = pageId;

    // 各ページコンテナの表示・非表示切替
    validPages.forEach((p) => {
      const el = $(`#page-${p}`);
      if (el) {
        const isActive = p === pageId;
        el.classList.toggle("active", isActive);
        el.hidden = !isActive;
      }
    });

    // 下部ナビゲーションボタンのアクティブ状態
    document.querySelectorAll(".bottom-nav .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    // 最上部へスクロール
    window.scrollTo({ top: 0, behavior: "instant" });

    // 道路情報ページに切り替わった場合、マップが非表示からの復帰で再描画が必要なら反映
    if (pageId === "roads") {
      renderRoads();
    }
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
            <button class="pin ${pins.has(a) ? "on" : ""}" aria-label="${esc(a)}をマイ地域に登録" data-pin="${esc(a)}">★</button>
            <span class="area-name">${esc(a)}</span>
            <div class="tags">
              ${list.length ? list.map((w) => `<span class="tag tag-${w.level}">${esc(w.type)}</span>`).join("") : '<span class="tag-none">発表なし</span>'}
            </div>
            <a class="yahoo-link" href="${yahooUrl(model.codes[a])}" target="_blank" rel="noopener" aria-label="${esc(a)}のYahoo!天気を開く">天気<span aria-hidden="true">↗</span></a>
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

  // 鉄道の運行情報（神鉄はAPI連携、JR・山陽は準備中）
  function renderTrains() {
    const scope = visibleLines();
    const scopeCount = scope.length;
    $("#train-count").textContent = mine() ? `★ ${scopeCount}路線` : `全${scopeCount}路線`;
    if (!scopeCount) {
      $("#train-list").innerHTML = activeOnly
        ? '<p class="empty card all-clear">✅ 現在、運行情報が出ている路線はありません（平常運転中または準備中）</p>'
        : '<p class="empty card">全体表示で ★ をタップして、マイ路線を登録してください</p>';
      return;
    }
    $("#train-list").innerHTML =
      '<p class="note train-note">※ 4路線（JR神戸線・JR加古川線・神戸電鉄・山陽電車）すべての運行情報の有無を自動反映しています。詳細・最新状況は各運行情報ページをご確認ください。</p>' +
      scope.map((l, i) => {
        const st = getLineStatus(l.id);
        return `
        <article class="card train ${st.hasAlert ? "train-alert" : ""}" id="train-${l.id}" style="--line:${l.color};animation-delay:${i * 60}ms">
          <span class="train-color"></span>
          <div class="train-body">
            <div class="train-head">
              <button class="pin ${linePins.has(l.id) ? "on" : ""}" aria-label="${l.name}をマイ路線に登録" data-line-pin="${l.id}">★</button>
              <div class="train-id">
                <div class="train-name">${l.name}</div>
                <div class="train-section">${l.section}</div>
              </div>
              <div class="train-right">
                <span class="status ${st.cls}">${st.label}</span>
              </div>
            </div>
            ${st.text ? `<p class="train-msg ${st.hasAlert ? "alert" : ""}">${esc(st.text)}</p>` : ""}
            <a class="train-link" href="${l.url}" target="_blank" rel="noopener">運行情報の詳細を見る ↗</a>
          </div>
        </article>`;
      }).join("");
  }

  // 道路交通情報（区間所要時間・路線図マップ）の描画
  function renderRoads() {
    const sections = trafficData?.sections || [];

    // 方向切替ボタンのアクティブ状態
    const btnBoth = $("#dir-both");
    const btnSe = $("#dir-se");
    const btnNw = $("#dir-nw");
    if (btnBoth && btnSe && btnNw) {
      btnBoth.classList.toggle("active", trafficDirection === "both");
      btnSe.classList.toggle("active", trafficDirection === "south_east");
      btnNw.classList.toggle("active", trafficDirection === "north_west");
    }

    // 表示モード切替ボタンのアクティブ状態
    const btnMap = $("#mode-map");
    const btnList = $("#mode-list");
    if (btnMap && btnList) {
      btnMap.classList.toggle("active", trafficViewMode === "map");
      btnList.classList.toggle("active", trafficViewMode === "list");
    }

    const mapCard = $("#road-map-card");
    const listCard = $("#road-list-card");
    if (mapCard) mapCard.hidden = trafficViewMode !== "map";
    if (listCard) listCard.hidden = trafficViewMode !== "list";

    // カウント表示
    const delayedSections = sections.filter((s) => s.delayMin >= 3);
    const countEl = $("#road-count");
    if (countEl) {
      countEl.textContent = `全${sections.length}区間${delayedSections.length > 0 ? `（遅れ${delayedSections.length}件）` : ""}`;
    }

    const checkedEl = $("#road-checked-at");
    if (checkedEl) {
      checkedEl.textContent = fmtTrafficCheckedAt(trafficData?.checkedAt);
    }
    const badgeEl = $("#road-source-badge");
    if (badgeEl) {
      badgeEl.textContent = trafficData?.isMock
        ? "※ 基準所要時間表示中（APIキー準備中）"
        : "※ リアルタイム渋滞情報連動中";
    }

    if (trafficViewMode === "map") {
      renderRoadMapSvg(sections, trafficDirection);
    } else {
      renderRoadList(sections, trafficDirection);
    }
    renderCommute();
  }

  // マイルート（スタート ⇄ ゴール 複数登録・Googleマップ直行）の描画
  function renderCommute() {
    const savedView = $("#commute-saved-view");
    const listEl = $("#commute-list");
    const form = $("#commute-form");
    const addBtn = $("#commute-add-btn");
    const formTitle = $("#commute-form-title");
    if (!savedView || !listEl || !form) return;

    // 登録画面（フォーム）は登録・編集ボタンを押した時のみ表示する
    savedView.hidden = commuteFormOpen;
    form.hidden = !commuteFormOpen;
    if (addBtn) addBtn.hidden = commuteFormOpen;

    if (commuteFormOpen) {
      if (formTitle) {
        formTitle.textContent = editingRouteId ? "✏️ ルートを編集" : "＋ 新しいルートを登録";
      }
      return;
    }

    if (commuteRoutes.length === 0) {
      listEl.innerHTML = `
        <div class="commute-empty">
          <span>まだルートが登録されていません。右上の「＋ ルートを登録」からスタート・ゴールを登録できます。</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = commuteRoutes
      .map((r, i) => {
        const toGoalUrl = buildCommuteMapsUrl(r.home, r.work, r.via);
        const toStartUrl = buildCommuteMapsUrl(r.work, r.home, r.via);
        const nameBadge = r.label
          ? `<span class="commute-item-name">${esc(r.label)}</span>`
          : `<span class="commute-item-name">ルート ${i + 1}</span>`;
        const viaHtml = r.via
          ? `<span>⇄</span><span class="commute-route-tag">🛣 経由：${esc(r.via)}</span>`
          : "";
        return `
          <div class="commute-item" data-route-id="${esc(r.id)}">
            <div class="commute-item-head">
              <div class="commute-item-info">
                ${nameBadge}
                <span class="commute-route-tag">🚩 ${esc(r.home)}</span>
                ${viaHtml}
                <span>⇄</span>
                <span class="commute-route-tag">🏁 ${esc(r.work)}</span>
              </div>
              <div class="commute-item-ctrl">
                <button type="button" class="commute-mini-btn" data-commute-edit="${esc(r.id)}">✏️ 編集</button>
                <button type="button" class="commute-mini-btn del" data-commute-del="${esc(r.id)}">🗑 削除</button>
              </div>
            </div>
            <div class="commute-actions">
              <a href="${esc(toGoalUrl)}" target="_blank" rel="noopener noreferrer" class="commute-go-btn to-work">
                <span class="cg-icon">🚩</span>
                <span class="cg-text">
                  <b>行き（${esc(r.home)} → ${esc(r.work)}）</b>
                  <small>現在の渋滞・所要時間をGoogleマップで開く ↗</small>
                </span>
              </a>
              <a href="${esc(toStartUrl)}" target="_blank" rel="noopener noreferrer" class="commute-go-btn to-home">
                <span class="cg-icon">🏁</span>
                <span class="cg-text">
                  <b>帰り（${esc(r.work)} → ${esc(r.home)}）</b>
                  <small>現在の渋滞・所要時間をGoogleマップで開く ↗</small>
                </span>
              </a>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // SVG路線図のレンダリング（両方向同時表示対応）
  function renderRoadMapSvg(sections, direction) {
    const svg = $("#road-svg-map");
    if (!svg) return;

    const secLookup = {};
    sections.forEach((s) => { secLookup[s.id] = s; });

    let svgHtml = `
      <defs>
        <filter id="badge-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(20,40,40,0.18)" />
        </filter>
      </defs>
    `;

    // 1. 接続線（高砂・別所接続の破線）
    svgHtml += `<line x1="50" y1="380" x2="90" y2="520" class="svg-edge-path road-connector" />`;

    // 2. 道路ライン（各区間）
    // 各ラインに属する区間の最大遅延ステータスを求めてハイライト
    const getRoadStatus = (secIds) => {
      const statuses = secIds.map((id) => secLookup[id]?.status || "normal");
      if (statuses.includes("heavy")) return "status-heavy";
      if (statuses.includes("crowded")) return "status-crowded";
      return "status-normal";
    };

    const edgeDefs = [
      { id: "r175-1", x1: 505, y1: 45, x2: 525, y2: 200, road: "r175", sw: 7, secs: ["r175-s-1", "r175-n-3"] },
      { id: "r175-2", x1: 525, y1: 200, x2: 550, y2: 360, road: "r175", sw: 7, secs: ["r175-s-2", "r175-n-2"] },
      { id: "r175-3", x1: 550, y1: 360, x2: 570, y2: 520, road: "r175", sw: 7, secs: ["r175-s-3", "r175-n-1"] },
      { id: "hharima-1", x1: 290, y1: 380, x2: 525, y2: 200, road: "higashiharima", sw: 7, secs: ["hharima-d-1", "hharima-u-1"] },
      { id: "bypass-1", x1: 50, y1: 380, x2: 290, y2: 380, road: "bypass", sw: 8, secs: ["bypass-e-1", "bypass-w-2"] },
      { id: "bypass-2", x1: 290, y1: 380, x2: 410, y2: 380, road: "bypass", sw: 8, secs: ["bypass-e-2", "bypass-w-1"] },
      { id: "meiki-1", x1: 90, y1: 520, x2: 250, y2: 520, road: "meiki", sw: 7, secs: ["meiki-e-1", "meiki-w-3"] },
      { id: "meiki-2", x1: 250, y1: 520, x2: 410, y2: 520, road: "meiki", sw: 7, secs: ["meiki-e-2", "meiki-w-2"] },
      { id: "meiki-3", x1: 410, y1: 520, x2: 570, y2: 520, road: "meiki", sw: 7, secs: ["meiki-e-3", "meiki-w-1"] },
    ];

    edgeDefs.forEach((e) => {
      const stCls = getRoadStatus(e.secs);
      svgHtml += `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke-width="${e.sw}" class="svg-edge-path road-${e.road} ${stCls}" />`;
    });

    // 3. 路線名タイトル
    svgHtml += `
      <text x="535" y="28" class="svg-road-title road-r175">175号線</text>
      <text x="312" y="275" class="svg-road-title road-higashiharima">東播磨道</text>
      <text x="75" y="325" class="svg-road-title road-bypass">加古川・姫路バイパス</text>
      <text x="280" y="590" class="svg-road-title road-meiki">明姫幹線</text>
    `;

    // 4. ノード（地点）
    const nodes = [
      { id: "takino", x: 505, y: 45, label: "滝野社IC", sub: "加東市", lx: 492, ly: 49, ta: "end" },
      { id: "tenjin", x: 525, y: 200, label: "天神町", sub: "小野市", lx: 538, ly: 195, ta: "start" },
      { id: "tainishi", x: 550, y: 360, label: "田井西", sub: "三木市", lx: 563, ly: 355, ta: "start" },
      { id: "moritomo", x: 570, y: 520, label: "森友", sub: "明石・神戸西", lx: 570, ly: 542, ta: "middle" },
      { id: "chuo", x: 290, y: 380, label: "加古川中央", sub: "加古川市", lx: 280, ly: 363, ta: "middle" },
      { id: "bessho", x: 50, y: 380, label: "別所SA", sub: "姫路市", lx: 50, ly: 363, ta: "middle" },
      { id: "akashinishi", x: 410, y: 380, label: "明石西", sub: "播磨・明石", lx: 410, ly: 363, ta: "middle" },
      { id: "nakasuji", x: 90, y: 520, label: "中筋西", sub: "高砂市", lx: 90, ly: 542, ta: "middle" },
      { id: "sakai", x: 250, y: 520, label: "坂井", sub: "別府", lx: 250, ly: 542, ta: "middle" },
      { id: "taniike", x: 410, y: 520, label: "谷池", sub: "播磨", lx: 410, ly: 542, ta: "middle" },
    ];

    nodes.forEach((n) => {
      svgHtml += `
        <circle cx="${n.x}" cy="${n.y}" r="6" class="svg-node-circle" stroke="#0f172a" />
        <text x="${n.lx}" y="${n.ly}" text-anchor="${n.ta}" class="svg-node-label">${n.label}</text>
      `;
    });

    // 5. 所要時間バッジ（全18区間・両方向レイアウト）
    const SECTION_LAYOUT = {
      // 175号線 (南行: 線の左側 / 北行: 線の右側)
      "r175-s-1": { x: 553, y: 122, dir: "south_east", arrow: "↓", tag: "南" },
      "r175-n-3": { x: 477, y: 122, dir: "north_west", arrow: "↑", tag: "北" },
      "r175-s-2": { x: 576, y: 280, dir: "south_east", arrow: "↓", tag: "南" },
      "r175-n-2": { x: 499, y: 280, dir: "north_west", arrow: "↑", tag: "北" },
      "r175-s-3": { x: 598, y: 440, dir: "south_east", arrow: "↓", tag: "南" },
      "r175-n-1": { x: 522, y: 440, dir: "north_west", arrow: "↑", tag: "北" },

      // 東播磨道 (下り・小野方面: 線の上側 / 上り・加古川方面: 線の下側)
      "hharima-d-1": { x: 394, y: 278, dir: "south_east", arrow: "↗", tag: "小野" },
      "hharima-u-1": { x: 424, y: 303, dir: "north_west", arrow: "↙", tag: "加古" },

      // 加古川・姫路バイパス (東行: 線の上側 / 西行: 線の下側)
      "bypass-e-1": { x: 170, y: 359, dir: "south_east", arrow: "→", tag: "東" },
      "bypass-w-2": { x: 170, y: 401, dir: "north_west", arrow: "←", tag: "西" },
      "bypass-e-2": { x: 350, y: 359, dir: "south_east", arrow: "→", tag: "東" },
      "bypass-w-1": { x: 350, y: 401, dir: "north_west", arrow: "←", tag: "西" },

      // 明姫幹線 (東行: 線の上側 / 西行: 線の下側)
      "meiki-e-1": { x: 170, y: 499, dir: "south_east", arrow: "→", tag: "東" },
      "meiki-w-3": { x: 170, y: 541, dir: "north_west", arrow: "←", tag: "西" },
      "meiki-e-2": { x: 330, y: 499, dir: "south_east", arrow: "→", tag: "東" },
      "meiki-w-2": { x: 330, y: 541, dir: "north_west", arrow: "←", tag: "西" },
      "meiki-e-3": { x: 490, y: 499, dir: "south_east", arrow: "→", tag: "東" },
      "meiki-w-1": { x: 490, y: 541, dir: "north_west", arrow: "←", tag: "西" },
    };

    Object.entries(SECTION_LAYOUT).forEach(([secId, pos]) => {
      // 進行方向フィルター
      if (direction !== "both" && pos.dir !== direction) return;

      const sec = secLookup[secId];
      if (!sec) return;

      const hasDelay = sec.delayMin >= 2;
      const status = sec.status;
      const bw = hasDelay ? 66 : 56;
      const bh = 24;
      const bx = pos.x - bw / 2;
      const by = pos.y - bh / 2;

      svgHtml += `
        <g class="svg-badge-group" data-road-id="${sec.id}" transform-origin="${pos.x} ${pos.y}">
          <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" class="svg-badge-rect status-${status}" filter="url(#badge-shadow)" />
          <text x="${hasDelay ? pos.x - 9 : pos.x}" y="${pos.y + 1}" class="svg-badge-text-time status-${status}">
            <tspan fill="#64748b" font-size="10" font-weight="700">${pos.arrow}${pos.tag}</tspan> ${sec.durationInTrafficMin}分
          </text>
          ${hasDelay
          ? `
              <rect x="${bx + bw - 20}" y="${by + 3}" width="17" height="12" class="svg-badge-delay-pill status-${status}" />
              <text x="${bx + bw - 11.5}" y="${by + 9.5}" class="svg-badge-delay-text">+${sec.delayMin}</text>
            `
          : ""
        }
        </g>
      `;
    });

    svg.innerHTML = svgHtml;

    // バッジクリックで詳細モーダルを開く
    svg.querySelectorAll("[data-road-id]").forEach((g) => {
      g.addEventListener("click", () => {
        const id = g.dataset.roadId;
        const sec = secLookup[id];
        if (sec) openRoadDetail(sec);
      });
    });
  }

  // 区間リストのレンダリング
  function renderRoadList(sections, direction) {
    const listCard = $("#road-list-card");
    if (!listCard) return;

    // 方向フィルタ
    const filtered = sections.filter((s) => {
      if (direction === "both") return true;
      if (direction === "north_west") return s.direction === "north" || s.direction === "west" || s.direction === "up";
      return s.direction === "south" || s.direction === "east" || s.direction === "down";
    });

    // 「情報ありのみ」なら遅延のみ
    const displayList = activeOnly ? filtered.filter((s) => s.delayMin >= 3) : filtered;

    if (!displayList.length) {
      listCard.innerHTML = activeOnly
        ? '<p class="empty card all-clear">✅ 現在、遅延している道路区間はありません（すべて順調）</p>'
        : '<p class="empty card">区間データがありません</p>';
      return;
    }

    // 路線ごとにグループ化
    const grouped = {};
    displayList.forEach((s) => {
      if (!grouped[s.road]) grouped[s.road] = [];
      grouped[s.road].push(s);
    });

    let html = "";
    ROAD_LINES.forEach((rl) => {
      const items = grouped[rl.id];
      if (!items || !items.length) return;

      html += `
        <div class="road-group-card">
          <div class="road-group-header">
            <h3 class="road-group-title">
              <span class="road-group-dot" style="background:${rl.color}"></span>
              ${rl.name}
            </h3>
            <span class="note">${rl.desc}</span>
          </div>
          <div class="road-items">
            ${items
          .map((s) => {
            const statusBadge =
              s.status === "heavy"
                ? '<span class="road-delay-badge status-heavy">渋滞</span>'
                : s.status === "crowded"
                  ? `<span class="road-delay-badge status-crowded">+${s.delayMin}分遅れ</span>`
                  : "";
            return `
                <div class="road-item" data-road-id="${s.id}">
                  <div class="road-item-left">
                    <span class="road-item-name">${esc(s.name)}</span>
                    <span class="road-item-sub">約 ${s.distanceKm} km・通常 ${s.durationMin}分</span>
                  </div>
                  <div class="road-item-right">
                    <div class="road-time-box">
                      <span class="road-time-main status-${s.status}">${s.durationInTrafficMin}分</span>
                      ${statusBadge}
                    </div>
                    <span class="road-item-arrow">›</span>
                  </div>
                </div>`;
          })
          .join("")}
          </div>
        </div>
      `;
    });

    listCard.innerHTML = html;

    listCard.querySelectorAll("[data-road-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.roadId;
        const sec = sections.find((s) => s.id === id);
        if (sec) openRoadDetail(sec);
      });
    });
  }

  // 道路区間詳細モーダルを開く
  function openRoadDetail(sec) {
    const sheet = $("#road-sheet");
    if (!sheet) return;

    const badge = $("#road-sheet-badge");
    badge.className = `road-badge status-${sec.status}`;
    badge.textContent = sec.status === "heavy" ? "🔴 渋滞" : sec.status === "crowded" ? "🟡 混雑" : "🟢 順調";

    $("#road-sheet-title").textContent = `【${sec.roadName}】${sec.name}`;
    $("#road-sheet-curr").textContent = `${sec.durationInTrafficMin} 分`;
    $("#road-sheet-base").textContent = `${sec.durationMin} 分`;
    $("#road-sheet-delay").textContent = sec.delayMin > 0 ? `+${sec.delayMin} 分` : "なし";

    let desc = `${fmtTrafficCheckedAt(trafficData?.checkedAt)} ／ 区間距離：約 ${sec.distanceKm} km (${sec.directionLabel})`;
    if (sec.delayMin >= 8) {
      desc += "。現在、大幅な渋滞が発生しています。別ルートの検討や出発時間の調整をおすすめします。";
    } else if (sec.delayMin >= 3) {
      desc += "。通常よりやや混雑しています。余裕をもってお出かけください。";
    } else {
      desc += "。目立った混雑はなく、通常通りスムーズに走行できます。";
    }
    $("#road-sheet-desc").textContent = desc;

    const mapLink = $("#road-sheet-maplink");
    mapLink.href = sec.mapUrl;

    sheet.hidden = false;
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

  // スナップショット、神鉄データ、道路交通データの読み込み
  async function load({ manual = false } = {}) {
    try {
      const [snapRes, railRes, trafficRes] = await Promise.allSettled([
        fetch(SNAPSHOT_URL, { cache: "no-store" }),
        fetch(RAIL_URL, { cache: "no-store" }),
        fetch(TRAFFIC_URL, { cache: "no-store" }),
      ]);

      if (snapRes.status === "fulfilled" && snapRes.value.ok) {
        model = adaptSnapshot(await snapRes.value.json());
        $("#load-error").hidden = true;
      } else {
        const errStatus = snapRes.status === "fulfilled" ? snapRes.value.status : "接続エラー";
        throw new Error(errStatus === 503 ? "データの準備ができていません" : `HTTP ${errStatus}`);
      }

      if (railRes.status === "fulfilled" && railRes.value.ok) {
        try {
          railData = await railRes.value.json();
          shintetsuStatus = parseRailLineStatus(railData?.lines?.shintetsu, "shintetsu");
        } catch (e) {
          console.warn("鉄道データの解析エラー:", e);
          railData = null;
          shintetsuStatus = parseShintetsuStatus(null);
        }
      } else {
        railData = null;
        shintetsuStatus = parseShintetsuStatus(null);
      }

      if (trafficRes.status === "fulfilled" && trafficRes.value.ok) {
        try {
          trafficData = await trafficRes.value.json();
        } catch (e) {
          console.warn("道路交通データの解析エラー:", e);
          trafficData = null;
        }
      } else {
        trafficData = null;
      }

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

  // 道路：進行方向切替
  $("#dir-both")?.addEventListener("click", () => {
    trafficDirection = "both";
    renderRoads();
  });
  $("#dir-se")?.addEventListener("click", () => {
    trafficDirection = "south_east";
    renderRoads();
  });
  $("#dir-nw")?.addEventListener("click", () => {
    trafficDirection = "north_west";
    renderRoads();
  });

  // 道路：表示形式切替（路線図マップ / リスト）
  $("#mode-map")?.addEventListener("click", () => {
    trafficViewMode = "map";
    renderRoads();
  });
  $("#mode-list")?.addEventListener("click", () => {
    trafficViewMode = "list";
    renderRoads();
  });

  // マイルート（スタート ⇄ ゴール 複数登録）の追加・編集・保存・削除イベント
  const openCommuteForm = (route = null) => {
    editingRouteId = route ? route.id : null;
    commuteFormOpen = true;
    const labelInput = $("#commute-label");
    const homeInput = $("#commute-home");
    const workInput = $("#commute-work");
    const viaInput = $("#commute-via");
    if (labelInput) labelInput.value = route?.label || "";
    if (homeInput) homeInput.value = route?.home || "";
    if (workInput) workInput.value = route?.work || "";
    if (viaInput) viaInput.value = route?.via || "";
    renderCommute();
    homeInput?.focus();
  };

  $("#commute-add-btn")?.addEventListener("click", () => {
    openCommuteForm(null);
  });

  $("#commute-cancel-btn")?.addEventListener("click", () => {
    commuteFormOpen = false;
    editingRouteId = null;
    renderCommute();
  });

  $("#commute-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const label = $("#commute-label")?.value.trim() || "";
    const home = $("#commute-home")?.value.trim() || "";
    const work = $("#commute-work")?.value.trim() || "";
    const via = $("#commute-via")?.value.trim() || "";
    if (!home || !work) {
      toast("スタートとゴールの両方を入力してください");
      return;
    }

    if (editingRouteId) {
      commuteRoutes = commuteRoutes.map((r) =>
        r.id === editingRouteId ? { ...r, label, home, work, via } : r
      );
      toast("🗺 マイルートを更新しました");
    } else {
      commuteRoutes.push({
        id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        label,
        home,
        work,
        via,
      });
      toast("🗺 新しいマイルートを登録しました");
    }
    saveCommuteRoutes();
    commuteFormOpen = false;
    editingRouteId = null;
    renderCommute();
    if (model) renderHero();
  });

  $("#commute-list")?.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-commute-edit]");
    if (editBtn) {
      const id = editBtn.dataset.commuteEdit;
      const target = commuteRoutes.find((r) => r.id === id);
      if (target) openCommuteForm(target);
      return;
    }
    const delBtn = e.target.closest("[data-commute-del]");
    if (delBtn) {
      const id = delBtn.dataset.commuteDel;
      commuteRoutes = commuteRoutes.filter((r) => r.id !== id);
      saveCommuteRoutes();
      renderCommute();
      if (model) renderHero();
      toast("マイルートを削除しました");
    }
  });

  const fillGeoLocation = (inputSelector, labelName) => {
    const input = $(inputSelector);
    if (!input) return;
    if (!navigator.geolocation) {
      toast("お使いのブラウザは現在地取得に対応していません");
      return;
    }
    toast(`${labelName}の現在地を取得中...`);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        input.value = `${lat},${lng}`;
        toast(`📍 ${labelName}に現在地座標を入力しました`);
      },
      () => {
        toast("現在地を取得できませんでした。住所や駅名・施設名を入力してください");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };
  $("#commute-geo-home")?.addEventListener("click", () => fillGeoLocation("#commute-home", "スタート地点"));
  $("#commute-geo-work")?.addEventListener("click", () => fillGeoLocation("#commute-work", "ゴール地点"));

  // 道路詳細モーダルの閉じる
  $("#road-sheet-close")?.addEventListener("click", () => {
    const sheet = $("#road-sheet");
    if (sheet) sheet.hidden = true;
  });
  $("#road-sheet")?.addEventListener("click", (e) => {
    if (e.target.id === "road-sheet") e.currentTarget.hidden = true;
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

  // 下部ナビゲーションのページ切り替えイベント
  document.querySelectorAll(".bottom-nav [data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchPage(btn.dataset.page);
    });
  });

  // 概要ページの各サマリーカードクリックでのページ遷移（カード内リンクタップ時は除外）
  document.querySelectorAll("[data-go-page]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      switchPage(card.dataset.goPage);
    });
  });

  // 初期ページ表示
  renderCommute();
  switchPage(activePage);

  load();
  if (!IS_SAMPLE) setInterval(load, 5 * 60 * 1000); // 5分ごとに自動更新
})();
