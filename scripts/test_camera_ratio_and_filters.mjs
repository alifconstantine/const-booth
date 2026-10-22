import { spawn } from 'child_process';
import WebSocket from 'ws';
import allTemplates from '../public/assets/all-templates.json' with { type: 'json' };

// Find 3 templates with different slot ratios:
// 1. 3:2
const tmpl3_2 = allTemplates.find((t) => {
  const p = t.positions[0];
  const r = (p.width / p.height) * (t.ratio === '1:3' ? 1/3 : 2/3);
  return r >= 1.38 && r <= 1.65;
});

// 2. 1:1
const tmpl1_1 = allTemplates.find((t) => {
  const p = t.positions[0];
  const r = (p.width / p.height) * (t.ratio === '1:3' ? 1/3 : 2/3);
  return r >= 0.90 && r <= 1.15;
});

// 3. 4:3
const tmpl4_3 = allTemplates.find((t) => {
  const p = t.positions[0];
  const r = (p.width / p.height) * (t.ratio === '1:3' ? 1/3 : 2/3);
  return r >= 1.15 && r < 1.38;
});

console.log('Selected templates:');
console.log('3:2 template:', tmpl3_2.name, tmpl3_2.shortId);
console.log('1:1 template:', tmpl1_1.name, tmpl1_1.shortId);
console.log('4:3 template:', tmpl4_3.name, tmpl4_3.shortId);

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/camera'
  ]);

  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (_e) {}
  }

  if (!ready) {
    console.error('Failed to start Chrome with debugging port');
    chrome.kill();
    process.exit(1);
  }

  const listRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await listRes.json();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            ws.off('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        } catch (e) {
          reject(e);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  ws.on('open', async () => {
    await send('Runtime.enable');

    // Test 1: Check 3:2 template
    console.log('\n--- Testing Ratio 3:2 ---');
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('outputMode', 'strip');
        localStorage.setItem('stripStyle', '${tmpl3_2.shortId}');
        localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl3_2)}));
        location.reload();
      `
    });

    await new Promise((r) => setTimeout(r, 1800));

    const check3_2 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const frame = document.getElementById('camera-frame');
          const badge = document.getElementById('cam-ratio-badge');
          const styleSec = document.querySelector('.strip-style-section');
          const styleScroll = document.getElementById('output-style-scroll');
          return {
            frameClass: frame ? frame.className : null,
            badgeText: badge ? badge.textContent : null,
            badgeDisplay: badge ? window.getComputedStyle(badge).display : null,
            styleSecDisplay: styleSec ? window.getComputedStyle(styleSec).display : 'no-sec',
            styleScrollDisplay: styleScroll ? window.getComputedStyle(styleScroll).display : 'no-scroll',
            ratioInfo: window._camRatioInfo
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 3:2:', check3_2.result.value);

    // Test 2: Check 1:1 template
    console.log('\n--- Testing Ratio 1:1 ---');
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('stripStyle', '${tmpl1_1.shortId}');
        localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl1_1)}));
        location.reload();
      `
    });

    await new Promise((r) => setTimeout(r, 1800));

    const check1_1 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const frame = document.getElementById('camera-frame');
          const badge = document.getElementById('cam-ratio-badge');
          return {
            frameClass: frame ? frame.className : null,
            badgeText: badge ? badge.textContent : null,
            ratioInfo: window._camRatioInfo
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 1:1:', check1_1.result.value);

    // Test 3: Check 4:3 template
    console.log('\n--- Testing Ratio 4:3 ---');
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('stripStyle', '${tmpl4_3.shortId}');
        localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl4_3)}));
        location.reload();
      `
    });

    await new Promise((r) => setTimeout(r, 1800));

    const check4_3 = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const frame = document.getElementById('camera-frame');
          const badge = document.getElementById('cam-ratio-badge');
          return {
            frameClass: frame ? frame.className : null,
            badgeText: badge ? badge.textContent : null,
            ratioInfo: window._camRatioInfo
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 4:3:', check4_3.result.value);

    // Test 4: Verify Filter Rendering on Jepreto Template
    console.log('\n--- Testing Filter Application (None vs Noir vs Vintage) ---');
    const filterTest = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            // Setup a fake colored captured photo in He
            const c = document.createElement('canvas');
            c.width = 600; c.height = 400;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ff3366';
            ctx.fillRect(0, 0, 600, 400);
            ctx.fillStyle = '#33ccff';
            ctx.fillRect(100, 50, 400, 300);
            const samplePhoto = c.toDataURL('image/jpeg', 0.9);

            // Set template
            localStorage.setItem('stripStyle', '${tmpl3_2.shortId}');
            localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl3_2)}));

            // Access He or set window photo
            const slotsCount = ${tmpl3_2.slotsCount};
            // Trigger output render with filter none
            window.setCurrentStripFilter('none');
            // Populate photo slots if needed
            window._samplePhoto = samplePhoto;

            // Call Lt or render logic
            // Check if Lt is available
            const hasLt = typeof window.Lt === 'function';
            return {
              hasLt: hasLt,
              currentFilter: window.getCurrentStripFilter ? window.getCurrentStripFilter() : null
            };
          } catch(err) {
            return { error: String(err) };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Filter test environment:', filterTest.result.value);

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

run();
