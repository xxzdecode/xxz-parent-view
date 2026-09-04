import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith('--')) pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));
const date = String(args.date || '');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请用 --date YYYY-MM-DD 指定日报日期');
if (!args.output) throw new Error('请用 --output 指定 PNG 输出路径');

const mime = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let server;
let baseUrl = args.url;
if (!baseUrl) {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' }).end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  const url = new URL(baseUrl);
  url.searchParams.set('view', 'daily-card');
  url.searchParams.set('date', date);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('#dailyCardContent:not(.loading-card)').waitFor({ timeout: 20000 });
  if (await page.locator('#dailyCardContent.empty').count()) throw new Error(`${date} 没有可截图的日报`);
  await page.evaluate(() => document.fonts.ready);
  const output = path.resolve(args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await page.locator('#dailyCardView').screenshot({ path: output });
  console.log(output);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
