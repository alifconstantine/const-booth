import { spawn } from 'child_process';
import http from 'http';

const port = process.env.PORT || 3000;

// Helper to check if server is running
function checkServer(p) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${p}/api/check-booth/test`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('\n🚀 Memulai ConstBooth Shared & Mobile Access...');

  let serverProcess = null;
  const isRunning = await checkServer(port);

  if (!isRunning) {
    console.log(`📦 Menjalankan ConstBooth server di port ${port}...`);
    serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: String(port) }
    });

    // Wait until server is responding
    let connected = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 600));
      if (await checkServer(port)) {
        connected = true;
        break;
      }
    }
    if (!connected) {
      console.error('❌ Gagal menyalakan server lokal.');
      if (serverProcess) serverProcess.kill();
      process.exit(1);
    }
  } else {
    console.log(`✅ Server lokal sudah berjalan di http://localhost:${port}`);
  }

  console.log('🌐 Membuka HTTPS tunnel via Cloudflare...');

  const cf = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
    shell: true
  });

  let tunnelUrl = null;

  const onData = (data) => {
    const str = data.toString();
    const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      console.log('\n' + '='.repeat(64));
      console.log('🎉 LINK HTTPS HP (SHARED PHOTOBOOTH) SUDAH AKTIF!');
      console.log('='.repeat(64));
      console.log(`\n👉 Buka di browser HP Anda:`);
      console.log(`   \x1b[36m\x1b[1m${tunnelUrl}\x1b[0m\n`);
      console.log('✅ Keunggulan menggunakan link ini:');
      console.log('   - Kamera HP otomatis aktif tanpa batasan keamanan browser.');
      console.log('   - Berfungsi di Android (Chrome) & iPhone (Safari).');
      console.log('   - Fitur Photobooth Berdua (Shared) tersinkronisasi langsung!');
      console.log('\nTekan Ctrl+C untuk menghentikan tunnel.\n' + '='.repeat(64) + '\n');
    }
  };

  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);

  const cleanup = () => {
    console.log('\nMenutup tunnel...');
    try { cf.kill(); } catch (_) {}
    if (serverProcess) {
      try { serverProcess.kill(); } catch (_) {}
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
