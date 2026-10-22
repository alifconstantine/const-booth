import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_OUT_DIR = path.join(ROOT_DIR, 'public', 'assets', 'jepreto-frames');

function sanitizeName(name) {
  return (name || 'template')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function getSubfolder(ratio) {
  if (ratio === '1:3') return 'strips';
  if (ratio === '2:3') return 'cards';
  return 'others';
}

async function fetchPage(page) {
  try {
    const res = await fetch(`https://jepreto.com/template-selection?page=${page}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const idx = unescaped.indexOf('"templates":[');
    if (idx === -1) return [];
    const start = unescaped.indexOf('[', idx);
    let depth = 0, end = -1;
    for (let i = start; i < unescaped.length; i++) {
      if (unescaped[i] === '[') depth++;
      else if (unescaped[i] === ']') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    return JSON.parse(unescaped.substring(start, end + 1));
  } catch(e) {
    console.error(`Error fetching page ${page}:`, e.message);
    return [];
  }
}

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
    return true; // Already downloaded
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
      return true;
    } catch(err) {
      if (attempt === 3) {
        console.error(`Failed to download ${url}:`, err.message);
        return false;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
}

async function run() {
  console.log('=== Jepreto Top 100 Templates Downloader ===\n');

  // Create required directories
  const dirs = [
    BASE_OUT_DIR,
    path.join(BASE_OUT_DIR, 'strips'),
    path.join(BASE_OUT_DIR, 'cards'),
    path.join(BASE_OUT_DIR, 'others'),
    path.join(BASE_OUT_DIR, 'thumbnails')
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  console.log('1. Fetching template metadata...');
  const allTemplates = [];
  const visitedIds = new Set();

  // Fetch first 15 pages (180 templates) to find the top 100 most used
  for (let p = 1; p <= 15; p++) {
    const pageItems = await fetchPage(p);
    for (const item of pageItems) {
      if (item && item.id && !visitedIds.has(item.id)) {
        visitedIds.add(item.id);
        allTemplates.push(item);
      }
    }
  }

  console.log(`Fetched ${allTemplates.length} unique candidates.`);

  // Sort by used_times descending
  allTemplates.sort((a, b) => (b.used_times || 0) - (a.used_times || 0));

  // Take top 100
  const top100 = allTemplates.slice(0, 100);
  console.log(`Filtered Top 100 templates (Highest: ${top100[0]?.used_times} uses, Lowest: ${top100[99]?.used_times} uses)\n`);

  console.log('2. Downloading images and building catalog...');
  const catalog = [];

  // Batch download in chunks of 5
  const CONCURRENCY = 5;
  for (let i = 0; i < top100.length; i += CONCURRENCY) {
    const chunk = top100.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (tmpl, idxInChunk) => {
      const index = i + idxInChunk + 1;
      const cleanName = sanitizeName(tmpl.name);
      const ratio = tmpl.aspect_ratio || 'other';
      const cleanRatio = ratio.replace(/[^a-zA-Z0-9]/g, 'x');
      const slotsCount = tmpl.positions?.length || 0;
      const shortId = tmpl.id.slice(0, 6);
      const subfolder = getSubfolder(ratio);

      // Determine frame extension
      const frameExt = (tmpl.url && tmpl.url.endsWith('.webp')) ? '.webp' : '.png';
      const frameFilename = `${cleanName}_${cleanRatio}_${slotsCount}slots_${shortId}${frameExt}`;
      const thumbFilename = `${cleanName}_${cleanRatio}_${slotsCount}slots_${shortId}.webp`;

      const frameLocalPath = path.join(BASE_OUT_DIR, subfolder, frameFilename);
      const thumbLocalPath = path.join(BASE_OUT_DIR, 'thumbnails', thumbFilename);

      const frameRelPath = `/assets/jepreto-frames/${subfolder}/${frameFilename}`;
      const thumbRelPath = `/assets/jepreto-frames/thumbnails/${thumbFilename}`;

      process.stdout.write(`[${index}/100] Downloading: "${tmpl.name}" (${subfolder})...\n`);

      // Download frame and thumbnail
      await Promise.all([
        tmpl.url ? downloadFile(tmpl.url, frameLocalPath) : Promise.resolve(),
        tmpl.thumbnail ? downloadFile(tmpl.thumbnail, thumbLocalPath) : Promise.resolve()
      ]);

      catalog.push({
        id: tmpl.id,
        shortId,
        name: tmpl.name,
        creator: tmpl.creator_name || 'Community',
        ratio: tmpl.aspect_ratio || 'unknown',
        subfolder,
        slotsCount,
        usedTimes: tmpl.used_times || 0,
        frameFile: frameFilename,
        frameUrl: frameRelPath,
        thumbnailUrl: thumbRelPath,
        sourceUrl: tmpl.url,
        positions: (tmpl.positions || []).map(pos => ({
          index: pos.position_index,
          top: parseFloat(pos.position_top) || 0,
          left: parseFloat(pos.position_left) || 0,
          width: parseFloat(pos.width) || 0,
          height: parseFloat(pos.height) || 0,
          type: pos.type || 'landscape',
          rotation: parseFloat(pos.position_rotation) || 0
        }))
      });
    }));
  }

  // Sort catalog matching top100 order
  catalog.sort((a, b) => b.usedTimes - a.usedTimes);

  // Write catalog.json
  const catalogPath = path.join(BASE_OUT_DIR, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

  console.log(`\nDONE!`);
  console.log(`- Downloaded 100 templates into: ${BASE_OUT_DIR}`);
  console.log(`- Catalog generated: ${catalogPath}`);
}

run();
