(function (window, document) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var W = 831;
  var H = 506;

  var REEL_CENTERS = { left: { x: 225, y: 201.15 }, right: { x: 605, y: 201.15 } };
  var HUB_RADIUS = 80.5;

  var ART_PACK = { left: 118.5, right: 151 };
  var PACK_MIN = 86;
  var PACK_K = ART_PACK.left * ART_PACK.left + ART_PACK.right * ART_PACK.right - 2 * PACK_MIN * PACK_MIN;
  var ART_PROGRESS = 1 - (ART_PACK.left * ART_PACK.left - PACK_MIN * PACK_MIN) / PACK_K;

  var FONT = 'Caveat';
  var FONT_WEIGHT = '700';

  var DESIGNS = [
    {
      id: 'blue-side-a',
      name: 'Blue Side A',
      src: '/assets/studio/cassette/blue-side-a.svg?v=6865f681',
      photo: { after: 34, clip: 34, rect: { x: 67, y: 116, w: 698, h: 242 } },
      title: null,
      message: { x: 136, y: 52, w: 612, h: 60, align: 'middle', color: '#022E82', size: 44, min: 24 },
      date: { x: 84, y: 292, w: 210, h: 52, align: 'start', color: '#FFFFFF', size: 36 }
    },
    {
      id: 'golden-mix',
      name: 'Golden Mix',
      src: '/assets/studio/cassette/golden-mix.svg?v=a01037ed',
      photo: { after: 33, clip: 33, rect: { x: 67, y: 117, w: 697, h: 242 } },
      title: 36,
      message: { x: 137, y: 48, w: 600, h: 46, align: 'middle', color: '#000000', size: 40, min: 22 },
      date: { x: 510, y: 294, w: 150, h: 50, align: 'end', color: '#000000', size: 34 }
    },
    {
      id: 'pink-pop',
      name: 'Pink Pop',
      src: '/assets/studio/cassette/pink-pop.svg?v=027d2e28',
      photo: { after: 33, clip: 33, rect: { x: 66, y: 43, w: 699, h: 315 } },
      title: 35,
      message: { x: 100, y: 57, w: 634, h: 54, align: 'middle', color: '#DE5D90', size: 42, min: 22 },
      date: { x: 560, y: 296, w: 184, h: 50, align: 'end', color: '#4D1834', size: 34 }
    },
    {
      id: 'rainbow-love',
      name: 'Rainbow Love',
      src: '/assets/studio/cassette/rainbow-love.svg?v=5a9f072a',
      photo: { after: 34, clip: 34, rect: { x: 66, y: 125, w: 699, h: 235 } },
      title: 46,
      message: { x: 110, y: 62, w: 612, h: 58, align: 'middle', color: '#3775C6', size: 46, min: 24 },
      date: { x: 560, y: 296, w: 184, h: 50, align: 'end', color: '#FFFFFF', size: 34 }
    },
    {
      id: 'retro-green',
      name: 'Retro Green',
      src: '/assets/studio/cassette/retro-green.svg?v=3370513a',
      photo: { after: 33, clip: 33, rect: { x: 67, y: 96, w: 696, h: 203 } },
      title: null,
      message: { x: 104, y: 42, w: 624, h: 46, align: 'middle', color: '#1D1B12', size: 40, min: 22 },
      date: { x: 84, y: 318, w: 180, h: 50, align: 'start', color: '#ECE9C8', size: 32 }
    }
  ];

  var byId = {};
  DESIGNS.forEach(function (d) { byId[d.id] = d; });

  var templateCache = {};
  var instanceCounter = 0;

  function loadTemplate(designId) {
    var design = byId[designId];
    if (!design) return Promise.reject(new Error('unknown-design'));
    if (templateCache[designId]) return templateCache[designId];

    var job = fetch(design.src, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('design-missing');
        return res.text();
      })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        var root = doc.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
          throw new Error('design-invalid');
        }
        return { design: design, root: root };
      });

    templateCache[designId] = job;
    job.catch(function () { delete templateCache[designId]; });
    return job;
  }

  var fontsReady = null;
  function ensureFonts() {
    if (fontsReady) return fontsReady;
    if (!document.fonts || typeof document.fonts.load !== 'function') {
      fontsReady = Promise.resolve();
      return fontsReady;
    }
    fontsReady = Promise.race([
      document.fonts.load(FONT_WEIGHT + ' 40px ' + FONT).catch(function () {}),
      new Promise(function (resolve) { window.setTimeout(resolve, 2500); })
    ]);
    return fontsReady;
  }

  function pathBox(d) {
    if (!d) return null;
    var tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g);
    if (!tokens) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var cmd = 'M';
    var nums = [];
    function flush() {
      var i;
      if (cmd === 'H') { for (i = 0; i < nums.length; i++) { minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]); } }
      else if (cmd === 'V') { for (i = 0; i < nums.length; i++) { minY = Math.min(minY, nums[i]); maxY = Math.max(maxY, nums[i]); } }
      else if (cmd !== 'Z') {
        for (i = 0; i + 1 < nums.length; i += 2) {
          minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
          minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
        }
      }
      nums = [];
    }
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      if (/^[A-Za-z]$/.test(tok)) {
        flush();
        cmd = tok.toUpperCase();
      } else {
        nums.push(parseFloat(tok));
      }
    }
    flush();
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  function reelSideOf(box) {
    if (!box || Math.abs(box.w - box.h) > 3 || Math.abs(box.cy - REEL_CENTERS.left.y) > 3) return null;
    if (Math.abs(box.cx - REEL_CENTERS.left.x) <= 3) return 'left';
    if (Math.abs(box.cx - REEL_CENTERS.right.x) <= 3) return 'right';
    return null;
  }

  function packRadii(progress) {
    var p = Math.max(0, Math.min(1, progress));
    return {
      left: Math.sqrt(PACK_MIN * PACK_MIN + (1 - p) * PACK_K),
      right: Math.sqrt(PACK_MIN * PACK_MIN + p * PACK_K)
    };
  }

  function photoPlacement(photo, rect) {
    var base = Math.max(rect.w / photo.width, rect.h / photo.height);
    var scale = base * Math.max(1, photo.zoom || 1);
    var dw = photo.width * scale;
    var dh = photo.height * scale;
    var fx = typeof photo.fx === 'number' ? photo.fx : 0.5;
    var fy = typeof photo.fy === 'number' ? photo.fy : 0.5;
    var x = rect.x + rect.w / 2 - fx * dw;
    var y = rect.y + rect.h / 2 - fy * dh;
    x = Math.min(rect.x, Math.max(rect.x + rect.w - dw, x));
    y = Math.min(rect.y, Math.max(rect.y + rect.h - dh, y));
    return {
      x: x, y: y, w: dw, h: dh,
      fx: (rect.x + rect.w / 2 - x) / dw,
      fy: (rect.y + rect.h / 2 - y) / dh
    };
  }

  var measureCtx = null;
  function measure(text, size) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = FONT_WEIGHT + ' ' + size + 'px ' + FONT + ', cursive';
    return measureCtx.measureText(text).width;
  }

  function fitSize(lines, maxSize, minSize, width) {
    var size = maxSize;
    function widest(s) {
      var m = 0;
      for (var i = 0; i < lines.length; i++) m = Math.max(m, measure(lines[i], s));
      return m;
    }
    while (size > minSize && widest(size) > width) size -= 1;
    return { size: size, fits: widest(size) <= width };
  }

  function splitTwo(text) {
    var words = text.split(' ');
    if (words.length < 2) {
      var half = Math.ceil(text.length / 2);
      return [text.slice(0, half), text.slice(half)];
    }
    var best = null;
    for (var i = 1; i < words.length; i++) {
      var a = words.slice(0, i).join(' ');
      var b = words.slice(i).join(' ');
      var score = Math.max(measure(a, 20), measure(b, 20));
      if (!best || score < best.score) best = { lines: [a, b], score: score };
    }
    return best.lines;
  }

  function layoutText(text, box, allowTwoLines) {
    if (!text) return null;
    var single = fitSize([text], box.size, box.min || box.size, box.w);
    if (single.fits || !allowTwoLines) {
      return { size: single.fits ? single.size : fitSize([text], box.size, 8, box.w).size, lines: [text] };
    }
    var lines = splitTwo(text);
    var twoMax = Math.min(box.size, Math.floor(box.h / 1.9));
    var two = fitSize(lines, twoMax, 8, box.w);
    return { size: two.size, lines: lines };
  }

  function textAnchorX(box) {
    if (box.align === 'middle') return box.x + box.w / 2;
    if (box.align === 'end') return box.x + box.w;
    return box.x;
  }

  function baselines(layout, box) {
    var cy = box.y + box.h / 2;
    var lh = layout.size * 0.92;
    var offset = layout.size * 0.3;
    if (layout.lines.length === 1) return [cy + offset];
    return [cy - lh / 2 + offset, cy + lh / 2 + offset];
  }

  function formatDate(date) {
    return date || '';
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
      }
    }
    return node;
  }

  function create(designId) {
    return Promise.all([loadTemplate(designId), ensureFonts()]).then(function (results) {
      var template = results[0];
      var design = template.design;
      var uid = 'csa' + (++instanceCounter);

      var svg = document.importNode(template.root, true);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'cs-art');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      var ided = svg.querySelectorAll('[id]');
      Array.prototype.forEach.call(ided, function (node) {
        var oldId = node.getAttribute('id');
        var newId = oldId + '-' + uid;
        node.setAttribute('id', newId);
        var refs = svg.querySelectorAll('[fill="url(#' + oldId + ')"], [stroke="url(#' + oldId + ')"]');
        Array.prototype.forEach.call(refs, function (ref) {
          if (ref.getAttribute('fill') === 'url(#' + oldId + ')') ref.setAttribute('fill', 'url(#' + newId + ')');
          if (ref.getAttribute('stroke') === 'url(#' + oldId + ')') ref.setAttribute('stroke', 'url(#' + newId + ')');
        });
      });

      var children = Array.prototype.slice.call(svg.children || svg.childNodes).filter(function (n) {
        return n.nodeType === 1;
      });

      var found = findReelParts(children);
      var reels = { left: { packs: [], spokes: [] }, right: { packs: [], spokes: [] } };
      found.packs.forEach(function (e) { reels[e.side].packs.push(e.node); });
      found.spokes.forEach(function (e) { reels[e.side].spokes.push(e.node); });

      var reelParts = {};
      ['left', 'right'].forEach(function (side) {
        var c = REEL_CENTERS[side];
        var part = { spokes: reels[side].spokes, pack: null };
        var packPath = reels[side].packs[0];
        if (packPath) {
          var R = ART_PACK[side];
          var ring = el('circle', {
            cx: c.x, cy: c.y,
            r: (HUB_RADIUS + R) / 2,
            fill: 'none',
            stroke: packPath.getAttribute('fill') || '#000',
            'stroke-width': R - HUB_RADIUS,
            'class': 'cs-art-pack'
          });
          packPath.parentNode.insertBefore(ring, packPath);
          packPath.setAttribute('display', 'none');
          part.pack = ring;
        }
        reelParts[side] = part;
      });

      var defs = el('defs');
      svg.insertBefore(defs, svg.firstChild);
      var photoLayer = null;
      var photoImage = null;
      var labelNode = children[design.photo.clip];
      if (labelNode && labelNode.getAttribute('d')) {
        var labelClip = el('clipPath', { id: uid + '-label' });
        labelClip.appendChild(el('path', { d: labelNode.getAttribute('d') }));
        var rectClip = el('clipPath', { id: uid + '-rect' });
        var r = design.photo.rect;
        rectClip.appendChild(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h }));
        defs.appendChild(labelClip);
        defs.appendChild(rectClip);

        photoLayer = el('g', { 'clip-path': 'url(#' + uid + '-label)', 'class': 'cs-art-photo', display: 'none' });
        var inner = el('g', { 'clip-path': 'url(#' + uid + '-rect)' });
        photoImage = el('image', { preserveAspectRatio: 'none' });
        inner.appendChild(photoImage);
        photoLayer.appendChild(inner);
        var afterNode = children[design.photo.after];
        if (afterNode && afterNode.nextSibling) svg.insertBefore(photoLayer, afterNode.nextSibling);
        else svg.appendChild(photoLayer);
      }

      var titleNode = design.title !== null ? children[design.title] : null;

      var textFont = FONT + ', cursive';
      var messageNode = el('text', {
        'class': 'cs-art-message',
        'font-family': textFont,
        'font-weight': FONT_WEIGHT,
        fill: design.message.color,
        'text-anchor': design.message.align
      });
      var dateNode = el('text', {
        'class': 'cs-art-date',
        'font-family': textFont,
        'font-weight': FONT_WEIGHT,
        fill: design.date.color,
        'text-anchor': design.date.align
      });
      svg.appendChild(messageNode);
      svg.appendChild(dateNode);

      var photoHandle = el('rect', {
        'class': 'cs-art-handle',
        x: design.photo.rect.x, y: design.photo.rect.y,
        width: design.photo.rect.w, height: design.photo.rect.h,
        fill: 'transparent',
        display: 'none'
      });
      svg.appendChild(photoHandle);

      function writeText(node, text, box, twoLines) {
        while (node.firstChild) node.removeChild(node.firstChild);
        var layout = layoutText(text, box, twoLines);
        if (!layout) return;
        node.setAttribute('font-size', layout.size);
        var ys = baselines(layout, box);
        var x = textAnchorX(box);
        layout.lines.forEach(function (line, i) {
          var span = el('tspan', { x: x, y: ys[i] });
          span.textContent = line;
          node.appendChild(span);
        });
      }

      var current = { message: '', date: '', photo: null };

      function update(state) {
        var s = state || {};
        current = { message: s.message || '', date: s.date || '', photo: s.photo || null };

        writeText(messageNode, current.message, design.message, true);
        writeText(dateNode, formatDate(current.date), design.date, false);
        if (titleNode) titleNode.setAttribute('display', current.message ? 'none' : 'inline');

        if (photoLayer) {
          if (current.photo && current.photo.url) {
            var place = photoPlacement(current.photo, design.photo.rect);
            photoImage.setAttribute('x', place.x);
            photoImage.setAttribute('y', place.y);
            photoImage.setAttribute('width', place.w);
            photoImage.setAttribute('height', place.h);
            if (photoImage.getAttribute('href') !== current.photo.url) {
              photoImage.setAttribute('href', current.photo.url);
              photoImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', current.photo.url);
            }
            photoLayer.setAttribute('display', 'inline');
          } else {
            photoLayer.setAttribute('display', 'none');
          }
        }
      }

      function setTape(progress, angles) {
        var radii = typeof progress === 'number' ? packRadii(progress) : ART_PACK;
        ['left', 'right'].forEach(function (side) {
          var part = reelParts[side];
          var c = REEL_CENTERS[side];
          if (part.pack) {
            part.pack.setAttribute('r', ((HUB_RADIUS + radii[side]) / 2).toFixed(2));
            part.pack.setAttribute('stroke-width', (radii[side] - HUB_RADIUS).toFixed(2));
          }
          var a = angles ? angles[side] : 0;
          part.spokes.forEach(function (spoke) {
            if (a) spoke.setAttribute('transform', 'rotate(' + (a % 360).toFixed(2) + ' ' + c.x + ' ' + c.y + ')');
            else spoke.removeAttribute('transform');
          });
        });
      }

      return {
        svg: svg,
        design: design,
        update: update,
        setTape: setTape,
        photoHandle: photoHandle,
        photoRect: design.photo.rect,
        state: function () { return current; }
      };
    });
  }

  function serialize(root) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image-load')); };
      img.src = src;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('encode'));
        }, type, quality);
        return;
      }
      try {
        var dataUrl = canvas.toDataURL(type, quality);
        var bin = window.atob(dataUrl.split(',')[1]);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: type }));
      } catch (err) {
        reject(err);
      }
    });
  }

  function findReelParts(children) {
    var parts = { packs: [], spokes: [], hubs: [] };
    children.forEach(function (node, index) {
      if (node.nodeName.toLowerCase() !== 'path') return;
      var box = pathBox(node.getAttribute('d'));
      var side = reelSideOf(box);
      if (!side) return;
      var entry = { index: index, side: side, node: node };

      if (box.w > 200 && box.w < 360) parts.packs.push(entry);
      else if (box.w > 140 && box.w <= 200) parts.hubs.push(entry);
      else if (box.w > 95 && box.w < 135) parts.spokes.push(entry);
    });
    return parts;
  }

  function renderLayers(designId, state, pixelWidth) {
    var s = state || {};
    var k = (pixelWidth || W * 2) / W;
    return Promise.all([loadTemplate(designId), ensureFonts()]).then(function (results) {
      var template = results[0];
      var design = template.design;
      var children = Array.prototype.slice.call(template.root.children || template.root.childNodes).filter(function (n) {
        return n.nodeType === 1;
      });
      var reel = findReelParts(children);
      var moving = {};
      reel.packs.concat(reel.spokes).forEach(function (entry) { moving[entry.index] = true; });

      var lastUnder = -1;
      reel.packs.concat(reel.hubs).forEach(function (entry) { lastUnder = Math.max(lastUnder, entry.index); });

      function partial(from, to) {
        var root = template.root.cloneNode(false);
        root.setAttribute('width', W);
        root.setAttribute('height', H);
        children.forEach(function (node, index) {
          var isDefs = node.nodeName.toLowerCase() === 'defs';
          if (!isDefs && (index < from || index > to || moving[index])) return;
          if (!isDefs && s.message && index === design.title) return;
          root.appendChild(node.cloneNode(true));
        });
        return serialize(root);
      }

      function layer() {
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(W * k);
        canvas.height = Math.round(H * k);
        var ctx = canvas.getContext('2d');
        ctx.scale(k, k);
        return { canvas: canvas, ctx: ctx };
      }

      var jobs = [
        loadImage(partial(0, lastUnder)),
        loadImage(partial(lastUnder + 1, design.photo.after)),
        loadImage(partial(design.photo.after + 1, children.length))
      ];
      if (s.photo && s.photo.url) jobs.push(loadImage(s.photo.url));

      return Promise.all(jobs).then(function (images) {
        var bottom = layer();
        bottom.ctx.drawImage(images[0], 0, 0, W, H);

        var top = layer();
        var ctx = top.ctx;
        ctx.drawImage(images[1], 0, 0, W, H);

        if (images[3]) {
          var labelNode = children[design.photo.clip];
          var r = design.photo.rect;
          var place = photoPlacement({
            width: images[3].naturalWidth,
            height: images[3].naturalHeight,
            zoom: s.photo.zoom,
            fx: s.photo.fx,
            fy: s.photo.fy
          }, r);
          ctx.save();
          if (labelNode && window.Path2D) ctx.clip(new window.Path2D(labelNode.getAttribute('d')));
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          ctx.drawImage(images[3], place.x, place.y, place.w, place.h);
          ctx.restore();
        }

        ctx.drawImage(images[2], 0, 0, W, H);

        function drawText(text, box, twoLines) {
          var layout = layoutText(text, box, twoLines);
          if (!layout) return;
          ctx.font = FONT_WEIGHT + ' ' + layout.size + 'px ' + FONT + ', cursive';
          ctx.fillStyle = box.color;
          ctx.textAlign = box.align === 'middle' ? 'center' : (box.align === 'end' ? 'right' : 'left');
          ctx.textBaseline = 'alphabetic';
          var ys = baselines(layout, box);
          var x = textAnchorX(box);
          layout.lines.forEach(function (line, i) { ctx.fillText(line, x, ys[i]); });
        }
        drawText(s.message || '', design.message, true);
        drawText(formatDate(s.date), design.date, false);

        var reels = {};
        ['left', 'right'].forEach(function (side) {
          var pack = reel.packs.filter(function (e) { return e.side === side; })[0];
          reels[side] = {
            cx: REEL_CENTERS[side].x,
            cy: REEL_CENTERS[side].y,
            packColor: pack ? (pack.node.getAttribute('fill') || '#000') : null,
            spokes: reel.spokes.filter(function (e) { return e.side === side; }).map(function (e) {
              return { d: e.node.getAttribute('d'), fill: e.node.getAttribute('fill') || '#fff' };
            })
          };
        });

        return {
          scale: k,
          width: bottom.canvas.width,
          height: bottom.canvas.height,
          bottom: bottom.canvas,
          top: top.canvas,
          reels: reels,
          hubRadius: HUB_RADIUS
        };
      });
    });
  }

  function renderCover(designId, photo, image) {
    var design = byId[designId];
    var r = design.photo.rect;
    var k = 2;
    var place = photoPlacement(photo, r);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(r.w * k);
    canvas.height = Math.round(r.h * k);
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, (place.x - r.x) * k, (place.y - r.y) * k, place.w * k, place.h * k);
    return canvasToBlob(canvas, 'image/jpeg', 0.86);
  }

  window.LBCassetteArt = {
    WIDTH: W,
    HEIGHT: H,
    ART_PROGRESS: ART_PROGRESS,
    MAX_SECONDS: 300,
    designs: DESIGNS,
    design: function (id) { return byId[id] || null; },
    create: create,
    ensureFonts: ensureFonts,
    photoPlacement: photoPlacement,
    packRadii: packRadii,
    renderLayers: renderLayers,
    renderCover: renderCover,
    canvasToBlob: canvasToBlob
  };
})(window, document);
