(function () {
  'use strict';

  var panel = document.getElementById('lb-info');
  var openers = document.querySelectorAll('[data-info-open]');
  if (!panel || !openers.length) return;

  var card = panel.querySelector('.lb-info-card');
  var lastFocus = null;
  var hiddenNodes = [];

  function track(name) {
    try {
      if (typeof window.trackGA4Event === 'function') window.trackGA4Event(name, { page: window.location.pathname });
    } catch (_e) {}
  }

  function focusables() {
    return Array.prototype.filter.call(
      card.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (node) { return node.offsetParent !== null; }
    );
  }

  function setBackground(off) {
    if (off) {
      hiddenNodes = [];
      var nodes = document.querySelectorAll('body > header, body > main, body > footer');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].contains(panel)) continue;
        nodes[i].setAttribute('aria-hidden', 'true');
        if ('inert' in nodes[i]) nodes[i].inert = true;
        hiddenNodes.push(nodes[i]);
      }
    } else {
      for (var j = 0; j < hiddenNodes.length; j++) {
        hiddenNodes[j].removeAttribute('aria-hidden');
        if ('inert' in hiddenNodes[j]) hiddenNodes[j].inert = false;
      }
      hiddenNodes = [];
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var inside = card.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(trigger) {
    if (!panel.hidden) return;
    lastFocus = trigger || document.activeElement;
    panel.hidden = false;
    setBackground(true);
    document.addEventListener('keydown', onKey, true);
    var closeBtn = panel.querySelector('.lb-info-close');
    if (closeBtn) closeBtn.focus();
    track('studio_info_opened');
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    setBackground(false);
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && typeof lastFocus.focus === 'function' && lastFocus.offsetParent !== null) {
      lastFocus.focus();
    }
  }

  Array.prototype.forEach.call(openers, function (btn) {
    btn.addEventListener('click', function () { open(btn); });
  });
  Array.prototype.forEach.call(panel.querySelectorAll('[data-info-close]'), function (node) {
    node.addEventListener('click', close);
  });
  window.addEventListener('pagehide', close);
}());
