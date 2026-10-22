import WebSocket from 'ws';

async function test() {
  const listRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await listRes.json();
  const page = targets.find(t => t.url.includes('localhost:3000/strips'));
  if (!page) return;

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const id = msgId++;
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  ws.on('open', async () => {
    await send('Runtime.enable');

    // Test adding an inline onclick to a card and clicking it
    const test = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const card = document.querySelector('.ts-card');
          card.setAttribute('onclick', 'localStorage.setItem("testClicked", "yes")');
          card.click();
          return localStorage.getItem('testClicked');
        })()
      `,
      returnByValue: true
    });
    console.log('Inline onclick test:', test.result.value);

    ws.close();
    process.exit(0);
  });
}

test();
