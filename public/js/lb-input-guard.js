(function (window) {
  'use strict';

  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
  var IMAGE_EXTENSION = /\.(jpe?g|png)$/i;
  var ANY_EXTENSION = /\.[a-z0-9]{1,8}$/i;
  var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  var MESSAGES = {
    empty: 'Please choose a photo.',
    'too-large': 'That image is too big. Try one under 10 MB.',
    unsupported: 'Please choose a JPG or PNG photo.',
    unreadable: 'That photo could not be read. Try another one.',
    corrupt: 'That photo could not be opened. It may be damaged.'
  };

  var LINK_PATTERN = new RegExp([
    '(?:https?|ftp|javascript|data|mailto|file):',
    '\\bwww\\.',
    '\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b',
    '\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.' +
      '(?:com|net|org|io|app|co|me|ly|gg|gl|xyz|info|biz|link|click|site|online|store|shop|dev|ai|tv|to|in|uk|us|ru|cn|tk|ml|ga|cf|gq|top|live|club|page|link|lol|icu|vip|win|zip|mov)' +
      '(?![a-z0-9-])'
  ].join('|'), 'i');

  function result(ok, reason, type) {
    return { ok: ok, reason: reason || null, type: type || null, message: ok ? '' : MESSAGES[reason] };
  }

  function readHead(file) {
    return new Promise(function (resolve) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(new Uint8Array(reader.result)); };
        reader.onerror = function () { resolve(null); };
        reader.readAsArrayBuffer(file.slice(0, 16));
      } catch (_e) {
        resolve(null);
      }
    });
  }

  function sniff(bytes) {
    if (!bytes) return null;
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length < PNG_SIGNATURE.length) return null;
    for (var i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) return null;
    }
    return 'image/png';
  }

  function decodes(file) {
    return new Promise(function (resolve) {
      var url;
      var settled = false;
      function done(ok) {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(url); } catch (_e) {}
        resolve(ok);
      }
      try {
        url = URL.createObjectURL(file);
      } catch (_e) {
        resolve(false);
        return;
      }
      var img = new Image();
      img.onload = function () { done(img.naturalWidth > 0 && img.naturalHeight > 0); };
      img.onerror = function () { done(false); };
      window.setTimeout(function () { done(false); }, 20000);
      img.src = url;
    });
  }

  function checkImage(file, options) {
    var maxBytes = (options && options.maxBytes) || MAX_IMAGE_BYTES;
    if (!file || typeof file.size !== 'number') return Promise.resolve(result(false, 'empty'));
    if (!file.size) return Promise.resolve(result(false, 'unreadable'));
    if (file.size > maxBytes) return Promise.resolve(result(false, 'too-large'));

    var declared = String(file.type || '').toLowerCase();
    if (declared && IMAGE_TYPES.indexOf(declared) === -1) return Promise.resolve(result(false, 'unsupported'));

    var name = String(file.name || '');
    if (ANY_EXTENSION.test(name) && !IMAGE_EXTENSION.test(name)) return Promise.resolve(result(false, 'unsupported'));

    return readHead(file).then(function (head) {
      if (!head) return result(false, 'unreadable');
      var type = sniff(head);
      if (!type) return result(false, 'unsupported');
      return decodes(file).then(function (ok) {
        return ok ? result(true, null, type) : result(false, 'corrupt');
      });
    });
  }

  function filterImages(files, options) {
    var list = Array.prototype.slice.call(files || []);
    return Promise.all(list.map(function (file) { return checkImage(file, options); })).then(function (checks) {
      var out = { accepted: [], rejected: [] };
      checks.forEach(function (check, i) {
        if (check.ok) out.accepted.push(list[i]);
        else out.rejected.push({ file: list[i], reason: check.reason, message: check.message });
      });
      return out;
    });
  }

  function hasLink(text) {
    return typeof text === 'string' && text.length > 0 && LINK_PATTERN.test(text);
  }

  window.LBInputGuard = {
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    checkImage: checkImage,
    filterImages: filterImages,
    hasLink: hasLink
  };
})(window);
