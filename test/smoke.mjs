// Playwright smoke-тест игры «Сладкая Банка / Sweet Jar».
// Запуск:  node test/smoke.mjs      (Chromium уже установлен, playwright install не нужен)
// Настоящий SDK доступен только на площадке, поэтому подменяем его моком
// через page.addInitScript — до загрузки скриптов игры. Мок считает вызовы
// и дёргает колбэки, в том числе onRewarded + onError подряд (ловушка на двойную награду).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + resolve(__dirname, '..', 'index.html');
const TODAY = new Date().toISOString().slice(0, 10);
const dayAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const errors = [];
// Сетевой шум (Google Fonts недоступны в песочнице) — не JS-ошибка страницы.
const NOISE = /Failed to load resource|net::ERR_|ERR_CONNECTION|favicon/i;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const state = async page => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const shut = async page => { const c = page.context(); await page.close(); await c.close(); };
const calls = async page => await page.evaluate(() => window.__calls);

// ---------------- мок Yandex Games SDK ----------------
function sdkMock() {
  const cfg = window.__mockCfg || {};
  const C = window.__calls = { ready: 0, langReads: 0, rewarded: 0, fullscreen: 0,
    setData: 0, flushes: [], lb: [], canShowPrompt: 0, showPrompt: 0, canReview: 0, review: 0 };
  window.__adAudio = [];
  // страница открыта не в iframe (file://), поэтому игра выставляет __noSDK — глушим запись
  Object.defineProperty(window, '__noSDK', { get: () => false, set: () => {}, configurable: true });
  const muted = () => (typeof window.__audioMuted === 'function') ? window.__audioMuted() : null;
  const seq = steps => { let i = 0; const next = () => { if (i >= steps.length) return;
    try { steps[i++](); } catch (e) {} setTimeout(next, 5); }; setTimeout(next, 5); };
  const sdk = {
    environment: { i18n: { get lang() { C.langReads++; return cfg.lang || 'ru'; } } },
    features: { LoadingAPI: { ready() {
      C.ready++;
      window.__readySnapshot = { uiReady: window.__uiReady === true, firstFrame: window.__firstFrame === true,
        hooks: typeof window.render_game_to_text === 'function' };
    } } },
    getPlayer() {
      if (cfg.playerHangs) return new Promise(() => {});
      return Promise.resolve({
        isAuthorized() { return cfg.authorized !== false; },
        getData() { return Promise.resolve(cfg.cloudSave != null ? { save: cfg.cloudSave } : {}); },
        setData(d, flush) { C.setData++; C.flushes.push(!!flush); window.__cloud = d && d.save; return Promise.resolve(); },
      });
    },
    adv: {
      showRewardedVideo(o) {
        C.rewarded++;
        const cb = (o && o.callbacks) || {};
        const mode = window.__rewardMode || 'both';
        seq([
          () => { cb.onOpen && cb.onOpen(); window.__adAudio.push(['open', muted()]); },
          () => { if (mode !== 'error') cb.onRewarded && cb.onRewarded(); },
          () => { if (mode !== 'reward') cb.onError && cb.onError(new Error('mock')); }, // ПОСЛЕ награды
          () => { cb.onClose && cb.onClose(); window.__adAudio.push(['close', muted()]); },
        ]);
      },
      showFullscreenAdv(o) {
        C.fullscreen++;
        const cb = (o && o.callbacks) || {};
        const was = window.__advWasShown !== false;
        seq([
          () => { cb.onOpen && cb.onOpen(); window.__adAudio.push(['fopen', muted()]); },
          () => { cb.onClose && cb.onClose(was); window.__adAudio.push(['fclose', muted()]); },
        ]);
      },
    },
    leaderboards: { setScore(name, score) { C.lb.push([name, score]); return Promise.resolve(); } },
    shortcut: {
      canShowPrompt() { C.canShowPrompt++; return Promise.resolve({ canShow: cfg.canShortcut !== false }); },
      showPrompt() { C.showPrompt++; return Promise.resolve({ outcome: cfg.shortcutOutcome || 'accepted' }); },
    },
    feedback: {
      canReview() { C.canReview++; return Promise.resolve({ value: cfg.canReview !== false, reason: 'NO_AUTH' }); },
      requestReview() { C.review++; return Promise.resolve({ feedbackSent: true }); },
    },
  };
  window.YaGames = { init() { return Promise.resolve(sdk); } };
}

async function openGame(cfg = {}, opts = {}) {
  const page = await browser.newPage(opts.viewport ? { viewport: opts.viewport } : {});
  page.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(c => { window.__mockCfg = c; }, cfg);
  if (cfg.save !== undefined)
    await page.addInitScript(sv => { try {
      if (!localStorage.getItem('sweetjar_save_v1')) localStorage.setItem('sweetjar_save_v1', sv);
    } catch (e) {} }, cfg.save);
  if (!cfg.noSdk) await page.addInitScript(sdkMock);
  await page.goto(url);
  if (!cfg.noWait)
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && window.__uiReady === true,
      { timeout: 12000 });
  return page;
}

// ============================================================
// 1. Базовая механика (без SDK — фолбэк-путь, localStorage)
// ============================================================
{
const page = await openGame({ noSdk: true });

let s0 = await state(page);
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
let s1 = await state(page);
assert(s1.ballCount === 1, 'dropping a candy adds one ball to the jar');

// два тира-0 в одной точке падают и сливаются в тир-1, приносят монеты
await page.evaluate(() => { window.testClearJar(); });
await page.evaluate(() => { window.testDrop(0.5, 0); window.testDrop(0.5, 0); });
let beforeMerge = await state(page);
assert(beforeMerge.ballCount === 2, 'testDrop places two candies for a forced merge test');
await page.evaluate(() => window.advanceTime(600));
let afterMerge = await state(page);
assert(afterMerge.ballCount <= 1, 'two same-tier candies merge into one');
assert(afterMerge.coins > beforeMerge.coins, 'merging awards coins');
assert(afterMerge.discovered.includes(1), 'tier 1 gets discovered after first merge');
assert(afterMerge.bestTier >= 1, 'bestTier tracks the highest merged tier');

// хук времени не ломает стейт когда банка пустая
await page.evaluate(() => window.testClearJar());
let beforeIdle = await state(page);
await page.evaluate(() => window.advanceTime(3000));
let afterIdle = await state(page);
assert(afterIdle.coins === beforeIdle.coins, 'advanceTime on an empty jar does not change coins');
assert(Number.isFinite(afterIdle.coins), 'coins stay a finite number after advanceTime');

// накопить монет и купить апгрейд в магазине (модалка)
await page.evaluate(() => window.testSetCoins(5000));
await page.click('#shopBtn');
assert(await page.evaluate(() => document.getElementById('shopModal').classList.contains('on')) === true, 'shop modal opens');
const poolBefore = (await state(page)).up.pool;
await page.evaluate(() => { const b = document.querySelector('#upList button[data-key="pool"]'); if (b && !b.disabled) b.click(); });
const sUp = await state(page);
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
const beforeSpecial = await state(page);
await page.click('#specialBtn');
const afterSpecial = await state(page);
assert(afterSpecial.nextTier > beforeSpecial.up.pool, 'buying a special candy raises the next drop tier');
assert(afterSpecial.coins < beforeSpecial.coins, 'special candy purchase spends coins');

// принудительное переполнение банки: даёт бонус монет, банка очищается, счёт уходит в bestScore
await page.evaluate(() => { window.testClearJar(); window.testDrop(0.5, 3); });
await page.evaluate(() => window.advanceTime(500));
const beforeFull = await state(page);
await page.evaluate(() => window.testForceOverflow());
const afterFull = await state(page);
assert(afterFull.ballCount === 0, 'jar overflow clears all candies');
assert(afterFull.coins > beforeFull.coins, 'jar overflow grants a completion bonus');
assert(afterFull.overflowing === false, 'overflow timer resets after the jar is cleared');

// сейв переживает перезагрузку страницы (localStorage-путь)
const savedCoins = (await state(page)).coins;
await page.reload();
await page.waitForFunction(() => typeof window.render_game_to_text === 'function', { timeout: 8000 });
const afterReload = await state(page);
assert(afterReload.coins === savedCoins, 'coins persist across a page reload via localStorage');
await shut(page);
}

// ============================================================
// 2. Rewarded-слоты: награда ровно один раз, звук заглушён на время ролика
// ============================================================
{
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, bestTier: 0, lifetimeEarned: 0,
  lastClaimDay: TODAY, streak: 1, discovered: [0] }) });

// --- подарок: onRewarded + onError подряд не должны заплатить дважды ---
await page.evaluate(() => window.testSetState({ coins: 0, lifetimeEarned: 0, bestTier: 0, fillCoins: 0, lastGift: 0 }));
await page.click('#giftBtn');
await page.waitForTimeout(200);
let s = await state(page), c = await calls(page);
assert(c.rewarded === 1, 'gift slot shows exactly one rewarded video');
assert(s.coins === 50, 'gift pays out exactly once even when onError follows onRewarded (got ' + s.coins + ')');
assert(s.lifetimeEarned === 0, 'gift does not move lifetimeEarned (grant, not earn)');
const audio = await page.evaluate(() => window.__adAudio);
assert(audio[0] && audio[0][0] === 'open' && audio[0][1] === true, 'audio is muted while the rewarded ad is open');
assert(audio[1] && audio[1][0] === 'close' && audio[1][1] === false, 'audio comes back after the rewarded ad closes');

// --- «Убрать конфеты»: ровно 3 конфеты, а не 6 ---
await page.evaluate(() => { window.testClearJar();
  for (let i = 0; i < 6; i++) window.testDrop(0.15 + i * 0.14, i);   // разные тиры: не сливаются
  window.testSetState({ lastShake: 0 }); });
await page.evaluate(() => window.__adAudio.length = 0);
await page.click('#shakeBtn');
await page.waitForTimeout(200);
s = await state(page); c = await calls(page);
assert(c.rewarded === 2, 'shake slot shows a rewarded video');
assert(s.ballCount === 3, 'shake removes exactly 3 candies once (got ' + s.ballCount + ' left of 6)');

// --- «Особая конфета» за ролик (второй способ получения) ---
await page.evaluate(() => window.testSetState({ lastSpecialAd: 0, coins: 0 }));
const beforeSp = await state(page);
await page.click('#specialAdBtn');
await page.waitForTimeout(200);
s = await state(page); c = await calls(page);
assert(c.rewarded === 3, 'special-candy-for-ad slot shows a rewarded video');
assert(s.nextTier > beforeSp.up.pool, 'special candy for an ad raises the next drop tier');
assert(s.coins === 0, 'special candy for an ad costs no coins');
assert(await page.evaluate(() => document.getElementById('specialAdBtn').disabled) === true, 'special-ad button goes on cooldown');

// --- «Продолжить» на конце забега: убирает ровно 5 самых мелких ---
await page.evaluate(() => { window.testClearJar();
  for (let i = 0; i < 6; i++) window.testDrop(0.15 + i * 0.14, i); });   // разные тиры: не сливаются
await page.evaluate(() => window.testGameOver());
assert(await page.evaluate(() => document.getElementById('overModal').classList.contains('on')) === true, 'overflow opens the run-over modal');
assert(await page.evaluate(() => !!document.getElementById('overRestart')) === true, 'run-over modal always offers a free restart next to the ad');
const beforeCont = await state(page);
await page.click('#overCont');
await page.waitForTimeout(200);
s = await state(page);
assert(s.ballCount === beforeCont.ballCount - 5, 'continue-for-ad removes exactly 5 candies once');
assert(s.gameOver === false && s.paused === false, 'continue resumes the same run');
assert(s.fillCoins === beforeCont.fillCoins, 'continue keeps the run score');
await shut(page);
}

// ============================================================
// 3. Реклама не стартует сама; межстраничная считает паузу от факта показа
// ============================================================
{
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, lastClaimDay: TODAY, streak: 1 }) });
await page.waitForTimeout(1200);
let c = await calls(page);
assert(c.fullscreen === 0, 'no interstitial starts on its own');
assert(c.rewarded === 0, 'no rewarded video starts without a player tap');
// конец забега зовёт maybeInterstitial, но прогрев сессии ещё не прошёл
await page.evaluate(() => { window.testClearJar(); window.testForceOverflow(); });
await page.waitForTimeout(200);
c = await calls(page);
assert(c.fullscreen === 0, 'interstitial stays silent during the session warm-up');
// явный показ: пауза 210 с считается от факта показа (wasShown=true)
await page.evaluate(() => { window.__adAudio.length = 0; window.testShowInterstitial(); });
await page.waitForTimeout(150);
c = await calls(page);
const adAudio = await page.evaluate(() => window.__adAudio);
let info = await page.evaluate(() => window.testAdInfo());
assert(c.fullscreen === 1, 'interstitial shows when the game asks for it');
assert(adAudio[0][1] === true && adAudio[1][1] === false, 'audio is muted for the whole interstitial');
assert(near(info.nextAdAt - Date.now(), info.gap * 1000, 3000), 'shown interstitial pushes the next one by the full gap');
assert(await page.evaluate(() => window.testMaybeInterstitial() === undefined && window.__calls.fullscreen) === 1,
  'interstitial is not repeated while the gap has not passed');
// показа не было (wasShown=false) — возвращаемся раньше
await page.evaluate(() => { window.__advWasShown = false; window.testShowInterstitial(); });
await page.waitForTimeout(150);
info = await page.evaluate(() => window.testAdInfo());
assert(near(info.nextAdAt - Date.now(), info.retry * 1000, 3000), 'unshown interstitial retries much sooner');
await shut(page);
}

// ============================================================
// 4. GameReady: ровно один раз и не раньше готового интерфейса
// ============================================================
{
const page = await openGame({});
const snap = await page.evaluate(() => window.__readySnapshot);
const c = await calls(page);
assert(c.ready === 1, 'LoadingAPI.ready() is called exactly once');
assert(snap && snap.uiReady === true, 'at the moment of ready() the UI is already wired for the player');
assert(snap && snap.firstFrame === false, 'ready() fires before the first rendered frame, not later');
await shut(page);
}
{ // ветка таймаута 4 с: getPlayer не отвечает — игра всё равно стартует и шлёт ready один раз
const page = await openGame({ playerHangs: true });
await page.waitForTimeout(300);
const c = await calls(page);
assert(c.ready === 1, 'ready() is sent exactly once on the 4s timeout path too');
assert((await state(page)).coins === 0, 'the game boots on the timeout path');
await shut(page);
}
{ // ветка без SDK
const page = await openGame({ noSdk: true });
assert(typeof (await state(page)).coins === 'number', 'the game boots with no SDK at all');
await shut(page);
}

// ============================================================
// 5. I18N и сейвы
// ============================================================
{
const page = await openGame({ lang: 'en' });
const c = await calls(page);
assert(c.langReads >= 1, 'environment.i18n.lang is actually read on every launch');
assert(await page.evaluate(() => document.getElementById('coinsL').textContent) === 'COINS',
  'the platform language is applied to the very first HUD render');
const keys = await page.evaluate(() => Object.keys(localStorage));
assert(keys.every(k => k === 'sweetjar_save_v1'), 'the detected language is never written to localStorage');
// дожим сейва при уходе со страницы — с flush:true
await page.evaluate(() => { window.testSetCoins(123);
  Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
await page.waitForTimeout(100);
const c2 = await calls(page);
assert(c2.flushes.some(f => f === true), 'leaving the page flushes the cloud save with flush:true');
assert(c2.flushes.filter(f => f === true).length === 1, 'the flush itself is rate-limited');
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
await page.waitForTimeout(50);
assert((await calls(page)).flushes.filter(f => f === true).length === 1, 'a second quick tab switch does not burn the platform limit');
await shut(page);
}

// ============================================================
// 6. Битые и чужие сейвы не убивают игру
// ============================================================
for (const [name, raw] of [
  ['garbage instead of JSON', '{not a json at all'],
  ['nulls in required fields', JSON.stringify({ coins: null, bestTier: null, up: null, discovered: null, balls: null, tips: null, lifetimeEarned: null })],
  ['tier index out of range', JSON.stringify({ coins: 10, bestTier: 99, discovered: [0, 9, 'x', -1], up: { pool: 99, luck: 'a', cap: null, mult: 7 },
    balls: [{ x: 100, y: 100, t: 9 }, { x: 120, y: 100, t: undefined }, { x: 140, y: 120, t: 0 }] })],
]) {
  const page = await openGame({ save: raw, noSdk: true });
  const s = await state(page);
  const tiers = await page.evaluate(() => window.testBallTiers());
  assert(Number.isFinite(s.coins), 'broken save (' + name + '): game boots with finite coins');
  assert(s.bestTier >= 0 && s.bestTier <= 7, 'broken save (' + name + '): bestTier stays inside the tier table');
  assert(s.discovered.every(t => t >= 0 && t <= 7), 'broken save (' + name + '): discovered holds only real tiers');
  assert(tiers.every(t => t >= 0 && t <= 7), 'broken save (' + name + '): no candy with an unknown tier survives');
  assert(!tiers.includes(7), 'broken save (' + name + '): an out-of-range tier is dropped, not clamped to a free top candy');
  assert(s.up.pool <= 2 && s.up.luck <= 10 && s.up.cap <= 10, 'broken save (' + name + '): upgrade levels are clamped');
  await shut(page);
}
{ // старый сейв v1 (без lifetimeEarned и tips) грузится и мигрирует
const page = await openGame({ noSdk: true, save: JSON.stringify({ v: 1, coins: 300, bestTier: 3, bestScore: 200,
  fillCoins: 0, discovered: [0, 1, 2, 3], up: { pool: 1, luck: 2, cap: 1 }, lastGift: 0, lastShake: 0,
  lastDaily: Date.now() - 86400000, balls: [] }) });
const s = await state(page);
assert(s.coins === 300 && s.up.luck === 2, 'a v1 save keeps its progress');
assert(s.lifetimeEarned >= 300, 'a v1 save gets a sane lifetimeEarned (' + s.lifetimeEarned + ')');
assert(s.up.mult === 0, 'a v1 save gets the new multiplier upgrade at level 0');
assert(s.tips && typeof s.tips === 'object', 'a v1 save without tips still loads and gets the tips object');
assert(s.lastClaimDay === dayAgo(1), 'lastDaily migrates into the day-string daily streak');
await shut(page);
}

// ============================================================
// 7. Апгрейд «Вежливая банка» действует сразу
// ============================================================
{
const page = await openGame({ noSdk: true });
const before = (await state(page)).overflowY;
await page.evaluate(() => { window.testSetCoins(999999);
  const b = document.querySelector('#upList button[data-key="cap"]'); b.click(); });
const after = await state(page);
assert(after.up.cap === 1, 'cap upgrade level goes up');
assert(after.overflowY > before, 'buying cap moves the overflow line right away, without a reload (' + before + ' -> ' + after.overflowY + ')');
// апгрейд множителя монет — сток для поздней игры
await page.evaluate(() => { const b = document.querySelector('#upList button[data-key="mult"]'); b.click(); });
const m1 = await state(page);
assert(m1.up.mult === 1, 'the coin multiplier upgrade can be bought');
await page.evaluate(() => { window.testClearJar(); window.testDrop(0.5, 0); window.testDrop(0.5, 0); });
const beforeM = await state(page);
await page.evaluate(() => window.advanceTime(600));
const afterM = await state(page);
assert(afterM.coins - beforeM.coins >= 4, 'merges pay the multiplier-boosted value');
assert(afterM.lifetimeEarned > beforeM.lifetimeEarned, 'merge coins do count as lifetime earnings');
await shut(page);
}

// ============================================================
// 8. Ежедневный бонус: серия, пропуск дня, один раз в сутки, ×2 за ролик
// ============================================================
{ // вчера забирал, серия растёт
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, lifetimeEarned: 0, lastClaimDay: dayAgo(1), streak: 3, discovered: [0] }) });
await page.waitForTimeout(150);
assert(await page.evaluate(() => document.getElementById('dailyModal').classList.contains('on')) === true, 'daily bonus is shown in a modal on a new day');
const info = await page.evaluate(() => window.testDailyInfo());
assert(info.streak === 4, 'claiming on the next day continues the streak');
const before = await state(page);
await page.click('#dailyClaim');
await page.waitForTimeout(100);
let s = await state(page);
assert(s.coins - before.coins === info.reward, 'daily bonus pays the streak-day reward');
assert(s.lifetimeEarned === 0, 'daily bonus does not move lifetimeEarned');
assert(s.streak === 4 && s.lastClaimDay === TODAY, 'daily claim records the day and the streak');
assert(await page.evaluate(() => document.getElementById('dailyModal').classList.contains('on')) === false, 'the daily modal closes after claiming');
// повторно в тот же день — награды нет
await page.evaluate(() => { window.testDailyCheck(); });
const same = await state(page);
assert(same.coins === s.coins, 'the daily bonus can be claimed only once per calendar day');
assert(await page.evaluate(() => window.testDailyInfo().pending) === false, 'the daily bonus is no longer pending today');
await shut(page);
}
{ // пропуск дня обнуляет серию
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, lastClaimDay: dayAgo(3), streak: 9, discovered: [0] }) });
const info = await page.evaluate(() => window.testDailyInfo());
assert(info.streak === 1, 'a skipped day resets the streak back to 1');
await shut(page);
}
{ // «Забрать ×2» за ролик
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, lastClaimDay: dayAgo(1), streak: 6, discovered: [0] }) });
await page.waitForTimeout(150);
const info = await page.evaluate(() => window.testDailyInfo());
assert(info.day === 7, 'the 7-day cycle wraps around to the big last day');
const before = await state(page);
await page.click('#dailyClaimX2');
await page.waitForTimeout(200);
const s = await state(page), c = await calls(page);
assert(c.rewarded === 1, 'the daily x2 button shows one rewarded video');
assert(s.coins - before.coins === info.reward * 2, 'the daily x2 reward is exactly doubled, once');
assert(s.lifetimeEarned === 0, 'the doubled daily bonus is still a grant, not an earning');
await shut(page);
}
{ // самый первый игрок не встречает окно ежедневки
const page = await openGame({});
assert(await page.evaluate(() => document.getElementById('dailyModal').classList.contains('on')) === false,
  'a brand-new player is not greeted with the daily bonus modal');
assert((await state(page)).lastClaimDay === TODAY, 'the streak starts counting from the second visit');
await shut(page);
}

// ============================================================
// 9. Лидерборд
// ============================================================
{
const page = await openGame({});
await page.evaluate(() => window.testSubmit(1234.7));
let c = await calls(page);
assert(c.lb.length === 1 && c.lb[0][0] === 'sweetjar_score' && c.lb[0][1] === 1234,
  'submitScore writes an integer score through the new-generation setScore');
await page.evaluate(() => { window.testSubmit(2000); });
c = await calls(page);
assert(c.lb.length === 1, 'score writes are throttled to once per second');
await page.waitForTimeout(1100);
await page.evaluate(() => { window.testSubmit(0); window.testSubmit(-5); });
c = await calls(page);
assert(c.lb.length === 1, 'a zero or negative score is never submitted');
await shut(page);
}
{
const page = await openGame({ authorized: false });
await page.evaluate(() => window.testSubmit(500));
assert((await calls(page)).lb.length === 0, 'nothing is written to the leaderboard for a guest player');
await shut(page);
}

// ============================================================
// 10. Контекстные подсказки
// ============================================================
{
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, bestTier: 3, discovered: [0, 1, 2, 3],
  lastGift: 0, lastClaimDay: TODAY, streak: 1 }) });   // старый сейв без поля tips
await page.waitForTimeout(900);
assert(await page.evaluate(() => document.getElementById('tip').classList.contains('on')) === true,
  'a contextual tip shows up once the mechanic is actually usable');
assert(await page.evaluate(() => document.getElementById('giftBtn').classList.contains('tip-target')) === true,
  'the tip highlights the target button itself');
assert(await page.evaluate(() => document.getElementById('tip').offsetWidth) > 150,
  'the tip bubble has an explicit width and does not collapse into a word column');
assert((await state(page)).tips.gift === 1, 'the tip is remembered in the save, not just in the session');
// тап по экрану снимает подсказку
await page.mouse.click(30, 300);
await page.waitForTimeout(100);
assert(await page.evaluate(() => document.getElementById('tip').classList.contains('on')) === false, 'any tap dismisses the tip');
await page.waitForTimeout(700);
assert(await page.evaluate(() => document.getElementById('tip').classList.contains('on')) === false, 'a dismissed tip never comes back');
await shut(page);
}
{ // подсказка никогда не появляется поверх открытой модалки
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, bestTier: 3, discovered: [0, 1, 2, 3],
  tips: { gift: 1, shake: 1 }, lastClaimDay: TODAY, streak: 1 }) });
await page.click('#shopBtn');
await page.evaluate(() => window.testSetCoins(5000));   // условие подсказки становится истинным при открытой модалке
await page.waitForTimeout(900);
assert(await page.evaluate(() => document.getElementById('tip').classList.contains('on')) === false,
  'no tip is drawn on top of an open modal');
await page.click('#closeShop');
await page.waitForTimeout(900);
assert(await page.evaluate(() => document.getElementById('tip').classList.contains('on')) === true,
  'the tip waits for the modal to close and only then shows up');
await shut(page);
}

// ============================================================
// 11. Ярлык на главный экран и запрос оценки
// ============================================================
{
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, bestTier: 4, lifetimeEarned: 900,
  discovered: [0, 1, 2, 3, 4], lastClaimDay: TODAY, streak: 1 }) });
let c = await calls(page);
assert(c.canShowPrompt === 1, 'shortcut.canShowPrompt() is checked before offering anything');
assert(await page.evaluate(() => document.getElementById('scModal').classList.contains('on')) === false,
  'the shortcut card is not shown at the very start of a session');
await page.evaluate(() => { window.testClearJar(); window.testForceOverflow(); });
await page.waitForTimeout(1300);
assert(await page.evaluate(() => document.getElementById('scModal').classList.contains('on')) === true,
  'the shortcut card appears once the player is engaged');
const before = await state(page);
await page.click('#scYes');
await page.waitForTimeout(200);
c = await calls(page);
const s = await state(page);
assert(c.showPrompt === 1, 'showPrompt() runs from the player tap handler');
assert(s.coins - before.coins === 300, 'an accepted shortcut is rewarded');
assert(s.shortcutDone === true, 'the shortcut offer is remembered and never asked twice');
await page.reload();
await page.waitForFunction(() => window.__uiReady === true);
await page.evaluate(() => { window.testClearJar(); window.testForceOverflow(); });
await page.waitForTimeout(1300);
assert(await page.evaluate(() => document.getElementById('scModal').classList.contains('on')) === false,
  'the shortcut card does not come back after the answer');
await shut(page);
}
{ // оценка запрашивается после первого праздничного торта (тир 7)
const page = await openGame({ save: JSON.stringify({ v: 2, coins: 0, bestTier: 6, discovered: [0, 1, 2, 3, 4, 5, 6],
  lastClaimDay: TODAY, streak: 1 }) });
let c = await calls(page);
assert(c.canReview === 0, 'no review is requested at the start of a session');
await page.evaluate(() => { window.testClearJar(); window.testDrop(0.5, 6); window.testDrop(0.5, 6); window.advanceTime(600); });
await page.waitForTimeout(200);
c = await calls(page);
assert(c.canReview === 1, 'feedback.canReview() is checked before asking for a review');
assert(c.review === 1, 'the review is requested right after the first party cake');
assert((await state(page)).reviewDone === true, 'the review is asked at most once');
await shut(page);
}
{ // запасной сценарий: оценка недоступна
const page = await openGame({ canReview: false, save: JSON.stringify({ v: 2, coins: 0, bestTier: 6,
  discovered: [0, 1, 2, 3, 4, 5, 6], lastClaimDay: TODAY, streak: 1 }) });
await page.evaluate(() => { window.testClearJar(); window.testDrop(0.5, 6); window.testDrop(0.5, 6); window.advanceTime(600); });
await page.waitForTimeout(200);
const c = await calls(page);
assert(c.canReview === 1 && c.review === 0, 'an unavailable review is skipped quietly instead of throwing');
assert((await state(page)).reviewDone === false, 'an unavailable review can be retried in a later session');
await shut(page);
}

// ============================================================
// 12. Вёрстка на узких экранах
// ============================================================
for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }]) {
  const page = await openGame({ save: JSON.stringify({ v: 2, coins: 5000, bestTier: 3, discovered: [0, 1, 2, 3],
    tips: { gift: 1, shake: 1, shop: 1 }, lastClaimDay: TODAY, streak: 1 }) }, { viewport: vp });
  const tag = vp.width + 'x' + vp.height;
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    tag + ': the page never scrolls horizontally');
  for (const id of ['specialBtn', 'specialAdBtn', 'giftBtn', 'shakeBtn', 'shopBtn', 'collectionBtn']) {
    const b = await page.locator('#' + id).boundingBox();
    assert(b && b.x >= -0.5 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5 && b.height >= 36,
      tag + ': #' + id + ' fits on screen and stays tappable');
  }
  await page.click('#shopBtn');
  const card = await page.locator('#shopModal .card').boundingBox();
  assert(card && card.width <= vp.width && card.height <= vp.height, tag + ': the shop modal fits the screen');
  await page.click('#closeShop');
  await page.evaluate(() => window.testDailyCheck());
  await shut(page);
}

assert(errors.length === 0, 'no console/page errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
