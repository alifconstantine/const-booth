import { spawn } from 'child_process';
import WebSocket from 'ws';
import allTemplates from '../public/assets/all-templates.json' with { type: 'json' };

async function run() {
  const tmpl = allTemplates[0]; // "1975 - About you (4)", 3 slots
  console.log('Testing Canvas Strip rendering with:', tmpl.name);

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

    // Setup localStorage
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

    await new Promise((r) => setTimeout(r, 2000));

    // Test loading the template frame image and drawing onto canvas
    const renderTest = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const jt = JSON.parse(localStorage.getItem('jepretoTemplate'));
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const loadPromise = new Promise((resolve, reject) => {
              img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = (e) => reject('Failed to load ' + img.src);
            });
            img.src = jt.frameUrl;
            const size = await loadPromise;

            // Create canvas and test composite
            const c = document.createElement('canvas');
            c.width = size.width;
            c.height = size.height;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);

            const dataUrl = c.toDataURL('image/jpeg', 0.9);
            return {
              success: true,
              width: size.width,
              height: size.height,
              dataUrlLength: dataUrl.length
            };
          } catch(err) {
            return { success: false, error: String(err) };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Frame Overlay Canvas Test:', JSON.stringify(renderTest.result.value, null, 2));

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

run();
