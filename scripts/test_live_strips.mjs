import { spawn } from 'child_process';
import WebSocket from 'ws';

async function run() {
  console.log('1. Starting headless Chrome on port 9222...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/strips'
  ]);

  // Wait for Chrome remote debugging port to become ready
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
    console.error('Failed to connect to Chrome on 9222');
    chrome.kill();
    process.exit(1);
  }

  console.log('2. Connected to Chrome. Finding /strips tab...');
  const listRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await listRes.json();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('localhost:3000'));
  if (!page) {
    console.error('No page tab found:', tabs);
    chrome.kill();
    process.exit(1);
  }

  console.log('3. Connecting WebSocket to tab:', page.url);
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
    try {
      await send('Runtime.enable');
      await send('Page.enable');

      // Wait 1.5s for page to settle and render cards
      await new Promise((r) => setTimeout(r, 1500));

      // Check card count and rendered content
      const inspectRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const cards = document.querySelectorAll('.ts-card');
            const title = document.querySelector('.ts-hero-title')?.innerText;
            const firstCardTitle = cards[0]?.querySelector('.ts-card-title')?.innerText;
            const firstCardId = cards[0]?.getAttribute('data-tmpl-id');
            const totalInWindow = window.__ALL_TEMPLATES_DATA__?.length;
            return {
              cardsCount: cards.length,
              heroTitle: title,
              firstCardTitle,
              firstCardId,
              totalInWindow
            };
          })()
        `,
        returnByValue: true
      });
      console.log('DOM Inspection Result:', JSON.stringify(inspectRes.result.value, null, 2));

      // Test clicking the first card!
      console.log('4. Simulating click on first card...');
      const clickRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const card = document.querySelector('.ts-card');
            if (!card) return { error: 'No card found' };
            card.click();
            return {
              clicked: true,
              cardText: card.querySelector('.ts-card-title')?.innerText,
              storageOutputMode: localStorage.getItem('outputMode'),
              storageStripStyle: localStorage.getItem('stripStyle'),
              hasJepretoTemplate: !!localStorage.getItem('jepretoTemplate'),
              jepretoTemplateName: (function(){ try { return JSON.parse(localStorage.getItem('jepretoTemplate')).name; }catch(e){ return null; } })()
            };
          })()
        `,
        returnByValue: true
      });
      console.log('Card Click Result:', JSON.stringify(clickRes.result.value, null, 2));

      // Wait 300ms for navigation to trigger
      await new Promise((r) => setTimeout(r, 600));

      const navRes = await send('Runtime.evaluate', {
        expression: `location.href`,
        returnByValue: true
      });
      console.log('Current URL after click:', navRes.result.value);

      ws.close();
      chrome.kill();
      process.exit(0);
    } catch (err) {
      console.error('Error during test:', err);
      ws.close();
      chrome.kill();
      process.exit(1);
    }
  });
}

run();
