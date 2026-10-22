import { spawn } from 'child_process';
import WebSocket from 'ws';
import allTemplates from '../public/assets/all-templates.json' with { type: 'json' };

const tmpl = allTemplates[0]; // 1975 - About you (4)

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

    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('outputMode', 'strip');
        localStorage.setItem('stripStyle', '${tmpl.shortId}');
        localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl)}));
        location.reload();
      `
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Test clicking capture button to take photos
    console.log('--- Triggering Capture ---');
    const captureResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const btn = document.getElementById('capture-btn');
            if (btn) {
              btn.click();
              return { clicked: true };
            }
            return { clicked: false };
          } catch(e) {
            return { error: String(e) };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Capture Clicked:', captureResult.result.value);

    // Wait for the countdown and photo shoot to finish (about 12s for 3 slots with fast timers or fake stream)
    console.log('Waiting for photo shoot to finish and reach output screen...');
    let previewVisible = false;
    for (let wait = 0; wait < 30; wait++) {
      await new Promise((r) => setTimeout(r, 1000));
      const check = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const ps = document.getElementById('preview-screen');
            const img = document.getElementById('preview-img');
            return {
              visible: ps ? ps.classList.contains('visible') : false,
              hasImgSrc: !!(img && img.src && img.src.length > 100),
              imgSrcLength: img && img.src ? img.src.length : 0
            };
          })()
        `,
        returnByValue: true
      });
      if (check.result.value.visible && check.result.value.hasImgSrc) {
        previewVisible = true;
        console.log(`Reached output screen after ${wait + 1}s:`, check.result.value);
        break;
      }
    }

    if (!previewVisible) {
      console.log('Note: Fake stream timer taking longer or overlay waiting.');
    }

    // Now test clicking filters on output screen!
    console.log('\n--- Testing Output Screen Filter Clicks ---');
    const filterSwitchResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const initialFilter = window.getCurrentStripFilter ? window.getCurrentStripFilter() : 'none';
            const imgBefore = document.getElementById('preview-img')?.src;

            // Click Noir filter
            const noirBtn = document.querySelector('#output-filter-scroll .filter[data-filter=\"noir\"]');
            if (noirBtn) {
              noirBtn.click();
            }

            // Wait 500ms for debounce and render
            await new Promise(r => setTimeout(r, 600));

            const filterAfterNoir = window.getCurrentStripFilter ? window.getCurrentStripFilter() : null;
            const imgAfterNoir = document.getElementById('preview-img')?.src;

            // Click Vintage filter
            const vintageBtn = document.querySelector('#output-filter-scroll .filter[data-filter=\"vintage\"]');
            if (vintageBtn) {
              vintageBtn.click();
            }

            await new Promise(r => setTimeout(r, 600));

            const filterAfterVintage = window.getCurrentStripFilter ? window.getCurrentStripFilter() : null;
            const imgAfterVintage = document.getElementById('preview-img')?.src;

            return {
              initialFilter,
              filterAfterNoir,
              filterAfterVintage,
              imgUpdatedNoir: imgBefore !== imgAfterNoir,
              imgUpdatedVintage: imgAfterNoir !== imgAfterVintage,
              styleSectionHidden: document.querySelector('.strip-style-section') ? window.getComputedStyle(document.querySelector('.strip-style-section')).display : 'none'
            };
          } catch(err) {
            return { error: String(err) };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Filter switch result:', JSON.stringify(filterSwitchResult.result.value, null, 2));

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

run();
