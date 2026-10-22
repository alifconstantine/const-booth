import { spawn } from 'child_process';
import WebSocket from 'ws';
import allTemplates from '../public/assets/all-templates.json' with { type: 'json' };

async function run() {
  const tmpl = allTemplates[0]; // "1975 - About you (4)", 3 slots
  console.log('Testing Camera Booth with template:', tmpl.name, 'slots:', tmpl.slotsCount);

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
    await send('Page.enable');

    // Setup localStorage with the Jepreto template and reload
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          localStorage.setItem('outputMode', 'strip');
          localStorage.setItem('stripStyle', '${tmpl.shortId}');
          localStorage.setItem('jepretoTemplate', JSON.stringify(${JSON.stringify(tmpl)}));
          location.reload();
        })()
      `
    });

    // Wait 2.5s for camera.min.js to initialize on reload
    await new Promise((r) => setTimeout(r, 2500));

    // Check camera initialization state
    const initCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const stored = localStorage.getItem('jepretoTemplate');
          const parsed = stored ? JSON.parse(stored) : null;
          return {
            stripStyle: localStorage.getItem('stripStyle'),
            slotsCount: parsed ? parsed.slotsCount : null,
            templateName: parsed ? parsed.name : null,
            hasCaptureBtn: !!document.getElementById('capture-btn'),
            captureBtnText: document.getElementById('capture-btn')?.innerText
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Camera Init Check:', JSON.stringify(initCheck.result.value, null, 2));

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

run();
