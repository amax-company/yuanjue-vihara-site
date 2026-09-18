/* ==========================================================================
   圓覺經舍 — 互動（vanilla JS，零依賴，spec DEC-01）

   本檔只做五件事，全部在 spec §5 有明文：
     1. §5.1.1  手機導覽三態（收合／展開／無 JS）
     2. §5.11   捲動淡入（IntersectionObserver，一次性）
     3. §5.12   燈箱（三種關閉方式、焦點管理、body 鎖捲）
     4. §5.1    目前所在區塊的導覽項標示（選配）
     5. §5.8b   一鍵複製（v2.1；按鈕由本檔注入，故無 JS 時不存在）

   本檔**不得**出現 font-size 字面值與 hex 色碼（spec §4 前言）：
   所有樣式差異一律靠切換 class，由 style.css 以 token 決定外觀。

   降級：`js` class 由 index.html 的 inline script 加上。
   沒有 JS 時不會有任何初始隱藏狀態，內容一次同時完整可見（§5.11）。
   ========================================================================== */

(function () {
  'use strict';

  var body = document.body;
  var SCROLL_LOCK = 'is-scroll-locked';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------------
     共用：可聚焦元素（燈箱焦點困陷用）
     --------------------------------------------------------------------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  /* =====================================================================
     1. §5.1.1 手機導覽
     ===================================================================== */
  var nav = document.querySelector('.site-nav');
  var toggle = nav && nav.querySelector('.site-nav__toggle');
  var menu = document.getElementById('site-nav-menu');
  var tabletQuery = window.matchMedia('(min-width: 768px)');

  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    menu.classList.toggle('is-open', open);
    body.classList.toggle(SCROLL_LOCK, open);
  }

  function menuIsOpen() {
    return !!toggle && toggle.getAttribute('aria-expanded') === 'true';
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(!menuIsOpen());
    });

    /* 點導覽項：關閉面板 -> 捲到該區 -> 焦點移至該區標題（§5.1.1 狀態 B） */
    menu.addEventListener('click', function (event) {
      var link = event.target.closest ? event.target.closest('.site-nav__link') : null;
      if (!link) return;
      if (menuIsOpen()) setMenu(false);
      focusSectionHeading(link.getAttribute('href'));
    });

    /* 桌機寬度時面板不該殘留（避免縮放後 is-open 卡住整個視窗） */
    var onBreakpoint = function (event) {
      if (event.matches && menuIsOpen()) setMenu(false);
    };
    if (tabletQuery.addEventListener) tabletQuery.addEventListener('change', onBreakpoint);
    else if (tabletQuery.addListener) tabletQuery.addListener(onBreakpoint);
  }

  /* 導覽列的每個錨點（含站名與首屏「向下探索」）點擊後，
     把鍵盤焦點送到目標區的標題，避免鍵盤使用者捲動後焦點還留在導覽列。 */
  function focusSectionHeading(hash) {
    if (!hash || hash.charAt(0) !== '#') return;
    var target = document.getElementById(hash.slice(1));
    if (!target) return;
    var heading = target.querySelector('h1, h2');
    var focusTarget = heading || target;
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
    // 讓瀏覽器先完成錨點捲動，再把焦點放上去（focus 本身會再捲一次，
    // 但 scroll-margin-top 會讓兩次落點相同）
    window.setTimeout(function () { focusTarget.focus({ preventScroll: false }); }, 0);
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('.site-nav__brand, .hero__scroll'),
    function (link) {
      link.addEventListener('click', function () {
        focusSectionHeading(link.getAttribute('href'));
      });
    }
  );

  /* =====================================================================
     2. §5.11 捲動淡入（一次性；reduced-motion 時完全不介入）
     ===================================================================== */
  var revealables = document.querySelectorAll('.reveal');

  function revealAll() {
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-visible');
    });
  }

  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    // 沒有 IO 或使用者要求減少動態 -> 直接全部呈現最終狀態，不留任何隱藏內容
    revealAll();
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // 一次性
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });

    Array.prototype.forEach.call(revealables, function (el) { observer.observe(el); });
  }

  /* 使用者中途打開「減少動態效果」時，把還沒淡入的內容立刻攤平 */
  var onReduceChange = function (event) { if (event.matches) revealAll(); };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onReduceChange);
  else if (reduceMotion.addListener) reduceMotion.addListener(onReduceChange);

  /* =====================================================================
     3. §5.12 燈箱
     ===================================================================== */
  var lightbox = document.getElementById('lightbox');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lightboxClose = lightbox && lightbox.querySelector('.lightbox__close');
  var lightboxImg = null;
  var lastTrigger = null;

  function openLightbox(trigger) {
    if (!lightbox || !lightboxCaption) return;
    lastTrigger = trigger;
    if (lightboxImg && lightboxImg.parentNode) lightboxImg.parentNode.removeChild(lightboxImg);
    lightboxImg = document.createElement('img');
    lightboxImg.className = 'lightbox__img';
    lightboxImg.setAttribute('src', trigger.getAttribute('data-lightbox'));
    lightboxImg.setAttribute('alt', trigger.getAttribute('data-lightbox-alt') || '');
    lightboxCaption.parentNode.insertBefore(lightboxImg, lightboxCaption);
    lightboxCaption.textContent = trigger.getAttribute('data-lightbox-caption') || '';
    lightbox.hidden = false;
    body.classList.add(SCROLL_LOCK);
    if (lightboxClose) lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    body.classList.remove(SCROLL_LOCK);
    if (lightboxImg && lightboxImg.parentNode) {
      lightboxImg.parentNode.removeChild(lightboxImg);
      lightboxImg = null;
    }
    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  function lightboxIsOpen() {
    return !!lightbox && !lightbox.hidden;
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-lightbox]'),
    function (trigger) {
      trigger.addEventListener('click', function () { openLightbox(trigger); });
    }
  );

  if (lightbox) {
    /* 關閉方式 1：點遮罩空白處；關閉方式 3：點叉叉
       （兩者都帶 data-lightbox-close，用同一條路徑處理） */
    lightbox.addEventListener('click', function (event) {
      var el = event.target;
      while (el && el !== lightbox) {
        if (el.hasAttribute && el.hasAttribute('data-lightbox-close')) {
          closeLightbox();
          return;
        }
        el = el.parentNode;
      }
    });

    /* 焦點困陷：Tab 不得離開彈層（§5.14、AC-35） */
    lightbox.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var items = focusables(lightbox);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* 關閉方式 2：ESC（修正 demo 缺陷 D-07）。手機選單同樣支援 ESC（§5.1.1 狀態 B） */
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    if (lightboxIsOpen()) {
      closeLightbox();
    } else if (menuIsOpen()) {
      setMenu(false);
      if (toggle) toggle.focus();
    }
  });

  /* =====================================================================
     4. §5.1（選配）目前所在區塊的導覽項以 --c-brown 標示
        只切換 aria-current，顏色由 style.css 決定；導覽列的底色、
        高度、尺寸一律不隨捲動改變（§5.1 明訂不做，AC-31）。
     ===================================================================== */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav__link'));
  var sections = navLinks
    .map(function (link) { return document.getElementById(link.getAttribute('href').slice(1)); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + entry.target.id;
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* =====================================================================
     5. §5.8b 一鍵複製（v2.1，vanilla JS，零依賴 DEC-01）

     ⚠️ 本段註解**刻意不重述 §9 N-06 被限定的字眼**（只允許出現在 index.html 的
        <section id="offering"> 之內，見 tools/verify/check-forbidden.py 的範圍判斷）。
        唯一的例外是下方三個常數：它們是 §附錄 A.8b 指定的介面文字本身，
        由本檔寫進 #offering 內的回饋容器（check-forbidden 對「spec 指定字串」放行，
        不是把檢查關掉 —— 判準與放行清單都由 spec 機械推導）。

     🚨 「複製」按鈕**由本檔注入**，不是寫在 index.html 裡再用 CSS 藏 ——
        §5.8b／§5.11 的明文要求是「無 JS 時本按鈕**不出現**」，
        CSS 藏起來的按鈕在 DOM 裡仍然數得到 1 個（D5 ④ 判準是數量 0），
        而被複製的那一列文字本身一律完整可見、可手動選取
        （它是內容，按鈕只是操作捷徑）。

     三種結果（§5.8b 逐一正面列舉）：
       成功         -> 剪貼簿寫入該列的值（含連字號）＋回饋「已複製」，2 秒後消失
       失敗／不支援 -> 選取該列文字＋回饋 fallback 提示，同樣 2 秒後消失
       reduced-motion -> 與上述**完全相同**的呈現（本功能不帶任何 transition／animation，
                         回饋是純顯示切換，故不需要為 prefers-reduced-motion 加分支）
     🚨 不得靜默失敗：三條路徑都一定會顯示回饋文字。
     ===================================================================== */
  var account = document.querySelector('[data-copy-account]');
  var copySlot = document.querySelector('[data-copy-slot]');
  var copyFeedback = document.querySelector('[data-copy-feedback]');
  /* 三句介面文字依 §附錄 A.8b（PM 擬定、唯一允許的介面文字）：
     不得改成「一鍵複製」「點我複製」等更強的動作語氣（§5.8b 素淨要求、AC-48）；
     fallback 提示不得寫 Ctrl+C（非中文字串，§1.3 未列入允許清單）。 */
  var COPY_LABEL = '複製';
  var COPY_DONE = '已複製';
  var COPY_FALLBACK = '已選取帳號，請手動複製';
  var FEEDBACK_MS = 2000; /* §5.8b：回饋文字 2 秒後消失 */
  var feedbackTimer = null;

  function sayCopyResult(message) {
    if (!copyFeedback) return;
    copyFeedback.textContent = message;
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(function () {
      copyFeedback.textContent = '';
      feedbackTimer = null;
    }, FEEDBACK_MS);
  }

  /* fallback：以 window.getSelection() + Range 選取該列的文字節點（§5.8b）。
     不使用任何第三方套件（DEC-01）。 */
  function selectAccountText() {
    if (!account || typeof window.getSelection !== 'function') return false;
    var selection = window.getSelection();
    if (!selection || typeof document.createRange !== 'function') return false;
    var range = document.createRange();
    range.selectNodeContents(account);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  if (account && copySlot && copyFeedback) {
    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'offering-card__copy';
    /* 按鈕內只有文字 —— 不得放 <svg>／<img>／icon 字元（§5.8b、AC-48） */
    copyButton.textContent = COPY_LABEL;
    copySlot.appendChild(copyButton);

    copyButton.addEventListener('click', function () {
      /* 複製的是**該列的文字內容**（含連字號，逐字依附錄 A.8b）：
         讀 textContent 而非畫面上的排版結果，故 CSS 換行與否都不影響複製字串。 */
      var text = account.textContent.trim();
      var clip = navigator.clipboard;
      if (!clip || typeof clip.writeText !== 'function') {
        selectAccountText();
        sayCopyResult(COPY_FALLBACK);
        return;
      }
      clip.writeText(text).then(function () {
        sayCopyResult(COPY_DONE);
      }, function () {
        /* 非安全情境、權限被拒、Promise reject 一律落到 fallback（§5.8b） */
        selectAccountText();
        sayCopyResult(COPY_FALLBACK);
      });
    });
  }
}());
