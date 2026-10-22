(function (window, document) {
  'use strict';

  var ART = window.LBCassetteArt;

  var VIDEO_W = 1280;
  var VIDEO_H = 960;
  var FPS = 30;

  var DECK_W = 620;
  var DECK_X = (VIDEO_W - DECK_W) / 2;
  var STAGE_H = DECK_W * 0.69;
  var PANEL_H = DECK_W * 0.2;
  var DECK_H = STAGE_H + PANEL_H;
  var CASS_W = DECK_W * 0.84;
  var CASS_H = CASS_W * ART.HEIGHT / ART.WIDTH;
  var CASS_X = DECK_W * 0.08;
  var CASS_Y = DECK_W * 0.07;

  var WINDOW = { x: DECK_W * 0.055, y: DECK_W * 0.052, w: DECK_W * 0.89, h: DECK_W * 0.56, r: DECK_W * 0.035 };
  var LINE = 5;

  var DECK_Y_INSERT = 420;
  var DECK_Y_SETTLED = 232;

  var T_INSERT_START = 0.25;
  var T_INSERT = 2.5;
  var T_SETTLE_START = T_INSERT_START + T_INSERT + 0.1;
  var T_SETTLE = 0.8;
  var T_AUDIO = T_SETTLE_START + T_SETTLE + 0.45;
  var T_TAIL = 1.2;

  var COLORS = {
    bg: '#F4F4F0',
    grid: 'rgba(0, 0, 0, 0.07)',
    ink: '#000000',
    body: '#FFFFFF',
    bay: '#F0EDE8',
    bayDot: 'rgba(0, 0, 0, 0.12)',
    muted: '#737373',
    readout: '#111111',
    primary: '#F12850'
  };

  var TAPE_SPEED = 2 * Math.PI * 86 * 1.05;

  function AudioCtx() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function pickMimeType() {
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') return '';

    var candidates = [
      'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_e) {}
    }
    return '';
  }

  function isSupported() {
    var probe = document.createElement('canvas');
    return !!(
      probe.captureStream &&
      window.MediaRecorder &&
      window.MediaStream &&
      AudioCtx() &&
      pickMimeType()
    );
  }

  function bezier(x1, y1, x2, y2) {
    function at(a1, a2, t) {
      return ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t;
    }
    function slope(a1, a2, t) {
      return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 6; i++) {
        var d = slope(x1, x2, t);
        if (Math.abs(d) < 1e-6) break;
        t -= (at(x1, x2, t) - x) / d;
      }
      return at(y1, y2, Math.max(0, Math.min(1, t)));
    };
  }

  var EASE_IN_OUT = bezier(0.45, 0, 0.2, 1);
  var EASE_ALIGN = bezier(0.3, 0, 0.3, 1);
  var EASE_SLOW = bezier(0.55, 0, 0.8, 0.4);
  var EASE_SLIDE = bezier(0.7, 0, 0.9, 0.6);
  var EASE_PULL = bezier(0.2, 0.6, 0.3, 1);
  var EASE_SETTLE = bezier(0.23, 1, 0.32, 1);

  function insertionFrames() {
    var above = -(CASS_H + CASS_Y + 0.035 * DECK_W);
    return [
      { o: 0, x: -0.13 * DECK_W, y: above - 0.03 * DECK_W, r: -9, a: 0, e: EASE_IN_OUT },
      { o: 0.12, x: -0.1 * DECK_W, y: above - 0.035 * DECK_W, r: -7, a: 1, e: EASE_ALIGN },
      { o: 0.42, x: 0, y: above, r: 0, a: 1, e: EASE_SLOW },
      { o: 0.52, x: 0, y: above + 3, r: 0, a: 1, e: EASE_SLIDE },
      { o: 0.8, x: 0, y: above * 0.52, r: 0, a: 1, e: EASE_PULL },
      { o: 0.93, x: 0, y: 0.006 * DECK_W, r: 0, a: 1, e: EASE_IN_OUT },
      { o: 1, x: 0, y: 0, r: 0, a: 1 }
    ];
  }

  function sampleFrames(frames, progress) {
    var p = Math.max(0, Math.min(1, progress));
    for (var i = 0; i < frames.length - 1; i++) {
      var from = frames[i];
      var to = frames[i + 1];
      if (p <= to.o) {
        var local = (p - from.o) / (to.o - from.o || 1);
        var k = from.e ? from.e(local) : local;
        return {
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
          r: from.r + (to.r - from.r) * k,
          a: from.a + (to.a - from.a) * k
        };
      }
    }
    var last = frames[frames.length - 1];
    return { x: last.x, y: last.y, r: last.r, a: last.a };
  }

  function flapAt(p) {
    if (p < 0.5) return 1;
    if (p < 0.56) return 1 - 0.85 * ((p - 0.5) / 0.06);
    if (p < 0.9) return 0.15;
    if (p < 1) return 0.15 + 0.85 * ((p - 0.9) / 0.1);
    return 1;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function clockText(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  function spacedText(ctx, text, x, y, spacing) {
    var cursor = x;
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text.charAt(i), cursor, y);
      cursor += ctx.measureText(text.charAt(i)).width + spacing;
    }
  }

  function createScene(layers) {
    var spokePaths = {};
    ['left', 'right'].forEach(function (side) {
      spokePaths[side] = layers.reels[side].spokes.map(function (spoke) {
        return { path: new window.Path2D(spoke.d), fill: spoke.fill };
      });
    });

    var background = document.createElement('canvas');
    background.width = VIDEO_W;
    background.height = VIDEO_H;
    (function paintBackground(bg) {
      bg.fillStyle = COLORS.bg;
      bg.fillRect(0, 0, VIDEO_W, VIDEO_H);
      bg.fillStyle = COLORS.grid;
      var step = 48;
      var offsetX = (VIDEO_W % step) / 2;
      var offsetY = (VIDEO_H % step) / 2;
      for (var x = offsetX; x <= VIDEO_W; x += step) bg.fillRect(Math.round(x), 0, 2, VIDEO_H);
      for (var y = offsetY; y <= VIDEO_H; y += step) bg.fillRect(0, Math.round(y), VIDEO_W, 2);
    })(background.getContext('2d'));

    var WATERMARK_H = 46;
    var WATERMARK_Y = VIDEO_H - 36 - WATERMARK_H;

    function drawWatermark(ctx, alpha) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 26px Satoshi, -apple-system, "Segoe UI", sans-serif';
      var text = 'lensbooth.app';
      var w = ctx.measureText(text).width + 44;
      var h = WATERMARK_H;
      var x = (VIDEO_W - w) / 2;
      var y = WATERMARK_Y;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = COLORS.bg;
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, VIDEO_W / 2, y + h / 2 + 1);
      ctx.restore();
    }

    function drawCassette(ctx, tape) {
      var k = CASS_W / ART.WIDTH;
      ctx.save();
      ctx.scale(k, k);
      ctx.drawImage(layers.bottom, 0, 0, ART.WIDTH, ART.HEIGHT);

      var radii = ART.packRadii(tape.progress);
      ['left', 'right'].forEach(function (side) {
        var reel = layers.reels[side];
        if (reel.packColor) {
          ctx.beginPath();
          ctx.arc(reel.cx, reel.cy, radii[side], 0, Math.PI * 2, false);
          ctx.arc(reel.cx, reel.cy, layers.hubRadius, 0, Math.PI * 2, true);
          ctx.fillStyle = reel.packColor;
          ctx.fill();
        }
        spokePaths[side].forEach(function (spoke) {
          ctx.save();
          ctx.translate(reel.cx, reel.cy);
          ctx.rotate(tape.angles[side] * Math.PI / 180);
          ctx.translate(-reel.cx, -reel.cy);
          ctx.fillStyle = spoke.fill;
          ctx.fill(spoke.path);
          ctx.restore();
        });
      });

      ctx.drawImage(layers.top, 0, 0, ART.WIDTH, ART.HEIGHT);
      ctx.restore();
    }

    function draw(ctx, state) {
      ctx.drawImage(background, 0, 0);

      if (state.heading > 0) {
        ctx.save();
        ctx.globalAlpha = state.heading;
        ctx.translate(VIDEO_W / 2, DECK_Y_SETTLED - 92 + (1 - state.heading) * 16);
        ctx.rotate(-2 * Math.PI / 180);
        ctx.fillStyle = COLORS.primary;
        ctx.font = '700 84px Caveat, cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('A cassette for you', 0, 0);
        ctx.restore();
      }

      var dx = DECK_X;
      var dy = state.deckY + state.bump;

      ctx.save();
      ctx.translate(dx, dy);

      ctx.beginPath();
      roundRect(ctx, 12, 12, DECK_W, DECK_H, 52);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, 0, 0, DECK_W, DECK_H, 52);
      ctx.fillStyle = COLORS.body;
      ctx.fill();

      ctx.beginPath();
      roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r);
      ctx.fillStyle = COLORS.bay;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = COLORS.bayDot;
      for (var gy = WINDOW.y + 6; gy < WINDOW.y + WINDOW.h; gy += 14) {
        for (var gx = WINDOW.x + 6; gx < WINDOW.x + WINDOW.w; gx += 14) {
          ctx.fillRect(gx, gy, 1.6, 1.6);
        }
      }
      ctx.restore();

      if (state.cassette && state.cassette.a > 0) {
        ctx.save();
        ctx.globalAlpha = state.cassette.a;
        var cx = CASS_X + CASS_W / 2 + state.cassette.x;
        var cy = CASS_Y + CASS_H / 2 + state.cassette.y;
        ctx.translate(cx, cy);
        ctx.rotate(state.cassette.r * Math.PI / 180);
        ctx.translate(-CASS_W / 2, -CASS_H / 2);
        drawCassette(ctx, state.tape);
        ctx.restore();
      }

      ctx.beginPath();
      roundRect(ctx, 0, 0, DECK_W, DECK_H, 52);
      roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r);
      ctx.fillStyle = COLORS.body;
      ctx.fill('evenodd');

      ctx.lineWidth = LINE;
      ctx.strokeStyle = COLORS.ink;
      ctx.beginPath();
      roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r);
      ctx.stroke();
      ctx.beginPath();
      roundRect(ctx, 0, 0, DECK_W, DECK_H, 52);
      ctx.stroke();

      var slotX = DECK_W * 0.06;
      var slotW = DECK_W * 0.88;
      var slotH = Math.max(18, DECK_W * 0.03);
      var slotY = -DECK_W * 0.014;
      ctx.beginPath();
      roundRect(ctx, slotX, slotY, slotW, slotH, slotH / 2);
      ctx.fillStyle = '#111111';
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, slotX, slotY, slotW, slotH, slotH / 2);
      ctx.clip();
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(slotX + slotW * 0.03, slotY, slotW * 0.94, slotH * 0.55 * state.flap);
      ctx.restore();
      ctx.beginPath();
      roundRect(ctx, slotX, slotY, slotW, slotH, slotH / 2);
      ctx.lineWidth = LINE;
      ctx.stroke();

      var plateY = (WINDOW.y + WINDOW.h + STAGE_H) / 2 + 1;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = '800 23px Satoshi, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = COLORS.primary;
      ctx.fillText('Lens', WINDOW.x, plateY);
      var lensW = ctx.measureText('Lens').width;
      ctx.fillStyle = COLORS.ink;
      ctx.fillText('Booth', WINDOW.x + lensW, plateY);
      ctx.font = '700 15px Satoshi, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = COLORS.muted;
      var model = 'CASSETTE PLAYER';
      var modelW = 0;
      for (var mi = 0; mi < model.length; mi++) modelW += ctx.measureText(model.charAt(mi)).width + 2.2;
      spacedText(ctx, model, WINDOW.x + WINDOW.w - modelW + 2.2, plateY, 2.2);

      var rx = DECK_W * 0.05;
      var ry = STAGE_H + DECK_W * 0.012;
      var rw = DECK_W * 0.9;
      var rh = DECK_W * 0.12;
      ctx.beginPath();
      roundRect(ctx, rx, ry, rw, rh, 20);
      ctx.fillStyle = COLORS.readout;
      ctx.fill();

      var mid = ry + rh / 2;
      ctx.font = '700 24px Satoshi, -apple-system, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = state.playing ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(rx + 26, mid - 11);
      ctx.lineTo(rx + 26, mid + 11);
      ctx.lineTo(rx + 45, mid);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = 'left';
      spacedText(ctx, 'PLAY', rx + 58, mid + 1, 2.4);

      var counter = clockText(Math.min(state.seconds, state.total)) + ' / ' + clockText(state.total);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 28px Satoshi, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(counter, rx + rw - 24, mid + 1);
      var counterW = ctx.measureText(counter).width;

      var meterX = rx + 150;
      var meterW = Math.max(40, rw - 24 - counterW - 28 - (meterX - rx));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      roundRect(ctx, meterX, mid - 4, meterW, 8, 4);
      ctx.fill();
      var ratio = state.total > 0 ? Math.max(0, Math.min(1, state.seconds / state.total)) : 0;
      if (ratio > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        roundRect(ctx, meterX, mid - 4, Math.max(8, meterW * ratio), 8, 4);
        ctx.fill();
      }

      ctx.restore();

      var clearance = WATERMARK_Y - (dy + DECK_H + 12) - 14;
      drawWatermark(ctx, Math.max(0, Math.min(1, clearance / 36)));
    }

    return { draw: draw };
  }

  function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('read')); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function decode(context, arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function ok(buffer) { if (!settled) { settled = true; resolve(buffer); } }
      function fail() { if (!settled) { settled = true; reject(new Error('decode')); } }
      try {
        var result = context.decodeAudioData(arrayBuffer, ok, fail);
        if (result && typeof result.then === 'function') result.then(ok, fail);
      } catch (_e) {
        fail();
      }
    });
  }

  function measureDuration(blob) {
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline || !blob) return Promise.resolve(null);
    var context;
    try {
      context = new Offline(1, 44100, 44100);
    } catch (_e) {
      return Promise.resolve(null);
    }
    return blobToArrayBuffer(blob)
      .then(function (data) { return decode(context, data); })
      .then(function (buffer) { return buffer && isFinite(buffer.duration) ? buffer.duration : null; })
      .catch(function () { return null; });
  }

  function render(options) {
    var cancelled = false;
    var cleanup = [];
    var cancelHook = null;

    function onCleanup(fn) { cleanup.push(fn); }
    function runCleanup() {
      while (cleanup.length) {
        try { cleanup.pop()(); } catch (_e) {}
      }
    }

    var promise = new Promise(function (resolve, reject) {
      if (!isSupported()) {
        reject(new Error('unsupported'));
        return;
      }

      var Ctx = AudioCtx();
      var audioContext = new Ctx();
      onCleanup(function () { if (audioContext.close) audioContext.close(); });

      var fontsReady = document.fonts && document.fonts.load
        ? Promise.all([
          document.fonts.load('900 20px Satoshi'),
          document.fonts.load('700 20px Satoshi'),
          document.fonts.load('700 40px Caveat')
        ]).catch(function () {})
        : Promise.resolve();

      Promise.all([
        ART.renderLayers(options.design, options.state, Math.round(CASS_W * 1.5)),
        blobToArrayBuffer(options.audio).then(function (data) { return decode(audioContext, data); }),
        fontsReady,
        audioContext.resume ? audioContext.resume().catch(function () {}) : Promise.resolve()
      ]).then(function (results) {
        if (cancelled) throw new Error('cancelled');
        var layers = results[0];
        var buffer = results[1];
        var duration = buffer.duration;
        var total = T_AUDIO + duration + T_TAIL;
        var scene = createScene(layers);

        var canvas = document.createElement('canvas');
        canvas.width = VIDEO_W;
        canvas.height = VIDEO_H;

        canvas.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;pointer-events:none;';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        onCleanup(function () { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); });
        var ctx = canvas.getContext('2d');

        var destination = audioContext.createMediaStreamDestination();
        var videoStream = canvas.captureStream(FPS);
        var tracks = videoStream.getVideoTracks().concat(destination.stream.getAudioTracks());
        var stream = new window.MediaStream(tracks);
        onCleanup(function () { tracks.forEach(function (t) { try { t.stop(); } catch (_e) {} }); });

        var mime = pickMimeType();
        var recorder = new window.MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 3000000,
          audioBitsPerSecond: 128000
        });
        var chunks = [];
        recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

        var tape = { progress: ART.ART_PROGRESS, angles: { left: 0, right: 0 } };
        var frames = insertionFrames();

        function stateAt(t) {
          var insertP = (t - T_INSERT_START) / T_INSERT;
          var settleP = Math.max(0, Math.min(1, (t - T_SETTLE_START) / T_SETTLE));
          var settleK = EASE_SETTLE(settleP);
          var audioT = Math.max(0, Math.min(duration, t - T_AUDIO));

          var previous = tape.progress;
          var nextProgress;
          if (t < T_SETTLE_START) {
            nextProgress = ART.ART_PROGRESS;
          } else if (t < T_AUDIO) {

            var rewindP = Math.max(0, Math.min(1, (t - T_SETTLE_START) / (T_AUDIO - T_SETTLE_START)));
            nextProgress = ART.ART_PROGRESS * (1 - EASE_IN_OUT(rewindP));
            var turns = -3 * 360 * EASE_IN_OUT(rewindP);
            tape.angles.left = turns;
            tape.angles.right = turns * 1.4;
          } else {
            nextProgress = audioT / ART.MAX_SECONDS;
            var radii = ART.packRadii((previous + nextProgress) / 2);
            var moved = (nextProgress - previous) * TAPE_SPEED * ART.MAX_SECONDS;
            if (moved > 0) {
              tape.angles.left += (moved / radii.left) * (180 / Math.PI);
              tape.angles.right += (moved / radii.right) * (180 / Math.PI);
            }
          }
          tape.progress = nextProgress;

          var bump = 0;
          if (insertP > 0.9 && insertP < 1) bump = Math.sin((insertP - 0.9) / 0.1 * Math.PI) * 6;

          return {
            deckY: DECK_Y_INSERT + (DECK_Y_SETTLED - DECK_Y_INSERT) * settleK,
            bump: bump,
            cassette: insertP <= 0 ? null : sampleFrames(frames, insertP),
            flap: flapAt(insertP),
            tape: tape,
            heading: Math.max(0, Math.min(1, (t - T_SETTLE_START - 0.25) / 0.6)),
            seconds: audioT,
            total: duration,
            playing: t >= T_AUDIO && t < T_AUDIO + duration
          };
        }

        scene.draw(ctx, stateAt(0));

        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);

        var startAt = audioContext.currentTime + 0.12;
        var finished = false;
        var timer = 0;

        function timeline() {
          return audioContext.currentTime - startAt;
        }

        function finish(error) {
          if (finished) return;
          finished = true;
          window.clearTimeout(timer);
          document.removeEventListener('visibilitychange', onVisibility);
          if (error) {
            try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_e) {}
            runCleanup();
            reject(error);
            return;
          }
          recorder.onstop = function () {
            runCleanup();
            var type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
            var blob = new Blob(chunks, { type: type });
            if (!blob.size) {
              reject(new Error('empty'));
              return;
            }
            resolve({ blob: blob, mime: type, extension: type.indexOf('mp4') !== -1 ? 'mp4' : 'webm' });
          };
          try {
            recorder.stop();
          } catch (_e) {
            runCleanup();
            reject(new Error('recorder'));
          }
        }

        cancelHook = function () { finish(new Error('cancelled')); };

        function onVisibility() {
          if (finished) return;
          if (document.hidden) {
            if (audioContext.suspend) audioContext.suspend();
            try { if (recorder.state === 'recording') recorder.pause(); } catch (_e) {}
          } else {
            try { if (recorder.state === 'paused') recorder.resume(); } catch (_e) {}
            if (audioContext.resume) audioContext.resume();
            tick();
          }
        }
        document.addEventListener('visibilitychange', onVisibility);

        function tick() {
          if (finished) return;
          window.clearTimeout(timer);
          var t = Math.max(0, timeline());
          scene.draw(ctx, stateAt(t));
          if (options.onProgress) options.onProgress(Math.min(1, t / total));
          if (t >= total) {
            finish(null);
            return;
          }
          timer = window.setTimeout(tick, 1000 / FPS);
        }

        recorder.onerror = function () { finish(new Error('recorder')); };
        recorder.start(1000);
        source.start(startAt + T_AUDIO);
        tick();
      }).catch(function (err) {
        runCleanup();
        reject(err && err.message === 'cancelled' ? err : (err instanceof Error ? err : new Error('render')));
      });
    });

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        if (cancelHook) cancelHook();
      }
    };
  }

  function isMobile() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod|Android/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(url);
    }, 60000);
    return { ok: true, method: 'download' };
  }

  function save(result, title) {
    var filename = 'lensbooth-cassette.' + result.extension;
    var file = null;
    try {
      file = new File([result.blob], filename, { type: result.mime });
    } catch (_e) {
      file = null;
    }
    var shareData = file ? { files: [file], title: title } : null;
    var canShareFile = false;
    try {
      canShareFile = !!(shareData && navigator.share && navigator.canShare && navigator.canShare(shareData));
    } catch (_e) {
      canShareFile = false;
    }

    if (isMobile() && canShareFile) {
      return navigator.share(shareData).then(function () {
        return { ok: true, method: 'share' };
      }, function (err) {
        if (err && err.name === 'AbortError') return { ok: false, aborted: true };
        return download(result.blob, filename);
      });
    }
    return Promise.resolve(download(result.blob, filename));
  }

  function bindSaveButton(options) {
    var o = options;
    var label = o.button.querySelector('span');
    var idleText = label ? label.textContent : 'Save video';
    var job = null;
    var ready = null;

    function setLabel(text) {
      if (label) label.textContent = text;
      o.button.setAttribute('aria-label', text);
    }

    function setBusy(busy) {
      o.button.disabled = busy;
      o.progress.hidden = !busy;
      if (busy) setProgress(0);
    }

    function setProgress(ratio) {
      var pct = Math.round(ratio * 100);
      o.fill.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
      o.text.textContent = 'Making your video… ' + pct + '%';
    }

    function deliver(result) {
      return save(result, o.title).then(function (res) {
        if (res && res.ok) {
          o.toast('Video saved!', 'success');
          o.track('cassette_saved', { format: 'video' });
        }
        return res;
      });
    }

    function reset() {
      ready = null;
      setLabel(idleText);
    }

    function start() {
      if (job) return;
      if (ready) {
        var result = ready;
        deliver(result).then(function (res) {
          if (res && res.ok) reset();
        });
        return;
      }
      if (!isSupported()) {
        o.toast('Saving a video isn’t supported in this browser. Try the latest Chrome, Edge or Safari.', 'error');
        return;
      }

      setBusy(true);
      Promise.resolve(o.getInput()).then(function (input) {
        job = render({
          design: input.design,
          state: input.state,
          audio: input.audio,
          onProgress: setProgress
        });
        return job.promise;
      }).then(function (result) {
        job = null;
        setBusy(false);
        if (isMobile()) {
          ready = result;
          setLabel('Tap to save video');
          if (window.LBCassetteDeck) window.LBCassetteDeck.focusForKeyboard(o.button);
          o.toast('Your video is ready. Tap to save it.', 'info');
          return null;
        }
        return deliver(result);
      }).catch(function (err) {
        job = null;
        setBusy(false);
        if (err && err.message === 'cancelled') {
          o.toast('Video cancelled.', 'info');
        } else if (err && err.message === 'unsupported') {
          o.toast('Saving a video isn’t supported in this browser. Try the latest Chrome, Edge or Safari.', 'error');
        } else {
          o.toast('Your video couldn’t be made. Please try again.', 'error');
        }
      });
    }

    o.button.addEventListener('click', start);
    o.cancel.addEventListener('click', function () {
      if (job) job.cancel();
    });

    return {

      reset: function () {
        if (job) job.cancel();
        reset();
      },
      busy: function () { return !!job; }
    };
  }

  window.LBCassetteVideo = {
    isSupported: isSupported,
    render: render,
    save: save,
    bindSaveButton: bindSaveButton,
    measureDuration: measureDuration,
    WIDTH: VIDEO_W,
    HEIGHT: VIDEO_H
  };
})(window, document);
