(function () {
  'use strict';

  var S = {
    LISTEN_IDLE: 'listen-idle',
    LISTEN_TUNING: 'listen-tuning',
    LISTEN_READY: 'listen-ready',
    LISTEN_PLAYING: 'listen-playing',
    LISTEN_PAUSED: 'listen-paused',
    LISTEN_ENDED: 'listen-ended',
    LISTEN_EMPTY: 'listen-empty',
    LISTEN_ERROR: 'listen-error',

    RECORD_INTRO: 'record-intro',
    RECORD_REQUESTING: 'record-requesting',
    RECORDING: 'recording',
    RECORDING_PAUSED: 'recording-paused',
    RECORD_ERROR: 'record-error',
    RECORD_READY: 'record-ready',
    RECORD_PREVIEW: 'record-preview',
    RECORD_SUBMITTING: 'record-submitting',
    RECORD_FAILED: 'record-failed',
    RECORD_BREAK: 'record-break',
    RECORD_LIMIT: 'record-limit',
    RECORD_BLOCKED: 'record-blocked',
    RECORD_APPROVED: 'record-approved',
    RECORD_REJECTED: 'record-rejected'
  };

  var MAX_SECONDS = 60;
  var MIN_SECONDS = 1;
  var MAX_BYTES = 1536 * 1024;
  var RECENT_MAX = 20;
  var STATIONS = [87.6, 88.3, 89.2, 90.1, 91.7, 92.5, 93.4, 94.3, 95.8, 96.9, 98.1];

  var DIAL = [[87.6, 894.0, -120], [89.2, 1009.85, -60], [91.7, 1138.0, 0], [94.3, 1256.92, 60], [98.1, 1379.94, 120]];
  var NEEDLE_REST_X = 1138.0;
  var KNOB_CX = 1134.34;
  var KNOB_CY = 303.369;

  var COPY = {
    micDenied: 'We need your microphone to hear you.',
    micMissing: 'We couldn’t find a microphone. Plug one in and try again.',
    micBusy: 'Another app is using your microphone. Close it and try again.',
    micFailed: 'Your microphone wouldn’t start. Try again.',
    micUnsupported: 'Recording isn’t supported in this browser. Try Chrome, Safari, Edge or Firefox.',
    micLost: 'Your microphone stopped, but we kept what you said.',
    tooShort: 'That was over in a blink. Try again?',
    tooBig: 'That recording is too big to send. Try a shorter one.',
    badRecording: 'That recording didn’t come through. Try recording it again.',
    sendFailed: 'Your message didn’t make it out. It’s still here — try again.',
    sendOffline: 'You’re offline. Reconnect and try again; your message is still here.',
    sendBusy: 'One moment — you’re going a little fast. Try again shortly.',
    radioBreak: 'The radio needs a little rest. Try again later.',
    limit: 'That’s all you can send today.',
    blocked: 'Sending is paused for now, after a few messages we couldn’t air. Try again tomorrow.',
    listenOffline: 'You’re offline. Come back when you’re connected.',
    listenBusy: 'Lots of people are tuning in. Try again in a moment.',
    listenFailed: 'The signal slipped away. Try again.',
    playBlocked: 'Press play to hear them.',
    playFailed: 'This one won’t play on your device. Try the next stranger.',
    previewFailed: 'Your recording won’t play here, but you can still broadcast it.',
    reportThanks: 'Thanks for telling us.',
    reportBusy: 'You’ve sent a lot of reports. Try again later.',
    reportFailed: 'That report didn’t send. Try again.',
    reportOffline: 'You’re offline. Reconnect to send your report.',
    copied: 'Link copied.',
    copyFailed: 'Couldn’t copy the link. Share lensbooth.app/studio/radio instead.',
    unsupportedLanguage: 'We can\u2019t safely review this language yet. Please try English, Spanish, French, German, Hindi, Italian, Portuguese, or Thai.'
  };

  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(id) { return document.getElementById(id); }

  var app = $('rd-app');
  if (!app) return;

  var el = {
    radio: $('rd-radio'),
    display: $('rd-display-text'),
    knob: $('rd-knob'),
    knobMarks: $('rd-knob-marks'),
    needle: $('rd-needle'),
    bars: app.querySelectorAll('.rd-bar'),
    readout: $('rd-readout'),
    tuneDown: $('rd-tune-down'),
    tuneUp: $('rd-tune-up'),
    status: $('rd-status'),
    listenPanel: $('rd-listen'),
    recordPanel: $('rd-record'),
    audio: $('rd-audio'),
    timeNow: $('rd-time-now'),
    timeTotal: $('rd-time-total'),
    progress: $('rd-progress-fill'),
    playPause: $('rd-play-pause'),
    playPauseLabel: $('rd-play-pause-label'),
    mute: $('rd-mute'),
    reportOpen: $('rd-report-open'),
    reportLabel: $('rd-report-label'),
    recNow: $('rd-rec-now'),
    recFill: $('rd-rec-fill'),
    recStart: $('rd-rec-start'),
    recStartLabel: $('rd-rec-start-label'),
    recPause: $('rd-rec-pause'),
    recPauseLabel: $('rd-rec-pause-label'),
    recAlert: $('rd-record-alert'),
    recordTitle: $('rd-record-title'),
    preview: $('rd-preview-audio'),
    previewPlay: $('rd-preview-play'),
    previewLabel: $('rd-preview-label'),
    broadcast: $('rd-broadcast'),
    broadcastLabel: $('rd-broadcast-label'),
    modal: $('rd-report'),
    reportForm: $('rd-report-form'),
    reportSubmit: $('rd-report-submit'),
    reportError: $('rd-report-error')
  };

  var shows = app.querySelectorAll('[data-show]');

  var state = S.LISTEN_IDLE;

  var listen = {
    message: null,
    recent: loadRecent(),
    reported: {},
    request: null,
    token: 0,
    playedFor: null,
    autoplayTried: false
  };

  var dial = {
    freq: 91.7,
    target: null,
    tween: null,
    tweenGuard: null,
    dragging: null,
    commitTimer: null
  };

  var rec = {
    stream: null,
    recorder: null,
    chunks: [],
    mime: '',
    elapsedBase: 0,
    segmentStart: 0,
    timer: null,
    blob: null,
    url: null,
    seconds: 0,
    key: '',
    discarded: false,
    meterCtx: null,
    meterRaf: 0,
    request: null,
    retries: 0,
    retryTimer: null
  };

  function track(name, params) {
    try {
      if (typeof window.trackGA4Event === 'function') window.trackGA4Event(name, params || {});
    } catch (_e) {}
  }

  var INFO_ICON =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  function toast(message, kind) {
    var type = kind || 'info';
    var opts = { type: type, duration: type === 'error' ? 3200 : 2500 };
    if (type === 'info') opts.iconHTML = INFO_ICON;
    try {
      if (typeof window.showPillMessage === 'function') {
        window.showPillMessage(message, opts);
      } else if (window.LBExport && window.LBExport.toast) {
        window.LBExport.toast(message, type);
      }
    } catch (_e) {}
  }

  function isOffline() {
    return typeof navigator.onLine === 'boolean' && navigator.onLine === false;
  }

  function loadRecent() {
    try {
      var raw = window.sessionStorage.getItem('lb-radio-recent');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (id) { return /^[a-f0-9]{32}$/.test(id); }).slice(-RECENT_MAX) : [];
    } catch (_e) {
      return [];
    }
  }

  function rememberHeard(id) {
    listen.recent = listen.recent.filter(function (x) { return x !== id; });
    listen.recent.push(id);
    if (listen.recent.length > RECENT_MAX) listen.recent = listen.recent.slice(-RECENT_MAX);
    try { window.sessionStorage.setItem('lb-radio-recent', JSON.stringify(listen.recent)); } catch (_e) {}
  }

  function clock(seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function fmtFreq(f) {
    return (Math.round(f * 10) / 10).toFixed(1);
  }

  function announce(text) {
    el.status.classList.remove('sr-only');
    if (el.status.textContent !== text) el.status.textContent = text || '';
  }

  function announceQuietly(text) {
    el.status.classList.add('sr-only');
    if (el.status.textContent !== text) el.status.textContent = text || '';
  }

  function isListenState(s) { return s.indexOf('listen-') === 0; }

  function randomKey() {
    var bytes = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  function setState(next) {
    state = next;
    render();
  }

  function render() {
    app.setAttribute('data-state', state);
    var listening = isListenState(state);
    el.listenPanel.hidden = !listening;
    el.recordPanel.hidden = listening;

    for (var i = 0; i < shows.length; i++) {
      var list = ' ' + shows[i].getAttribute('data-show') + ' ';
      shows[i].hidden = list.indexOf(' ' + state + ' ') === -1;
    }

    var cls = el.radio.classList;
    cls.toggle('is-on', state !== S.LISTEN_IDLE && state !== S.RECORD_INTRO);
    cls.toggle('is-tuning', state === S.LISTEN_TUNING);
    cls.toggle('is-playing', state === S.LISTEN_PLAYING || state === S.RECORD_PREVIEW);
    cls.toggle('is-recording', state === S.RECORDING);
    cls.toggle('is-rec-paused', state === S.RECORDING_PAUSED);
    cls.toggle('is-processing', state === S.RECORD_SUBMITTING);

    var tunable = listening && state !== S.LISTEN_TUNING;
    el.knob.setAttribute('aria-disabled', tunable ? 'false' : 'true');
    el.tuneDown.disabled = !tunable;
    el.tuneUp.disabled = !tunable;
    $('rd-listen-start').disabled = state === S.LISTEN_TUNING;

    el.playPause.classList.toggle('is-paused', state !== S.LISTEN_PLAYING);
    el.playPauseLabel.textContent = state === S.LISTEN_PLAYING ? 'Pause' : 'Play';
    el.playPause.setAttribute('aria-label', state === S.LISTEN_PLAYING ? 'Pause message' : 'Play message');

    var reported = !!(listen.message && listen.reported[listen.message.id]);
    el.reportOpen.disabled = reported;
    el.reportLabel.textContent = reported ? 'Reported' : 'Report';

    el.recStart.disabled = state === S.RECORD_REQUESTING;
    el.recStartLabel.textContent = state === S.RECORD_REQUESTING ? 'Waiting for your microphone…' : (state === S.RECORD_ERROR ? 'Try again' : 'Record');
    el.recPause.classList.toggle('is-paused', state === S.RECORDING_PAUSED);
    el.recPauseLabel.textContent = state === S.RECORDING_PAUSED ? 'Resume' : 'Pause';

    var submitting = state === S.RECORD_SUBMITTING;
    el.broadcast.disabled = submitting;
    el.previewPlay.disabled = submitting;
    $('rd-rec-again').disabled = submitting;
    el.broadcastLabel.textContent = submitting ? 'Sending…' : ((state === S.RECORD_FAILED || state === S.RECORD_BREAK) ? 'Try again' : 'Broadcast');
    el.previewPlay.classList.toggle('is-paused', state !== S.RECORD_PREVIEW);
    el.previewLabel.textContent = state === S.RECORD_PREVIEW ? 'Pause' : 'Listen';

    renderDisplay();
  }

  function renderDisplay() {
    var text = fmtFreq(dial.freq) + ' FM';
    var isRec = false;
    if (state === S.RECORDING || state === S.RECORDING_PAUSED) { text = 'REC'; isRec = true; }
    else if (state === S.RECORD_SUBMITTING) text = 'ON AIR';
    else if (state === S.RECORD_APPROVED) text = 'ON AIR';
    el.display.textContent = text;
    el.display.classList.toggle('is-rec', isRec);
    el.readout.textContent = fmtFreq(dial.freq) + ' FM';
  }

  function dialPose(freq) {
    var f = Math.max(DIAL[0][0], Math.min(DIAL[DIAL.length - 1][0], freq));
    for (var i = 0; i < DIAL.length - 1; i++) {
      var a = DIAL[i];
      var b = DIAL[i + 1];
      if (f <= b[0]) {
        var t = (f - a[0]) / (b[0] - a[0]);
        return { x: a[1] + (b[1] - a[1]) * t, angle: a[2] + (b[2] - a[2]) * t };
      }
    }
    var last = DIAL[DIAL.length - 1];
    return { x: last[1], angle: last[2] };
  }

  function freqForAngle(angle) {
    var g = Math.max(DIAL[0][2], Math.min(DIAL[DIAL.length - 1][2], angle));
    for (var i = 0; i < DIAL.length - 1; i++) {
      var a = DIAL[i];
      var b = DIAL[i + 1];
      if (g <= b[2]) return a[0] + (b[0] - a[0]) * ((g - a[2]) / (b[2] - a[2]));
    }
    return DIAL[DIAL.length - 1][0];
  }

  function nearestStationIndex(freq) {
    var best = 0;
    for (var i = 1; i < STATIONS.length; i++) {
      if (Math.abs(STATIONS[i] - freq) < Math.abs(STATIONS[best] - freq)) best = i;
    }
    return best;
  }

  function setDial(freq) {
    dial.freq = Math.max(STATIONS[0], Math.min(STATIONS[STATIONS.length - 1], freq));
    var pose = dialPose(dial.freq);
    el.needle.setAttribute('transform', 'translate(' + (pose.x - NEEDLE_REST_X).toFixed(2) + ' 0)');
    el.knobMarks.setAttribute('transform', 'rotate(' + pose.angle.toFixed(2) + ' ' + KNOB_CX + ' ' + KNOB_CY + ')');
    var label = fmtFreq(dial.freq);
    el.knob.setAttribute('aria-valuenow', label);
    el.knob.setAttribute('aria-valuetext', label + ' FM');
    renderDisplay();
  }

  function stopTween() {
    if (dial.tween) {
      window.cancelAnimationFrame(dial.tween);
      dial.tween = null;
    }
    if (dial.tweenGuard) {
      window.clearTimeout(dial.tweenGuard);
      dial.tweenGuard = null;
    }
  }

  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function glideTo(target, ms, wobble, done) {
    stopTween();
    dial.target = target;
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      stopTween();
      dial.target = null;
      setDial(target);
      if (done) done();
    }
    if (reducedMotion || ms <= 0) {
      finish();
      return;
    }
    var from = dial.freq;
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ms);
      if (t >= 1) {
        finish();
        return;
      }
      var f = from + (target - from) * easeInOut(t);
      if (wobble) f += Math.sin(t * Math.PI * 3) * (1 - t) * 0.35;
      setDial(f);
      dial.tween = window.requestAnimationFrame(step);
    }
    dial.tween = window.requestAnimationFrame(step);
    dial.tweenGuard = window.setTimeout(finish, ms + 150);
  }

  function abortListenRequest() {
    if (listen.request) {
      try { listen.request.abort(); } catch (_e) {}
      listen.request = null;
    }
  }

  function stopListenerAudio() {
    var a = el.audio;
    try { a.pause(); } catch (_e) {}
    if (a.getAttribute('src')) {
      a.removeAttribute('src');
      try { a.load(); } catch (_e) {}
    }
  }

  function tuneIn(manualFreq) {
    if (state === S.LISTEN_TUNING) return;
    var token = ++listen.token;
    abortListenRequest();
    stopListenerAudio();
    listen.message = null;
    listen.autoplayTried = false;
    setState(S.LISTEN_TUNING);
    announce('Tuning in…');

    var minDelay = reducedMotion ? 0 : 750;
    var started = Date.now();
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    listen.request = controller;
    var timeout = window.setTimeout(function () { if (controller) controller.abort(); }, 12000);

    if (typeof manualFreq !== 'number') {
      var wander = STATIONS[Math.floor(Math.random() * STATIONS.length)];
      glideTo(wander, reducedMotion ? 0 : 700, true);
    }

    if (isOffline()) {
      window.clearTimeout(timeout);
      listen.request = null;
      stopTween();
      setState(S.LISTEN_ERROR);
      announce('');
      toast(COPY.listenOffline, 'error');
      return;
    }

    var url = '/api/radio/random' + (listen.recent.length ? '?recent=' + listen.recent.join(',') : '');
    fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (res.status === 429) throw new Error('busy');
        if (!res.ok) throw new Error('status');
        return res.json().catch(function () { throw new Error('status'); });
      })
      .then(function (data) {
        return new Promise(function (resolve) {
          window.setTimeout(function () { resolve(data); }, Math.max(0, minDelay - (Date.now() - started)));
        });
      })
      .then(function (data) {
        if (token !== listen.token) return;
        var message = data && data.message;
        var target = typeof manualFreq === 'number'
          ? manualFreq
          : (message && isFinite(message.frequency) ? Number(message.frequency) : dial.freq);
        glideTo(target, reducedMotion ? 0 : 480, false, function () {
          if (token !== listen.token) return;
          if (!message || !/^[a-f0-9]{32}$/.test(message.id) || String(message.audio).indexOf('/api/radio/audio/') !== 0) {
            setState(S.LISTEN_EMPTY);
            announce('');
            return;
          }
          lockOn(message);
        });
      })
      .catch(function (err) {
        if (token !== listen.token) return;
        stopTween();
        setState(S.LISTEN_ERROR);
        announce('');
        var reason = err && err.message;
        toast(isOffline() ? COPY.listenOffline : (reason === 'busy' ? COPY.listenBusy : COPY.listenFailed), 'error');
      })
      .then(function () {
        window.clearTimeout(timeout);
        if (listen.request === controller) listen.request = null;
      });
  }

  function lockOn(message) {
    listen.message = message;
    rememberHeard(message.id);
    el.audio.src = message.audio;
    updateListenTime();
    setState(S.LISTEN_READY);
    announce('Found someone.');

    listen.autoplayTried = true;
    var attempt;
    try { attempt = el.audio.play(); } catch (_e) { attempt = null; }
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () {
        if (listen.message === message && state !== S.LISTEN_ERROR && el.audio.paused) {
          setState(S.LISTEN_READY);
          announce('Found someone.');
        }
      });
    }
  }

  function listenDuration() {
    var d = el.audio.duration;
    if (isFinite(d) && d > 0) return d;
    return listen.message ? Number(listen.message.duration) || 0 : 0;
  }

  function updateListenTime() {
    var total = listenDuration();
    var now = Math.min(el.audio.currentTime || 0, total || Infinity);
    el.timeNow.textContent = clock(now);
    el.timeTotal.textContent = clock(total);
    el.progress.style.width = total ? Math.min(100, (now / total) * 100).toFixed(2) + '%' : '0%';
  }

  function playListener() {
    if (!listen.message) return;
    if (el.audio.ended) el.audio.currentTime = 0;
    var p;
    try { p = el.audio.play(); } catch (_e) { p = null; }
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        var name = err && err.name;
        if (name === 'AbortError') return;
        if (name === 'NotAllowedError') {
          toast(COPY.playBlocked, 'info');
          return;
        }
        toast(COPY.playFailed, 'error');
      });
    }
  }

  var _noise = {
    ctx: null,
    source: null,
    gainNode: null,
    mediaSrc: null,
    ready: false
  };

  function _buildNoise() {
    if (_noise.ready) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _noise.ctx = new AC();
      _noise.mediaSrc = _noise.ctx.createMediaElementSource(el.audio);

      var voiceGain = _noise.ctx.createGain();
      voiceGain.gain.value = 1;
      _noise.mediaSrc.connect(voiceGain);
      voiceGain.connect(_noise.ctx.destination);

      var sr = _noise.ctx.sampleRate;
      var buf = _noise.ctx.createBuffer(1, sr * 2, sr);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      _noise.source = _noise.ctx.createBufferSource();
      _noise.source.buffer = buf;
      _noise.source.loop = true;
      _noise.gainNode = _noise.ctx.createGain();
      _noise.gainNode.gain.value = 0;
      _noise.source.connect(_noise.gainNode);
      _noise.gainNode.connect(_noise.ctx.destination);
      _noise.source.start();
      _noise.ready = true;
    } catch (_e) {  }
  }

  function _noiseOn() {
    _buildNoise();
    if (!_noise.ready) return;
    if (_noise.ctx.state === 'suspended') _noise.ctx.resume();
    var now = _noise.ctx.currentTime;
    _noise.gainNode.gain.cancelScheduledValues(now);

    _noise.gainNode.gain.setValueAtTime(0, now);
    _noise.gainNode.gain.linearRampToValueAtTime(0.022, now + 0.5);
    _noise.gainNode.gain.linearRampToValueAtTime(0, now + 1.8);
  }

  function _noiseOff() {
    if (!_noise.ready) return;
    var now = _noise.ctx.currentTime;
    _noise.gainNode.gain.cancelScheduledValues(now);
    _noise.gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
  }

  el.audio.addEventListener('playing', function () {
    if (!listen.message || !isListenState(state)) return;
    setState(S.LISTEN_PLAYING);
    announce('');
    if (listen.playedFor !== listen.message.id) {
      listen.playedFor = listen.message.id;
      track('radio_message_played');
    }
    _noiseOn();
  });
  el.audio.addEventListener('pause', function () {
    if (!listen.message || el.audio.ended) return;
    if (state === S.LISTEN_PLAYING) setState(S.LISTEN_PAUSED);
    _noiseOff();
  });
  el.audio.addEventListener('ended', function () {
    if (!listen.message) return;
    updateListenTime();
    if (isListenState(state)) setState(S.LISTEN_ENDED);
    _noiseOff();
  });
  el.audio.addEventListener('error', function () {
    if (!listen.message || !el.audio.getAttribute('src')) return;
    listen.message = null;
    if (isListenState(state)) {
      setState(S.LISTEN_ERROR);
      announce('');
      toast(isOffline() ? COPY.listenOffline : COPY.playFailed, 'error');
    }
  });
  el.audio.addEventListener('timeupdate', updateListenTime);
  el.audio.addEventListener('loadedmetadata', updateListenTime);
  el.audio.addEventListener('durationchange', updateListenTime);
  el.audio.addEventListener('volumechange', function () {
    el.mute.classList.toggle('is-muted', el.audio.muted);
    el.mute.setAttribute('aria-pressed', el.audio.muted ? 'true' : 'false');
    el.mute.setAttribute('aria-label', el.audio.muted ? 'Unmute' : 'Mute');
  });

  $('rd-listen-start').addEventListener('click', function () {
    track('radio_listen_started');
    tuneIn();
  });
  $('rd-listen-retry').addEventListener('click', function () { tuneIn(); });
  el.playPause.addEventListener('click', function () {
    if (state === S.LISTEN_PLAYING) el.audio.pause();
    else playListener();
  });
  $('rd-replay').addEventListener('click', function () {
    if (!listen.message) return;
    el.audio.currentTime = 0;
    playListener();
  });
  $('rd-next').addEventListener('click', function () {
    track('radio_next_message');
    tuneIn();
  });
  el.mute.addEventListener('click', function () { el.audio.muted = !el.audio.muted; });

  function settledFreq() {
    return dial.target !== null ? dial.target : dial.freq;
  }

  function tunable() {
    return isListenState(state) && state !== S.LISTEN_TUNING;
  }

  function scheduleCommit(ms) {
    window.clearTimeout(dial.commitTimer);
    dial.commitTimer = window.setTimeout(function () {
      if (tunable()) tuneIn(STATIONS[nearestStationIndex(settledFreq())]);
    }, ms);
  }

  function stepStation(delta) {
    if (!tunable()) return;
    var i = nearestStationIndex(settledFreq());
    var j = Math.max(0, Math.min(STATIONS.length - 1, i + delta));
    if (j === i && Math.abs(STATIONS[i] - settledFreq()) < 0.05) return;
    glideTo(STATIONS[j], reducedMotion ? 0 : 260, false);
    scheduleCommit(550);
  }

  el.tuneDown.addEventListener('click', function () { stepStation(-1); });
  el.tuneUp.addEventListener('click', function () { stepStation(1); });

  el.knob.addEventListener('keydown', function (e) {
    var key = e.key;
    var handled = true;
    if (key === 'ArrowRight' || key === 'ArrowUp') stepStation(1);
    else if (key === 'ArrowLeft' || key === 'ArrowDown') stepStation(-1);
    else if (key === 'PageUp') stepStation(3);
    else if (key === 'PageDown') stepStation(-3);
    else if (key === 'Home') stepStation(-STATIONS.length);
    else if (key === 'End') stepStation(STATIONS.length);
    else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      if (tunable()) {
        window.clearTimeout(dial.commitTimer);
        tuneIn(STATIONS[nearestStationIndex(settledFreq())]);
      }
    } else handled = false;
    if (handled) e.preventDefault();
  });

  function pointerAngle(e) {
    var r = el.knob.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    return Math.atan2(e.clientX - cx, cy - e.clientY) * 180 / Math.PI;
  }

  if (window.PointerEvent) {
    el.knob.addEventListener('pointerdown', function (e) {
      if (!tunable() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      stopTween();
      dial.target = null;
      window.clearTimeout(dial.commitTimer);
      try { el.knob.setPointerCapture(e.pointerId); } catch (_e) {}
      dial.dragging = { id: e.pointerId, last: pointerAngle(e), angle: dialPose(dial.freq).angle, moved: 0 };

      el.knob.classList.add('is-dragging');
    });

    el.knob.addEventListener('pointermove', function (e) {
      var d = dial.dragging;
      if (!d || d.id !== e.pointerId) return;
      var a = pointerAngle(e);
      var delta = a - d.last;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      d.last = a;
      d.moved += Math.abs(delta);
      d.angle = Math.max(-120, Math.min(120, d.angle + delta));
      setDial(freqForAngle(d.angle));
    });

    var endDrag = function (e) {
      var d = dial.dragging;
      if (!d || d.id !== e.pointerId) return;
      dial.dragging = null;
      el.knob.classList.remove('is-dragging');
      try { el.knob.releasePointerCapture(e.pointerId); } catch (_e) {}
      if (!tunable()) return;
      if (d.moved < 4) {

        var next = nearestStationIndex(dial.freq) + 1;
        if (next >= STATIONS.length) next = 0;
        glideTo(STATIONS[next], reducedMotion ? 0 : 320, false);
      } else {
        glideTo(STATIONS[nearestStationIndex(dial.freq)], reducedMotion ? 0 : 200, false);
      }
      scheduleCommit(420);
    };
    el.knob.addEventListener('pointerup', endDrag);
    el.knob.addEventListener('pointercancel', endDrag);
  } else {
    el.knob.addEventListener('click', function () { stepStation(1); });
  }

  function recorderSupported() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder === 'function');
  }

  function pickMimeType() {
    var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') return '';
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_e) {}
    }
    return '';
  }

  function recordedSeconds() {
    var extra = rec.segmentStart ? (Date.now() - rec.segmentStart) / 1000 : 0;
    return rec.elapsedBase + extra;
  }

  function showRecordError(message) {
    el.recAlert.textContent = message;
    setState(S.RECORD_ERROR);
  }

  function stopMeter() {
    if (rec.meterRaf) window.cancelAnimationFrame(rec.meterRaf);
    rec.meterRaf = 0;
    if (rec.meterCtx) {
      try { rec.meterCtx.close(); } catch (_e) {}
      rec.meterCtx = null;
    }
    for (var i = 0; i < el.bars.length; i++) el.bars[i].style.opacity = '';
  }

  function startMeter(stream) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || reducedMotion) return;
    try {
      var ctx = new Ctx();
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      var data = new Uint8Array(analyser.fftSize);
      rec.meterCtx = ctx;
      var tick = function () {
        if (rec.meterCtx !== ctx) return;
        analyser.getByteTimeDomainData(data);
        var peak = 0;
        for (var i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        var level = state === S.RECORDING ? Math.min(1, peak / 48) : 0;
        for (var b = 0; b < el.bars.length; b++) {
          el.bars[b].style.opacity = level > (b + 0.5) / el.bars.length ? '1' : '.22';
        }
        rec.meterRaf = window.requestAnimationFrame(tick);
      };
      rec.meterRaf = window.requestAnimationFrame(tick);
    } catch (_e) {
      stopMeter();
    }
  }

  function stopTracks() {
    if (rec.stream) {
      rec.stream.getTracks().forEach(function (t) {
        t.onended = null;
        try { t.stop(); } catch (_e) {}
      });
      rec.stream = null;
    }
    stopMeter();
  }

  function clearRecTimer() {
    if (rec.timer) window.clearInterval(rec.timer);
    rec.timer = null;
  }

  function stopPreview() {
    try { el.preview.pause(); } catch (_e) {}
    if (el.preview.getAttribute('src')) {
      el.preview.removeAttribute('src');
      try { el.preview.load(); } catch (_e) {}
    }
  }

  function abortBroadcast() {
    if (rec.retryTimer) window.clearTimeout(rec.retryTimer);
    rec.retryTimer = null;
    if (rec.request) {
      try { rec.request.abort(); } catch (_e) {}
      rec.request = null;
    }
  }

  function discardRecording() {
    abortBroadcast();
    clearRecTimer();
    if (rec.recorder) {
      rec.discarded = true;
      var r = rec.recorder;
      r.ondataavailable = null;
      r.onerror = null;
      if (r.state !== 'inactive') {
        try { r.stop(); } catch (_e) {}
      }
      rec.recorder = null;
    }
    stopTracks();
    stopPreview();
    if (rec.url) {
      try { URL.revokeObjectURL(rec.url); } catch (_e) {}
      rec.url = null;
    }
    rec.blob = null;
    rec.chunks = [];
    rec.elapsedBase = 0;
    rec.segmentStart = 0;
    rec.seconds = 0;
    rec.key = '';
    rec.retries = 0;
  }

  function openRecorder() {
    listen.token++;
    abortListenRequest();
    stopTween();
    window.clearTimeout(dial.commitTimer);
    try { el.audio.pause(); } catch (_e) {}
    discardRecording();
    setState(S.RECORD_INTRO);
    announce('');
    if (el.recordTitle) el.recordTitle.focus({ preventScroll: true });
  }

  function leaveRecorder() {
    discardRecording();
    if (listen.message && el.audio.getAttribute('src')) {
      setState(el.audio.ended ? S.LISTEN_ENDED : (el.audio.currentTime > 0 ? S.LISTEN_PAUSED : S.LISTEN_READY));
    } else {
      setState(S.LISTEN_IDLE);
    }
    announce('');
    $('rd-title').focus({ preventScroll: true });
  }

  function startRecording() {
    if (state === S.RECORD_REQUESTING || state === S.RECORDING || state === S.RECORDING_PAUSED) return;
    discardRecording();
    if (!recorderSupported()) {
      showRecordError(COPY.micUnsupported);
      return;
    }
    setState(S.RECORD_REQUESTING);

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {

        if (state !== S.RECORD_REQUESTING) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        rec.stream = stream;
        rec.mime = pickMimeType();
        var recorder;
        try {
          recorder = new window.MediaRecorder(stream, rec.mime ? { mimeType: rec.mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
        } catch (_e) {

          try {
            rec.mime = '';
            recorder = new window.MediaRecorder(stream);
          } catch (_e2) {
            stopTracks();
            showRecordError(COPY.micUnsupported);
            return;
          }
        }
        rec.recorder = recorder;
        rec.discarded = false;
        rec.chunks = [];
        recorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size) rec.chunks.push(ev.data);
        };
        recorder.onstop = function () { finalizeRecording(recorder); };
        recorder.onerror = function () {
          discardRecording();
          showRecordError(COPY.micFailed);
        };

        stream.getAudioTracks().forEach(function (t) {
          t.onended = function () {
            if (state === S.RECORDING || state === S.RECORDING_PAUSED) toast(COPY.micLost, 'info');
            stopRecording();
          };
        });

        try {
          recorder.start(1000);
        } catch (_e) {
          discardRecording();
          showRecordError(COPY.micFailed);
          return;
        }
        rec.elapsedBase = 0;
        rec.segmentStart = Date.now();
        startMeter(stream);
        rec.timer = window.setInterval(tickRecording, 200);
        tickRecording();
        setState(S.RECORDING);
        announceQuietly('Recording.');
        track('radio_record_started');
      })
      .catch(function (err) {
        if (state !== S.RECORD_REQUESTING) return;
        var name = err && err.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          showRecordError(COPY.micDenied);
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
          showRecordError(COPY.micMissing);
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          showRecordError(COPY.micBusy);
        } else {
          showRecordError(COPY.micFailed);
        }
      });
  }

  function tickRecording() {
    var s = Math.min(MAX_SECONDS, recordedSeconds());
    el.recNow.textContent = clock(s);
    el.recFill.style.width = ((s / MAX_SECONDS) * 100).toFixed(2) + '%';
    if (s >= MAX_SECONDS) stopRecording();
  }

  function pauseResumeRecording() {
    var r = rec.recorder;
    if (!r) return;
    if (state === S.RECORDING && typeof r.pause === 'function') {
      try { r.pause(); } catch (_e) { return; }
      rec.elapsedBase += (Date.now() - rec.segmentStart) / 1000;
      rec.segmentStart = 0;
      setState(S.RECORDING_PAUSED);
      announceQuietly('Paused.');
    } else if (state === S.RECORDING_PAUSED && typeof r.resume === 'function') {
      try { r.resume(); } catch (_e) { return; }
      rec.segmentStart = Date.now();
      setState(S.RECORDING);
      announceQuietly('Recording.');
    }
  }

  function stopRecording() {
    var r = rec.recorder;
    if (!r || (state !== S.RECORDING && state !== S.RECORDING_PAUSED)) return;
    rec.seconds = Math.min(MAX_SECONDS, recordedSeconds());
    rec.elapsedBase = rec.seconds;
    rec.segmentStart = 0;
    clearRecTimer();
    tickRecording();
    if (r.state !== 'inactive') {
      try { r.stop(); } catch (_e) { finalizeRecording(r); }
    } else {
      finalizeRecording(r);
    }
  }

  function finalizeRecording(recorder) {
    if (rec.recorder !== recorder || rec.discarded) return;
    rec.recorder = null;

    stopTracks();
    var type = recorder.mimeType || rec.mime || (rec.chunks[0] && rec.chunks[0].type) || 'audio/webm';
    var blob = new Blob(rec.chunks, { type: type.split(';')[0] });
    rec.chunks = [];

    if (rec.seconds < MIN_SECONDS || blob.size < 1024) {
      showRecordError(COPY.tooShort);
      return;
    }
    if (blob.size > MAX_BYTES) {
      showRecordError(COPY.tooBig);
      return;
    }
    rec.blob = blob;
    rec.url = URL.createObjectURL(blob);
    rec.key = randomKey();
    el.preview.src = rec.url;
    el.recNow.textContent = clock(rec.seconds);
    setState(S.RECORD_READY);
    announceQuietly('Your message is ready.');
    track('radio_record_completed', { seconds: Math.round(rec.seconds) });
  }

  el.preview.addEventListener('playing', function () {
    if (state === S.RECORD_READY || state === S.RECORD_FAILED || state === S.RECORD_BREAK) setState(S.RECORD_PREVIEW);
  });
  function previewStopped() {
    if (state === S.RECORD_PREVIEW) setState(S.RECORD_READY);
  }
  el.preview.addEventListener('pause', previewStopped);
  el.preview.addEventListener('ended', previewStopped);
  el.preview.addEventListener('error', function () {
    if (!rec.url) return;
    previewStopped();
    toast(COPY.previewFailed, 'info');
  });

  el.previewPlay.addEventListener('click', function () {
    if (!rec.url) return;
    if (state === S.RECORD_PREVIEW) {
      el.preview.pause();
      return;
    }
    if (el.preview.ended) el.preview.currentTime = 0;
    var p;
    try { p = el.preview.play(); } catch (_e) { p = null; }
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        var name = err && err.name;
        if (name === 'AbortError') return;
        toast(name === 'NotAllowedError' ? COPY.playBlocked : COPY.previewFailed, 'info');
      });
    }
  });

  function failBroadcast(message, nextState) {
    el.recAlert.textContent = message;
    setState(nextState || S.RECORD_FAILED);
    announce('');
    toast(message, 'error');
  }

  function broadcast() {
    if (!rec.blob || state === S.RECORD_SUBMITTING) return;
    try { el.preview.pause(); } catch (_e) {}
    setState(S.RECORD_SUBMITTING);
    announceQuietly('Sending your voice out…');
    if (isOffline()) {
      failBroadcast(COPY.sendOffline);
      return;
    }
    if (rec.retries === 0) track('radio_broadcast_submitted');

    var form = new FormData();
    form.append('key', rec.key);
    form.append('audio', rec.blob, 'message');

    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    rec.request = controller;
    var timeout = window.setTimeout(function () { if (controller) controller.abort(); }, 90000);

    fetch('/api/radio/broadcast', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-lb-csrf': 'true' },
      body: form,
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body || {} };
        });
      })
      .then(function (out) {
        if (rec.request !== controller) return;
        var result = out.body.status;
        if (out.status === 200 && result === 'approved') {
          discardRecording();
          setState(S.RECORD_APPROVED);
          announce('');
          track('radio_broadcast_approved');
        } else if (out.status === 200 && result === 'rejected') {
          discardRecording();
          if (out.body.code === 'radio_blocked') {
            setState(S.RECORD_BLOCKED);
          } else {
            setState(S.RECORD_REJECTED);
            if (out.body.code === 'radio_unsupported_language') {
              toast(COPY.unsupportedLanguage, 'info');
            }
          }
          announce('');
          track('radio_broadcast_rejected');
        } else if (out.status === 202 && rec.retries < 5) {

          rec.retries++;
          rec.request = null;
          rec.retryTimer = window.setTimeout(function () {
            rec.retryTimer = null;
            if (state === S.RECORD_SUBMITTING) {
              state = S.RECORD_READY;
              broadcast();
            }
          }, 4000);
        } else if (out.status === 403 && out.body.code === 'radio_blocked') {

          discardRecording();
          setState(S.RECORD_BLOCKED);
          announce('');
          toast(COPY.blocked, 'error');
          track('radio_broadcast_blocked');
        } else if (out.status === 429 && out.body.code === 'radio_limit') {

          discardRecording();
          setState(S.RECORD_LIMIT);
          announce('');
          toast(COPY.limit, 'info');
          track('radio_broadcast_limit');
        } else if (out.status === 503 && out.body.code === 'radio_break') {
          failBroadcast(COPY.radioBreak, S.RECORD_BREAK);
        } else if (out.status === 429) {
          failBroadcast(COPY.sendBusy);
        } else if (out.status === 413) {
          failBroadcast(COPY.tooBig);
        } else if (out.status === 400) {
          failBroadcast(COPY.badRecording);
        } else {
          failBroadcast(COPY.sendFailed);
        }
      })
      .catch(function () {
        if (rec.request !== controller) return;

        failBroadcast(isOffline() ? COPY.sendOffline : COPY.sendFailed);
      })
      .then(function () {
        window.clearTimeout(timeout);
        if (rec.request === controller) rec.request = null;
      });
  }

  $('rd-leave').addEventListener('click', openRecorder);
  $('rd-rec-leave').addEventListener('click', leaveRecorder);
  el.recStart.addEventListener('click', startRecording);
  el.recPause.addEventListener('click', pauseResumeRecording);
  $('rd-rec-stop').addEventListener('click', stopRecording);
  $('rd-rec-again').addEventListener('click', function () {
    discardRecording();
    setState(S.RECORD_INTRO);
    startRecording();
  });
  $('rd-rejected-again').addEventListener('click', function () {
    discardRecording();
    setState(S.RECORD_INTRO);
    startRecording();
  });
  el.broadcast.addEventListener('click', broadcast);
  $('rd-approved-listen').addEventListener('click', function () {
    discardRecording();
    setState(S.LISTEN_IDLE);
    tuneIn();
  });

  var modal = { lastFocus: null, messageId: null, sending: false, hiddenSiblings: [] };

  function modalFocusables() {
    return Array.prototype.filter.call(
      el.modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'),
      function (node) { return !node.disabled && node.offsetParent !== null; }
    );
  }

  function openReport() {
    if (!listen.message || listen.reported[listen.message.id]) return;
    modal.messageId = listen.message.id;
    modal.lastFocus = document.activeElement;
    el.reportForm.reset();
    syncReasons();
    el.reportError.hidden = true;
    el.modal.hidden = false;

    modal.hiddenSiblings = [];
    var nodes = [app, document.querySelector('.mobile-header'), document.querySelector('.main-header'), document.querySelector('footer')];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      nodes[i].setAttribute('aria-hidden', 'true');
      if ('inert' in nodes[i]) nodes[i].inert = true;
      modal.hiddenSiblings.push(nodes[i]);
    }
    document.addEventListener('keydown', onModalKey, true);
    var first = el.modal.querySelector('input[name="reason"]');
    if (first) first.focus();
  }

  function closeReport() {
    if (el.modal.hidden) return;
    el.modal.hidden = true;
    document.removeEventListener('keydown', onModalKey, true);
    for (var i = 0; i < modal.hiddenSiblings.length; i++) {
      modal.hiddenSiblings[i].removeAttribute('aria-hidden');
      if ('inert' in modal.hiddenSiblings[i]) modal.hiddenSiblings[i].inert = false;
    }
    modal.hiddenSiblings = [];

    var candidates = [el.reportOpen, $('rd-next'), el.playPause, $('rd-title')];
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j];
      if (c && !c.disabled && (c.offsetParent !== null || c.id === 'rd-title')) {
        c.focus();
        break;
      }
    }
  }

  function onModalKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeReport();
      return;
    }
    if (e.key !== 'Tab') return;
    var items = modalFocusables();
    if (!items.length) return;

    items = items.filter(function (node) {
      return node.name !== 'reason' || node.checked || (!el.reportForm.querySelector('input[name="reason"]:checked') && node === el.reportForm.querySelector('input[name="reason"]'));
    });
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !el.modal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !el.modal.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }

  function syncReasons() {
    var inputs = el.reportForm.querySelectorAll('input[name="reason"]');
    var any = false;
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].parentNode.classList.toggle('is-checked', inputs[i].checked);
      if (inputs[i].checked) any = true;
    }
    el.reportSubmit.disabled = !any || modal.sending;
  }

  el.reportOpen.addEventListener('click', openReport);
  el.reportForm.addEventListener('change', syncReasons);
  Array.prototype.forEach.call(el.modal.querySelectorAll('[data-report-close]'), function (node) {
    node.addEventListener('click', closeReport);
  });

  el.reportForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var checked = el.reportForm.querySelector('input[name="reason"]:checked');
    if (!checked || modal.sending || !modal.messageId) return;
    var id = modal.messageId;
    if (isOffline()) {
      el.reportError.textContent = COPY.reportOffline;
      el.reportError.hidden = false;
      return;
    }
    modal.sending = true;
    syncReasons();
    el.reportError.hidden = true;

    fetch('/api/radio/report', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-lb-csrf': 'true' },
      body: JSON.stringify({ id: id, reason: checked.value })
    })
      .then(function (res) {
        if (res.ok || res.status === 404) {
          listen.reported[id] = true;
          track('radio_report_submitted', { reason: checked.value });
          if (listen.message && listen.message.id === id) {
            try { el.audio.pause(); } catch (_e2) {}
          }
          closeReport();
          render();
          announce(COPY.reportThanks);
          toast(COPY.reportThanks, 'success');
          return;
        }
        el.reportError.textContent = res.status === 429 ? COPY.reportBusy : COPY.reportFailed;
        el.reportError.hidden = false;
      })
      .catch(function () {
        el.reportError.textContent = isOffline() ? COPY.reportOffline : COPY.reportFailed;
        el.reportError.hidden = false;
      })
      .then(function () {
        modal.sending = false;
        syncReasons();
      });
  });

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (_e) {
      return false;
    }
  }

  function share() {
    var url = window.location.origin + '/studio/radio';
    var text = 'I just heard a stranger on LensBooth Radio.\nTune in and hear one too.';
    var full = text + '\n' + url;
    track('radio_shared');
    function copy() {
      var done = function (ok) { toast(ok ? COPY.copied : COPY.copyFailed, ok ? 'success' : 'info'); };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
        navigator.clipboard.writeText(full).then(function () { done(true); }, function () { done(legacyCopy(full)); });
      } else {
        done(legacyCopy(full));
      }
    }
    if (navigator.share) {
      navigator.share({ title: 'LensBooth Radio', text: text, url: url }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        copy();
      });
      return;
    }
    copy();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-share]'), function (node) {
    node.addEventListener('click', share);
  });

  document.addEventListener('visibilitychange', function () {

    if (document.hidden && (state === S.RECORDING || state === S.RECORDING_PAUSED)) stopRecording();
  });

  window.addEventListener('pagehide', function () {
    listen.token++;
    abortListenRequest();
    stopTween();
    window.clearTimeout(dial.commitTimer);
    stopListenerAudio();
    discardRecording();
  });

  window.addEventListener('pageshow', function (e) {

    if (e.persisted) {
      listen.message = null;
      setState(S.LISTEN_IDLE);
      announce('');
    }
  });

  var WELCOME_KEY = 'lb-radio-welcome-v1';
  var welcome = { el: $('rd-welcome'), last: null, hidden: [], closeTimer: null };

  function welcomeSeen() {
    try {
      if (window.localStorage.getItem(WELCOME_KEY) === '1') return true;
    } catch (_e) {}
    try {
      return window.sessionStorage.getItem(WELCOME_KEY) === '1';
    } catch (_e2) {
      return false;
    }
  }

  function markWelcomeSeen() {
    try {
      window.localStorage.setItem(WELCOME_KEY, '1');
      return;
    } catch (_e) {}
    try { window.sessionStorage.setItem(WELCOME_KEY, '1'); } catch (_e2) {}
  }

  function welcomeFocusables() {
    return Array.prototype.filter.call(
      welcome.el.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'),
      function (node) { return !node.disabled && node.offsetParent !== null; }
    );
  }

  function onWelcomeKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeWelcome();
      return;
    }
    if (e.key !== 'Tab') return;
    var items = welcomeFocusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var inside = welcome.el.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  function openWelcome() {
    if (!welcome.el || !welcome.el.hidden) return;
    if (!el.modal.hidden) return;
    welcome.last = document.activeElement;
    welcome.el.hidden = false;
    welcome.hidden = [];
    var nodes = [app, document.querySelector('.mobile-header'), document.querySelector('.main-header'), document.querySelector('footer')];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      nodes[i].setAttribute('aria-hidden', 'true');
      if ('inert' in nodes[i]) nodes[i].inert = true;
      welcome.hidden.push(nodes[i]);
    }
    document.addEventListener('keydown', onWelcomeKey, true);
    void welcome.el.offsetWidth;
    welcome.el.classList.add('is-open');
    var go = $('rd-welcome-go');
    if (go) go.focus({ preventScroll: true });
    track('radio_welcome_shown');
  }

  function closeWelcome(afterClose) {
    if (!welcome.el || welcome.el.hidden) return;
    markWelcomeSeen();
    document.removeEventListener('keydown', onWelcomeKey, true);
    for (var i = 0; i < welcome.hidden.length; i++) {
      welcome.hidden[i].removeAttribute('aria-hidden');
      if ('inert' in welcome.hidden[i]) welcome.hidden[i].inert = false;
    }
    welcome.hidden = [];
    welcome.el.classList.remove('is-open');
    welcome.el.hidden = true;
    if (typeof afterClose === 'function') {
      afterClose();
      return;
    }
    var back = welcome.last && welcome.last !== document.body ? welcome.last : $('rd-listen-start');
    if (back && typeof back.focus === 'function' && back.offsetParent !== null) back.focus({ preventScroll: true });
  }

  if (welcome.el) {
    $('rd-welcome-go').addEventListener('click', function () {
      track('radio_welcome_accepted');
      closeWelcome(function () {
        $('rd-title').focus({ preventScroll: true });
      });
    });
    $('rd-welcome-more').addEventListener('click', function () {
      closeWelcome(function () {
        var openers = document.querySelectorAll('[data-info-open]');
        for (var i = 0; i < openers.length; i++) {
          if (openers[i].offsetParent !== null) {
            openers[i].click();
            return;
          }
        }
      });
    });
    Array.prototype.forEach.call(welcome.el.querySelectorAll('[data-welcome-close]'), function (node) {
      node.addEventListener('click', function () { closeWelcome(); });
    });
    if (!welcomeSeen()) {
      window.setTimeout(openWelcome, reducedMotion ? 0 : 400);
    }
  }

  setDial(dial.freq);
  render();
  track('radio_page_view');
}());
