// Usage: node screenshot.mjs <url> [label] [--mobile] [--full]
// Saves to "./temporary screenshots/screenshot-N[-label].png" (never overwrites).
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [url = 'http://localhost:3000', label] = args.filter((a) => !a.startsWith('--'));
const mobile = flags.has('--mobile');

const dir = path.resolve('temporary screenshots');
fs.mkdirSync(dir, { recursive: true });
const nums = fs.readdirSync(dir).map((f) => Number((f.match(/^screenshot-(\d+)/) || [])[1]) || 0);
const n = Math.max(0, ...nums) + 1;
const file = path.join(dir, `screenshot-${n}${label ? `-${label}` : ''}.png`);

const systemChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
// Optional: sign in to the admin first (ADMIN_USER / ADMIN_PW env vars).
if (process.env.ADMIN_PW) {
  await page.goto(new URL('/admin/login', url).href, { waitUntil: 'networkidle2' });
  await page.type('#username', process.env.ADMIN_USER || 'admin');
  await page.type('#password', process.env.ADMIN_PW);
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
}
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
// Reveal scroll-animated sections and give fonts/images a moment.
await page.evaluate(async () => {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  // Scroll through so lazy images load, then return to top.
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 1200)));
await page.screenshot({ path: file, fullPage: flags.has('--full') });
await browser.close();
console.log(file);
