// Playwright smoke-тест игры «Сладкая Банка / Sweet Jar».
// Запуск:  npx playwright install chromium  (один раз)
//          node test/smoke.mjs
// Проверяет: страница грузится без ошибок консоли, тест-хуки есть,
// бросок конфеты и слияние двух одинаковых работает, апгрейды и переполнение банки не ломают стейт.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url);
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

let s0 = await state();
assert(typeof s0.coins === 'number', 'render_game_to_text returns state');
assert(s0.discovered.includes(0), 'tier 0 discovered from the start');
assert(s0.ballCount === 0, 'jar starts empty');
assert(s0.up.pool === 0 && s0.up.luck === 0 && s0.up.cap === 0, 'upgrades start at level 0');

// бросок конфеты через реальный указатель (canvas pointerdown/up) добавляет шар в банку
const box = await page.locator('#cv').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height * 0.3;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(150);
let s1 = await state();
assert(s1.ballCount === 1, 'dropping a candy adds one ball to the jar');

// два тира-0 в одной точке падают и сливаются в тир-1, приносят монеты
await page.evaluate(() => { window.testClearJar(); });
await page.evaluate(() => { window.testDrop(0.5, 0); window.testDrop(0.5, 0); });
let beforeMerge = await state();
assert(beforeMerge.ballCount === 2, 'testDrop places two candies for a forced merge test');
await page.evaluate(() => window.advanceTime(600));
let afterMerge = await state();
assert(afterMerge.ballCount <= 1, 'two same-tier candies merge into one');
assert(afterMerge.coins > beforeMerge.coins, 'merging awards coins');
assert(afterMerge.discovered.includes(1), 'tier 1 gets discovered after first merge');
assert(afterMerge.bestTier >= 1, 'bestTier tracks the highest merged tier');

// хук времени не ломает стейт когда банка пустая
await page.evaluate(() => window.testClearJar());
let beforeIdle = await state();
await page.evaluate(() => window.advanceTime(3000));
let afterIdle = await state();
assert(afterIdle.coins === beforeIdle.coins, 'advanceTime on an empty jar does not change coins');
assert(Number.isFinite(afterIdle.coins), 'coins stay a finite number after advanceTime');

// накопить монет и купить апгрейд в магазине (модалка)
await page.evaluate(() => window.testSetCoins(5000));
await page.click('#shopBtn');
assert(await page.evaluate(() => document.getElementById('shopModal').classList.contains('on')) === true, 'shop modal opens');
const poolBefore = (await state()).up.pool;
await page.evaluate(() => { const b = document.querySelector('#upList button[data-key="pool"]'); if (b && !b.disabled) b.click(); });
const sUp = await state();
assert(sUp.up.pool > poolBefore, 'buying the pool upgrade increases its level');
assert(sUp.coins < 5000, 'buying an upgrade spends coins');
await page.click('#closeShop');
assert(await page.evaluate(() => document.getElementById('shopModal').classList.contains('on')) === false, 'shop modal closes');

// коллекция открывается и показывает все 8 тиров
await page.click('#collectionBtn');
assert(await page.evaluate(() => document.getElementById('collectionModal').classList.contains('on')) === true, 'collection modal opens');
assert(await page.evaluate(() => document.querySelectorAll('#collGrid .ccell').length) === 8, 'collection shows all 8 tiers');
await page.click('#closeColl');

// особая конфета: покупка за монеты повышает следующий тир
await page.evaluate(() => window.testSetCoins(5000));
const beforeSpecial = await state();
await page.click('#specialBtn');
const afterSpecial = await state();
assert(afterSpecial.nextTier > beforeSpecial.up.pool, 'buying a special candy raises the next drop tier');
assert(afterSpecial.coins < beforeSpecial.coins, 'special candy purchase spends coins');

// принудительное переполнение банки: даёт бонус монет, банка очищается, счёт уходит в bestScore
await page.evaluate(() => { window.testClearJar(); window.testDrop(0.5, 3); });
await page.evaluate(() => window.advanceTime(500));
const beforeFull = await state();
await page.evaluate(() => window.testForceOverflow());
const afterFull = await state();
assert(afterFull.ballCount === 0, 'jar overflow clears all candies');
assert(afterFull.coins > beforeFull.coins, 'jar overflow grants a completion bonus');
assert(afterFull.overflowing === false, 'overflow timer resets after the jar is cleared');

// сейв переживает перезагрузку страницы (localStorage-путь)
const savedCoins = (await state()).coins;
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
const afterReload = await state();
assert(afterReload.coins === savedCoins, 'coins persist across a page reload via localStorage');

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
