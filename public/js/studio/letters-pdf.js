(function (window, document) {
  'use strict';

  var M = window.LBLetters;
  var R = window.LBLettersRender;

  var PT_PER_UNIT = 595.28 / 1000;

  function ascii(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function concat(chunks, total) {
    var out = new Uint8Array(total);
    var at = 0;
    for (var i = 0; i < chunks.length; i++) {
      out.set(chunks[i], at);
      at += chunks[i].length;
    }
    return out;
  }

  function pdfString(value) {
    return '(' + String(value).replace(/[\\()]/g, '\\$&').replace(/[\r\n]/g, ' ') + ')';
  }

  function pdfDate(d) {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return 'D:' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function blobToBytes(blob) {
    if (blob.arrayBuffer) {
      return blob.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(new Error('read')); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function build(canvases, opts) {
    opts = opts || {};
    if (!canvases || !canvases.length) return Promise.reject(new Error('no-pages'));

    var quality = opts.quality || 0.92;

    var jobs = canvases.map(function (canvas) {
      return R.canvasToBlob(canvas, 'image/jpeg', quality).then(blobToBytes);
    });

    return Promise.all(jobs).then(function (images) {
      return assemble(images, canvases, opts);
    });
  }

  function assemble(images, canvases, opts) {

    var pageW = (M.PAGE_W * PT_PER_UNIT).toFixed(2);
    var pageH = (M.PAGE_H * PT_PER_UNIT).toFixed(2);
    var count = images.length;

    var FIRST = 4;
    function pageObj(i) { return FIRST + i * 3; }
    function contentObj(i) { return FIRST + i * 3 + 1; }
    function imageObj(i) { return FIRST + i * 3 + 2; }

    var chunks = [];
    var total = 0;
    var offsets = [];

    function push(bytes) {
      chunks.push(bytes);
      total += bytes.length;
    }

    function pushStr(str) { push(ascii(str)); }

    function beginObject(num) {
      offsets[num] = total;
      pushStr(num + ' 0 obj\n');
    }

    function endObject() { pushStr('\nendobj\n'); }

    pushStr('%PDF-1.4\n');

    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    beginObject(1);
    pushStr('<< /Type /Catalog /Pages 2 0 R >>');
    endObject();

    var kids = [];
    for (var k = 0; k < count; k++) kids.push(pageObj(k) + ' 0 R');

    beginObject(2);
    pushStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + count + ' >>');
    endObject();

    beginObject(3);
    pushStr(
      '<< /Title ' + pdfString(opts.title || 'A letter from ConstBooth') +
      ' /Producer ' + pdfString('ConstBooth Studio') +
      ' /Creator ' + pdfString('ConstBooth Studio') +
      ' /CreationDate ' + pdfString(pdfDate(new Date())) + ' >>'
    );
    endObject();

    for (var i = 0; i < count; i++) {
      var img = images[i];
      var canvas = canvases[i];

      beginObject(pageObj(i));
      pushStr(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + ']' +
        ' /Resources << /XObject << /Im0 ' + imageObj(i) + ' 0 R >> >>' +
        ' /Contents ' + contentObj(i) + ' 0 R >>'
      );
      endObject();

      var content = 'q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im0 Do\nQ\n';
      beginObject(contentObj(i));
      pushStr('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
      endObject();

      beginObject(imageObj(i));
      pushStr(
        '<< /Type /XObject /Subtype /Image /Width ' + canvas.width +
        ' /Height ' + canvas.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        img.length + ' >>\nstream\n'
      );
      push(img);
      pushStr('\nendstream');
      endObject();
    }

    var maxObj = imageObj(count - 1);
    var xrefAt = total;

    var xref = 'xref\n0 ' + (maxObj + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= maxObj; n++) {
      var off = offsets[n] || 0;
      xref += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    }
    pushStr(xref);

    pushStr(
      'trailer\n<< /Size ' + (maxObj + 1) + ' /Root 1 0 R /Info 3 0 R >>\n' +
      'startxref\n' + xrefAt + '\n%%EOF\n'
    );

    return new Blob([concat(chunks, total)], { type: 'application/pdf' });
  }

  window.LBLettersPdf = { build: build };
})(window, document);
