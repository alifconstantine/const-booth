(function (window, document) {
  'use strict';

  var ART = window.LBCassetteArt;

  var STATES = ['IDLE', 'INSERTING', 'INSERTED', 'RECORDING', 'PAUSED_RECORDING', 'PLAYING', 'PAUSED_PLAYBACK', 'STOPPED', 'EJECTING'];

  var CASSETTE_W = 0.84;
  var CASSETTE_H = CASSETTE_W * 506 / 831;
  var FACE_TOP_GAP = 0.07;
  var ROOM_MS = 560;

  var TAPE_SPEED = 2 * Math.PI * 86 * 1.05;

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_e) {
      return false;
    }
  }

  var keyboardMode = false;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || /^Arrow/.test(e.key || '')) keyboardMode = true;
  }, true);
  ['mousedown', 'pointerdown', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, function () { keyboardMode = false; }, { capture: true, passive: true });
  });

  function focusForKeyboard(el) {
    if (!el || !keyboardMode) return;
    try {
      el.focus({ preventScroll: true });
    } catch (_e) {
      el.focus();
    }
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  function node(tag, className, attrs) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) n.setAttribute(key, attrs[key]);
      }
    }
    return n;
  }

  function create(mount, options) {
    var opts = options || {};

    var root = node('div', 'cs-deck', { 'data-state': 'IDLE' });
    var stage = node('div', 'cs-deck-stage');
    var bay = node('div', 'cs-deck-bay', { 'aria-hidden': 'true' });
    var holder = node('div', 'cs-deck-cassette');
    var front = node('div', 'cs-deck-front', { 'aria-hidden': 'true' });
    var slot = node('div', 'cs-deck-slot', { 'aria-hidden': 'true' });
    var flap = node('span', 'cs-deck-flap');
    var windowEl = node('div', 'cs-deck-window');
    var plate = node('div', 'cs-deck-plate');
    var brand = node('span', 'cs-deck-brand');
    var brandLens = node('span', 'cs-deck-brand-lens');
    brandLens.textContent = 'Const';
    brand.appendChild(brandLens);
    brand.appendChild(document.createTextNode('Booth'));
    var model = node('span', 'cs-deck-model');
    model.textContent = 'Cassette player';
    plate.appendChild(brand);
    plate.appendChild(model);

    slot.appendChild(flap);
    front.appendChild(windowEl);
    front.appendChild(plate);
    stage.appendChild(bay);
    stage.appendChild(holder);
    stage.appendChild(front);
    stage.appendChild(slot);

    var panel = node('div', 'cs-deck-panel');
    var readout = node('div', 'cs-deck-readout');
    var rec = node('span', 'cs-deck-rec');
    rec.innerHTML = '<span class="cs-deck-rec-dot" aria-hidden="true"></span><span>REC</span>';
    var counter = node('span', 'cs-deck-counter', { role: 'timer', 'aria-live': 'off' });
    counter.textContent = '00:00';
    var meter = node('span', 'cs-deck-meter', { 'aria-hidden': 'true' });
    var meterFill = node('span', 'cs-deck-meter-fill');
    meter.appendChild(meterFill);
    readout.appendChild(rec);
    readout.appendChild(meter);
    readout.appendChild(counter);

    var keys = node('div', 'cs-deck-keys', { role: 'group', 'aria-label': opts.keysLabel || 'Cassette controls' });
    panel.appendChild(readout);
    panel.appendChild(keys);

    root.appendChild(stage);
    root.appendChild(panel);
    mount.appendChild(root);

    mount.classList.add('is-instant');
    mount.classList.add('is-making-room');
    void mount.offsetHeight;
    mount.classList.remove('is-instant');

    var art = null;
    var state = 'IDLE';

    function measure() {

      var width = root.clientWidth || root.getBoundingClientRect().width || 320;
      root.style.setProperty('--deck-w', width.toFixed(2) + 'px');
      return width;
    }
    measure();
    var resizeTimer = null;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measure, 60);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    function setState(next) {
      if (STATES.indexOf(next) === -1) return;
      state = next;
      root.setAttribute('data-state', next);
    }

    var tape = {
      source: null,
      active: false,
      target: ART.ART_PROGRESS,
      shown: ART.ART_PROGRESS,
      angles: { left: 0, right: 0 },
      raf: 0,
      lastText: ''
    };

    function currentSeconds() {
      return tape.source ? Math.max(0, tape.source() || 0) : 0;
    }

    function renderTape(progress) {
      if (art) art.setTape(progress, tape.angles);
    }

    function advance(from, to) {
      var radii = ART.packRadii((from + to) / 2);
      var moved = (to - from) * TAPE_SPEED * ART.MAX_SECONDS;
      var slow = reducedMotion() ? 0.35 : 1;
      tape.angles.left += (moved / radii.left) * (180 / Math.PI) * slow;
      tape.angles.right += (moved / radii.right) * (180 / Math.PI) * slow;
    }

    function frame(now) {
      tape.raf = 0;

      if (state === 'INSERTING' || state === 'EJECTING') return;
      var seconds = currentSeconds();
      if (tape.active) tape.target = Math.min(1, seconds / ART.MAX_SECONDS);

      var gap = tape.target - tape.shown;
      var next;
      if (Math.abs(gap) < 0.004) {
        next = tape.target;
      } else {

        var dt = Math.min(0.05, Math.max(0.001, (now - (tape.lastFrame || now)) / 1000));
        next = tape.shown + gap * Math.min(1, dt * 7);
      }
      tape.lastFrame = now;
      advance(tape.shown, next);
      tape.shown = next;
      renderTape(tape.shown);
      renderReadout(seconds);

      if (tape.active || tape.shown !== tape.target) {
        tape.raf = window.requestAnimationFrame(frame);
      } else {
        tape.lastFrame = 0;
      }
    }

    function kick() {
      if (!tape.raf) tape.raf = window.requestAnimationFrame(frame);
    }

    var total = null;

    function renderReadout(seconds) {
      var text = total ? formatTime(Math.min(seconds, total)) + ' / ' + formatTime(total) : formatTime(seconds);
      if (text !== tape.lastText) {
        counter.textContent = text;
        tape.lastText = text;
      }
      var limit = total || ART.MAX_SECONDS;
      var ratio = Math.max(0, Math.min(1, seconds / limit));
      meterFill.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    }

    function animate(target, frames, timing) {
      if (!target.animate) return null;
      try {
        return target.animate(frames, timing);
      } catch (_e) {
        return null;
      }
    }

    function finished(animation, fallbackMs) {
      return new Promise(function (resolve) {
        if (!animation) {
          window.setTimeout(resolve, fallbackMs || 0);
          return;
        }
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          resolve();
        }
        animation.onfinish = finish;
        animation.oncancel = finish;

        window.setTimeout(finish, (fallbackMs || 0) + 1500);
      });
    }

    function wait(ms) {
      return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
    }

    function openRoom() {
      if (mount.classList.contains('is-making-room')) return Promise.resolve();
      mount.classList.add('is-making-room');
      return reducedMotion() ? Promise.resolve() : wait(ROOM_MS);
    }

    function closeRoom() {
      if (!mount.classList.contains('is-making-room')) return Promise.resolve();
      mount.classList.remove('is-making-room');
      return reducedMotion() ? Promise.resolve() : wait(ROOM_MS);
    }

    function insert(insertOptions) {
      setState('INSERTING');
      return openRoom().then(function () { return runInsert(insertOptions); });
    }

    function runInsert(insertOptions) {
      var o = insertOptions || {};
      var width = measure();
      var cassetteH = CASSETTE_H * width;
      var above = -(cassetteH + FACE_TOP_GAP * width + 0.035 * width);
      var duration = o.duration || 2600;

      setState('INSERTING');
      holder.classList.add('is-visible');

      if (reducedMotion()) {
        var fade = animate(holder, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'backwards' });
        return finished(fade, 240).then(seated);
      }

      var cassette = animate(holder, [
        { offset: 0, opacity: 0, transform: 'translate(' + (-0.13 * width) + 'px,' + (above - 0.03 * width) + 'px) rotate(-9deg)' },
        { offset: 0.12, opacity: 1, transform: 'translate(' + (-0.1 * width) + 'px,' + (above - 0.035 * width) + 'px) rotate(-7deg)', easing: 'cubic-bezier(.45,0,.2,1)' },
        { offset: 0.42, opacity: 1, transform: 'translate(0px,' + above + 'px) rotate(0deg)', easing: 'cubic-bezier(.3,0,.3,1)' },
        { offset: 0.52, opacity: 1, transform: 'translate(0px,' + (above + 3) + 'px) rotate(0deg)', easing: 'cubic-bezier(.55,0,.8,.4)' },
        { offset: 0.8, opacity: 1, transform: 'translate(0px,' + (above * 0.52) + 'px) rotate(0deg)', easing: 'cubic-bezier(.7,0,.9,.6)' },
        { offset: 0.93, opacity: 1, transform: 'translate(0px,' + (0.006 * width) + 'px) rotate(0deg)', easing: 'cubic-bezier(.2,.6,.3,1)' },
        { offset: 1, opacity: 1, transform: 'translate(0px,0px) rotate(0deg)' }
      ], { duration: duration, fill: 'backwards' });

      animate(flap, [
        { offset: 0, transform: 'scaleY(1)' },
        { offset: 0.5, transform: 'scaleY(1)' },
        { offset: 0.56, transform: 'scaleY(0.15)' },
        { offset: 0.9, transform: 'scaleY(0.15)' },
        { offset: 1, transform: 'scaleY(1)' }
      ], { duration: duration, easing: 'ease-in-out' });

      animate(root, [
        { offset: 0, transform: 'translateY(0)' },
        { offset: 0.9, transform: 'translateY(0)' },
        { offset: 0.94, transform: 'translateY(3px)' },
        { offset: 1, transform: 'translateY(0)' }
      ], { duration: duration, easing: 'ease-out' });

      return finished(cassette, duration).then(seated);
    }

    function seated() {
      holder.classList.add('is-visible');
      setState('INSERTED');
      root.classList.add('is-seated');
      kick();
      return closeRoom();
    }

    function eject() {
      setState('EJECTING');
      root.classList.remove('is-seated');
      return openRoom().then(runEject);
    }

    function runEject() {
      var width = measure();
      var above = -(CASSETTE_H * width + FACE_TOP_GAP * width + 0.035 * width);
      if (reducedMotion()) {
        var fade = animate(holder, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
        return finished(fade, 200).then(ejected);
      }
      var duration = 900;
      animate(flap, [
        { offset: 0, transform: 'scaleY(1)' },
        { offset: 0.1, transform: 'scaleY(0.15)' },
        { offset: 0.85, transform: 'scaleY(0.15)' },
        { offset: 1, transform: 'scaleY(1)' }
      ], { duration: duration });
      var out = animate(holder, [
        { offset: 0, opacity: 1, transform: 'translate(0,0)' },
        { offset: 0.55, opacity: 1, transform: 'translate(0,' + (above * 0.9) + 'px)', easing: 'ease-in' },
        { offset: 1, opacity: 0, transform: 'translate(0,' + (above - 0.1 * width) + 'px)' }
      ], { duration: duration, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      return finished(out, duration).then(ejected);
    }

    function ejected() {
      holder.classList.remove('is-visible');
      if (holder.getAnimations) {
        holder.getAnimations().forEach(function (a) { a.cancel(); });
      }
      setState('IDLE');
    }

    function setArt(instance) {
      art = instance;
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      if (art) {
        holder.appendChild(art.svg);
        renderTape(tape.shown);
      }
    }

    return {
      el: root,
      keys: keys,
      state: function () { return state; },
      setState: setState,
      setArt: setArt,
      insert: insert,
      eject: eject,

      follow: function (source) {
        tape.source = source;
        renderReadout(currentSeconds());
      },

      setActive: function (active) {
        tape.active = !!active;
        if (tape.active) kick();
        else {
          tape.target = Math.min(1, currentSeconds() / ART.MAX_SECONDS);
          kick();
        }
      },

      windTo: function (progress) {
        tape.target = Math.max(0, Math.min(1, progress));
        kick();
      },

      setTotal: function (seconds) {
        total = seconds > 0 ? seconds : null;
        renderReadout(currentSeconds());
      },

      refresh: function () {
        renderReadout(currentSeconds());
      },

      revealKeys: function () {
        var box = keys.getBoundingClientRect();
        var viewport = window.innerHeight || document.documentElement.clientHeight;
        if (box.bottom <= viewport - 12) return;
        try {
          keys.scrollIntoView({ block: 'end', behavior: reducedMotion() ? 'auto' : 'smooth' });
        } catch (_e) {
          keys.scrollIntoView(false);
        }
      },

      destroy: function () {
        if (tape.raf) window.cancelAnimationFrame(tape.raf);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
      }
    };
  }

  function renderKeys(container, list) {
    var active = document.activeElement;
    var hadFocus = active && container.contains(active);
    var focusedId = hadFocus ? active.getAttribute('data-key') : null;

    while (container.firstChild) container.removeChild(container.firstChild);

    var first = null;
    var match = null;
    list.forEach(function (key) {
      var button = node('button', 'cs-key' + (key.primary ? ' cs-key--primary' : '') + (key.rec ? ' cs-key--rec' : ''), {
        type: 'button',
        'data-key': key.id,
        'aria-label': key.label
      });
      if (key.disabled) button.disabled = true;
      var icon = node('span', 'cs-key-icon', { 'aria-hidden': 'true' });
      icon.innerHTML = ICONS[key.icon] || '';
      var text = node('span', 'cs-key-text');
      text.textContent = key.text;
      button.appendChild(icon);
      button.appendChild(text);
      button.addEventListener('click', function () {
        if (!button.disabled && key.onPress) key.onPress();
      });
      container.appendChild(button);
      if (!first && !key.disabled) first = button;
      if (focusedId && key.id === focusedId && !key.disabled) match = button;
    });

    if (hadFocus) {
      var target = match || first;
      if (target) focusForKeyboard(target);
    }
  }

  var ICONS = {
    rec: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5" fill="currentColor"/></svg>',
    replay: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/></svg>',
    rerecord: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v5h-5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>'
  };

  window.LBCassetteDeck = {
    create: create,
    renderKeys: renderKeys,
    focusForKeyboard: focusForKeyboard,
    formatTime: formatTime,
    reducedMotion: reducedMotion
  };
})(window, document);
