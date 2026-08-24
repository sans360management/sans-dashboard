/* ============================================================
   Sans Wellness · 26 周年「元气肩颈」免费体验会 — 共用逻辑
   语言切换 / 图片 / 影片 / 倒数 / 数字滚动 / 地图 / 滚动动画
   ============================================================ */
(function () {
  'use strict';

  var DICT   = window.SANS26_I18N   || {};
  var CONFIG = window.SANS26_CONFIG || {};
  var STORE_KEY = 'sans26.lang';

  /* 整段贴进 GHL 时，外层会包一个 <div id="sansnc">。
     有它就把所有查询限制在容器内，避免选到 GHL 自己的 .nav / .card 等元素；
     独立网页时 SCOPE 为 null，行为跟原本完全一样。 */
  var SCOPE = null;
  var ROOT = document;
  var FLAG = document.body;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 语言 ---------- */
  function detectLang() {
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
    } catch (e) { /* localStorage 被封锁时忽略 */ }

    var url = new URLSearchParams(location.search).get('lang');
    if (url === 'en' || url === 'zh') return url;

    return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  }

  var lang = detectLang();

  function t(key) {
    var entry = DICT[key];
    if (!entry) return '';
    return entry[lang] || entry.en || '';
  }

  /* 从 config 取双语活动资料，例如 pick(CONFIG.event.date) */
  function pick(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[lang] || value.en || '';
  }

  function applyLang() {
    document.documentElement.lang = (lang === 'zh') ? 'zh-Hans' : 'en';
    document.documentElement.setAttribute('data-lang', lang);

    ROOT.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n'));
      if (value) el.textContent = value;
    });

    ROOT.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n-ph'));
      if (value) el.setAttribute('placeholder', value);
    });

    ROOT.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n-alt'));
      if (value) el.setAttribute('alt', value);
    });

    ROOT.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n-title'));
      if (value) el.setAttribute('title', value);
    });

    // 活动资料（来自 config.js）
    ROOT.querySelectorAll('[data-event]').forEach(function (el) {
      var value = pick((CONFIG.event || {})[el.getAttribute('data-event')]);
      if (value) el.textContent = value;
    });

    ROOT.querySelectorAll('[data-lang-only]').forEach(function (el) {
      el.style.display = (el.getAttribute('data-lang-only') === lang) ? '' : 'none';
    });

    // 「你最想解决的问题」下拉
    ROOT.querySelectorAll('[data-category-select]').forEach(function (select) {
      var current = select.value;
      var placeholder = select.querySelector('option[value=""]');
      select.textContent = '';
      if (placeholder) select.appendChild(placeholder);
      (CONFIG.concerns || CONFIG.invitationCategories || []).forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat[lang] || cat.en;
        select.appendChild(opt);
      });
      select.value = current;
    });

    ROOT.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-set-lang') === lang));
    });

    document.dispatchEvent(new CustomEvent('sans26:langchange', { detail: { lang: lang } }));
  }

  function setLang(next) {
    if (next !== 'en' && next !== 'zh') return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* 忽略 */ }
    applyLang();
  }

  /* ---------- 图片 ----------
     每一张都是选配：档案在就显示，不在就静静降级，页面不破版。 */
  function applyImages() {
    /* window.SANS26_IMAGES 优先 —— 贴进 GHL 后可以直接在那段程式码最上面
       改网址，不必重新打包 */
    var imgs = window.SANS26_IMAGES || CONFIG.images || {};

    function warn(what, url) {
      console.warn('[Sans26] ' + what + ' 载不到，该处已自动降级。网址：', String(url).slice(0, 120));
    }

    /* 主视觉：载入成功才切换到照片版，否则维持「26」图形 fallback */
    var poster = document.getElementById('hero-poster');
    var art = document.getElementById('hero-art');
    if (poster && art && imgs.hero) {
      poster.addEventListener('load', function () { art.classList.add('has-poster'); });
      poster.addEventListener('error', function () {
        art.classList.remove('has-poster');
        warn('主视觉', imgs.hero);
      });
      poster.src = imgs.hero;
    }

    /* 四宫格价值图 / 奖项墙：<figure> 预设 hidden，载好才打开 */
    [
      { img: 'val-poster',    fig: 'val-art',    key: 'valueGrid', label: '价值四宫格' },
      { img: 'awards-poster', fig: 'awards-art', key: 'awards',    label: '奖项墙' },
    ].forEach(function (slot) {
      var el = document.getElementById(slot.img);
      var fig = document.getElementById(slot.fig);
      var url = imgs[slot.key];
      if (!el || !fig || !url) return;
      el.addEventListener('load', function () { fig.hidden = false; });
      el.addEventListener('error', function () { warn(slot.label, url); });
      el.src = url;
    });

    /* 症状卡 / Offer 卡的配图：用 data-img="sym1" 之类指向 config.images */
    ROOT.querySelectorAll('[data-img]').forEach(function (box) {
      var url = imgs[box.getAttribute('data-img')];
      if (!url) return;
      var probe = new Image();
      probe.onload = function () {
        box.style.backgroundImage = 'url("' + url + '")';
        box.classList.add('has-img');
      };
      probe.onerror = function () { warn(box.getAttribute('data-img'), url); };
      probe.src = url;
    });

    ['brand-logo', 'brand-logo-footer'].forEach(function (id) {
      var logo = document.getElementById(id);
      if (!logo || !imgs.logo) return;
      logo.addEventListener('load', function () {
        logo.hidden = false;
        var fb = logo.parentNode.querySelector('.brand__fallback');
        if (fb) fb.hidden = true;
      });
      logo.addEventListener('error', function () { warn('Logo', imgs.logo); });
      logo.src = imgs.logo;
    });
  }

  /* ---------- 影片 ----------
     config.videos 留空 = 该区块整个不出现。
     顾客见证用「点击才载入」的封面，避免一进页面就拉三个 YouTube iframe。 */
  function ytId(value) {
    if (!value) return '';
    var m = String(value).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(value) ? value : '');
  }

  function ytFrame(id, title) {
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&autoplay=1';
    f.title = title || 'Video';
    f.loading = 'lazy';
    f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    return f;
  }

  function applyVideos() {
    var vids = CONFIG.videos || {};
    var imgs = window.SANS26_IMAGES || CONFIG.images || {};

    /* 品牌影片 */
    var brandBox = document.getElementById('brand-video');
    var brandFrame = document.getElementById('brand-video-frame');
    var brandSrc = vids.brand;
    if (brandBox && brandFrame && brandSrc) {
      var id = ytId(brandSrc);
      if (id) {
        makePoster(brandFrame, imgs.brandCover, function () {
          brandFrame.textContent = '';
          brandFrame.appendChild(ytFrame(id, t('about.videoTitle')));
        });
      } else {
        var v = document.createElement('video');
        v.src = brandSrc;
        v.controls = true;
        v.playsInline = true;
        if (imgs.brandCover) v.poster = imgs.brandCover;
        brandFrame.appendChild(v);
      }
      brandBox.hidden = false;
    }

    /* 顾客见证影片 */
    var wrap = document.getElementById('test-videos');
    if (!wrap) return;
    var list = (vids.testimonials || []).map(ytId).filter(Boolean);
    if (!list.length) return;

    list.slice(0, 3).forEach(function (id) {
      var box = document.createElement('div');
      box.className = 'vids__item';
      makePoster(box, 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', function () {
        box.textContent = '';
        box.appendChild(ytFrame(id, t('test.videoTitle')));
      });
      wrap.appendChild(box);
    });
    wrap.hidden = false;
  }

  /* 封面 + 播放钮：按下去才真的载入 iframe */
  function makePoster(container, coverUrl, onPlay) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'playbtn';
    btn.setAttribute('aria-label', 'Play video');
    if (coverUrl) btn.style.backgroundImage = 'url("' + coverUrl + '")';
    btn.innerHTML = '<span class="playbtn__tri" aria-hidden="true"></span>';
    btn.addEventListener('click', onPlay);
    container.appendChild(btn);
  }

  /* ---------- 外部连结（地图 / Waze / 停车影片）---------- */
  function applyLinks() {
    var links = CONFIG.links || {};
    [
      ['map-link', links.googleMaps],
      ['waze-link', links.waze],
      ['park-video-link', links.parkingVideo],
    ].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      if (pair[1]) { el.href = pair[1]; el.hidden = false; }
    });
  }

  /* ---------- 倒数计时 ---------- */
  function initCountdown() {
    var box = document.getElementById('countdown');
    if (!box) return;

    var ev = CONFIG.event || {};
    if (!ev.startISO) { box.hidden = true; return; }

    var start = new Date(ev.startISO).getTime();
    var end = new Date(ev.endISO || ev.startISO).getTime();
    if (isNaN(start)) { box.hidden = true; return; }

    var grid = document.getElementById('cd-grid');
    var msg = document.getElementById('cd-msg');
    var cells = {};
    box.querySelectorAll('[data-cd]').forEach(function (el) {
      cells[el.getAttribute('data-cd')] = el;
    });

    var pad = function (n) { return String(n).padStart(2, '0'); };

    function tick() {
      var diff = start - Date.now();

      if (diff <= 0) {
        if (grid) grid.hidden = true;
        if (msg) {
          msg.setAttribute('data-i18n', Date.now() <= end ? 'cd.live' : 'cd.past');
          msg.textContent = t(msg.getAttribute('data-i18n'));
        }
        return false;
      }

      var s = Math.floor(diff / 1000);
      if (cells.days)  cells.days.textContent  = String(Math.floor(s / 86400));
      if (cells.hours) cells.hours.textContent = pad(Math.floor(s / 3600) % 24);
      if (cells.mins)  cells.mins.textContent  = pad(Math.floor(s / 60) % 60);
      if (cells.secs)  cells.secs.textContent  = pad(s % 60);
      return true;
    }

    if (tick()) {
      setInterval(function () { if (!tick()) { /* 到点后停止更新数字 */ } }, 1000);
    }
  }

  /* ---------- 数字滚动 ---------- */
  function initCountUp() {
    var items = ROOT.querySelectorAll('[data-countup]');
    if (!items.length) return;

    function run(el) {
      var target = parseInt(el.getAttribute('data-countup'), 10) || 0;
      if (REDUCED) { el.textContent = String(target); return; }

      var startedAt = null;
      var DURATION = 1100;

      function step(now) {
        if (startedAt === null) startedAt = now;
        var p = Math.min((now - startedAt) / DURATION, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (REDUCED || !('IntersectionObserver' in window)) return;  // 保留 HTML 里的最终数字

    items.forEach(function (el) { el.textContent = '0'; });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Google 地图 ---------- */
  function initMap() {
    var ev = CONFIG.event || {};
    var query = [pick(ev.venue), pick(ev.address)].filter(Boolean).join(', ');
    if (!query) return;

    var frame = document.getElementById('venue-map');
    if (frame) frame.src = 'https://www.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed';

    /* config.links.googleMaps 优先（applyLinks 已经填过），没有才用地址搜寻 */
    var link = document.getElementById('map-link');
    if (link && !(CONFIG.links || {}).googleMaps) {
      link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
    }
  }


  /* ---------- 导航吸顶 ---------- */
  function initNav() {
    var nav = ROOT.querySelector('.nav');
    if (!nav) return;
    var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 手机版固定登记列 ---------- */
  function initStickyCta() {
    var bar = document.getElementById('sticky-cta');
    var hero = ROOT.querySelector('.hero');
    var rsvp = document.getElementById('rsvp');
    if (!bar || !hero) return;

    var onScroll = function () {
      var pastHero = window.scrollY > hero.offsetHeight * 0.8;
      var inForm = rsvp && rsvp.getBoundingClientRect().top < window.innerHeight * 0.9;
      bar.hidden = !(pastHero && !inForm);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 滚动淡入 ---------- */
  function initReveal() {
    var items = ROOT.querySelectorAll('.reveal');
    if (!items.length) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 语言按钮 ---------- */
  function initLangButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-set-lang]');
      if (!btn) return;
      e.preventDefault();
      setLang(btn.getAttribute('data-set-lang'));
    });
  }

  /* ---------- 对外接口（form.js 使用）---------- */
  window.SANS26 = {
    t: t,
    pick: pick,
    getLang: function () { return lang; },
    setLang: setLang,
  };

  function init() {
    SCOPE = document.getElementById('sansnc');
    ROOT = SCOPE || document;
    FLAG = SCOPE || document.body;

    applyLang();
    applyImages();
    applyVideos();
    applyLinks();
    initMap();
    initNav();
    initReveal();
    initCountdown();
    initCountUp();
    initStickyCta();
    initLangButtons();
    FLAG.classList.add('is-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
