import { spawn } from 'child_process';
import WebSocket from 'ws';

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/strips'
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
    await new Promise((r) => setTimeout(r, 1500));

    // Test 1: Category Switch to "Card 2:3"
    console.log('--- Test 1: Category Filter (Card 2:3) ---');
    const catTest = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = document.querySelector('.ts-cat-btn[data-cat="2:3"]');
          btn.click();
          const cards = document.querySelectorAll('.ts-card');
          const firstTitle = cards[0]?.querySelector('.ts-card-title')?.innerText;
          return { cardsCount: cards.length, firstTitle };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 1:', catTest.result.value);

    // Test 2: Search for "snoopy"
    console.log('--- Test 2: Search filter ---');
    const searchTest = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const input = document.getElementById('ts-search-input');
          input.value = 'snoopy';
          document.getElementById('ts-search-btn').click();
          const cards = document.querySelectorAll('.ts-card');
          const titles = Array.from(cards).map(c => c.querySelector('.ts-card-title')?.innerText);
          return { cardsCount: cards.length, titles };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 2:', searchTest.result.value);

    // Test 3: Tag Chip Click (#cute)
    console.log('--- Test 3: Trending Tag (#cute) ---');
    const tagTest = await send('Runtime.evaluate', {
      expression: `
        (() => {
          document.getElementById('ts-btn-reset-filters')?.click() || document.getElementById('ts-search-clear')?.click();
          const cuteChip = document.querySelector('.ts-tag-chip[data-tag="cute"]');
          cuteChip.click();
          const cards = document.querySelectorAll('.ts-card');
          const titles = Array.from(cards).slice(0, 3).map(c => c.querySelector('.ts-card-title')?.innerText);
          return { cardsCount: cards.length, titles };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 3:', tagTest.result.value);

    // Test 4: Pagination to Page 2
    console.log('--- Test 4: Pagination to Page 2 ---');
    const pageTest = await send('Runtime.evaluate', {
      expression: `
        (() => {
          // Reset all
          const resetBtn = document.getElementById('ts-btn-reset-filters');
          if (resetBtn) resetBtn.click();
          else {
            const allBtn = document.querySelector('.ts-cat-btn[data-cat="all"]');
            if (allBtn) allBtn.click();
          }
          const nextBtn = document.querySelector('.ts-page-btn[data-page="2"]');
          if (nextBtn) nextBtn.click();
          const pageInfo = document.querySelector('.ts-page-info')?.innerText;
          const firstTitle = document.querySelector('.ts-card .ts-card-title')?.innerText;
          return { pageInfo, firstTitle };
        })()
      `,
      returnByValue: true
    });
    console.log('Result 4:', pageTest.result.value);

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

run();
