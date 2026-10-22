(function (window, document) {
  'use strict';

  var M = window.LBLetters;

  var fontsPromise = null;

  function ensureFonts() {
    if (fontsPromise) return fontsPromise;

    fontsPromise = new Promise(function (resolve) {
      if (!document.fonts || !document.fonts.load) { resolve(); return; }

      var wanted = [
        '700 60px "Caveat"',
        '600 60px "Caveat"',
        '400 60px "Kalam"',
        '400 60px "Patrick Hand"',
        '400 60px "Indie Flower"',
        '600 60px "Dancing Script"',
        '500 40px "Satoshi"'
      ];
      var jobs = [];
      for (var i = 0; i < wanted.length; i++) {
        try { jobs.push(document.fonts.load(wanted[i], 'Aa')); } catch (_e) {}
      }

      Promise.all(jobs)
        .then(function () { return document.fonts.ready; })
        .then(function () { resolve(); })
        .catch(function () { resolve(); });
    });

    return fontsPromise;
  }

  var TEXTURE_SRC = {
    fiber: '/assets/studio/paper-fiber.png?v=6017202a',
    grain: '/assets/studio/paper-grain.png?v=83800a98'
  };

  var FIBER_TILE = 0.30;
  var GRAIN_TILE = 0.16;

  var texturePromise = null;

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();

      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        if (src.indexOf('.webp') !== -1) {
          var fallback = new Image();
          fallback.decoding = 'async';
          fallback.onload = function () { resolve(fallback); };
          fallback.onerror = function () { reject(new Error('image')); };
          fallback.src = src.replace(/\.webp$/, '.png');
        } else {
          reject(new Error('image'));
        }
      };
      img.src = src;
    });
  }

  function loadTextures() {
    if (texturePromise) return texturePromise;

    texturePromise = Promise.all([
      loadImage(TEXTURE_SRC.fiber).catch(function () { return null; }),
      loadImage(TEXTURE_SRC.grain).catch(function () { return null; })
    ]).then(function (pair) {
      return { fiber: pair[0], grain: pair[1] };
    });

    return texturePromise;
  }

  var imageCache = Object.create(null);

  var imageReady = Object.create(null);

  function loadObjectImage(src) {
    if (imageCache[src]) return imageCache[src];
    imageCache[src] = loadImage(src).then(function (img) {
      imageReady[src] = img;
      return img;
    }, function () {
      imageReady[src] = null;
      return null;
    });
    return imageCache[src];
  }

  function preloadObjects(letter) {
    var jobs = [];
    for (var i = 0; i < letter.objects.length; i++) {
      var o = letter.objects[i];
      if (o.src) jobs.push(loadObjectImage(o.src));
    }
    return Promise.all(jobs);
  }

  var mirror = null;

  var metricsCtx = null;

  function getMetricsCtx() {
    if (!metricsCtx) metricsCtx = document.createElement('canvas').getContext('2d');
    return metricsCtx;
  }

  function baselineFromTop(font, lineHeightPx) {
    var ctx = getMetricsCtx();
    ctx.font = font;
    var m = ctx.measureText('Hg');
    var ascent = m.fontBoundingBoxAscent;
    var descent = m.fontBoundingBoxDescent;

    if (!(ascent >= 0) || !(descent >= 0) || ascent + descent <= 0) {
      return lineHeightPx * 0.72;
    }

    var natural = ascent + descent;
    var halfLeading = (lineHeightPx - natural) / 2;
    return halfLeading + ascent;
  }

  function getMirror() {
    if (mirror) return mirror;

    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    var s = mirror.style;
    s.position = 'fixed';
    s.top = '0';
    s.left = '-99999px';
    s.visibility = 'hidden';
    s.pointerEvents = 'none';
    s.whiteSpace = 'pre-wrap';
    s.overflowWrap = 'break-word';
    s.wordBreak = 'normal';
    s.padding = '0';
    s.margin = '0';
    s.border = '0';
    s.boxSizing = 'content-box';
    document.body.appendChild(mirror);
    return mirror;
  }

  function styleMirror(opts) {
    var el = getMirror();
    var s = el.style;
    s.fontFamily = opts.family;
    s.fontWeight = String(opts.weight);
    s.fontSize = opts.fontSize + 'px';
    s.lineHeight = opts.lineHeight + 'px';
    s.letterSpacing = 'normal';
    s.width = opts.width + 'px';
    s.textAlign = opts.align || 'left';
    return el;
  }

  function measureHeight(text, opts) {
    var el = styleMirror(opts);

    el.textContent = text.length ? text + '​' : '​';
    return el.scrollHeight;
  }

  function measureLines(text, opts) {
    var el = styleMirror(opts);
    el.textContent = text;

    var lines = [];
    if (!text.length) return lines;

    var node = el.firstChild;
    var range = document.createRange();
    var current = '';
    var lastTop = null;

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);

      if (ch === '\n') {
        lines.push(current);
        current = '';
        lastTop = null;
        continue;
      }

      var top = null;
      try {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        var rects = range.getClientRects();
        if (rects.length) top = Math.round(rects[0].top * 10) / 10;
      } catch (_e) {}

      if (top !== null && lastTop !== null && top > lastTop + 1) {

        lines.push(current.replace(/\s+$/, ''));
        current = '';
      }
      if (top !== null) lastTop = top;
      current += ch;
    }

    lines.push(current);
    return lines;
  }

  function typeMetrics(letter) {
    var hand = M.hand(letter.type.hand);
    return {
      family: M.handFamily(hand),
      weight: hand.weight,
      fontSize: letter.type.size * hand.scale,
      lineHeight: letter.type.size * hand.scale * letter.type.lineHeight * hand.lineScale,
      align: letter.type.align,
      color: letter.type.color
    };
  }

  function layout(letter) {
    var t = typeMetrics(letter);
    var inset = M.TEXT_INSET;
    var width = M.PAGE_W - inset.left - inset.right;
    var top = inset.top;
    var bottom = M.PAGE_H - inset.bottom;

    var pages = [];
    var lastIndex = letter.pages.length - 1;

    for (var i = 0; i < letter.pages.length; i++) {
      var y = top;
      var head = [];

      if (i === 0 && letter.meta.date) {
        head.push({ text: letter.meta.date, align: 'right', y: y, size: t.fontSize * 0.72 });
        y += t.lineHeight * 0.85 + t.lineHeight * 0.5;
      }
      if (i === 0 && letter.meta.to) {
        head.push({ text: letter.meta.to, align: t.align === 'right' ? 'right' : 'left', y: y, size: t.fontSize });
        y += t.lineHeight * 1.4;
      }

      var signLines = [];
      if (i === lastIndex && letter.meta.from) {
        signLines = String(letter.meta.from).split('\n');
      }
      var signHeight = signLines.length ? (signLines.length * t.lineHeight + t.lineHeight * 0.8) : 0;

      pages.push({
        head: head,
        bodyX: inset.left,
        bodyY: y,
        bodyWidth: width,
        bodyHeight: Math.max(t.lineHeight, bottom - y - signHeight),
        signLines: signLines,
        signHeight: signHeight,
        signY: bottom - signLines.length * t.lineHeight
      });
    }

    return { type: t, pages: pages, width: width };
  }

  function ruleGeometry(letter) {
    var paper = M.paper(letter.paper);
    if (!paper.rule) return null;

    var t = typeMetrics(letter);
    var info = layout(letter);
    var baseline = baselineFromTop(fontString(t.weight, t.fontSize, t.family), t.lineHeight);
    var firstBaseline = info.pages[0].bodyY + baseline;

    return {
      color: paper.rule.color,
      margin: paper.rule.margin,
      gap: t.lineHeight,

      offset: firstBaseline - t.lineHeight
    };
  }

  function bodyOpts(layoutInfo, pageIndex) {
    var t = layoutInfo.type;
    return {
      family: t.family,
      weight: t.weight,
      fontSize: t.fontSize,
      lineHeight: t.lineHeight,
      width: layoutInfo.pages[pageIndex].bodyWidth,
      align: t.align
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function paintPaper(ctx, paper, rule, textures, x, y, w, h, folds) {
    ctx.save();
    roundRect(ctx, x, y, w, h, w * 0.004);
    ctx.clip();

    ctx.fillStyle = paper.base;
    ctx.fillRect(x, y, w, h);

    drawTexture(ctx, textures.fiber, x, y, w, h, w * FIBER_TILE, paper.fiber);
    drawTexture(ctx, textures.grain, x, y, w, h, w * GRAIN_TILE, paper.grain);

    if (rule) {
      var scale = w / M.PAGE_W;
      ctx.save();
      ctx.strokeStyle = rule.color;
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      for (var ly = rule.offset + rule.gap; ly < M.PAGE_H; ly += rule.gap) {
        var py = Math.round(y + ly * scale) + 0.5;
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
      }
      ctx.stroke();

      ctx.strokeStyle = rule.margin;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.11, y);
      ctx.lineTo(x + w * 0.11, y + h);
      ctx.stroke();
      ctx.restore();
    }

    if (paper.vignette > 0) paintVignette(ctx, x, y, w, h, paper.vignette);
    if (folds) paintFolds(ctx, x, y, w, h);

    ctx.strokeStyle = paper.edge;
    ctx.lineWidth = Math.max(1, w / M.PAGE_W);
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, w * 0.004);
    ctx.stroke();

    ctx.restore();
  }

  function drawTexture(ctx, img, x, y, w, h, tile, opacity) {
    if (!img || opacity <= 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'soft-light';

    var pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {

      var k = tile / img.width;
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w / k, h / k);
    }

    ctx.restore();
  }

  function paintVignette(ctx, x, y, w, h, strength) {

    var depth = Math.min(w, h) * 0.16;
    var edges = [
      [x, y, w, depth, 0, 1],
      [x, y + h - depth, w, depth, 0, -1],
      [x, y, depth, h, 1, 0],
      [x + w - depth, y, depth, h, -1, 0]
    ];

    ctx.save();
    ctx.globalAlpha = strength;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var gx0 = e[4] === -1 ? e[0] + e[2] : e[0];
      var gy0 = e[5] === -1 ? e[1] + e[3] : e[1];
      var gx1 = e[4] === 1 ? e[0] + e[2] : (e[4] === -1 ? e[0] : e[0]);
      var gy1 = e[5] === 1 ? e[1] + e[3] : (e[5] === -1 ? e[1] : e[1]);
      var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, 'rgba(120, 92, 52, .55)');
      g.addColorStop(1, 'rgba(120, 92, 52, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(e[0], e[1], e[2], e[3]);
    }
    ctx.restore();
  }

  function paintFolds(ctx, x, y, w, h) {
    var band = h * 0.017;

    ctx.save();
    for (var i = 1; i <= 2; i++) {
      var fy = y + (h * i) / 3;
      var gradient = ctx.createLinearGradient(0, fy - band / 2, 0, fy + band / 2);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.34, 'rgba(0, 0, 0, .045)');
      gradient.addColorStop(0.48, 'rgba(0, 0, 0, .1)');
      gradient.addColorStop(0.54, 'rgba(255, 255, 255, .62)');
      gradient.addColorStop(0.68, 'rgba(255, 255, 255, .2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, fy - band / 2, w, band);
    }
    ctx.restore();
  }

  function paintPhoto(ctx, img, cx, cy, w, h, rot, kind) {
    var border = w * (kind === 'strip' ? 0.045 : 0.05);
    var footer = kind === 'strip' ? border : border * 2.2;
    var frameW = w;
    var frameH = h + footer - border;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .34)';
    ctx.shadowBlur = w * 0.09;
    ctx.shadowOffsetY = w * 0.035;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
    ctx.restore();

    if (img) {
      ctx.drawImage(
        img,
        -frameW / 2 + border,
        -frameH / 2 + border,
        frameW - border * 2,
        h - border * 2
      );
    } else {
      ctx.fillStyle = '#F0EDE8';
      ctx.fillRect(-frameW / 2 + border, -frameH / 2 + border, frameW - border * 2, h - border * 2);
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, .08)';
    ctx.lineWidth = Math.max(1, w * 0.004);
    ctx.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);

    ctx.restore();
  }

  function paintDecoration(ctx, kind, cx, cy, w, h, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);

    if (kind === 'tape') {
      ctx.fillStyle = 'rgba(246, 238, 214, .72)';
      ctx.shadowColor = 'rgba(0, 0, 0, .16)';
      ctx.shadowBlur = h * 0.22;
      ctx.shadowOffsetY = h * 0.08;

      ctx.beginPath();
      ctx.moveTo(0, h * 0.08);
      ctx.lineTo(w * 0.06, 0);
      ctx.lineTo(w * 0.94, h * 0.05);
      ctx.lineTo(w, h * 0.92);
      ctx.lineTo(w * 0.93, h);
      ctx.lineTo(w * 0.05, h * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255, 255, 255, .35)';
      ctx.fillRect(w * 0.08, h * 0.2, w * 0.84, h * 0.16);
    } else if (kind === 'clip') {
      ctx.strokeStyle = '#9AA0A6';
      ctx.lineWidth = Math.max(1, w * 0.16);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, .3)';
      ctx.shadowBlur = w * 0.2;
      ctx.shadowOffsetY = w * 0.06;
      var r = w * 0.32;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.86);
      ctx.lineTo(w * 0.5, h * 0.2);
      ctx.arc(w * 0.5, h * 0.2, r, Math.PI, 0);
      ctx.lineTo(w * 0.5 + r, h * 0.72);
      ctx.arc(w * 0.5, h * 0.72, r * 0.52, 0, Math.PI);
      ctx.lineTo(w * 0.5 - r * 0.52, h * 0.34);
      ctx.stroke();
    } else if (kind === 'stamp') {

      var step = w / 11;
      ctx.beginPath();
      var px = 0;
      var py = 0;
      ctx.moveTo(0, 0);
      for (px = step / 2; px < w; px += step) { ctx.arc(px, 0, step * 0.34, Math.PI, 0, true); }
      ctx.lineTo(w, h);
      for (px = w - step / 2; px > 0; px -= step) { ctx.arc(px, h, step * 0.34, 0, Math.PI, true); }
      ctx.closePath();
      ctx.fillStyle = '#F7F2E6';
      ctx.shadowColor = 'rgba(0, 0, 0, .22)';
      ctx.shadowBlur = w * 0.08;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = 'rgba(0, 0, 0, .22)';
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76);
      ctx.fillStyle = '#C8506A';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.44, w * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0, 0, 0, .5)';
      ctx.fillRect(w * 0.26, h * 0.68, w * 0.48, Math.max(1, h * 0.03));
    } else if (kind === 'heart') {
      ctx.fillStyle = '#C8506A';
      ctx.shadowColor = 'rgba(0, 0, 0, .2)';
      ctx.shadowBlur = w * 0.12;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h);
      ctx.bezierCurveTo(-w * 0.16, h * 0.52, w * 0.16, -h * 0.1, w * 0.5, h * 0.26);
      ctx.bezierCurveTo(w * 0.84, -h * 0.1, w * 1.16, h * 0.52, w * 0.5, h);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function paintTextBlock(ctx, lines, x, y, width, lineHeight, align, font, color) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');

    var anchorX = align === 'center' ? x + width / 2 : (align === 'right' ? x + width : x);

    var baseline = baselineFromTop(font, lineHeight);

    for (var i = 0; i < lines.length; i++) {
      if (lines[i]) ctx.fillText(lines[i], anchorX, y + i * lineHeight + baseline);
    }

    ctx.restore();
  }

  function fontString(weight, size, family) {
    return String(weight) + ' ' + size + 'px ' + family;
  }

  function renderPage(letter, pageIndex, opts) {
    opts = opts || {};
    var scale = opts.scale || 2;
    var withBleed = opts.bleed !== false;

    var outW = Math.round((withBleed ? M.STAGE_W : M.PAGE_W) * scale);
    var outH = Math.round((withBleed ? M.STAGE_H : M.PAGE_H) * scale);
    var originX = withBleed ? 0 : M.BLEED;
    var originY = withBleed ? 0 : M.BLEED;

    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext('2d');

    ctx.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);
    ctx.imageSmoothingQuality = 'high';

    if (opts.background !== null) {
      ctx.fillStyle = opts.background || '#E9E2D6';
      ctx.fillRect(originX, originY, withBleed ? M.STAGE_W : M.PAGE_W, withBleed ? M.STAGE_H : M.PAGE_H);
    }

    return loadTextures().then(function (textures) {
      var paper = M.paper(letter.paper);
      var info = layout(letter);
      var objects = M.objectsOnPage(letter, pageIndex);
      var i;

      for (i = 0; i < objects.length; i++) {
        if (objects[i].z < 0) paintObject(ctx, objects[i]);
      }

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, .3)';
      ctx.shadowBlur = 46;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = paper.base;
      ctx.fillRect(M.BLEED, M.BLEED, M.PAGE_W, M.PAGE_H);
      ctx.restore();

      paintPaper(ctx, paper, ruleGeometry(letter), textures, M.BLEED, M.BLEED, M.PAGE_W, M.PAGE_H, letter.folds);

      paintPageText(ctx, letter, info, pageIndex);

      for (i = 0; i < objects.length; i++) {
        if (objects[i].z >= 0) paintObject(ctx, objects[i]);
      }

      return canvas;
    });
  }

  function paintPageText(ctx, letter, info, pageIndex) {
    var page = info.pages[pageIndex];
    if (!page) return;

    var t = info.type;
    var bodyFont = fontString(t.weight, t.fontSize, t.family);
    var x = M.BLEED + page.bodyX;
    var i;

    for (i = 0; i < page.head.length; i++) {
      var h = page.head[i];
      paintTextBlock(
        ctx,
        [h.text],
        x,
        M.BLEED + h.y,
        page.bodyWidth,
        t.lineHeight,
        h.align,
        fontString(t.weight, h.size, t.family),
        t.color
      );
    }

    var body = letter.pages[pageIndex].body;
    var lines = body ? measureLines(body, bodyOpts(info, pageIndex)) : null;
    if (lines) {
      paintTextBlock(
        ctx, lines, x, M.BLEED + page.bodyY, page.bodyWidth,
        t.lineHeight, t.align, bodyFont, t.color
      );
    }

    if (page.signLines.length) {
      paintTextBlock(
        ctx, page.signLines, x, M.BLEED + page.signY, page.bodyWidth,
        t.lineHeight, 'right', bodyFont, t.color
      );
    }
  }

  function paintObject(ctx, obj) {
    var h = obj.w * obj.ratio;

    if (obj.kind === 'deco') {
      if (obj.src && imageReady[obj.src]) {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate((obj.rot * Math.PI) / 180);
        ctx.drawImage(imageReady[obj.src], -obj.w / 2, -h / 2, obj.w, h);
        ctx.restore();
        return;
      }
      paintDecoration(ctx, obj.deco, obj.x, obj.y, obj.w, h, obj.rot);
      return;
    }

    paintPhoto(ctx, imageReady[obj.src] || null, obj.x, obj.y, obj.w, h, obj.rot, obj.kind);
  }

  function renderAll(letter, opts) {
    return ensureFonts()
      .then(function () { return preloadObjects(letter); })
      .then(function () {
        var out = [];
        var chain = Promise.resolve();
        letter.pages.forEach(function (_page, i) {
          chain = chain.then(function () {
            return renderPage(letter, i, opts).then(function (c) { out.push(c); });
          });
        });
        return chain.then(function () { return out; });
      });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('encode'));
        }, type || 'image/png', quality);
        return;
      }
      try {
        var dataUrl = canvas.toDataURL(type || 'image/png', quality);
        resolve(window.LBExport.dataUrlToBlob(dataUrl));
      } catch (e) {
        reject(e);
      }
    });
  }

  window.LBLettersRender = {
    ensureFonts: ensureFonts,
    loadTextures: loadTextures,
    loadObjectImage: loadObjectImage,
    preloadObjects: preloadObjects,

    measureHeight: measureHeight,
    measureLines: measureLines,
    typeMetrics: typeMetrics,
    layout: layout,
    bodyOpts: bodyOpts,
    ruleGeometry: ruleGeometry,

    renderPage: renderPage,
    renderAll: renderAll,
    paintDecoration: paintDecoration,
    canvasToBlob: canvasToBlob,

    FIBER_TILE: FIBER_TILE,
    GRAIN_TILE: GRAIN_TILE
  };
})(window, document);
