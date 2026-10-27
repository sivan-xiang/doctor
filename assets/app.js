/* 家庭医药助手 · 纯静态 H5（方案 A）
 * 无自研后端：内容构建期内联，收藏/药箱使用 localStorage，统计走可配置的第三方端点。
 */
(function () {
  'use strict';

  /* ================= 配置 ================= */
  var CONFIG = {
    hotWords: ['烫伤', '流鼻血', '异物卡喉', '发烧', '误服', '中暑'],
    // 上线前替换为真实的第三方反馈表单地址；留空时降级为邮件反馈
    feedbackFormUrl: '',
    feedbackEmail: 'feedback@example.com',
    // 第三方统计端点（可选）；也可在页面注入 window.plausible
    analyticsEndpoint: ''
  };

  var STORE = {
    fav: 'fm_favorites_v1',
    kit: 'fm_kit_v1',
    fs: 'fm_fontscale_v1'
  };

  /* ================= 数据 ================= */
  var DATA = window.__CONTENT__ || { articles: [], categories: [], version: '1.0' };
  var ARTICLES = DATA.articles || [];
  var CATS = DATA.categories || [];
  var BY_SLUG = {};
  ARTICLES.forEach(function (a) { BY_SLUG[a.slug] = a; });

  var app = document.getElementById('app');
  var currentPage = 'home';
  var lastFeedbackText = '';

  /* ================= 基础工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function readJSON(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ================= 埋点（第三方统计适配） ================= */
  var EVENTS = [];
  function track(name, props) {
    var ev = { name: name, props: props || {}, path: location.hash || '#/', ts: Date.now() };
    EVENTS.push(ev);
    window.__fmEvents = EVENTS;
    if (CONFIG.analyticsEndpoint && navigator.sendBeacon) {
      try { navigator.sendBeacon(CONFIG.analyticsEndpoint, JSON.stringify(ev)); } catch (e) { /* noop */ }
    }
    if (typeof window.plausible === 'function') {
      try { window.plausible(name, { props: ev.props }); } catch (e) { /* noop */ }
    }
    if (window.console && console.debug) console.debug('[track]', name, ev.props);
  }

  /* ================= 本地数据 ================= */
  function getFavs() {
    var v = readJSON(STORE.fav, []);
    return Array.isArray(v) ? v.filter(function (s) { return !!BY_SLUG[s]; }) : [];
  }
  function saveFavs(v) { writeJSON(STORE.fav, v); }

  function getKit() {
    var v = readJSON(STORE.kit, []);
    return Array.isArray(v) ? v : [];
  }
  function saveKit(v) { writeJSON(STORE.kit, v); }

  /* ================= 字号 ================= */
  var SCALES = [1, 1.12, 1.25];
  var SCALE_NAMES = ['标准', '较大', '最大'];
  function scaleIndex() {
    var v = Number(localStorage.getItem(STORE.fs));
    var i = SCALES.indexOf(v);
    return i < 0 ? 0 : i;
  }
  function applyFontScale() {
    document.documentElement.style.setProperty('--fs', String(SCALES[scaleIndex()]));
  }
  function cycleFont() {
    var i = (scaleIndex() + 1) % SCALES.length;
    try { localStorage.setItem(STORE.fs, String(SCALES[i])); } catch (e) { /* noop */ }
    applyFontScale();
    toast('正文字号：' + SCALE_NAMES[i]);
  }

  /* ================= 路由 ================= */
  function parseHash() {
    var h = (location.hash || '').replace(/^#/, '') || '/';
    var q = '';
    var qi = h.indexOf('?');
    if (qi >= 0) { q = h.slice(qi + 1); h = h.slice(0, qi); }
    var params = {};
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    var parts = h.split('/').filter(Boolean);
    return { parts: parts, params: params };
  }

  /* ================= 通用组件 ================= */
  var TAB_ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3l9 7.6"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    kit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M12 11v5M9.5 13.5h5"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5S20 17 20 21"/></svg>'
  };

  function topbar(opts) {
    opts = opts || {};
    var left = opts.back
      ? '<button class="icon-btn" data-action="back" aria-label="返回">‹</button>'
      : '<span class="brand"><span class="brand-mark">✚</span>家庭医药</span>';
    var right = opts.right || '<span class="icon-btn" style="visibility:hidden" aria-hidden="true"></span>';
    return '<header class="topbar">' +
      '<div class="tb-left">' + left + '</div>' +
      '<div class="tb-title">' + esc(opts.title || '') + '</div>' +
      '<div class="tb-right">' + right + '</div>' +
      '</header>';
  }

  function tabbar(active) {
    var items = [
      { key: 'home', href: '#/', label: '首页' },
      { key: 'search', href: '#/search', label: '搜索' },
      { key: 'kit', href: '#/kit', label: '药箱' },
      { key: 'me', href: '#/me', label: '我的' }
    ];
    return '<nav class="tabbar">' + items.map(function (it) {
      return '<a class="tab' + (active === it.key ? ' active' : '') + '" href="' + it.href + '">' +
        TAB_ICONS[it.key] + '<span>' + it.label + '</span></a>';
    }).join('') + '</nav>';
  }

  function section(title, sub, inner, moreHref, count) {
    var right = moreHref
      ? '<a class="sec-more" href="' + moreHref + '">全部' +
        (count ? ' ' + count + ' 篇' : '') + ' ›</a>'
      : (sub ? '<span>' + esc(sub) + '</span>' : '');
    return '<section class="section"><div class="section-head"><h2>' + esc(title) + '</h2>' +
      right + '</div>' + inner + '</section>';
  }

  function rowCard(a) {
    return '<a class="row-card" href="#/detail/' + a.slug + '" data-track="open_detail" data-slug="' + a.slug + '" data-from="' + currentPage + '">' +
      '<span class="row-icon">' + a.icon + '</span>' +
      '<span class="row-body"><b>' + esc(a.title) + '</b><small>' + esc(a.summary) + '</small></span>' +
      '<span class="chev">›</span></a>';
  }

  function scenarioCard(a) {
    return '<a class="scenario" href="#/detail/' + a.slug + '" data-track="scenario_click" data-slug="' + a.slug + '" data-from="home">' +
      '<span class="scenario-icon">' + a.icon + '</span>' +
      '<span class="scenario-name">' + esc(a.scenario || a.title) + '</span>' +
      '<span class="scenario-sum">' + esc(a.summary) + '</span></a>';
  }

  function miniCard(a) {
    return '<a class="mini" href="#/detail/' + a.slug + '" data-track="open_detail" data-slug="' + a.slug + '" data-from="' + currentPage + '">' +
      '<span>' + a.icon + '</span><span>' + esc(a.title) + '</span></a>';
  }

  function byCategory(key) {
    return ARTICLES.filter(function (a) { return a.category === key; });
  }

  function catName(key) {
    var c = CATS.filter(function (x) { return x.key === key; })[0];
    return c ? c.name : key;
  }

  /* ================= 页面：首页 ================= */
  function viewHome() {
    var em = byCategory('emergency');
    var daily = byCategory('daily-medicine');
    var kit = byCategory('medicine-kit');
    var seek = byCategory('seek-care');
    var myth = byCategory('misconceptions');

    return topbar({ title: '家庭医药助手' }) +
      '<main class="main">' +
        '<section class="hero">' +
          '<div class="hero-top"><span class="hero-pill">紧急情况</span></div>' +
          '<h1>先别慌，按步骤来</h1>' +
          '<p>烫伤、出血、卡喉、中暑……关键时刻的正确做法</p>' +
          '<a class="call-btn" href="tel:120" data-action="call120">📞 立即拨打 120</a>' +
          '<p class="hero-note">若未自动跳转拨号，请手动拨打 120</p>' +
        '</section>' +
        '<a class="search-entry" href="#/search"><span>🔍 搜索症状 / 场景 / 药品</span><span class="chev">›</span></a>' +
        section('紧急情况 · 快速处理', '', 
          '<div class="scenario-grid">' + em.map(scenarioCard).join('') + '</div>', '#/category/emergency', em.length) +
        section('日常医药', '',
          '<div class="row-list">' + daily.slice(0, 4).map(rowCard).join('') + '</div>', '#/category/daily-medicine', daily.length) +
        section('家庭药箱', '',
          '<div class="mini-grid">' + kit.map(miniCard).join('') + '</div>', '#/category/medicine-kit', kit.length) +
        section('就医指引', '',
          '<div class="mini-grid">' + seek.map(miniCard).join('') + '</div>', '#/category/seek-care', seek.length) +
        section('常见误区', '',
          '<div class="mini-grid">' + myth.map(miniCard).join('') + '</div>', '#/category/misconceptions', myth.length) +
        '<div class="disclaimer">本产品仅提供健康科普与应急处理指引，不构成诊断、处方或治疗建议，不替代医生、药师或 120。紧急情况请立即拨打 120。<br>' +
          '<a href="#/about" style="color:var(--brand)">查看完整免责声明与隐私说明 ›</a></div>' +
      '</main>';
  }

  /* ================= 页面：分类 ================= */
  function viewCategory(key) {
    var cat = CATS.filter(function (c) { return c.key === key; })[0];
    if (!cat) return viewNotFound();
    var list = byCategory(key);
    return topbar({ title: cat.name, back: true }) +
      '<main class="main">' +
        '<div class="cat-head"><div class="cat-icon">' + cat.icon + '</div><div>' +
          '<h1>' + esc(cat.name) + '</h1><p>' + esc(cat.desc) + ' · 共 ' + list.length + ' 篇</p></div></div>' +
        '<div class="row-list" style="margin-top:14px">' + list.map(rowCard).join('') + '</div>' +
        '<div class="disclaimer">内容仅用于健康科普，不替代医生、药师或 120。</div>' +
      '</main>';
  }

  /* ================= 页面：详情 ================= */
  function viewDetail(slug) {
    var a = BY_SLUG[slug];
    if (!a) return viewNotFound();
    var fav = getFavs().indexOf(slug) >= 0;
    var isEm = a.category === 'emergency';

    return topbar({
      title: a.title,
      back: true,
      right: '<button class="icon-btn font-btn" data-action="font-toggle" aria-label="调整正文字号">Aa</button>'
    }) +
      '<main class="main detail"><article>' +
        '<div class="detail-head">' +
          '<span class="chip chip-cat">' + esc(catName(a.category)) + '</span>' +
          '<span class="chip">' + esc(a.scenario) + '</span>' +
          (a.status === 'published' ? '<span class="chip chip-ok">已审核</span>' : '') +
        '</div>' +
        '<h1>' + esc(a.title) + '</h1>' +
        '<p class="detail-summary">' + esc(a.summary) + '</p>' +
        '<div class="detail-actions">' +
          '<button class="act ' + (fav ? 'on' : '') + '" data-action="fav-toggle" data-slug="' + a.slug + '">' +
            (fav ? '★ 已收藏' : '☆ 收藏') + '</button>' +
          '<button class="act" data-action="share" data-slug="' + a.slug + '">↗ 分享</button>' +
          '<a class="act" href="#/feedback">✎ 反馈</a>' +
        '</div>' +
        (isEm ? '<a class="call-btn call-inline" href="tel:120" data-action="call120">📞 立即拨打 120</a>' +
          '<p class="detail-em-note">内容仅为健康科普，不构成诊断或处方，不替代医生、药师或 120；情况紧急请立即拨打 120。</p>' : '') +
        '<section class="block"><h2>立即做什么</h2><ol class="steps">' +
          a.steps.map(function (s, i) {
            return '<li><span class="num">' + (i + 1) + '</span><p>' + esc(s) + '</p></li>';
          }).join('') + '</ol></section>' +
        '<section class="block block-dont"><h2>不要做什么</h2><ul class="donts">' +
          a.donts.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>' +
        '<section class="block block-when"><h2>何时必须就医 / 拨 120</h2><p>' + esc(a.when_to_seek_help) + '</p></section>' +
        (a.special_groups ? '<section class="block"><h2>特殊人群注意</h2><p class="plain">' + esc(a.special_groups) + '</p></section>' : '') +
        (a.bodyHtml ? '<section class="block prose">' + a.bodyHtml + '</section>' : '') +
        '<section class="meta"><h2>来源与审核</h2><dl>' +
          '<dt>来源</dt><dd>' + esc(a.source) + '</dd>' +
          '<dt>审核</dt><dd>' + esc(a.reviewer) + '</dd>' +
          '<dt>审核日期</dt><dd>' + esc(a.reviewed_at) + '</dd>' +
          '<dt>更新时间</dt><dd>' + esc(a.updated_at) + '</dd>' +
          '<dt>内容版本</dt><dd>v' + esc(a.version) + '</dd>' +
        '</dl></section>' +
        '<div class="disclaimer">' + esc(a.disclaimer) + '</div>' +
        '<div class="feedback-link"><a href="#/feedback">发现内容有误？提交纠错 ›</a></div>' +
      '</article></main>';
  }

  /* ================= 页面：搜索 ================= */
  function searchArticles(q) {
    var kw = (q || '').trim().toLowerCase();
    if (!kw) return [];
    var words = kw.split(/\s+/).filter(Boolean);
    return ARTICLES.map(function (a) {
      var title = a.title.toLowerCase();
      var scenario = (a.scenario || '').toLowerCase();
      var keywords = (a.keywords || []).join(' ').toLowerCase();
      var summary = (a.summary || '').toLowerCase();
      var hay = (a.text || '').toLowerCase();
      var score = 0;
      words.forEach(function (w) {
        if (title.indexOf(w) >= 0) score += 10;
        if (scenario.indexOf(w) >= 0) score += 6;
        if (keywords.indexOf(w) >= 0) score += 5;
        if (summary.indexOf(w) >= 0) score += 3;
        if (hay.indexOf(w) >= 0) score += 1;
      });
      return { a: a, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (x, y) { return y.score - x.score; })
      .map(function (x) { return x.a; });
  }

  function quickScenarioChips() {
    return byCategory('emergency').map(function (a) {
      return '<a class="chip-btn" href="#/detail/' + a.slug + '">' + esc(a.scenario) + '</a>';
    }).join('');
  }

  function renderResults(q, list) {
    if (!q.trim()) return '';
    if (!list.length) {
      return '<div class="empty"><div class="big">🔍</div><b>没找到相关内容</b>' +
        '<p>换个说法试试，或从下面的常见场景进入</p></div>' +
        '<div class="hot"><h3>常见场景</h3><div class="chips">' + quickScenarioChips() + '</div></div>' +
        '<div class="empty" style="padding-top:6px"><a class="chip-btn" href="#/feedback">提交内容建议</a></div>';
    }
    return '<div class="search-count">找到 ' + list.length + ' 条结果</div>' +
      '<div class="row-list">' + list.map(rowCard).join('') + '</div>';
  }

  function viewSearch(params) {
    var q = params.q || '';
    return topbar({ title: '搜索' }) +
      '<main class="main">' +
        '<div class="searchbar">' +
          '<span aria-hidden="true">🔍</span>' +
          '<input id="q" type="search" placeholder="搜索症状 / 场景 / 药品" value="' + esc(q) + '" autocomplete="off" aria-label="搜索关键词">' +
          '<button class="clear" data-action="clear-search" aria-label="清空">✕</button>' +
        '</div>' +
        '<div id="hot-wrap">' +
          '<div class="hot"><h3>大家都在搜</h3><div class="chips">' +
            CONFIG.hotWords.map(function (w) {
              return '<a class="chip-btn" href="#/search?q=' + encodeURIComponent(w) + '">' + esc(w) + '</a>';
            }).join('') + '</div></div>' +
          '<div class="hot"><h3>常见场景</h3><div class="chips">' + quickScenarioChips() + '</div></div>' +
        '</div>' +
        '<div id="results">' + renderResults(q, searchArticles(q)) + '</div>' +
      '</main>';
  }

  function initSearch(initial) {
    var input = document.getElementById('q');
    var results = document.getElementById('results');
    var hotWrap = document.getElementById('hot-wrap');
    if (!input || !results) return;

    var timer = null;
    var lastTracked = '';

    function run() {
      var q = input.value;
      if (hotWrap) hotWrap.style.display = q.trim() ? 'none' : '';
      var list = searchArticles(q);
      results.innerHTML = renderResults(q, list);

      clearTimeout(timer);
      timer = setTimeout(function () {
        if (q.trim() && q !== lastTracked) {
          lastTracked = q;
          track('search', { q: q, count: list.length });
          if (!list.length) track('search_no_result', { q: q });
        }
      }, 600);
    }

    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') input.blur();
    });
    if (initial) {
      input.value = initial;
      run();
    }
  }

  /* ================= 页面：药箱 ================= */
  function expiryStatus(expiry) {
    if (!expiry) return { label: '未填有效期', cls: 'badge-muted' };
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var d = new Date(expiry + 'T00:00:00');
    if (isNaN(d.getTime())) return { label: '日期无效', cls: 'badge-muted' };
    var days = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { label: '已过期 ' + Math.abs(days) + ' 天', cls: 'badge-danger' };
    if (days === 0) return { label: '今天到期', cls: 'badge-danger' };
    if (days <= 30) return { label: '临期 ' + days + ' 天', cls: 'badge-warn' };
    return { label: '有效', cls: 'badge-ok' };
  }

  function kitList() {
    var items = getKit().slice().sort(function (a, b) {
      if (!a.expiry && !b.expiry) return 0;
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry < b.expiry ? -1 : 1;
    });
    if (!items.length) {
      return '<div class="empty"><div class="big">🧰</div><b>药箱还是空的</b>' +
        '<p>添加药品后，可查看有效期与临期提醒</p></div>';
    }
    return items.map(function (it) {
      var st = expiryStatus(it.expiry);
      return '<div class="kit-item"><div class="k-main"><b>' + esc(it.name) + '</b>' +
        '<div class="kit-meta"><span>有效期 ' + (it.expiry ? esc(it.expiry) : '未填写') + '</span>' +
        '<span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
        (it.note ? '<div class="kit-note">' + esc(it.note) + '</div>' : '') +
        '</div><button class="del" data-action="kit-del" data-id="' + esc(it.id) + '">删除</button></div>';
    }).join('');
  }

  function viewKit() {
    var items = getKit();
    return topbar({ title: '家庭药箱', back: true }) +
      '<main class="main">' +
        '<form class="card" id="kit-form" novalidate>' +
          '<h2>添加药品</h2>' +
          '<label class="field">药品名称<input name="name" maxlength="40" placeholder="如：退热药、创可贴" autocomplete="off"></label>' +
          '<div class="grid2">' +
            '<label class="field">有效期<input type="date" name="expiry"></label>' +
            '<label class="field">备注<input name="note" maxlength="30" placeholder="选填"></label>' +
          '</div>' +
          '<button class="btn-primary" type="submit">加入药箱</button>' +
          '<p class="hint">数据仅保存在本机浏览器，清除缓存或更换设备会丢失；本功能只做记录提醒，不提供用药建议。</p>' +
        '</form>' +
        '<div class="card">' +
          '<h2>我的药品' + (items.length ? '（' + items.length + '）' : '') + '</h2>' +
          kitList() +
          (items.length ? '<button class="btn-ghost" style="margin-top:12px" data-action="kit-clear">清空药箱</button>' : '') +
        '</div>' +
        '<div class="disclaimer">药箱仅用于记录药品名称与有效期，不提供剂量、用法或替代就医的建议。</div>' +
      '</main>';
  }

  /* ================= 页面：收藏 ================= */
  function viewFavorites() {
    var list = getFavs().map(function (s) { return BY_SLUG[s]; }).filter(Boolean);
    return topbar({ title: '我的收藏', back: true }) +
      '<main class="main">' +
        (list.length
          ? '<div class="row-list">' + list.map(rowCard).join('') + '</div>' +
            '<p class="hint">内容更新后，建议重新打开查看最新版本。</p>'
          : '<div class="empty"><div class="big">☆</div><b>还没有收藏</b>' +
            '<p>在详情页点击「收藏」即可保存到这里</p>' +
            '<a class="chip-btn" href="#/">去首页看看</a></div>') +
      '</main>';
  }

  /* ================= 页面：我的 ================= */
  function viewMe() {
    var f = getFavs().length;
    var k = getKit().length;
    return topbar({ title: '我的' }) +
      '<main class="main">' +
        '<div class="profile"><div class="avatar">👤</div><div><b>我的</b><p>无需登录，数据保存在本机</p></div></div>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + f + '</b><span>收藏</span></div>' +
          '<div class="stat"><b>' + k + '</b><span>药箱药品</span></div>' +
          '<div class="stat"><b>' + ARTICLES.length + '</b><span>科普内容</span></div>' +
        '</div>' +
        '<div class="menu">' +
          '<a href="#/favorites"><span class="m-icon">☆</span><span class="m-label">我的收藏</span><span class="chev">›</span></a>' +
          '<a href="#/kit"><span class="m-icon">🧰</span><span class="m-label">家庭药箱</span><span class="chev">›</span></a>' +
          '<a href="#/feedback"><span class="m-icon">✎</span><span class="m-label">内容反馈</span><span class="chev">›</span></a>' +
          '<a href="#/about"><span class="m-icon">ℹ️</span><span class="m-label">关于与免责声明</span><span class="chev">›</span></a>' +
        '</div>' +
        '<div class="disclaimer">本产品仅提供健康科普，不构成诊断、处方或治疗建议，紧急情况请拨打 120。</div>' +
      '</main>';
  }

  /* ================= 页面：反馈 ================= */
  function viewFeedback() {
    return topbar({ title: '内容反馈', back: true }) +
      '<main class="main">' +
        '<form class="card" id="feedback-form">' +
          '<h2>告诉我们问题</h2>' +
          '<label class="field">反馈类型<select name="type">' +
            '<option>内容纠错</option><option>无效链接</option><option>功能建议</option><option>其他</option>' +
          '</select></label>' +
          '<label class="field">具体描述<textarea name="detail" rows="5" maxlength="500" placeholder="请描述问题所在的内容、位置或建议"></textarea></label>' +
          '<label class="field">联系方式（选填）<input name="contact" maxlength="60" placeholder="邮箱或微信，便于回复"></label>' +
          '<button class="btn-primary" type="submit">提交反馈</button>' +
          '<p class="hint">请勿填写病历、身份证等敏感信息。我们只收集处理反馈所必需的内容。</p>' +
        '</form>' +
        '<div class="card" id="feedback-result" style="display:none"></div>' +
        '<div class="disclaimer">紧急情况请勿在此反馈，请直接拨打 120。</div>' +
      '</main>';
  }

  function submitFeedback(form) {
    var fd = new FormData(form);
    var type = String(fd.get('type') || '');
    var detail = String(fd.get('detail') || '').trim();
    var contact = String(fd.get('contact') || '').trim();
    if (detail.length < 5) {
      toast('请至少填写 5 个字描述');
      return;
    }
    var text = '反馈类型：' + type + '\n内容描述：' + detail +
      (contact ? '\n联系方式：' + contact : '') +
      '\n来源页面：' + location.href + '\n提交时间：' + new Date().toLocaleString('zh-CN');
    lastFeedbackText = text;
    track('feedback_submit', { type: type });

    if (CONFIG.feedbackFormUrl) {
      var u = CONFIG.feedbackFormUrl + (CONFIG.feedbackFormUrl.indexOf('?') >= 0 ? '&' : '?') +
        'type=' + encodeURIComponent(type) + '&detail=' + encodeURIComponent(detail) +
        (contact ? '&contact=' + encodeURIComponent(contact) : '');
      window.open(u, '_blank');
      form.reset();
      toast('已打开反馈表单');
      return;
    }

    var mail = 'mailto:' + CONFIG.feedbackEmail +
      '?subject=' + encodeURIComponent('[家庭医药H5反馈] ' + type) +
      '&body=' + encodeURIComponent(text);
    var box = document.getElementById('feedback-result');
    if (box) {
      box.style.display = 'block';
      box.className = 'card result-box';
      box.innerHTML = '<b>反馈内容已生成</b>' +
        '<p style="margin:6px 0 10px">可点击下方按钮通过邮件发送，或复制内容后通过任意渠道反馈。</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
          '<a class="chip-btn" href="' + mail + '">发送邮件</a>' +
          '<button class="chip-btn" data-action="copy-feedback">复制内容</button>' +
        '</div>';
    }
    toast('已生成反馈内容');
  }

  /* ================= 页面：关于 ================= */
  function viewAbout() {
    var gen = '';
    if (DATA.generatedAt) {
      var d = new Date(DATA.generatedAt);
      if (!isNaN(d.getTime())) gen = d.toLocaleDateString('zh-CN');
    }
    return topbar({ title: '关于与免责声明', back: true }) +
      '<main class="main">' +
        '<div class="card prose">' +
          '<h3>产品定位</h3>' +
          '<p>家庭日常医药知识与应急处理指引工具，帮助家庭在突发状况下快速找到可执行的正确做法。</p>' +
          '<h3>免责声明</h3>' +
          '<p>本产品内容仅用于健康科普，<strong>不构成诊断、处方或治疗建议</strong>，不替代医生、药师或 120 急救。任何症状判断与用药，请咨询专业医务人员。紧急情况请立即拨打 120。</p>' +
          '<h3>内容来源与审核</h3>' +
          '<p>内容依据国家卫健委、红十字会等公开急救与用药科普资料整理；每篇内容标注来源、审核人、审核日期与版本，并定期复审。</p>' +
          '<h3>隐私说明</h3>' +
          '<p>本产品不要求登录，不收集个人身份信息。收藏与家庭药箱数据保存在本机浏览器（localStorage），不会上传服务器；清除浏览器缓存会一并清除。反馈信息仅用于处理问题，请勿提交敏感个人信息。</p>' +
          '<h3>数据与版本</h3>' +
          '<p>内容版本 v' + esc(DATA.version || '1.0') + (gen ? ' · 构建于 ' + gen : '') + ' · 共 ' + ARTICLES.length + ' 篇。</p>' +
        '</div>' +
        '<button class="btn-ghost" data-action="clear-all">清除本机收藏与药箱数据</button>' +
        '<div class="disclaimer">如发现内容有误，欢迎通过「内容反馈」告知我们。</div>' +
      '</main>';
  }

  function viewNotFound() {
    return topbar({ title: '页面不存在', back: true }) +
      '<main class="main"><div class="notfound">' +
        '<div style="font-size:40px">🧭</div>' +
        '<b>没找到这个页面</b><p>链接可能已失效或内容已下线</p>' +
        '<a class="chip-btn" href="#/">返回首页</a>' +
      '</div></main>';
  }

  /* ================= 交互动作 ================= */
  function toggleFav(slug) {
    var favs = getFavs();
    var i = favs.indexOf(slug);
    var added;
    if (i >= 0) {
      favs.splice(i, 1);
      added = false;
      track('favorite_remove', { slug: slug });
      toast('已取消收藏');
    } else {
      favs.push(slug);
      added = true;
      track('favorite_add', { slug: slug });
      toast('已收藏');
    }
    saveFavs(favs);
    var btn = document.querySelector('[data-action="fav-toggle"][data-slug="' + slug + '"]');
    if (btn) {
      btn.classList.toggle('on', added);
      btn.textContent = added ? '★ 已收藏' : '☆ 收藏';
    }
  }

  function shareArticle(slug) {
    var a = BY_SLUG[slug];
    if (!a) return;
    var url = location.href.split('#')[0] + '#/detail/' + slug;
    track('share', { slug: slug });
    var data = { title: a.title + ' · 家庭医药助手', text: a.summary, url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* 用户取消 */ });
      return;
    }
    copyText(url).then(function () {
      toast('链接已复制，可粘贴分享');
    }).catch(function () {
      toast('请手动复制地址栏链接');
    });
  }

  function addKit(data) {
    var items = getKit();
    items.push({
      id: 'k' + Date.now() + Math.random().toString(36).slice(2, 6),
      name: data.name,
      expiry: data.expiry || '',
      note: data.note || '',
      addedAt: Date.now()
    });
    saveKit(items);
  }

  function delKit(id) {
    saveKit(getKit().filter(function (x) { return x.id !== id; }));
    track('kit_remove', {});
    render({ preserveScroll: true, skipTrack: true });
  }

  function clearKit() {
    if (!confirm('确定清空本机药箱数据？此操作不可恢复。')) return;
    try { localStorage.removeItem(STORE.kit); } catch (e) { /* noop */ }
    track('kit_clear', {});
    render({ preserveScroll: true, skipTrack: true });
    toast('已清空药箱');
  }

  function clearAll() {
    if (!confirm('确定清除本机的收藏与药箱数据？此操作不可恢复。')) return;
    try {
      localStorage.removeItem(STORE.fav);
      localStorage.removeItem(STORE.kit);
    } catch (e) { /* noop */ }
    track('clear_local_data', {});
    render();
    toast('已清除本机数据');
  }

  /* ================= 事件委托 ================= */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var trackEl = t.closest('[data-track]');
    if (trackEl) {
      track(trackEl.getAttribute('data-track'), {
        slug: trackEl.getAttribute('data-slug') || '',
        from: trackEl.getAttribute('data-from') || ''
      });
    }

    var el = t.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    switch (action) {
      case 'back':
        e.preventDefault();
        if (history.length > 1) history.back();
        else location.hash = '#/';
        break;
      case 'call120':
        track('call_120', { from: currentPage });
        setTimeout(function () { toast('若未跳转拨号，请手动拨打 120'); }, 300);
        break;
      case 'fav-toggle':
        e.preventDefault();
        toggleFav(el.getAttribute('data-slug'));
        break;
      case 'share':
        e.preventDefault();
        shareArticle(el.getAttribute('data-slug'));
        break;
      case 'font-toggle':
        cycleFont();
        break;
      case 'kit-del':
        delKit(el.getAttribute('data-id'));
        break;
      case 'kit-clear':
        clearKit();
        break;
      case 'clear-search':
        var input = document.getElementById('q');
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
        break;
      case 'copy-feedback':
        copyText(lastFeedbackText).then(function () { toast('已复制反馈内容'); })
          .catch(function () { toast('复制失败，请手动选择文本'); });
        break;
      case 'clear-all':
        clearAll();
        break;
      default:
        break;
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.id === 'kit-form') {
      e.preventDefault();
      var fd = new FormData(form);
      var name = String(fd.get('name') || '').trim();
      if (!name) { toast('请填写药品名称'); return; }
      addKit({
        name: name,
        expiry: String(fd.get('expiry') || ''),
        note: String(fd.get('note') || '').trim()
      });
      track('kit_add', {});
      form.reset();
      render({ preserveScroll: true, skipTrack: true });
      toast('已加入药箱');
    } else if (form.id === 'feedback-form') {
      e.preventDefault();
      submitFeedback(form);
    }
  });

  /* ================= 渲染 ================= */
  function afterRender(page, r, opts) {
    applyFontScale();
    if (page === 'search') initSearch(r.params.q || '');
    if (opts.skipTrack) return;
    if (page === 'home') {
      track('page_view', { page: 'home' });
    } else if (page === 'detail') {
      var a = BY_SLUG[r.parts[1]];
      if (a) track('detail_view', { slug: a.slug, title: a.title });
    } else if (['category', 'kit', 'favorites', 'me', 'feedback', 'about'].indexOf(page) >= 0) {
      track('page_view', { page: page });
    }
  }

  function render(opts) {
    opts = opts || {};
    var y = window.scrollY || window.pageYOffset || 0;
    var r = parseHash();
    var page = r.parts[0] || 'home';
    currentPage = page;

    var html = '';
    var active = '';

    if (page === 'home') {
      html = viewHome(); active = 'home';
    } else if (page === 'category') {
      html = viewCategory(r.parts[1]); active = 'home';
    } else if (page === 'search') {
      html = viewSearch(r.params); active = 'search';
    } else if (page === 'detail') {
      html = viewDetail(r.parts[1]); active = '';
    } else if (page === 'kit') {
      html = viewKit(); active = 'kit';
    } else if (page === 'favorites') {
      html = viewFavorites(); active = 'me';
    } else if (page === 'me') {
      html = viewMe(); active = 'me';
    } else if (page === 'feedback') {
      html = viewFeedback(); active = 'me';
    } else if (page === 'about') {
      html = viewAbout(); active = 'me';
    } else {
      html = viewNotFound();
    }

    app.innerHTML = html + tabbar(active);
    if (opts.preserveScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    afterRender(page, r, opts);
  }

  /* ================= 启动 ================= */
  function init() {
    if (!ARTICLES.length) {
      app.innerHTML = '<div class="main"><div class="empty">' +
        '<div class="big">⚠️</div><b>内容未加载</b>' +
        '<p>请先运行 <code>npm run build</code> 生成内容数据</p></div></div>';
      return;
    }
    applyFontScale();
    window.addEventListener('hashchange', function () { render(); });
    render();
  }

  init();
})();
