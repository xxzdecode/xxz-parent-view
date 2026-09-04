import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, '.codex-backups', 'daily-card-visual-qa');
fs.mkdirSync(outputDir, { recursive: true });
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
  fs.readFile(target, (error, body) => error ? response.writeHead(404).end() : response.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' }).end(body));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
  await page.route('https://pnwxpuwsoprfehdvnlik.supabase.co/**', async route => {
    const key = new URL(route.request().url()).searchParams.get('key') || '';
    const value = key.includes('parent_daily_updates_v1') ? { records: { '2026-08-26': {
      title: '今日学习反馈',
      sections: [{ title: '英语', items: ['今天学习了 -ed 和 -ing 结尾形容词的区别与用法。', '薄弱点：书写细节仍需加强，疑问句末尾容易漏写问号。'] }, { title: '数学 · 启源', items: ['复习了大数计算，并练习了借位计算。'] }],
      homework: ['1. 芳菲、启源：完成一份日测。', '2. 芳菲：完成默写纸（已完成）。']
    } } } : null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ value }]) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=daily-card&date=2026-08-26`, { waitUntil: 'domcontentloaded' });
  await page.locator('#dailyCardContent:not(.loading-card)').waitFor();
  assert.equal(await page.locator('#dailyCardView').isVisible(), true);
  assert.equal(await page.locator('#homeView').isVisible(), false);
  assert.equal(await page.locator('.topbar').isVisible(), false);
  assert.equal(await page.locator('.daily-card__homework li').count(), 2);
  assert.equal(await page.locator('.daily-card__weakness').count(), 1);
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, cardWidth: document.querySelector('.daily-card').getBoundingClientRect().width }));
  assert.equal(metrics.scrollWidth, 393);
  assert.equal(metrics.clientWidth, 393);
  assert.ok(metrics.cardWidth > 350 && metrics.cardWidth < 393);
  await page.locator('#dailyCardView').screenshot({ path: path.join(outputDir, 'daily-card-393.png') });
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
