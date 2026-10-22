(function (window, document) {
  'use strict';

  var PAGE_W = 1000;
  var PAGE_H = 1414;
  var BLEED = 92;
  var STAGE_W = PAGE_W + BLEED * 2;
  var STAGE_H = PAGE_H + BLEED * 2;

  var TEXT_INSET = { top: 132, right: 118, bottom: 140, left: 118 };

  var PAPERS = [
    {
      id: 'cream', name: 'Soft Cream', swatch: '#FBF6EC',
      base: '#FBF6EC', fiber: 0.5, grain: 0.34,
      edge: 'rgba(90, 72, 44, .16)', vignette: 0,
      ink: '#2B2A28'
    },
    {
      id: 'warm', name: 'Warm Paper', swatch: '#F5EADA',
      base: '#F5EADA', fiber: 0.62, grain: 0.38,
      edge: 'rgba(90, 68, 36, .18)', vignette: 0,
      ink: '#33302B'
    },
    {
      id: 'notebook', name: 'Notebook', swatch: '#FCFBF7',
      base: '#FCFBF7', fiber: 0.26, grain: 0.3,
      edge: 'rgba(0, 0, 0, .12)', vignette: 0,
      ink: '#1F3352',
      rule: { color: 'rgba(116, 155, 190, .55)', gap: 52, offset: 26, margin: 'rgba(196, 122, 122, .5)' }
    },
    {
      id: 'handmade', name: 'Handmade', swatch: '#F3EDDF',
      base: '#F3EDDF', fiber: 1, grain: 0.58,
      edge: 'rgba(86, 70, 44, .2)', vignette: 0.18,
      ink: '#2F2C26'
    },
    {
      id: 'vintage', name: 'Vintage', swatch: '#EFE4CE',
      base: '#EFE4CE', fiber: 0.74, grain: 0.44,
      edge: 'rgba(92, 68, 30, .26)', vignette: 0.42,
      ink: '#3A3226'
    },
    {
      id: 'white', name: 'Clean White', swatch: '#FDFDFB',
      base: '#FDFDFB', fiber: 0.18, grain: 0.22,
      edge: 'rgba(0, 0, 0, .1)', vignette: 0,
      ink: '#232323'
    }
  ];

  var HANDS = [
    { id: 'marker', name: 'Marker', family: '"Caveat", cursive', weight: 700, scale: 1, lineScale: 1 },
    { id: 'everyday', name: 'Everyday', family: '"Caveat", cursive', weight: 600, scale: 1, lineScale: 1 },
    { id: 'note', name: 'Note', family: '"Kalam", cursive', weight: 400, scale: 0.78, lineScale: 1.1 },
    { id: 'neat', name: 'Neat', family: '"Patrick Hand", cursive', weight: 400, scale: 0.84, lineScale: 1.05 },
    { id: 'casual', name: 'Casual', family: '"Indie Flower", cursive', weight: 400, scale: 0.86, lineScale: 1.08 },
    { id: 'script', name: 'Script', family: '"Dancing Script", cursive', weight: 600, scale: 0.94, lineScale: 1.12 },
    { id: 'print', name: 'Print', family: 'var(--font-main)', cssFamily: null, weight: 500, scale: 0.66, lineScale: 1.15 }
  ];

  var FONT_MAIN_FALLBACK = '"Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  function handFamily(hand) {
    if (hand.id !== 'print') return hand.family;
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--font-main').trim();
      if (v) return v;
    } catch (_e) {}
    return FONT_MAIN_FALLBACK;
  }

  var INKS = [
    { id: 'ink', name: 'Ink', value: '#2B2A28' },
    { id: 'navy', name: 'Navy', value: '#1F3352' },
    { id: 'sepia', name: 'Sepia', value: '#5A4326' },
    { id: 'red', name: 'Red', value: '#9E2438' },
    { id: 'graphite', name: 'Graphite', value: '#5A5A57' }
  ];

  var DECORATIONS = [
    { id: 'air-mail-airplane', name: 'Air Mail Airplane', src: '/assets/studio/stickers/air-mail-airplane.webp?v=80584ef9', w: 180, ratio: 0.6455 },
    { id: 'air-mail-label', name: 'Air Mail Label', src: '/assets/studio/stickers/air-mail-label.webp?v=70e936a9', w: 180, ratio: 0.5753 },
    { id: 'crescent-moon-and-stars', name: 'Crescent Moon & Stars', src: '/assets/studio/stickers/crescent-moon-and-stars.webp?v=0d3e0cf5', w: 140, ratio: 0.9626 },
    { id: 'floral-love-postage-stamp', name: 'Floral Love Stamp', src: '/assets/studio/stickers/floral-love-postage-stamp.webp?v=4e45b6ea', w: 150, ratio: 0.9241 },
    { id: 'folded-travel-map-pin', name: 'Travel Map Pin', src: '/assets/studio/stickers/folded-travel-map-pin.webp?v=63f1f3be', w: 180, ratio: 0.6312 },
    { id: 'for-you-gift-tag', name: 'For You Gift Tag', src: '/assets/studio/stickers/for-you-gift-tag.webp?v=7c98d162', w: 180, ratio: 0.624 },
    { id: 'four-leaf-clover', name: 'Four-Leaf Clover', src: '/assets/studio/stickers/four-leaf-clover.webp?v=21cac466', w: 140, ratio: 1.0474 },
    { id: 'good-days-note', name: 'Good Days Note', src: '/assets/studio/stickers/good-days-note.webp?v=7f452274', w: 180, ratio: 0.5753 },
    { id: 'good-memories-ticket', name: 'Good Memories Ticket', src: '/assets/studio/stickers/good-memories-ticket.webp?v=3d7645ab', w: 180, ratio: 0.5619 },
    { id: 'green-gingham-tape', name: 'Green Gingham Tape', src: '/assets/studio/stickers/green-gingham-tape.webp?v=ae7e07a0', w: 180, ratio: 0.613 },
    { id: 'heart-wax-seal', name: 'Heart Wax Seal', src: '/assets/studio/stickers/heart-wax-seal.webp?v=a65921dc', w: 150, ratio: 0.9241 },
    { id: 'heart-sealed-envelope', name: 'Heart-Sealed Envelope', src: '/assets/studio/stickers/heart-sealed-envelope.webp?v=af3aa87c', w: 180, ratio: 0.6391 },
    { id: 'love-you-note', name: 'Love You Note', src: '/assets/studio/stickers/love-you-note.webp?v=970e4d94', w: 160, ratio: 0.7149 },
    { id: 'miss-you-note', name: 'Miss You Note', src: '/assets/studio/stickers/miss-you-note.webp?v=8c9503b2', w: 160, ratio: 0.8107 },
    { id: 'more-love-please-note', name: 'More Love Please', src: '/assets/studio/stickers/more-love-please-note.webp?v=d88b886f', w: 150, ratio: 1 },
    { id: 'mountain-postage-stamp', name: 'Mountain Stamp', src: '/assets/studio/stickers/mountain-postage-stamp.webp?v=32f84567', w: 150, ratio: 0.966 },
    { id: 'pink-polka-dot-tape', name: 'Pink Polka Dot Tape', src: '/assets/studio/stickers/pink-polka-dot-tape.webp?v=c7017e8d', w: 180, ratio: 0.6992 },
    { id: 'pink-pressed-flower', name: 'Pink Pressed Flower', src: '/assets/studio/stickers/pink-pressed-flower.webp?v=fcbb5576', w: 140, ratio: 0.9895 },
    { id: 'pink-satin-bow', name: 'Pink Satin Bow', src: '/assets/studio/stickers/pink-satin-bow.webp?v=c0683e70', w: 170, ratio: 0.8113 },
    { id: 'purple-wildflower-sprig', name: 'Purple Wildflower Sprig', src: '/assets/studio/stickers/purple-wildflower-sprig.webp?v=2d1d7505', w: 130, ratio: 1.4634 },
    { id: 'red-cherries', name: 'Red Cherries', src: '/assets/studio/stickers/red-cherries.webp?v=e9a7ef15', w: 140, ratio: 0.966 },
    { id: 'red-hand-drawn-heart', name: 'Hand-Drawn Heart', src: '/assets/studio/stickers/red-hand-drawn-heart.webp?v=9d881c2e', w: 140, ratio: 0.9211 },
    { id: 'sleeping-cat-with-hearts', name: 'Sleeping Cat', src: '/assets/studio/stickers/sleeping-cat-with-hearts.webp?v=b48c3127', w: 180, ratio: 0.7185 },
    { id: 'take-care-gift-tag', name: 'Take Care Gift Tag', src: '/assets/studio/stickers/take-care-gift-tag.webp?v=ebd626cf', w: 180, ratio: 0.6708 },
    { id: 'taped-white-daisy', name: 'Taped White Daisy', src: '/assets/studio/stickers/taped-white-daisy.webp?v=9df98400', w: 150, ratio: 1.0507 },
    { id: 'vintage-camera', name: 'Vintage Camera', src: '/assets/studio/stickers/vintage-camera.webp?v=d722217f', w: 160, ratio: 0.7407 },
    { id: 'white-pressed-flower', name: 'White Pressed Flower', src: '/assets/studio/stickers/white-pressed-flower.webp?v=5e5a6fe9', w: 140, ratio: 0.9884 },
    { id: 'white-wildflower-sprig', name: 'White Wildflower Sprig', src: '/assets/studio/stickers/white-wildflower-sprig.webp?v=71cad06b', w: 150, ratio: 0.8697 },
    { id: 'wildflower-bouquet-for-you', name: 'Wildflower Bouquet', src: '/assets/studio/stickers/wildflower-bouquet-for-you.webp?v=4384fa2f', w: 150, ratio: 1.0428 },
    { id: 'with-love-postmark', name: 'With Love Postmark', src: '/assets/studio/stickers/with-love-postmark.webp?v=1ed43d1e', w: 180, ratio: 0.65 },
    { id: 'you-got-this-note', name: 'You Got This Note', src: '/assets/studio/stickers/you-got-this-note.webp?v=95608f82', w: 160, ratio: 0.7407 }
  ];

  var SIZES = [
    { id: 'small', name: 'Small', factor: 0.22 },
    { id: 'medium', name: 'Medium', factor: 0.34 },
    { id: 'large', name: 'Large', factor: 0.48 }
  ];

  var TYPE_SIZES = [
    { id: 'sm', name: 'Small', value: 40 },
    { id: 'md', name: 'Medium', value: 50 },
    { id: 'lg', name: 'Large', value: 62 }
  ];

  function find(list, id, fallbackIndex) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[fallbackIndex || 0];
  }

  var SCHEMA_VERSION = 1;

  function createLetter() {
    return {
      v: SCHEMA_VERSION,
      paper: 'cream',
      folds: false,
      type: {
        hand: 'marker',
        size: 50,
        lineHeight: 1.42,
        color: '#2B2A28',
        align: 'left'
      },
      meta: { date: '', to: '', from: '' },
      pages: [{ body: '' }],
      objects: [],
      updatedAt: Date.now()
    };
  }

  var objectSeq = 0;

  function nextObjectId() {
    objectSeq += 1;
    return 'o' + Date.now().toString(36) + objectSeq.toString(36);
  }

  function zRange(letter) {
    var max = 0;
    var min = 0;
    for (var i = 0; i < letter.objects.length; i++) {
      var z = letter.objects[i].z;
      if (z > max) max = z;
      if (z < min) min = z;
    }
    return { min: min, max: max };
  }

  function addObject(letter, spec) {
    if (!letter || !Array.isArray(letter.objects) || letter.objects.length >= 30) return null;
    var z = zRange(letter).max + 1;
    var n = letter.objects.length;
    var jitterX = ((n % 3) - 1) * 90;
    var jitterY = (Math.floor(n / 3) % 3) * 80 - 60;

    var obj = {
      id: nextObjectId(),
      kind: spec.kind,
      page: spec.page || 0,
      src: spec.src || null,
      deco: spec.deco || null,
      ratio: spec.ratio || 1,
      w: spec.w || PAGE_W * 0.34,
      x: BLEED + PAGE_W / 2 + jitterX,
      y: BLEED + PAGE_H * 0.6 + jitterY,
      rot: spec.rot != null ? spec.rot : (Math.random() * 8 - 4),
      z: z
    };

    letter.objects.push(obj);
    return obj;
  }

  function removeObject(letter, id) {
    for (var i = 0; i < letter.objects.length; i++) {
      if (letter.objects[i].id === id) {
        letter.objects.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function getObject(letter, id) {
    for (var i = 0; i < letter.objects.length; i++) {
      if (letter.objects[i].id === id) return letter.objects[i];
    }
    return null;
  }

  function objectsOnPage(letter, pageIndex) {
    var out = [];
    for (var i = 0; i < letter.objects.length; i++) {
      if (letter.objects[i].page === pageIndex) out.push(letter.objects[i]);
    }
    out.sort(function (a, b) { return a.z - b.z; });
    return out;
  }

  var DB_NAME = 'lensbooth_studio';
  var DB_VERSION = 1;
  var STORE = 'letters';
  var DRAFT_KEY = 'draft';
  var DRAFT_FLAG = 'lb_studio_letter_draft';

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var req;
      try {
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });

    return dbPromise;
  }

  function saveDraft(letter) {
    letter.updatedAt = Date.now();
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        var tx;
        try {
          tx = db.transaction([STORE], 'readwrite');
        } catch (_e) {
          resolve(false);
          return;
        }
        tx.objectStore(STORE).put(letter, DRAFT_KEY);
        tx.oncomplete = function () {
          try { localStorage.setItem(DRAFT_FLAG, String(letter.updatedAt)); } catch (_e) {}
          resolve(true);
        };
        tx.onerror = function () { resolve(false); };
        tx.onabort = function () { resolve(false); };
      });
    });
  }

  function loadDraft() {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx;
        try {
          tx = db.transaction([STORE], 'readonly');
        } catch (_e) {
          resolve(null);
          return;
        }
        var req = tx.objectStore(STORE).get(DRAFT_KEY);
        req.onsuccess = function (e) { resolve(migrate(e.target.result) || null); };
        req.onerror = function () { resolve(null); };
      });
    });
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_FLAG); } catch (_e) {}
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        var tx;
        try {
          tx = db.transaction([STORE], 'readwrite');
        } catch (_e) {
          resolve(false);
          return;
        }
        tx.objectStore(STORE).delete(DRAFT_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    });
  }

  function migrate(letter) {
    if (!letter || typeof letter !== 'object') return null;
    if (!Array.isArray(letter.pages) || !letter.pages.length) return null;

    var base = createLetter();

    letter.v = SCHEMA_VERSION;
    letter.paper = find(PAPERS, letter.paper).id;
    letter.folds = letter.folds === true;
    letter.type = Object.assign({}, base.type, letter.type || {});
    letter.type.hand = find(HANDS, letter.type.hand).id;
    letter.meta = Object.assign({}, base.meta, letter.meta || {});
    letter.meta.date = (typeof letter.meta.date === 'string' ? letter.meta.date : '').slice(0, 60);
    letter.meta.to = (typeof letter.meta.to === 'string' ? letter.meta.to : '').slice(0, 80);
    letter.meta.from = (typeof letter.meta.from === 'string' ? letter.meta.from : '').slice(0, 120);
    if (letter.pages.length > 3) {
      letter.pages = letter.pages.slice(0, 3);
    }
    letter.objects = Array.isArray(letter.objects) ? letter.objects.slice(0, 30) : [];

    for (var i = 0; i < letter.pages.length; i++) {
      if (typeof letter.pages[i].body !== 'string') letter.pages[i].body = '';
      if (letter.pages[i].body.length > 4000) letter.pages[i].body = letter.pages[i].body.slice(0, 4000);
    }
    for (var j = letter.objects.length - 1; j >= 0; j--) {
      var o = letter.objects[j];
      if (!o || !o.id || (o.kind !== 'deco' && !o.src)) {
        letter.objects.splice(j, 1);
        continue;
      }
      if (o.page >= letter.pages.length) o.page = letter.pages.length - 1;
    }

    return letter;
  }

  function hasDraftFlag() {
    try { return !!localStorage.getItem(DRAFT_FLAG); } catch (_e) { return false; }
  }

  function isDirty(letter) {
    if (!letter) return false;
    if (letter.objects.length) return true;
    if (letter.meta.to || letter.meta.from || letter.meta.date) return true;
    for (var i = 0; i < letter.pages.length; i++) {
      if (letter.pages[i].body.trim()) return true;
    }
    return false;
  }

  window.LBLetters = {
    PAGE_W: PAGE_W,
    PAGE_H: PAGE_H,
    BLEED: BLEED,
    STAGE_W: STAGE_W,
    STAGE_H: STAGE_H,
    TEXT_INSET: TEXT_INSET,

    PAPERS: PAPERS,
    HANDS: HANDS,
    INKS: INKS,
    DECORATIONS: DECORATIONS,
    SIZES: SIZES,
    TYPE_SIZES: TYPE_SIZES,

    paper: function (id) { return find(PAPERS, id); },
    hand: function (id) { return find(HANDS, id); },
    handFamily: handFamily,
    size: function (id) { return find(SIZES, id, 1); },

    createLetter: createLetter,
    addObject: addObject,
    removeObject: removeObject,
    getObject: getObject,
    objectsOnPage: objectsOnPage,
    zRange: zRange,
    isDirty: isDirty,

    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    hasDraftFlag: hasDraftFlag
  };
})(window, document);
