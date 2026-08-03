// Headless-генерация магазинных ассетов (без внешних image-API).
// Делает: скриншоты геймплея с реального билда (RU+EN) + обложки RU/EN + иконку из card.html.
// Запуск из папки игры:  node test/make-assets.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'store-assets');
mkdirSync(out, { recursive: true });
const gameUrl = 'file://' + resolve(root, 'index.html');
const cardUrl = 'file://' + resolve(root, 'store', 'card.html');

// ---- CONFIG ----
const CONFIG = {
  titleRu: 'Сладкая Банка', titleEn: 'Sweet Jar',
  subRu: 'Слейся в сладкий рекорд!', subEn: 'Merge your way to a sweet record!',
  // герой обложки — банка с конфетами и бантом, векторная SVG (не эмодзи)
  heroSvg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M30 40 L27 82 Q27 89 34 89 L66 89 Q73 89 73 82 L70 40 Z" fill="#EAF6FB" stroke="#5B4636" stroke-width="4.5"/>'
    + '<rect x="35" y="29" width="30" height="13" rx="4" fill="#EAF6FB" stroke="#5B4636" stroke-width="4.5"/>'
    + '<rect x="30" y="17" width="40" height="13" rx="6" fill="#FF8FA3" stroke="#5B4636" stroke-width="4.5"/>'
    + '<circle cx="42" cy="60" r="9.5" fill="#FF9EAE" stroke="#5B4636" stroke-width="3.2"/>'
    + '<circle cx="60" cy="65" r="10.5" fill="#F2C14E" stroke="#5B4636" stroke-width="3.2"/>'
    + '<circle cx="50" cy="76" r="8.5" fill="#8FD9C4" stroke="#5B4636" stroke-width="3.2"/>'
    + '<path d="M33 46 L33 80" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>'
    + '</svg>',
  accent: '#FF8FA3', bg: '#FCE8D8', ink: '#5B4636',
  // характерные экраны игры: [имя файла, скрипт подготовки состояния через тест-хуки]
  shots: [
    ['d1-start', async p => {
      await p.evaluate(() => { window.testClearJar(); window.testSetState({coins:80, bestScore:0, discovered:[0]});
        window.testDrop(0.32,0); window.testDrop(0.62,0); window.advanceTime(700); });
    }],
    ['d2-merge', async p => {
      await p.evaluate(() => {
        window.testClearJar();
        window.testSetState({coins:340, bestScore:0, discovered:[0,1,2]});
        window.testDrop(0.3,1); window.testDrop(0.5,2); window.testDrop(0.7,1);
        window.testDrop(0.4,0); window.testDrop(0.6,0);
        window.advanceTime(900);
      });
    }],
    ['d3-shop', async p => {
      await p.evaluate(() => {
        window.testClearJar();
        window.testSetState({coins:1200, up:{pool:1,luck:0,cap:0}, discovered:[0,1,2,3]});
        window.testDrop(0.35,2); window.testDrop(0.65,3);
        window.advanceTime(700);
      });
      await p.click('#shopBtn');
      await p.waitForTimeout(150);
    }],
    ['d4-collection', async p => {
      await p.evaluate(() => {
        window.testClearJar();
        window.testSetState({coins:2600, bestScore:640, bestTier:5, discovered:[0,1,2,3,4,5]});
        window.testDrop(0.5,4);
        window.advanceTime(700);
      });
      await p.click('#collectionBtn');
      await p.waitForTimeout(150);
    }],
    ['d5-full', async p => {
      await p.evaluate(() => {
        window.testClearJar();
        window.testSetState({coins:5400, bestScore:900, bestTier:6, discovered:[0,1,2,3,4,5,6]});
        window.testDrop(0.5,6); window.testDrop(0.3,5); window.testDrop(0.7,4);
        window.testDrop(0.4,3); window.testDrop(0.6,2); window.testDrop(0.5,1);
        window.advanceTime(1200);
      });
    }],
  ],
};

const browser = await chromium.launch();

async function shot(url, w, h, file, prep, locale) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale });
  await page.goto(url);
  await page.waitForTimeout(400);
  if (prep) await prep(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('saved', file);
}

// Скриншоты геймплея (десктоп 1920x1080) — RU и EN локаль
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '.png', prep, 'ru-RU');
}
for (const [name, prep] of CONFIG.shots) {
  await shot(gameUrl, 1920, 1080, name + '-en.png', prep, 'en-US');
}

// Обложки 800x470 и иконка 512x512 из card.html
const card = (o) => cardUrl + '?' + new URLSearchParams(o).toString();
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleRu,sub:CONFIG.subRu,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover.png');
await shot(card({ w:800,h:470,mode:'cover',title:CONFIG.titleEn,sub:CONFIG.subEn,heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 800, 470, 'cover-en.png');
await shot(card({ w:512,h:512,mode:'icon',heroSvg:CONFIG.heroSvg,accent:CONFIG.accent,bg:CONFIG.bg,ink:CONFIG.ink }), 512, 512, 'icon.png');

await browser.close();
console.log('\nАссеты готовы в', out);
