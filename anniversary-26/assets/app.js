/* ============================================================
   Sans Wellness 26th Anniversary — 共用逻辑
   语言切换 / 活动资料注入 / 导航 / 滚动动画
   ============================================================ */
(function () {
  'use strict';

  var DICT   = window.SANS26_I18N   || {};
  var CONFIG = window.SANS26_CONFIG || {};
  var STORE_KEY = 'sans26.lang';

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

    // 文字内容
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n'));
      if (value) el.textContent = value;
    });

    // placeholder
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n-ph'));
      if (value) el.setAttribute('placeholder', value);
    });

    // 活动资料（来自 config.js）
    document.querySelectorAll('[data-event]').forEach(function (el) {
      var value = pick((CONFIG.event || {})[el.getAttribute('data-event')]);
      if (value) el.textContent = value;
    });

    // 只在特定语言显示的元素
    document.querySelectorAll('[data-lang-only]').forEach(function (el) {
      el.style.display = (el.getAttribute('data-lang-only') === lang) ? '' : 'none';
    });

    // 邀请类别下拉
    document.querySelectorAll('[data-category-select]').forEach(function (select) {
      var current = select.value;
      var placeholder = select.querySelector('option[value=""]');
      select.textContent = '';
      if (placeholder) select.appendChild(placeholder);
      (CONFIG.invitationCategories || []).forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat[lang] || cat.en;
        select.appendChild(opt);
      });
      select.value = current;
    });

    // 语言按钮状态
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
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

  /* ---------- 联络资料注入 ---------- */
  function applyContact() {
    var c = CONFIG.contact || {};
    document.querySelectorAll('[data-contact]').forEach(function (el) {
      var value = c[el.getAttribute('data-contact')];
      if (!value) return;
      el.textContent = value;
    });
    document.querySelectorAll('[data-href-tel]').forEach(function (el) {
      if (c.phone) el.href = 'tel:' + c.phone.replace(/[^\d+]/g, '');
    });
    document.querySelectorAll('[data-href-mail]').forEach(function (el) {
      if (c.email) el.href = 'mailto:' + c.email;
    });
    document.querySelectorAll('[data-href-wa]').forEach(function (el) {
      if (c.whatsapp) el.href = 'https://wa.me/' + c.whatsapp.replace(/[^\d]/g, '');
    });
  }

  /* ---------- 导航吸顶阴影 ---------- */
  function initNav() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 滚动淡入 ---------- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
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

  /* ---------- 内部连结保留语言 ---------- */
  function initLangLinks() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-keep-lang]');
      if (!link) return;
      var url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('lang', lang);
      link.setAttribute('href', url.pathname + url.search + url.hash);
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
    applyLang();
    applyContact();
    initNav();
    initReveal();
    initLangButtons();
    initLangLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
