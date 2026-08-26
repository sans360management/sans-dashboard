/* ============================================================
   Sans Wellness 26th Anniversary — 嘉宾登记表单
   验证 → POST 到 GHL Inbound Webhook → 成功画面
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = window.SANS26_CONFIG || {};

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  /* ============================================================
     模式二：直接嵌入 GHL 内建表单
     ============================================================ */

  /* ghlFormEmbedUrl 可以是一个网址字串，也可以是 { en, zh } 两份表单 */
  function embedUrlFor(lang) {
    var url = CONFIG.ghlFormEmbedUrl;
    if (!url) return '';
    if (typeof url === 'string') return url;
    return url[lang] || url.en || url.zh || '';
  }

  /* 载入 GHL 官方的 form_embed.js —— 它负责依表单内容自动调整 iframe 高度。
     白标网域优先，失败再退回官方网域。 */
  function loadEmbedScript(formUrl) {
    if (document.getElementById('ghl-embed-script')) return;

    var origin;
    try { origin = new URL(formUrl, location.href).origin; } catch (e) { return; }

    var script = document.createElement('script');
    script.id = 'ghl-embed-script';
    script.src = origin + '/js/form_embed.js';
    script.async = true;
    script.onerror = function () {
      var fallback = document.createElement('script');
      fallback.src = 'https://link.msgsndr.com/js/form_embed.js';
      fallback.async = true;
      document.body.appendChild(fallback);
    };
    document.body.appendChild(script);
  }

  /* 备援：官方脚本没载入时，自己听 iframe 回报的高度 */
  function listenForHeight(frame, formUrl) {
    var origin;
    try { origin = new URL(formUrl, location.href).origin; } catch (e) { return; }

    window.addEventListener('message', function (e) {
      if (e.origin !== origin) return;

      var data = e.data;
      var height = null;
      if (typeof data === 'number') height = data;
      else if (data && typeof data === 'object') height = data.height || (data.payload && data.payload.height);

      height = parseInt(height, 10);
      if (height > 200 && height < 6000) frame.style.height = height + 'px';
    });
  }

  function useGhlIframe(lang) {
    var wrap = document.getElementById('form-iframe-wrap');
    var frame = document.getElementById('ghl-form');
    var custom = document.getElementById('form-card-body');
    var url = embedUrlFor(lang);
    if (!wrap || !frame || !url) return false;

    // GHL 的 form_embed.js 靠这些属性认出 iframe，照它的格式给
    var formId = (url.split('/').pop() || '').split('?')[0];
    frame.id = 'inline-' + formId;
    frame.setAttribute('data-layout', '{"id":"INLINE"}');
    frame.setAttribute('data-trigger-type', 'alwaysShow');
    frame.setAttribute('data-activation-type', 'alwaysActivated');
    frame.setAttribute('data-deactivation-type', 'neverDeactivate');
    frame.setAttribute('data-form-id', formId);
    frame.setAttribute('data-layout-iframe-id', 'inline-' + formId);
    frame.src = url;

    wrap.classList.remove('is-hidden');
    if (custom) custom.classList.add('is-hidden');

    var card = wrap.closest('.form-card');
    if (card) card.classList.add('is-iframe');

    listenForHeight(frame, url);
    loadEmbedScript(url);

    // 切换语言时换成另一份表单（有设定 { en, zh } 才会换）
    document.addEventListener('sans26:langchange', function (e) {
      var next = embedUrlFor(e.detail.lang);
      if (next && next !== frame.src) frame.src = next;
    });

    return true;
  }

  ready(function () {
    if (CONFIG.formMode === 'iframe' && CONFIG.ghlFormEmbedUrl) {
      // 嵌入失败（例如网址填错）就自动退回自订表单，画面不会开天窗
      if (useGhlIframe(window.SANS26.getLang())) return;
    }

    var form = document.getElementById('rsvp-form');
    if (!form) return;

    var t          = window.SANS26.t;
    var pick       = window.SANS26.pick;
    var statusBox  = document.getElementById('form-status');
    var successBox = document.getElementById('form-success');
    var submitBtn  = document.getElementById('form-submit');
    var submitting = false;

    /* ---------- 示范模式提示 ---------- */
    var isDemo = !CONFIG.ghlWebhookUrl;
    if (isDemo) showStatus('f.demoMode', 'is-demo');

    function showStatus(key, cls) {
      if (!statusBox) return;
      statusBox.textContent = t(key);
      statusBox.className = 'form-status ' + cls;
      statusBox.setAttribute('data-status-key', key);
    }

    function clearStatus() {
      if (!statusBox || isDemo) return;
      statusBox.className = 'form-status';
      statusBox.removeAttribute('data-status-key');
    }

    /* 语言切换时，重新翻译提示讯息 */
    document.addEventListener('sans26:langchange', function () {
      if (statusBox && statusBox.getAttribute('data-status-key')) {
        statusBox.textContent = t(statusBox.getAttribute('data-status-key'));
      }
      form.querySelectorAll('.field.has-error .err').forEach(function (el) {
        if (el.getAttribute('data-err-key')) el.textContent = t(el.getAttribute('data-err-key'));
      });
      if (submitBtn && !submitting) submitBtn.textContent = t('f.submit');
    });

    /* ---------- 验证 ---------- */
    function fieldOf(input) { return input.closest('.field'); }

    function setError(input, key) {
      var field = fieldOf(input);
      if (!field) return;
      field.classList.add('has-error');
      var err = field.querySelector('.err');
      if (err) {
        err.setAttribute('data-err-key', key);
        err.textContent = t(key);
      }
    }

    function clearError(input) {
      var field = fieldOf(input);
      if (field) field.classList.remove('has-error');
    }

    function validate() {
      var ok = true;
      var firstBad = null;

      form.querySelectorAll('[data-required]').forEach(function (input) {
        clearError(input);
        var value = (input.value || '').trim();
        var key = null;

        if (!value) {
          key = 'f.errRequired';
        } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          key = 'f.errEmail';
        } else if (input.name === 'phone_local' && !/^\d[\d\s-]{6,14}$/.test(value)) {
          key = 'f.errPhone';
        }

        if (key) {
          ok = false;
          setError(input, key);
          if (!firstBad) firstBad = input;
        }
      });

      if (firstBad) {
        firstBad.focus();
        firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return ok;
    }

    /* 输入时即时清除该栏错误 */
    form.addEventListener('input', function (e) {
      if (e.target.matches('[data-required]')) clearError(e.target);
    });

    /* ---------- 组装送出资料 ---------- */
    function buildPayload() {
      var get = function (name) {
        var el = form.elements[name];
        return el ? (el.value || '').trim() : '';
      };

      var dial  = get('phone_dial').replace(/[^\d+]/g, '');
      var local = get('phone_local').replace(/[^\d]/g, '').replace(/^0+/, '');
      var phone = dial + local;

      var fullName  = get('full_name');
      var nameParts = fullName.split(/\s+/);

      return {
        // GHL 标准联络人栏位
        full_name:    fullName,
        first_name:   nameParts[0] || fullName,
        last_name:    nameParts.slice(1).join(' '),
        phone:        phone,
        email:        get('email'),
        companyName:  get('company'),

        // 活动自订栏位
        main_concern: get('invitation_category'),

        // 来源标记
        event:        'Sans Wellness 26th Anniversary — Free Neckcare Open House',
        event_date:   '2026-09-04',
        form_language: window.SANS26.getLang(),
        source:       'Neckcare 26 Landing Page',
        page_url:     location.href,
        submitted_at: new Date().toISOString(),
      };
    }

    /* ---------- 送出 ---------- */
    function send(payload) {
      var url = CONFIG.ghlWebhookUrl;
      if (!url) return Promise.resolve('demo');

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return 'sent';
      }).catch(function () {
        // 多数情况是浏览器 CORS 拦截了回应（资料其实已经送达 GHL）。
        // 用 no-cors 再送一次，确保收得到，然后当作成功处理。
        return fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(payload),
        }).then(function () { return 'sent-opaque'; });
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return;

      // 蜜罐：机器人填了就假装成功，不送出
      if ((form.elements['website'] && form.elements['website'].value)) {
        showSuccess();
        return;
      }

      if (!validate()) return;

      submitting = true;
      clearStatus();
      submitBtn.disabled = true;
      submitBtn.textContent = t('f.submitting');

      send(buildPayload())
        .then(function () {
          if (CONFIG.redirectAfterSubmit) {
            location.href = CONFIG.redirectAfterSubmit;
            return;
          }
          showSuccess();
        })
        .catch(function () {
          showStatus('f.errSubmit', 'is-error');
        })
        .finally(function () {
          submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = t('f.submit');
        });
    });

    /* ---------- 成功画面 ---------- */
    function showSuccess() {
      var card = document.getElementById('form-card-body');
      if (card) card.classList.add('is-hidden');
      if (successBox) {
        successBox.classList.add('is-on');
        successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setupCalendarButton();
    }

    /* ---------- 加入日历（.ics）---------- */
    function setupCalendarButton() {
      var btn = document.getElementById('add-to-calendar');
      if (!btn) return;

      var ev = CONFIG.event || {};
      if (!ev.startISO) { btn.classList.add('is-hidden'); return; }

      var stamp = function (iso) {
        return iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
      };

      var ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Sans Wellness//Neckcare Open House//EN',
        'BEGIN:VEVENT',
        'UID:sansnc-' + Date.now() + '@sanswellness.com',
        'DTSTART:' + stamp(ev.startISO),
        'DTEND:' + stamp(ev.endISO || ev.startISO),
        'SUMMARY:Sans Wellness 26th Anniversary — Free Neckcare Open House',
        'LOCATION:' + (pick(ev.venue) + ', ' + pick(ev.address)).replace(/,/g, '\\,'),
        'DESCRIPTION:Your free Exclusive Genkilogy NeckFix Therapy session\\, 1-on-1 consultation and 4-in-1 health assessment. See you there.',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      btn.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
      btn.setAttribute('download', 'sans-wellness-neckcare-open-house.ics');
      btn.classList.remove('is-hidden');
    }
  });
})();
