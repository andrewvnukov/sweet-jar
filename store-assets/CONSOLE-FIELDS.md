# Поля черновика — Сладкая Банка

Все тексты уже подогнаны под лимиты консоли (в скобках — длина/лимит).

## Общие настройки черновика (вкладка «Черновик», верх страницы)

| Поле | Что ставить |
|------|-------------|
| **Поддерживаемые платформы** | Десктоп + Мобильные (телефоны и планшеты) — игра адаптивная, управление мышью и тачем |
| **Ориентация** | Любая — сцена подстраивается под ширину окна, HUD держится в колонке до 560 px |
| **Игра переведена на** | Русский, Английский |
| **Возрастной рейтинг** | 0+ |
| **Категории** | Казуальные (одна категория — не смешивать с «Симулятор») |
| **Игра использует облачные сохранения** | ВКЛЮЧИТЬ — прогресс пишется через `player.setData/getData` |
| **Отсроченная публикация** | Выключено |


**Теги**: `мерж, головоломка, физика, конфеты, уютная` (RU) / `merge, puzzle, physics, candy, cozy` (EN)

**Ключевые слова** RU (67/100): `мерж, конфеты, банка, физика, головоломка, слияние, десерты, уютная`

**Ключевые слова** EN (66/100): `merge, candy, jar, physics, puzzle, desserts, cozy, casual, sweets`

**Комментарий разработчика** (981/2048):

```
Игра полностью работает офлайн-фолбэком и через Yandex Games SDK.
— SDK подключён из официального источника, LoadingAPI.ready() вызывается после реальной загрузки игры, GameplayAPI.start()/stop() — на старте, при потере фокуса вкладки и вокруг рекламы.
— Язык интерфейса определяется через ysdk.environment.i18n.lang; дополнительно есть ручной переключатель RU/EN (выбор сохраняется в облачном сейве).
— Прогресс (монеты, улучшения, коллекция, содержимое банки) сохраняется через player.setData/getData с фолбэком в localStorage.
— Реклама: fullscreen не чаще раза в 3 минуты и только по событию заполнения банки, никогда на старте; два rewarded-действия с явной наградой на кнопке («Подарок» +50 монет и «Убрать конфеты» −3 конфеты). Звук игры паузится на время показа рекламы и при потере фокуса страницы.
— Вся графика и музыка процедурные (Canvas2D + синтез звука), чужих ассетов нет.
— Игра проверена на портретной и альбомной ориентации, на мобильном и десктопном управлении.
```

**Иконка / обложка / скриншоты** — из папки `store-assets/`: `icon.png` (512×512), `cover.png` (RU) и `cover-en.png` (EN) 800×470, скриншоты `d1-start … d5-full` (RU без суффикса, EN с `-en`). Архив: `sweet-jar-yandex.zip`.

---

## Описание и продвижение → вкладка «Русский»

### Название (13/50)

```
Сладкая Банка
```

### Описание для SEO (137/160)

```
Сладкая Банка — уютная физика-мерж: роняй конфеты в стеклянную банку, сливай одинаковые в пончики, капкейки и торты и ставь новый рекорд.
```

### Короткое описание (62/70)

```
Роняй конфеты в банку и сливай одинаковые в десерты покрупнее!
```

### Об игре (966/1000)

```
Сладкая Банка — уютная физика-мерж на кухонном подоконнике.

Тапните или проведите пальцем, чтобы бросить конфету в стеклянную банку: она упадёт под гравитацией и столкнётся со стенками и другими конфетами.

Две одинаковые конфеты при касании слипаются в один более крупный десерт — от мятной конфетки и мармеладки до пончика, капкейка и целого праздничного торта. Каждое слияние приносит монеты и салют из искр.

Если десерты долго лежат выше горлышка банки, она мягко наполняется: вы получаете бонус монет за раунд, банка очищается и можно начинать заново. Проигрыша и штрафов нет.

На монеты открывайте улучшения: более крупные стартовые конфеты, шанс на редкую находку, терпимость банки к переполнению. Собирайте коллекцию из восьми десертов, заходите каждый день за бонусом, смотрите короткие видео за дополнительные монеты или спасительную чистку банки.

Простой цикл «прицелься — брось — слей — рекорд» затягивает на пару минут и всегда даёт видимый прогресс.
```

### Как играть (982/1000)

```
1. Ведите пальцем (или мышью) над банкой, чтобы прицелиться: полупрозрачная конфета показывает, куда она упадёт.

2. Отпустите палец — конфета падает в банку и физически сталкивается со стенками и другими конфетами.

3. Две одинаковые конфеты, коснувшись друг друга, сливаются в один более крупный десерт и приносят монеты. Цепочка из восьми ступеней: мятная конфетка, мармеладка, карамелька, трюфель, пончик, капкейк, кусок торта и праздничный торт.

4. Следите за горлышком: если десерты долго лежат выше пунктирной линии, банка наполняется. Это не проигрыш — вы получаете бонус монет, банка очищается, а результат идёт в рекорды.

5. Монеты тратятся в магазине (кнопка с шестерёнкой) на три улучшения: более крупные стартовые конфеты, шанс на редкую конфету и терпимость банки к переполнению.

6. «Особая конфета» за монеты сразу даёт крупный десерт, «Подарок» и «Убрать конфеты» — короткие видео за монеты и очистку банки от трёх мелких конфет. Кнопкой RU/EN переключается язык.
```

---

## Описание и продвижение → вкладка «Английский»

### Название (9/50)

```
Sweet Jar
```

### Описание для SEO (145/160)

```
Sweet Jar is a cozy physics-merge game: drop candies into a glass jar, merge matching ones into donuts, cupcakes and cakes, and beat your record.
```

### Короткое описание (58/70)

```
Drop candies into a jar and merge them into bigger treats!
```

### Об игре (963/1000)

```
Sweet Jar is a cozy physics-merge game set on a kitchen windowsill.

Tap or swipe to drop a candy into a glass jar — it falls under gravity and collides with the walls and the other candies.

Two matching candies stick together into one bigger treat on contact — from a mint candy and a gummy all the way up to a donut, a cupcake and a full party cake. Every merge earns coins and a burst of sparkles.

If treats sit too long above the jar's neck it gently fills up: you get a coin bonus for the round, the jar clears, and you start again chasing a new high score. There is no losing and no penalties — just a fresh run.

Spend coins on upgrades: bigger starting candies, a chance at a rare find, a jar that tolerates more before filling up. Collect all eight desserts, come back daily for a bonus, and watch short videos for extra coins or a jar-saving cleanup.

A simple "aim, drop, merge, record" loop that is easy to pick up and always shows visible progress.
```

### Как играть (995/1000)

```
1. Drag your finger (or the mouse) above the jar to aim — a translucent candy shows where it will land.

2. Release to drop it: the candy falls under gravity and collides with the walls and the other candies.

3. Two matching candies merge into one bigger treat on contact and pay out coins. The chain has eight steps: mint candy, gummy, caramel, truffle, donut, cupcake, cake slice and party cake.

4. Watch the jar's neck: if treats sit above the dashed line for too long, the jar fills up. That is not a loss — you get a coin bonus for the round, the jar clears, and the result goes to the leaderboard.

5. Spend coins in the shop (the gear button) on three upgrades: bigger starting candies, a better chance at a rare candy, and a jar that tolerates more before filling up.

6. The "Special candy" button spends coins on an instant big treat, while "Gift" and "Remove candies" play short videos for extra coins and for clearing the three smallest candies. The RU/EN button switches language.
```
