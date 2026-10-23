(function (window, document) {
  'use strict';

  var M = window.LBLetters;
  var R = window.LBLettersRender;

  var MAX_PAGES = 3;
  var MAX_TOTAL_CHARS = 25000;
  var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 1600;
  var ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

  var letter = null;
  var els = {};
  var pageEls = [];
  var selectedId = null;
  var scale = 0.4;
  var saveTimer = 0;
  var longLetterWarned = false;
  var finished = false;

  var undoStack = [];
  var redoStack = [];
  var undoBatchOpen = false;
  var lastUndoState = null;
  var srcPool = Object.create(null);
  var MAX_UNDO = 30;

  function snapshotLetter() {
    var clone = JSON.parse(JSON.stringify(letter));
    clone.objects.forEach(function (o) {
      if (o.src) {
        srcPool[o.id] = o.src;
        o.src = '';
      }
    });
    return JSON.stringify(clone);
  }

  function restoreSnapshot(snapStr) {
    letter = JSON.parse(snapStr);
    letter.objects.forEach(function (o) {
      o.src = srcPool[o.id] || '';
    });
  }

  function pushUndoState() {
    if (lastUndoState === null) return;
    undoStack.push(lastUndoState);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }

  function undo() {
    if (!undoStack.length || finished) return;
    redoStack.push(snapshotLetter());
    restoreSnapshot(undoStack.pop());
    lastUndoState = snapshotLetter();
    select(null);
    cutHints.length = 0;
    render({ scale: true, paper: true, keepCaret: false });
    updateUndoButtons();
    updateInkGroup();
    updateActivePaperDisplay();
    updateActiveFontDisplay();
    els.foldsBtn.setAttribute('aria-pressed', letter.folds ? 'true' : 'false');
    M.saveDraft(letter);
  }

  function redo() {
    if (!redoStack.length || finished) return;
    undoStack.push(snapshotLetter());
    restoreSnapshot(redoStack.pop());
    lastUndoState = snapshotLetter();
    select(null);
    cutHints.length = 0;
    render({ scale: true, paper: true, keepCaret: false });
    updateUndoButtons();
    updateInkGroup();
    updateActivePaperDisplay();
    updateActiveFontDisplay();
    els.foldsBtn.setAttribute('aria-pressed', letter.folds ? 'true' : 'false');
    M.saveDraft(letter);
  }

  function updateUndoButtons() {
    if (els.undoBtn) els.undoBtn.disabled = !undoStack.length;
    if (els.redoBtn) els.redoBtn.disabled = !redoStack.length;
  }

  function icon(paths, width) {
    return '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="' + (width || 2) +
      '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  var ICONS = {
    photo: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
    strip: icon('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M7 9h10M7 15h10"/>'),
    sticker: icon('<path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z"/><path d="M14 21v-5a2 2 0 0 1 2-2h5"/>'),
    details: icon('<path d="M4 6h16M4 12h14M4 18h10"/>'),
    close: icon('<path d="M18 6 6 18M6 6l12 12"/>', 2.5),
    rotateLeft: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    rotateRight: icon('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    trash: icon('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
    resize: icon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 2.5),
    rotate: icon('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>', 2.5),
    alignLeft: icon('<path d="M4 6h16M4 12h10M4 18h13"/>', 2.5),
    alignCenter: icon('<path d="M4 6h16M7 12h10M6 18h12"/>', 2.5),
    alignRight: icon('<path d="M4 6h16M10 12h10M7 18h13"/>', 2.5),
    send: icon('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
    video: icon('<path d="m23 7-7 5 7 5V7Z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
    download: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
    doc: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>'),
    finish: icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
    undo: icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
    redo: icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5a5.5 5.5 0 0 0 5.5 5.5H13"/>')
  };

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  var STUDIO_INFO_ICON =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  (function initStudioPillHook() {
    function wrapShowPill() {
      if (typeof window.showPillMessage !== 'function' || window.__lbStudioPillHooked) return;
      var origShowPill = window.showPillMessage;
      window.showPillMessage = function (msg, opts) {
        var options = Object.assign({}, opts);
        var type = options.type || 'info';
        var text = String(msg || '');
        var isError = type === 'error' || /error|fail|denied|problem|unable|wrong|blocked|cannot|could not/i.test(text);
        var isWarning = type === 'warning' || /warning|caution|wait|slow|hold/i.test(text);
        var isSaveShare = !isError && !isWarning && /save|saved|share|shared|download|copied/i.test(text);
        var finalType = isError ? 'error' : (isWarning ? 'warning' : (isSaveShare ? 'success' : type));
        if (finalType === 'info' && !options.iconHTML) {
          options.iconHTML = STUDIO_INFO_ICON;
        }
        return origShowPill(msg, options);
      };
      window.__lbStudioPillHooked = true;
    }
    wrapShowPill();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wrapShowPill);
    }
  })();

  function toast(message, kind, customIcon) {
    var resolvedKind = kind || 'info';
    var opts = { type: resolvedKind, duration: resolvedKind === 'error' ? 3200 : 2500 };
    if (customIcon) {
      opts.iconHTML = customIcon;
    } else if (resolvedKind === 'info') {
      opts.iconHTML = STUDIO_INFO_ICON;
    }
    if (typeof window.showPillMessage === 'function') {
      window.showPillMessage(message, opts);
    } else if (window.LBExport && window.LBExport.toast) {
      window.LBExport.toast(message, resolvedKind);
    }
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_e) {
      return false;
    }
  }

  function scheduleSave() {
    if (!undoBatchOpen) {
      undoBatchOpen = true;
      pushUndoState();
    }
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = 0;
      undoBatchOpen = false;
      lastUndoState = snapshotLetter();
      M.saveDraft(letter);
    }, 600);
  }

  function applyPaper(sheet) {
    var paper = M.paper(letter.paper);
    sheet.style.setProperty('--paper-base', paper.base);
    sheet.style.setProperty('--paper-fiber-opacity', String(paper.fiber));
    sheet.style.setProperty('--paper-grain-opacity', String(paper.grain));
    sheet.style.setProperty('--paper-edge', paper.edge);
    sheet.style.setProperty('--paper-vignette', String(paper.vignette));

    var rules = sheet.querySelector('.lb-paper-rules');
    var rule = R.ruleGeometry(letter);
    if (rule) {
      sheet.style.setProperty('--paper-rule-color', rule.color);
      sheet.style.setProperty('--paper-rule-gap', rule.gap + 'px');
      sheet.style.setProperty('--paper-rule-offset', rule.offset + 'px');
      sheet.style.setProperty('--paper-margin-color', rule.margin);
      rules.hidden = false;
    } else {
      rules.hidden = true;
    }

    sheet.querySelector('.lb-paper-folds').hidden = !letter.folds;
    sheet.querySelector('.lb-paper-vignette').hidden = paper.vignette <= 0;
  }

  function buildPages() {
    while (pageEls.length > letter.pages.length) {
      var dead = pageEls.pop();
      dead.root.parentNode.removeChild(dead.root);
    }
    while (pageEls.length < letter.pages.length) {
      pageEls.push(buildPage(pageEls.length));
    }
    for (var i = 0; i < pageEls.length; i++) {
      pageEls[i].number.textContent = letter.pages.length > 1
        ? 'Page ' + (i + 1) + ' of ' + letter.pages.length
        : '';
      pageEls[i].body.setAttribute(
        'aria-label',
        letter.pages.length > 1 ? 'Letter text, page ' + (i + 1) : 'Letter text'
      );
    }
  }

  function buildPage(index) {
    var root = el('div', 'lt-page');
    var inner = el('div', 'lt-page-inner');
    inner.style.width = M.STAGE_W + 'px';
    inner.style.height = M.STAGE_H + 'px';

    var behind = el('div', 'lt-objects lt-objects--behind');
    var front = el('div', 'lt-objects lt-objects--front');

    var sheet = el('div', 'lb-paper lt-sheet');
    sheet.style.left = M.BLEED + 'px';
    sheet.style.top = M.BLEED + 'px';
    sheet.style.width = M.PAGE_W + 'px';
    sheet.style.height = M.PAGE_H + 'px';
    sheet.appendChild(el('div', 'lb-paper-rules'));
    sheet.appendChild(el('div', 'lb-paper-vignette'));
    sheet.appendChild(el('div', 'lb-paper-folds'));

    var content = el('div', 'lb-paper-content lt-sheet-body');
    var date = el('div', 'lt-head lt-head--date');
    var greeting = el('div', 'lt-head lt-head--greeting');
    var sign = el('div', 'lt-sign');

    var body = document.createElement('textarea');
    body.className = 'lt-body';
    body.setAttribute('spellcheck', 'false');
    body.setAttribute('autocapitalize', 'sentences');
    body.placeholder = index === 0 ? 'Start writing…' : '';

    content.appendChild(date);
    content.appendChild(greeting);
    content.appendChild(body);
    content.appendChild(sign);
    sheet.appendChild(content);

    inner.appendChild(behind);
    inner.appendChild(sheet);
    inner.appendChild(front);

    var number = el('div', 'lt-page-number');
    root.appendChild(inner);
    root.appendChild(number);
    els.stage.appendChild(root);

    var isMobile = window.innerWidth < 600;
    var bleedOffset = isMobile ? Math.round(M.BLEED * scale) : 0;
    root.style.width = (isMobile ? Math.round(M.PAGE_W * scale) : Math.round(M.STAGE_W * scale)) + 'px';
    root.style.height = (isMobile ? Math.round(M.PAGE_H * scale) : Math.round(M.STAGE_H * scale)) + 'px';
    inner.style.left = (-bleedOffset) + 'px';
    inner.style.top = (-bleedOffset) + 'px';
    applyPaper(sheet);

    var page = {
      index: index,
      root: root,
      inner: inner,
      sheet: sheet,
      behind: behind,
      front: front,
      body: body,
      date: date,
      greeting: greeting,
      sign: sign,
      number: number
    };

    body.addEventListener('input', onBodyInput);
    body.addEventListener('focus', function () { select(null); });

    sheet.addEventListener('pointerdown', function (e) {
      if (e.target === sheet || e.target.classList.contains('lt-sheet-body')) {
        body.focus();
      }
    });

    return page;
  }

  function pageIndexOf(textarea) {
    for (var i = 0; i < pageEls.length; i++) {
      if (pageEls[i].body === textarea) return i;
    }
    return 0;
  }

  function computeScale() {
    var w = window.innerWidth;
    var gutter = 2 * parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--space-page-gutter') || '24'
    ) || 48;

    if (w < 600) {

      var mobilePaperW = Math.max(280, w - (w < 380 ? 24 : 36));
      return clampScale(mobilePaperW / M.PAGE_W);
    }

    if (w < 900) {

      var availableW = Math.max(240, w - gutter);
      return clampScale(availableW / M.STAGE_W);
    }

    var desktopTargetStageW = Math.min(780, Math.max(720, w * 0.50));
    return clampScale(desktopTargetStageW / M.STAGE_W);
  }

  function clampScale(value) {
    return Math.max(0.16, Math.min(value, 0.78));
  }

  function syncDockWidth() {
    if (!els.dock || !els.controls) return;
    if (window.innerWidth > 820) {
      var cw = els.controls.getBoundingClientRect().width;
      if (cw > 0) els.dock.style.width = Math.round(cw) + 'px';
    } else {
      els.dock.style.width = '';
    }
  }

  function applyScale() {
    scale = computeScale();
    els.app.style.setProperty('--lt-scale', String(scale));
    var isMobile = window.innerWidth < 600;
    var bleedOffset = isMobile ? Math.round(M.BLEED * scale) : 0;
    var w = isMobile ? Math.round(M.PAGE_W * scale) : Math.round(M.STAGE_W * scale);
    var h = isMobile ? Math.round(M.PAGE_H * scale) : Math.round(M.STAGE_H * scale);
    for (var i = 0; i < pageEls.length; i++) {
      pageEls[i].root.style.width = w + 'px';
      pageEls[i].root.style.height = h + 'px';
      pageEls[i].inner.style.left = (-bleedOffset) + 'px';
      pageEls[i].inner.style.top = (-bleedOffset) + 'px';
    }
    syncDockWidth();
  }

  function applyType() {
    var info = R.layout(letter);
    var t = info.type;

    for (var i = 0; i < pageEls.length; i++) {
      var p = pageEls[i];
      var page = info.pages[i];
      if (!page) continue;

      var s = p.body.style;
      s.fontFamily = t.family;
      s.fontWeight = String(t.weight);
      s.fontSize = t.fontSize + 'px';
      s.lineHeight = t.lineHeight + 'px';
      s.color = t.color;
      s.textAlign = t.align;
      s.left = page.bodyX + 'px';
      s.top = page.bodyY + 'px';
      s.width = page.bodyWidth + 'px';
      s.height = page.bodyHeight + 'px';

      renderHeads(p, page, info);

      p.sign.style.fontFamily = t.family;
      p.sign.style.fontWeight = String(t.weight);
      p.sign.style.fontSize = t.fontSize + 'px';
      p.sign.style.lineHeight = t.lineHeight + 'px';
      p.sign.style.color = t.color;
      p.sign.style.left = page.bodyX + 'px';
      p.sign.style.top = page.signY + 'px';
      p.sign.style.width = page.bodyWidth + 'px';
      p.sign.textContent = page.signLines.join('\n');
      p.sign.hidden = !page.signLines.length;
    }

    return info;
  }

  function renderHeads(p, page, info) {
    var t = info.type;
    var slots = [p.date, p.greeting];

    for (var i = 0; i < slots.length; i++) {
      var node = slots[i];
      var spec = page.head[i];
      if (!spec) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      node.textContent = spec.text;
      node.style.fontFamily = t.family;
      node.style.fontWeight = String(t.weight);
      node.style.fontSize = spec.size + 'px';
      node.style.lineHeight = t.lineHeight + 'px';
      node.style.color = t.color;
      node.style.left = page.bodyX + 'px';
      node.style.top = spec.y + 'px';
      node.style.width = page.bodyWidth + 'px';
      node.style.textAlign = spec.align;
    }
  }

  function findCut(text, opts, capacity, hint) {
    if (hint > 0) {
      var nudged = nudgeCut(text, opts, capacity, hint);
      if (nudged !== null) return nudged;
    }

    var limit = Math.min(text.length, Math.max(64, Math.round((hint || 512) * 1.4) + 64));

    while (R.measureHeight(text.slice(0, limit), opts) <= capacity) {
      if (limit >= text.length) return text.length;
      limit = Math.min(text.length, limit * 2);
    }

    var lo = 0;
    var hi = limit;
    var best = 0;

    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (R.measureHeight(text.slice(0, mid), opts) <= capacity) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return best > 0 ? best : 1;
  }

  function pagesForCount(count) {
    var probe = {
      type: letter.type,
      meta: letter.meta,
      pages: new Array(count)
    };
    for (var i = 0; i < count; i++) probe.pages[i] = { body: '' };
    return R.layout(probe);
  }

  function nudgeCut(text, opts, capacity, hint) {
    var MAX_STEPS = 40;
    var at = Math.min(hint, text.length);
    var i;

    if (R.measureHeight(text.slice(0, at), opts) <= capacity) {
      for (i = 0; i < MAX_STEPS; i++) {
        if (at >= text.length) return text.length;
        if (R.measureHeight(text.slice(0, at + 1), opts) > capacity) return at;
        at++;
      }
      return null;
    }

    for (i = 0; i < MAX_STEPS; i++) {
      if (at <= 0) return null;
      if (R.measureHeight(text.slice(0, at - 1), opts) <= capacity) return at - 1;
      at--;
    }
    return null;
  }

  var cutHints = [];

  function fillPages(text, assumedCount, startIndex) {
    var info = pagesForCount(Math.max(1, assumedCount));
    var out = [];
    var rest = text;

    while (true) {
      var page = startIndex + out.length;
      var idx = Math.min(page, info.pages.length - 1);
      var opts = R.bodyOpts(info, idx);
      var capacity = info.pages[idx].bodyHeight;

      var cut = findCut(rest, opts, capacity, cutHints[page]);
      cutHints[page] = cut;

      if (cut >= rest.length) {
        out.push(rest);
        break;
      }

      if (page >= MAX_PAGES - 1) {

        out.push(rest.slice(0, cut));
        break;
      }

      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }

    cutHints.length = startIndex + out.length;
    return out;
  }

  function reflow(fromPage) {
    var start = Math.max(0, Math.min(fromPage || 0, letter.pages.length - 1));
    var i;

    var head = letter.pages.slice(0, start);
    var tail = '';
    for (i = start; i < letter.pages.length; i++) tail += letter.pages[i].body;

    var passes = letter.meta.from ? 4 : 1;
    var count = letter.pages.length;
    var filled = null;

    for (var pass = 0; pass < passes; pass++) {
      filled = fillPages(tail, count, start);
      if (start + filled.length === count) break;
      count = start + filled.length;
    }

    var total = start + filled.length;

    if (total >= MAX_PAGES && !longLetterWarned) {
      longLetterWarned = true;
      toast('You have reached the maximum letter length.', 'warning');
    }

    var changed = total !== letter.pages.length;
    var next = head.slice();
    for (i = 0; i < filled.length; i++) {
      var page = start + i;
      if (letter.pages[page] && letter.pages[page].body !== filled[i]) changed = true;
      next.push({ body: filled[i] });
    }
    letter.pages = next;

    return changed;
  }

  function caretOffset() {
    var active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains('lt-body')) return null;

    var index = pageIndexOf(active);
    var offset = active.selectionStart || 0;
    for (var i = 0; i < index; i++) offset += letter.pages[i].body.length;
    return offset;
  }

  function restoreCaret(offset) {
    if (offset == null) return;
    var remaining = offset;
    for (var i = 0; i < letter.pages.length; i++) {
      var len = letter.pages[i].body.length;
      if (remaining <= len || i === letter.pages.length - 1) {
        var target = pageEls[i];
        if (!target) return;
        if (document.activeElement !== target.body) target.body.focus({ preventScroll: true });
        try {
          target.body.setSelectionRange(remaining, remaining);
        } catch (_e) {}
        target.body.scrollTop = 0;
        return;
      }
      remaining -= len;
    }
  }

  function syncTextareas() {
    for (var i = 0; i < pageEls.length; i++) {
      if (pageEls[i].body.value !== letter.pages[i].body) {
        pageEls[i].body.value = letter.pages[i].body;
      }
      pageEls[i].body.scrollTop = 0;
    }
  }

  function render(opts) {
    opts = opts || {};
    var caret = opts.keepCaret === false ? null : caretOffset();

    reflow(opts.from);
    buildPages();
    if (opts.scale) applyScale();
    applyType();
    syncTextareas();

    if (opts.paper) {
      for (var i = 0; i < pageEls.length; i++) applyPaper(pageEls[i].sheet);
    }

    syncObjects();
    if (caret != null) restoreCaret(caret);
  }

  function onBodyInput(e) {
    var index = pageIndexOf(e.target);
    var val = e.target.value;

    var otherChars = 0;
    for (var p = 0; p < letter.pages.length; p++) {
      if (p !== index) otherChars += letter.pages[p].body.length;
    }
    if (otherChars + val.length > MAX_TOTAL_CHARS) {
      var allowed = Math.max(0, MAX_TOTAL_CHARS - otherChars);
      val = val.slice(0, allowed);
      e.target.value = val;
      toast('Your letter has reached the maximum character limit.', 'warning');
    }

    letter.pages[index].body = val;
    render({ from: index });
    scheduleSave();
  }

  var objectEls = Object.create(null);

  function syncObjects() {
    var seen = Object.create(null);
    var i;

    for (i = 0; i < letter.objects.length; i++) {
      var obj = letter.objects[i];
      seen[obj.id] = true;
      var node = objectEls[obj.id];
      if (!node) {
        node = buildObject(obj);
        objectEls[obj.id] = node;
      }
      positionObject(node, obj);
    }

    for (var id in objectEls) {
      if (!seen[id]) {
        var dead = objectEls[id];
        if (dead.parentNode) dead.parentNode.removeChild(dead);
        delete objectEls[id];
      }
    }
  }

  function buildObject(obj) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'lt-obj lt-obj--' + obj.kind;
    node.setAttribute('data-id', obj.id);

    var frame = el('div', 'lt-obj-frame');
    if (obj.kind === 'deco') {
      if (obj.src) {
        var img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = obj.src;
        img.onerror = function () {
          if (this.src.indexOf('.webp') !== -1) {
            this.src = this.src.replace(/\.webp$/, '.png');
          }
        };
        frame.appendChild(img);
      } else {
        var canvas = document.createElement('canvas');
        frame.appendChild(canvas);
      }
    } else {
      var img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = obj.src;
      frame.appendChild(img);
    }

    node.appendChild(frame);
    node.appendChild(el('div', 'lt-obj-outline'));

    var resize = el('span', 'lt-handle lt-handle--resize', ICONS.resize);
    resize.setAttribute('data-handle', 'resize');
    var rotate = el('span', 'lt-handle lt-handle--rotate', ICONS.rotate);
    rotate.setAttribute('data-handle', 'rotate');
    node.appendChild(resize);
    node.appendChild(rotate);

    node.addEventListener('pointerdown', onObjectPointerDown);
    node.addEventListener('keydown', onObjectKeyDown);
    node.addEventListener('click', function (e) {
      e.preventDefault();
      select(obj.id);
    });

    return node;
  }

  function positionObject(node, obj) {
    var page = pageEls[obj.page] || pageEls[0];
    if (!page) return;

    var host = obj.z < 0 ? page.behind : page.front;
    if (node.parentNode !== host) host.appendChild(node);

    var h = obj.w * obj.ratio;
    var frameFooter = obj.kind === 'photo' ? obj.w * 0.06 : 0;

    node.style.width = obj.w + 'px';
    node.style.height = (h + frameFooter) + 'px';
    node.style.left = (obj.x - obj.w / 2) + 'px';
    node.style.top = (obj.y - (h + frameFooter) / 2) + 'px';
    node.style.transform = 'rotate(' + obj.rot + 'deg)';
    node.style.zIndex = String(Math.max(1, obj.z + 50));

    var onScreen = Math.max(18, Math.min(30, obj.w * scale * 0.34));
    node.style.setProperty('--lt-handle-size', (onScreen / scale) + 'px');

    var frame = node.querySelector('.lt-obj-frame');
    if (obj.kind === 'photo') {

      var b = obj.w * 0.05;
      frame.style.padding = b + 'px ' + b + 'px ' + (b * 2.2) + 'px';
      var img = frame.querySelector('img');
      if (img) {
        img.style.left = b + 'px';
        img.style.top = b + 'px';
        img.style.width = (obj.w - b * 2) + 'px';
        img.style.height = (h - b * 2) + 'px';
      }
    } else if (obj.kind === 'strip') {
      var sb = obj.w * 0.045;
      var simg = frame.querySelector('img');
      if (simg) {
        simg.style.left = sb + 'px';
        simg.style.top = sb + 'px';
        simg.style.width = (obj.w - sb * 2) + 'px';
        simg.style.height = (h - sb * 2) + 'px';
      }
    } else {
      paintDecoObject(node, obj, h);
    }

    node.setAttribute('aria-label', describeObject(obj));
  }

  function paintDecoObject(node, obj, h) {
    var canvas = node.querySelector('canvas');
    if (!canvas) return;

    var w = Math.round(obj.w);
    var ht = Math.round(h);
    if (canvas.width !== w || canvas.height !== ht) {
      canvas.width = w;
      canvas.height = ht;
    }
    canvas.style.width = obj.w + 'px';
    canvas.style.height = h + 'px';

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, ht);

    R.paintDecoration(ctx, obj.deco, w / 2, ht / 2, w, ht, 0);
  }

  function describeObject(obj) {
    var what = obj.kind === 'deco'
      ? decoName(obj.deco)
      : (obj.kind === 'strip' ? 'Photo strip' : 'Photo');
    return what + ', ' + Math.round(obj.w / M.PAGE_W * 100) + '% of the page wide' +
      (obj.z < 0 ? ', behind the paper' : '');
  }

  function decoName(id) {
    for (var i = 0; i < M.DECORATIONS.length; i++) {
      if (M.DECORATIONS[i].id === id) return M.DECORATIONS[i].name;
    }
    return 'Sticker';
  }

  function select(id) {
    if (selectedId === id) return;
    selectedId = id;

    for (var key in objectEls) {
      objectEls[key].classList.toggle('is-selected', key === id);
    }

    els.objTools.hidden = !id;

    if (id) raiseWithinLayer(M.getObject(letter, id));
  }

  function raiseWithinLayer(obj) {
    if (!obj) return;

    var range = M.zRange(letter);
    var top = obj.z < 0 ? -1 : range.max + 1;
    if (obj.z === top) return;

    obj.z = top;
    syncObjects();
    scheduleSave();
  }

  var gesture = null;
  var pointers = Object.create(null);

  function toDesignUnits(clientX, clientY, pageIndex) {
    var page = pageEls[pageIndex] || pageEls[0];
    var rect = page.inner.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  }

  function onObjectPointerDown(e) {
    var node = e.currentTarget;
    var id = node.getAttribute('data-id');
    var obj = M.getObject(letter, id);
    if (!obj) return;

    select(id);

    var handle = e.target.getAttribute && e.target.getAttribute('data-handle');
    var handleNode = e.target.closest ? e.target.closest('[data-handle]') : null;
    if (!handle && handleNode) handle = handleNode.getAttribute('data-handle');

    var point = toDesignUnits(e.clientX, e.clientY, obj.page);

    pointers[e.pointerId] = point;
    var ids = Object.keys(pointers);

    if (ids.length === 2) {
      startPinch(obj, ids);
    } else {
      gesture = {
        mode: handle || 'move',
        id: id,
        pointerId: e.pointerId,
        startX: point.x,
        startY: point.y,
        objX: obj.x,
        objY: obj.y,
        objW: obj.w,
        objRot: obj.rot,
        startAngle: Math.atan2(point.y - obj.y, point.x - obj.x),
        startDist: Math.hypot(point.x - obj.x, point.y - obj.y) || 1
      };
    }

    try { (handleNode || node).setPointerCapture(e.pointerId); } catch (_e) {}
    e.preventDefault();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function startPinch(obj, ids) {
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    gesture = {
      mode: 'pinch',
      id: obj.id,
      ids: ids,
      objW: obj.w,
      objRot: obj.rot,
      objX: obj.x,
      objY: obj.y,
      startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      startAngle: Math.atan2(b.y - a.y, b.x - a.x),
      startMidX: (a.x + b.x) / 2,
      startMidY: (a.y + b.y) / 2
    };
  }

  function onPointerMove(e) {
    if (!gesture) return;
    var obj = M.getObject(letter, gesture.id);
    if (!obj) return;

    var point = toDesignUnits(e.clientX, e.clientY, obj.page);
    pointers[e.pointerId] = point;

    if (gesture.mode === 'pinch') {
      var a = pointers[gesture.ids[0]];
      var b = pointers[gesture.ids[1]];
      if (!a || !b) return;
      var dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      var angle = Math.atan2(b.y - a.y, b.x - a.x);
      obj.w = clampWidth(gesture.objW * (dist / gesture.startDist));
      obj.rot = gesture.objRot + ((angle - gesture.startAngle) * 180) / Math.PI;
      obj.x = gesture.objX + ((a.x + b.x) / 2 - gesture.startMidX);
      obj.y = gesture.objY + ((a.y + b.y) / 2 - gesture.startMidY);
    } else if (gesture.mode === 'resize') {
      var d = Math.hypot(point.x - obj.x, point.y - obj.y);
      obj.w = clampWidth(gesture.objW * (d / gesture.startDist));
    } else if (gesture.mode === 'rotate') {
      var ang = Math.atan2(point.y - obj.y, point.x - obj.x);
      obj.rot = gesture.objRot + ((ang - gesture.startAngle) * 180) / Math.PI;
    } else {
      obj.x = gesture.objX + (point.x - gesture.startX);
      obj.y = gesture.objY + (point.y - gesture.startY);
    }

    clampPosition(obj);
    positionObject(objectEls[obj.id], obj);
    e.preventDefault();
  }

  function onPointerUp(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length === 0) {
      if (gesture) scheduleSave();
      gesture = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    }
  }

  function clampWidth(w) {
    return Math.max(M.PAGE_W * 0.06, Math.min(w, M.PAGE_W * 1.05));
  }

  function clampPosition(obj) {
    var margin = obj.w * 0.35;
    obj.x = Math.max(margin, Math.min(obj.x, M.STAGE_W - margin));
    obj.y = Math.max(margin, Math.min(obj.y, M.STAGE_H - margin));
  }

  function onObjectKeyDown(e) {
    var id = e.currentTarget.getAttribute('data-id');
    var obj = M.getObject(letter, id);
    if (!obj) return;

    var step = e.shiftKey ? 40 : 12;
    var handled = true;

    switch (e.key) {
      case 'ArrowLeft': obj.x -= step; break;
      case 'ArrowRight': obj.x += step; break;
      case 'ArrowUp': obj.y -= step; break;
      case 'ArrowDown': obj.y += step; break;
      case '+': case '=': obj.w = clampWidth(obj.w * 1.08); break;
      case '-': case '_': obj.w = clampWidth(obj.w / 1.08); break;
      case '[': obj.rot -= 3; break;
      case ']': obj.rot += 3; break;
      case 'Delete': case 'Backspace': deleteSelected(); return;
      case 'Escape': select(null); e.currentTarget.blur(); return;
      default: handled = false;
    }

    if (!handled) return;
    e.preventDefault();
    select(id);
    clampPosition(obj);
    positionObject(objectEls[id], obj);
    scheduleSave();
  }

  function withSelected(fn) {
    var obj = selectedId ? M.getObject(letter, selectedId) : null;
    if (!obj) return;
    fn(obj);
    clampPosition(obj);
    positionObject(objectEls[obj.id], obj);
    scheduleSave();
  }

  function deleteSelected() {
    if (!selectedId) return;
    M.removeObject(letter, selectedId);
    var node = objectEls[selectedId];
    if (node && node.parentNode) node.parentNode.removeChild(node);
    delete objectEls[selectedId];
    select(null);
    scheduleSave();
    toast('Removed.', 'info');
  }

  function addImageObject(src, ratio, kind, widthFactor) {
    var obj = M.addObject(letter, {
      kind: kind,
      src: src,
      ratio: ratio,
      page: currentPageIndex(),
      w: M.PAGE_W * (widthFactor || (kind === 'strip' ? 0.34 : 0.42))
    });
    if (!obj) {
      toast('Maximum stickers and photos reached (30).', 'warning');
      return null;
    }
    syncObjects();
    select(obj.id);
    scheduleSave();
    return obj;
  }

  function currentPageIndex() {
    var best = 0;
    var bestDist = Infinity;
    var mid = window.innerHeight / 2;
    for (var i = 0; i < pageEls.length; i++) {
      var rect = pageEls[i].root.getBoundingClientRect();
      var dist = Math.abs(rect.top + rect.height / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function sniffType(bytes) {
    if (bytes.length < 12) return null;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
    return null;
  }

  function readHeader(file) {
    return new Promise(function (resolve) {
      var slice = file.slice(0, 12);
      if (slice.arrayBuffer) {
        slice.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, function () { resolve(new Uint8Array(0)); });
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { resolve(new Uint8Array(0)); };
      reader.readAsArrayBuffer(slice);
    });
  }

  function importFile(file) {
    if (!file) return Promise.reject(new Error('empty'));

    if (file.size > MAX_UPLOAD_BYTES) {
      return Promise.reject(new Error('too-large'));
    }

    if (window.LBInputGuard) {
      return window.LBInputGuard.checkImage(file, { maxBytes: MAX_UPLOAD_BYTES }).then(function (check) {
        if (!check.ok) throw new Error(check.reason === 'too-large' ? 'too-large' : 'unsupported');
        return decodeAndShrink(file);
      });
    }

    return readHeader(file).then(function (header) {
      var sniffed = sniffType(header);
      if (!sniffed || ACCEPTED_TYPES.indexOf(sniffed) === -1) {
        throw new Error('unsupported');
      }
      return decodeAndShrink(file);
    });
  }

  function decodeAndShrink(file) {
    var url = URL.createObjectURL(file);

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('corrupt')); };
      img.src = url;
    }).then(function (img) {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      if (!w || !h) throw new Error('corrupt');

      var k = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), ratio: h / w };
    }).then(function (result) {
      URL.revokeObjectURL(url);
      return result;
    }, function (err) {
      URL.revokeObjectURL(url);
      throw err;
    });
  }

  function handleFiles(files, kind) {
    if (!files || !files.length) return;

    var list = Array.prototype.slice.call(files, 0, 8);
    var chain = Promise.resolve();
    var failures = 0;

    list.forEach(function (file) {
      chain = chain
        .then(function () { return importFile(file); })
        .then(function (result) {
          addImageObject(result.dataUrl, result.ratio, kind);
        })
        .catch(function (err) {
          failures++;
          reportImportError(err);
        });
    });

    chain.then(function () {
      if (failures < list.length) scheduleSave();
    });
  }

  function reportImportError(err) {
    var reason = err && err.message;
    if (reason === 'too-large') {
      toast('That image is too big. Try one under 10 MB.', 'error');
    } else if (reason === 'unsupported') {
      toast('That file is not a JPG or PNG.', 'error');
    } else {
      toast('Something went wrong while adding that photo.', 'error');
    }
  }

  function loadStrips() {
    var jobs = [loadAccountStrips(), loadGuestStrips()];
    return Promise.all(jobs).then(function (lists) {
      return lists[0].concat(lists[1]);
    });
  }

  var signedInPromise = null;

  function isSignedIn() {
    if (signedInPromise) return signedInPromise;

    signedInPromise = fetch('/auth/me', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return !!(data && data.user); })
      .catch(function () { return false; });

    return signedInPromise;
  }

  function loadAccountStrips() {
    return isSignedIn()
      .then(function (signedIn) {
        if (!signedIn) return null;
        return fetch('/api/strips/saved?limit=40', { credentials: 'same-origin' })
          .then(function (res) { return res.ok ? res.json() : null; });
      })
      .then(function (data) {
        if (!data || !data.strips) return [];
        return data.strips.map(function (s) {
          return { id: s.id, src: s.stripUrl, thumb: s.thumbnailUrl };
        });
      })
      .catch(function () { return []; });
  }

  function loadGuestStrips() {
    if (!window.LBGuestStorage || !window.LBGuestStorage.isAvailable()) return Promise.resolve([]);
    return window.LBGuestStorage.getPendingStrips()
      .then(function (rows) {
        return (rows || []).map(function (row) {
          return { id: row.local_strip_id, src: row.image, thumb: row.thumbnail || row.image };
        });
      })
      .catch(function () { return []; });
  }

  var openPanel = null;
  var lastFocus = null;

  function showPanel(panel) {
    lastFocus = document.activeElement;
    openPanel = panel;
    els.scrim.hidden = false;
    panel.hidden = false;

    window.requestAnimationFrame(function () {
      els.scrim.classList.add('is-open');
      panel.classList.add('is-open');
      var focusable = panel.querySelector('input, textarea, button:not(.lt-panel-close)');
      (focusable || panel.querySelector('.lt-panel-close')).focus();
    });
    document.addEventListener('keydown', onPanelKeyDown, true);
  }

  function hidePanel() {
    if (!openPanel) return;
    var panel = openPanel;
    openPanel = null;
    panel.classList.remove('is-open');
    els.scrim.classList.remove('is-open');
    document.removeEventListener('keydown', onPanelKeyDown, true);

    window.setTimeout(function () {
      panel.hidden = true;
      els.scrim.hidden = true;
    }, prefersReducedMotion() ? 0 : 300);

    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onPanelKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      hidePanel();
      return;
    }
    if (e.key !== 'Tab' || !openPanel) return;

    var items = openPanel.querySelectorAll(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  var finalArtUrl = null;
  var exporting = false;

  function releaseFinalArt() {
    if (finalArtUrl) {
      URL.revokeObjectURL(finalArtUrl);
      finalArtUrl = null;
    }
  }

  function letterHasLink() {
    if (!window.LBInputGuard) return false;
    var texts = [letter.meta && letter.meta.to, letter.meta && letter.meta.from];
    letter.pages.forEach(function (p) { texts.push(p.body); });
    return texts.some(function (t) { return window.LBInputGuard.hasLink(t || ''); });
  }

  function finish() {
    if (exporting) return;

    if (letterHasLink()) {
      toast('Links can’t be added to a letter. Please remove them first.', 'error');
      return;
    }

    var hasContent = letter.pages.some(function (p) {
      return p.body && p.body.trim().length > 0;
    });
    if (!hasContent) {
      toast('Write something before finishing your letter.', 'error');
      return;
    }

    exporting = true;
    select(null);

    els.finishBtn.disabled = true;
    if (typeof window.showLoader === 'function') window.showLoader('Folding your letter');

    R.renderAll(letter, { scale: 1.2, bleed: false, background: null })
      .then(function (canvases) {
        return R.canvasToBlob(canvases[0], 'image/jpeg', 0.92).then(function (blob) {
          return { canvases: canvases, blob: blob };
        });
      })
      .then(function (result) {
        if (typeof window.hideLoader === 'function') window.hideLoader();
        releaseFinalArt();
        finalArtUrl = URL.createObjectURL(result.blob);
        runFoldSequence(finalArtUrl);
      })
      .catch(function () {
        if (typeof window.hideLoader === 'function') window.hideLoader();
        exporting = false;
        els.finishBtn.disabled = false;
        toast('Your letter could not be folded. Try again.', 'error');
      });
  }

  function runFoldSequence(artUrl) {
    var scene = els.finish;
    var panels = scene.querySelectorAll('.lt-fold-panel');
    var paperColor = M.paper(letter.paper).base;
    scene.style.setProperty('--paper-color', paperColor);
    for (var i = 0; i < panels.length; i++) {
      panels[i].style.backgroundImage = 'url("' + artUrl + '")';
    }

    scene.hidden = false;
    scene.classList.remove('is-folding', 'is-inserting', 'is-sealed');

    var sceneWidth = scene.querySelector('.lt-fold-scene').getBoundingClientRect().width;
    var panelHeight = (sceneWidth * (M.PAGE_H / M.PAGE_W)) / 3;
    for (i = 0; i < panels.length; i++) {
      panels[i].style.height = panelHeight + 'px';
    }

    els.finalArt.src = artUrl;

    if (prefersReducedMotion()) {
      showFinal();
      return;
    }

    step(260, function () { scene.classList.add('is-folding'); });
    step(1200, function () { scene.classList.add('is-inserting'); });
    step(2050, function () { scene.classList.add('is-sealed'); });
    step(3400, showFinal);
  }

  var timers = [];

  function step(delay, fn) {
    timers.push(window.setTimeout(fn, delay));
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
  }

  function showFinal() {
    finished = true;
    exporting = false;
    els.finish.hidden = true;
    els.final.hidden = false;

    M.clearDraft();

    window.requestAnimationFrame(function () {
      els.final.classList.add('is-open');
      els.finalTitle.focus();
    });
  }

  function backToEditor() {
    clearTimers();
    finished = false;
    els.final.classList.remove('is-open');
    els.finish.hidden = true;
    els.finishBtn.disabled = false;
    window.setTimeout(function () { els.final.hidden = true; }, prefersReducedMotion() ? 0 : 400);
  }

  function setProgress(fraction, label) {
    els.progress.hidden = fraction == null;
    if (fraction == null) return;
    els.progressFill.style.width = Math.round(fraction * 100) + '%';
    els.progressText.textContent = label || '';
  }

  function busy(on) {
    var buttons = els.final.querySelectorAll('.lt-final-btn');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = on;
  }

  function exportPng() {
    busy(true);
    setProgress(0.1, 'Rendering your letter');

    R.renderAll(letter, { scale: 2, bleed: false, background: '#E9E2D6' })
      .then(function (canvases) {
        setProgress(0.7, 'Saving');
        return R.canvasToBlob(canvases[0], 'image/png');
      })
      .then(function (blob) {
        setProgress(null);
        busy(false);
        return window.LBExport.save({
          blob: blob,
          filename: 'constbooth-letter.png',
          title: 'My ConstBooth letter',
          text: 'A letter I made on ConstBooth',
          label: 'letter'
        });
      })
      .then(function (res) {
        if (res && res.ok) toast('Letter saved!', 'success');
      })
      .catch(function () {
        setProgress(null);
        busy(false);
        toast('Your letter could not be exported. Try again.', 'error');
      });
  }

  function exportPdf() {
    busy(true);
    setProgress(0.1, 'Rendering ' + letter.pages.length + (letter.pages.length > 1 ? ' pages' : ' page'));

    R.renderAll(letter, { scale: 2, bleed: false, background: '#E9E2D6' })
      .then(function (canvases) {
        setProgress(0.65, 'Building the PDF');
        return window.LBLettersPdf.build(canvases, { title: 'A letter from ConstBooth' });
      })
      .then(function (blob) {
        setProgress(null);
        busy(false);
        return window.LBExport.save({
          blob: blob,
          filename: 'constbooth-letter.pdf',
          title: 'My ConstBooth letter',
          label: 'letter-pdf'
        });
      })
      .then(function (res) {
        if (res && res.ok) toast('Letter saved as PDF!', 'success');
      })
      .catch(function () {
        setProgress(null);
        busy(false);
        toast('The PDF could not be created. Try again.', 'error');
      });
  }

  function shareLetter() {
    if (letterHasLink()) {
      toast('Links can’t be added to a letter. Please remove them first.', 'error');
      return;
    }
    busy(true);
    setProgress(0.1, 'Preparing your letter');

    R.ensureFonts()
      .then(function () { return R.preloadObjects(letter); })
      .then(function () {
        setProgress(0.35, 'Preparing your letter');
        return R.renderAll(letter, { scale: 1.6, bleed: false, background: '#E9E2D6' });
      })
      .then(function (canvases) {
        var jobs = canvases.map(function (c) { return c.toDataURL('image/jpeg', 0.86); });
        setProgress(0.65, 'Creating a link');
        return fetch('/api/letters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-lb-csrf': 'true' },
          credentials: 'same-origin',
          body: JSON.stringify({ pages: jobs, paper: letter.paper })
        });
      })
      .then(function (res) {
        if (res.status === 429) throw new Error('rate-limited');
        if (!res.ok) throw new Error('share-failed');
        return res.json();
      })
      .then(function (data) {
        setProgress(null);
        busy(false);
        var url = window.location.origin + '/studio/letters/' + data.id;
        toast('Letter shared!', 'success');
        return offerLink(url);
      })
      .catch(function (err) {
        setProgress(null);
        busy(false);
        if (err && err.message === 'rate-limited') {
          toast('You\u2019re sharing too quickly. Please wait a moment and try again.', 'warning');
        } else {
          toast('Your letter could not be shared right now. Try saving it instead.', 'error');
        }
      });
  }

  function offerLink(url) {
    if (navigator.share) {
      return navigator.share({
        title: 'A letter for you',
        text: 'I wrote you a letter.',
        url: url
      }).catch(function () { copyLink(url); });
    }
    copyLink(url);
    return Promise.resolve();
  }

  function copyLink(url) {
    window.LBExport.copyText(url);
    els.shareLink.value = url;
    els.shareLink.hidden = false;
    toast('Link copied. Send it to someone.', 'success');
  }

  function bindControls() {

    var paperButtons = els.papers.querySelectorAll('.lt-paper-opt');
    Array.prototype.forEach.call(paperButtons, function (button) {
      button.addEventListener('click', function () {
        letter.paper = button.getAttribute('data-paper');
        var ink = M.paper(letter.paper).ink;

        if (!letter.type.userColor) letter.type.color = ink;
        updateRadioGroup(paperButtons, 'data-paper', letter.paper);
        updateInkGroup();
        updateActivePaperDisplay();
        closeAllPopovers();
        render({ paper: true });
        scheduleSave();
      });
    });

    var handButtons = els.fonts.querySelectorAll('[data-hand]');
    Array.prototype.forEach.call(handButtons, function (button) {
      button.addEventListener('click', function () {
        letter.type.hand = button.getAttribute('data-hand');
        updateRadioGroup(handButtons, 'data-hand', letter.type.hand);
        updateActiveFontDisplay();
        closeAllPopovers();
        render({ paper: true });
        scheduleSave();
      });
    });

    if (els.paperTrigger) {
      els.paperTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePopover(els.paperPopover, els.paperTrigger);
      });
    }

    if (els.fontTrigger) {
      els.fontTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePopover(els.fontPopover, els.fontTrigger);
      });
    }

    if (els.paperClose) {
      els.paperClose.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllPopovers();
      });
    }

    if (els.fontClose) {
      els.fontClose.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllPopovers();
      });
    }

    if (els.paperPopover) {
      els.paperPopover.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    if (els.fontPopover) {
      els.fontPopover.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest || (!e.target.closest('.lt-menu-anchor') && !e.target.closest('.lt-popover'))) {
        closeAllPopovers();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllPopovers();
    });

    var sizeButtons = els.sizes.querySelectorAll('[data-size]');
    Array.prototype.forEach.call(sizeButtons, function (button) {
      button.addEventListener('click', function () {
        letter.type.size = parseInt(button.getAttribute('data-size'), 10);
        updateRadioGroup(sizeButtons, 'data-size', String(letter.type.size));
        render({ paper: true });
        scheduleSave();
      });
    });

    var inkButtons = els.inks.querySelectorAll('[data-ink]');
    Array.prototype.forEach.call(inkButtons, function (button) {
      button.addEventListener('click', function () {
        letter.type.color = button.getAttribute('data-ink');
        letter.type.userColor = true;
        updateInkGroup();
        render();
        scheduleSave();
      });
    });

    var alignButtons = els.aligns.querySelectorAll('[data-align]');
    Array.prototype.forEach.call(alignButtons, function (button) {
      button.addEventListener('click', function () {
        letter.type.align = button.getAttribute('data-align');
        updateRadioGroup(alignButtons, 'data-align', letter.type.align);
        render();
        scheduleSave();
      });
    });

    els.foldsBtn.addEventListener('click', function () {
      letter.folds = !letter.folds;
      els.foldsBtn.setAttribute('aria-pressed', letter.folds ? 'true' : 'false');
      for (var i = 0; i < pageEls.length; i++) applyPaper(pageEls[i].sheet);
      scheduleSave();
    });

    els.photoBtn.addEventListener('click', function () { els.fileInput.click(); });
    els.fileInput.addEventListener('change', function (e) {
      handleFiles(e.target.files, 'photo');
      e.target.value = '';
    });

    els.stripBtn.addEventListener('click', openStripPanel);
    els.decoBtn.addEventListener('click', openDecoPanel);
    els.detailsBtn.addEventListener('click', openDetailsPanel);
    els.finishBtn.addEventListener('click', finish);

    if (els.dateTrigger && els.datePicker) {
      els.dateTrigger.addEventListener('click', function (e) {
        e.preventDefault();
        if (els.datePicker.showPicker) {
          els.datePicker.showPicker();
        } else {
          els.datePicker.focus();
          els.datePicker.click();
        }
      });
      els.datePicker.addEventListener('change', function () {
        var formatted = formatDateForLetter(els.datePicker.value);
        if (formatted) els.fieldDate.value = formatted;
      });
    }

    els.fieldTo.addEventListener('input', function () {
      updateCharCount(els.fieldTo, els.countTo, 80);
    });
    els.fieldFrom.addEventListener('input', function () {
      updateCharCount(els.fieldFrom, els.countFrom, 120);
    });

    els.objTools.addEventListener('click', function (e) {
      var action = e.target.closest && e.target.closest('[data-action]');
      if (!action) return;
      var what = action.getAttribute('data-action');

      if (what === 'delete') { deleteSelected(); return; }
      if (what === 'size') {
        var preset = M.size(action.getAttribute('data-size'));
        withSelected(function (o) { o.w = clampWidth(M.PAGE_W * preset.factor); });
        return;
      }
      if (what === 'rot-left') { withSelected(function (o) { o.rot -= 5; }); return; }
      if (what === 'rot-right') { withSelected(function (o) { o.rot += 5; }); return; }
    });

    document.addEventListener('pointerdown', function (e) {
      if (gesture) return;
      if (e.target.closest && (e.target.closest('.lt-obj') || e.target.closest('.lt-obj-tools'))) return;
      select(null);
    });

    els.shareBtn.addEventListener('click', shareLetter);
    els.pngBtn.addEventListener('click', exportPng);
    els.pdfBtn.addEventListener('click', exportPdf);
    els.editBtn.addEventListener('click', backToEditor);

    els.scrim.addEventListener('click', hidePanel);
    Array.prototype.forEach.call(document.querySelectorAll('.lt-panel-close'), function (button) {
      button.addEventListener('click', hidePanel);
    });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    if (els.undoBtn) els.undoBtn.addEventListener('click', undo);
    if (els.redoBtn) els.redoBtn.addEventListener('click', redo);

    document.addEventListener('keydown', function (e) {
      if (finished) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) { redo(); } else { undo(); }
      }
      if (mod && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    });

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', function () {
      M.saveDraft(letter);

      clearTimers();
      releaseFinalArt();
    });
  }

  var resizeTimer = 0;

  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      applyScale();
    }, 120);
  }

  function onBeforeUnload(e) {
    if (finished || !M.isDirty(letter)) return;

    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  function updateRadioGroup(buttons, attr, value) {
    Array.prototype.forEach.call(buttons, function (button) {
      button.setAttribute('aria-checked', button.getAttribute(attr) === value ? 'true' : 'false');
    });
  }

  function updateInkGroup() {
    var inkButtons = els.inks.querySelectorAll('[data-ink]');
    Array.prototype.forEach.call(inkButtons, function (button) {
      button.setAttribute(
        'aria-checked',
        button.getAttribute('data-ink').toLowerCase() === String(letter.type.color).toLowerCase() ? 'true' : 'false'
      );
    });
  }

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function updateCharCount(input, counter, max) {
    if (!counter) return;
    var len = (input.value || '').length;
    counter.textContent = len + ' / ' + max;
    counter.classList.toggle('lt-char-count--warn', len >= max * 0.9);
    counter.classList.toggle('lt-char-count--full', len >= max);
  }

  function formatDateForLetter(isoStr) {
    if (!isoStr) return '';
    var parts = isoStr.split('-');
    if (parts.length !== 3) return '';
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return '';
    return d + ' ' + MONTH_NAMES[m] + ' ' + y;
  }

  function openDetailsPanel() {
    els.fieldDate.value = letter.meta.date;
    els.fieldTo.value = letter.meta.to;
    els.fieldFrom.value = letter.meta.from;
    updateCharCount(els.fieldTo, els.countTo, 80);
    updateCharCount(els.fieldFrom, els.countFrom, 120);
    showPanel(els.detailsPanel);
  }

  function applyDetails() {
    letter.meta.date = els.fieldDate.value.trim().slice(0, 60);
    letter.meta.to = els.fieldTo.value.trim().slice(0, 80);
    letter.meta.from = els.fieldFrom.value.replace(/\s+$/, '').slice(0, 120);
    render({ paper: true });
    scheduleSave();
    hidePanel();
  }

  function openStripPanel() {
    els.stripList.innerHTML = '';
    els.stripEmpty.hidden = true;
    els.stripLoading.hidden = false;
    showPanel(els.stripPanel);

    loadStrips().then(function (strips) {
      els.stripLoading.hidden = true;
      if (!strips.length) {
        els.stripEmpty.hidden = false;
        return;
      }
      strips.forEach(function (strip) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'lt-strip-btn';
        var img = document.createElement('img');
        img.src = strip.thumb;
        img.alt = '';
        img.loading = 'lazy';
        button.appendChild(img);
        button.addEventListener('click', function () {
          hidePanel();
          R.loadObjectImage(strip.src).then(function (loaded) {
            if (!loaded) {
              toast('That strip could not be added.', 'error');
              return;
            }
            addImageObject(strip.src, loaded.naturalHeight / loaded.naturalWidth, 'strip');
          });
        });
        els.stripList.appendChild(button);
      });
    }).catch(function () {
      els.stripLoading.hidden = true;
      els.stripEmpty.hidden = false;
    });
  }

  function openDecoPanel() {
    if (!els.decoList.childNodes.length) {
      if (!M.DECORATIONS || !M.DECORATIONS.length) {
        if (els.decoEmpty) els.decoEmpty.hidden = false;
      } else {
        if (els.decoEmpty) els.decoEmpty.hidden = true;
        M.DECORATIONS.forEach(function (deco) {
          var button = el('button', 'lt-deco-btn');
          button.type = 'button';
          button.setAttribute('aria-label', deco.name || 'Sticker');

          if (deco.src) {
            var img = document.createElement('img');
            img.src = deco.src;
            img.alt = deco.name || '';
            img.loading = 'lazy';
            img.onerror = function () {
              if (this.src.indexOf('.webp') !== -1) {
                this.src = this.src.replace(/\.webp$/, '.png');
              }
            };
            button.appendChild(img);
          } else {
            var canvas = document.createElement('canvas');
            canvas.width = 108;
            canvas.height = 84;
            R.paintDecoration(canvas.getContext('2d'), deco.id, 54, 42, 84, 62, 0);
            button.appendChild(canvas);
          }

          button.addEventListener('click', function () {
            hidePanel();
            var obj = M.addObject(letter, {
              kind: 'deco',
              deco: deco.id,
              src: deco.src || null,
              ratio: deco.ratio || 1,
              w: deco.w || 160,
              page: currentPageIndex()
            });
            if (obj) {
              syncObjects();
              select(obj.id);
              scheduleSave();
            } else {
              toast('Maximum stickers and photos reached (30).', 'warning');
            }
          });

          els.decoList.appendChild(button);
        });
      }
    }
    showPanel(els.decoPanel);
  }

  function collectElements() {
    function byId(id) { return document.getElementById(id); }

    els = {
      app: byId('lt-app'),
      stage: byId('lt-stage'),
      controls: byId('lt-controls'),
      prevBtn: byId('lt-page-prev'),
      nextBtn: byId('lt-page-next'),
      pageDisplay: byId('lt-page-display'),
      paperTrigger: byId('lt-paper-trigger'),
      paperPopover: byId('lt-popover-paper'),
      paperClose: byId('lt-paper-close'),
      activePaperLabel: byId('lt-active-paper-label'),
      activeSwatchThumb: byId('lt-active-swatch-thumb'),
      fontTrigger: byId('lt-font-trigger'),
      fontPopover: byId('lt-popover-font'),
      fontClose: byId('lt-font-close'),
      activeFontLabel: byId('lt-active-font-label'),
      papers: byId('lt-papers'),
      fonts: byId('lt-fonts'),
      sizes: byId('lt-sizes'),
      inks: byId('lt-inks'),
      aligns: byId('lt-aligns'),
      foldsBtn: byId('lt-folds'),

      photoBtn: byId('lt-add-photo'),
      stripBtn: byId('lt-add-strip'),
      decoBtn: byId('lt-add-deco'),
      detailsBtn: byId('lt-details'),
      finishBtn: byId('lt-finish-btn'),
      dock: document.querySelector('.lt-dock'),
      fileInput: byId('lt-file'),

      objTools: byId('lt-obj-tools'),

      scrim: byId('lt-scrim'),
      detailsPanel: byId('lt-panel-details'),
      stripPanel: byId('lt-panel-strips'),
      decoPanel: byId('lt-panel-deco'),
      fieldDate: byId('lt-field-date'),
      datePicker: byId('lt-field-date-picker'),
      dateTrigger: byId('lt-date-trigger'),
      fieldTo: byId('lt-field-to'),
      fieldFrom: byId('lt-field-from'),
      countTo: byId('lt-count-to'),
      countFrom: byId('lt-count-from'),
      detailsApply: byId('lt-details-apply'),
      stripList: byId('lt-strip-list'),
      stripEmpty: byId('lt-strip-empty'),
      stripLoading: byId('lt-strip-loading'),
      decoList: byId('lt-deco-list'),
      decoEmpty: byId('lt-deco-empty'),

      undoBtn: byId('lt-undo'),
      redoBtn: byId('lt-redo'),

      finish: byId('lt-finish'),
      final: byId('lt-final'),
      finalArt: byId('lt-final-art'),
      finalTitle: byId('lt-final-title'),
      progress: byId('lt-progress'),
      progressFill: byId('lt-progress-fill'),
      progressText: byId('lt-progress-text'),
      shareBtn: byId('lt-share'),
      pngBtn: byId('lt-save-png'),
      pdfBtn: byId('lt-save-pdf'),
      editBtn: byId('lt-edit'),
      shareLink: byId('lt-share-link')
    };
  }

  function closeAllPopovers() {
    if (els.paperPopover) els.paperPopover.hidden = true;
    if (els.fontPopover) els.fontPopover.hidden = true;
    if (els.paperTrigger) els.paperTrigger.setAttribute('aria-expanded', 'false');
    if (els.fontTrigger) els.fontTrigger.setAttribute('aria-expanded', 'false');
  }

  function togglePopover(popover, trigger) {
    if (!popover || !trigger) return;
    var wasHidden = popover.hidden;
    closeAllPopovers();
    if (wasHidden) {
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  function updateActivePaperDisplay() {
    var paper = M.paper(letter.paper);
    if (els.activePaperLabel && paper) {
      els.activePaperLabel.textContent = paper.name;
    }
    if (els.activeSwatchThumb && paper) {
      els.activeSwatchThumb.style.backgroundColor = paper.base;
    }
  }

  function updateActiveFontDisplay() {
    var hand = M.hand(letter.type.hand);
    if (els.activeFontLabel && hand) {
      els.activeFontLabel.textContent = hand.name;
      els.activeFontLabel.style.fontFamily = M.handFamily(hand);
    }
  }

  function buildToolbars() {

    M.PAPERS.forEach(function (paper) {
      var button = el('button', 'lt-paper-opt');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', paper.id === letter.paper ? 'true' : 'false');
      button.setAttribute('data-paper', paper.id);
      button.setAttribute('title', paper.name);
      button.setAttribute('aria-label', paper.name + ' paper');

      var swatch = el('span', 'lb-paper lt-paper-swatch');
      swatch.style.setProperty('--paper-base', paper.base);
      swatch.style.setProperty('--paper-fiber-opacity', String(paper.fiber));
      swatch.style.setProperty('--paper-grain-opacity', String(paper.grain));
      swatch.style.setProperty('--paper-edge', paper.edge);
      swatch.style.setProperty('--paper-vignette', String(paper.vignette));

      if (paper.vignette > 0) swatch.appendChild(el('span', 'lb-paper-vignette'));

      if (paper.rule) {
        swatch.style.setProperty('--paper-rule-color', paper.rule.color);
        swatch.style.setProperty('--paper-rule-gap', '8px');
        swatch.style.setProperty('--paper-rule-offset', '5px');
        swatch.style.setProperty('--paper-margin-color', paper.rule.margin);
        swatch.appendChild(el('span', 'lb-paper-rules'));
      }

      button.appendChild(swatch);
      button.appendChild(el('span', 'lt-paper-name', paper.name));
      els.papers.appendChild(button);
    });

    M.HANDS.forEach(function (hand) {
      var button = el('button', 'lt-font-opt');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('data-hand', hand.id);
      button.setAttribute('aria-checked', hand.id === letter.type.hand ? 'true' : 'false');

      var nameSpan = el('span', 'lt-font-name', hand.name);
      nameSpan.style.fontFamily = M.handFamily(hand);
      nameSpan.style.fontWeight = String(hand.weight);
      nameSpan.style.fontSize = Math.max(15, Math.round(21 * hand.scale)) + 'px';
      button.appendChild(nameSpan);

      var checkSvg = el('span', 'lt-font-check', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>');
      button.appendChild(checkSvg);

      els.fonts.appendChild(button);
    });

    M.TYPE_SIZES.forEach(function (size) {
      var button = el('button', 'lt-seg-btn', size.name.charAt(0));
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('data-size', String(size.value));
      button.setAttribute('title', size.name + ' size');
      button.setAttribute('aria-label', size.name + ' size');
      button.setAttribute('aria-checked', size.value === letter.type.size ? 'true' : 'false');
      els.sizes.appendChild(button);
    });

    M.INKS.forEach(function (ink) {
      var button = el('button', 'lt-ink');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('data-ink', ink.value);
      button.setAttribute('aria-label', ink.name + ' ink');
      button.setAttribute('title', ink.name + ' ink');
      button.style.background = ink.value;
      els.inks.appendChild(button);
    });

    [
      { id: 'left', label: 'Align left', svg: ICONS.alignLeft },
      { id: 'center', label: 'Align centre', svg: ICONS.alignCenter },
      { id: 'right', label: 'Align right', svg: ICONS.alignRight }
    ].forEach(function (align) {
      var button = el('button', 'lt-seg-btn lt-seg-btn--icon', align.svg);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('data-align', align.id);
      button.setAttribute('aria-label', align.label);
      button.setAttribute('title', align.label);
      button.setAttribute('aria-checked', align.id === letter.type.align ? 'true' : 'false');
      els.aligns.appendChild(button);
    });

    updateInkGroup();
    updateActivePaperDisplay();
    updateActiveFontDisplay();
  }

  function fillIcons() {
    var map = {
      'lt-add-photo': ICONS.photo,
      'lt-add-strip': ICONS.strip,
      'lt-add-deco': ICONS.sticker,
      'lt-details': ICONS.details,
      'lt-finish-btn': ICONS.finish,
      'lt-share': ICONS.send,
      'lt-save-png': ICONS.download,
      'lt-save-pdf': ICONS.doc
    };
    for (var id in map) {
      var node = document.getElementById(id);
      if (node) node.insertAdjacentHTML('afterbegin', map[id]);
    }

    var tools = {
      'lt-tool-rot-left': ICONS.rotateLeft,
      'lt-tool-rot-right': ICONS.rotateRight,
      'lt-tool-delete': ICONS.trash,
      'lt-undo': ICONS.undo,
      'lt-redo': ICONS.redo
    };
    for (var toolId in tools) {
      var tool = document.getElementById(toolId);
      if (tool) tool.innerHTML = tools[toolId];
    }

    Array.prototype.forEach.call(document.querySelectorAll('.lt-panel-close'), function (button) {
      button.innerHTML = ICONS.close;
    });
  }

  var isBooted = false;
  function boot() {
    collectElements();
    if (!els.app || isBooted) return;
    isBooted = true;

    M.loadDraft().then(function (draft) {
      letter = draft || M.createLetter();

      buildToolbars();
      fillIcons();
      bindControls();
      els.detailsApply.addEventListener('click', applyDetails);

      els.foldsBtn.setAttribute('aria-pressed', letter.folds ? 'true' : 'false');

      render({ scale: true, paper: true, keepCaret: false });

      lastUndoState = snapshotLetter();
      updateUndoButtons();

      R.ensureFonts();
      R.loadTextures().then(function () {
        render({ scale: true, paper: true, keepCaret: false });
      });

      if (draft && M.isDirty(draft)) toast('Picked up where you left off.', 'info');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
