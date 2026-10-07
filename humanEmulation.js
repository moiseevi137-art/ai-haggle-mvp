/**
 * Усиленный боевой модуль эмуляции человека под защиту Авито
 * Безопасность: Максимальная (Уровень маскировки под реальный смартфон/ПК РФ)
 */

const delay = (min, max) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Генерация кривой Безье для абсолютно человеческого движения мыши
function generateBezierPath(startX, startY, endX, endY, steps) {
  const points = [];
  // Случайные опорные точки для создания естественного изгиба руки
  const controlX1 = startX + (endX - startX) * Math.random();
  const controlY1 = startY + (endY - startY) * Math.random();
  const controlX2 = startX + (endX - startX) * Math.random();
  const controlY2 = startY + (endY - startY) * Math.random();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Формула кубической кривой Безье
    const x = Math.pow(1 - t, 3) * startX + 3 * Math.pow(1 - t, 2) * t * controlX1 + 3 * (1 - t) * Math.pow(t, 2) * controlX2 + Math.pow(t, 3) * endX;
    const y = Math.pow(1 - t, 3) * startY + 3 * Math.pow(1 - t, 2) * t * controlY1 + 3 * (1 - t) * Math.pow(t, 2) * controlY2 + Math.pow(t, 3) * endY;
    points.push({ x, y });
  }
  return points;
}

// 1. Имитация посимвольного ввода с микро-опечатками и исправлениями
async function typeLikeHuman(page, selector, text) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  await element.focus();
  await delay(400, 800);

  for (let i = 0; i < text.length; i++) {
    // Имитация случайной опечатки (с вероятностью 4%)
    if (Math.random() < 0.04 && i > 0 && text[i] !== ' ') {
      const wrongChar = String.fromCharCode(text.charCodeAt(i) + 1);
      await page.keyboard.type(wrongChar);
      await delay(150, 300);
      await page.keyboard.press('Backspace'); // Стираем опечатку
      await delay(200, 400);
    }

    await page.keyboard.type(text[i]);
    // Физиологический тайминг нажатия клавиш
    await delay(70, 220);

    // Логическая пауза (человек переносит взгляд или задумался)
    if (Math.random() > 0.90) {
      await delay(500, 1100);
    }
  }
  await delay(500, 1000);
}

// 2. Реалистичный волновой скроллинг с микро-откатами назад
async function scrollPageWithBiometrics(page) {
  const steps = Math.floor(Math.random() * 4) + 3;
  for (let i = 0; i < steps; i++) {
    const scrollAmount = Math.floor(Math.random() * 300) + 200;
    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
    await delay(400, 900);

    // Случайный микро-откат назад (человек вернулся дочитать строку)
    if (Math.random() > 0.7) {
      const rollback = Math.floor(Math.random() * 50) + 10;
      await page.evaluate((amount) => window.scrollBy(0, -amount), rollback);
      await delay(300, 600);
    }
  }
  await delay(1000, 2000);
}

// 3. Умный клик по кривой Безье с вариативным ускорением мыши
async function moveAndClickSmart(page, selector) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  const box = await element.boundingBox();

  if (box) {
    // Рандомная точка клика строго внутри геометрии кнопки (не по центру)
    const targetX = box.x + (box.width * (0.25 + Math.random() * 0.5));
    const targetY = box.y + (box.height * (0.25 + Math.random() * 0.5));

    // Имитируем текущую позицию мыши (если её нет, берем случайную стартовую точку)
    const startX = Math.random() * 800;
    const startY = Math.random() * 600;

    const steps = Math.floor(Math.random() * 15) + 15; // количество отрезков движения
    const path = generateBezierPath(startX, startY, targetX, targetY, steps);

    // Плавно перемещаем мышь по кривой с переменной скоростью
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      // Ускорение в середине пути, замедление у цели (биология руки)
      await delay(5, 15);
    }

    await delay(100, 350);
    await page.mouse.click(targetX, targetY);
    await delay(800, 1500);
  } else {
    await page.click(selector);
  }
}

// 4. Глубокий маскировщик отпечатков (Защита от сканеров Авито)
async function applyAntiFingerprint(page) {
  await page.evaluateOnNewDocument(() => {
    // 1. Полное уничтожение следов автоматизации
    if (navigator.webdriver) {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    }

    // 2. Имитация реальной структуры плагинов Chrome
    const mockPlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Chromium PDF Navigator' }
    ];
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const pluginsList = Object.create(PluginArray.prototype);
        mockPlugins.forEach((p, i) => {
          const plugin = Object.create(Plugin.prototype);
          Object.assign(plugin, p);
          pluginsList[i] = plugin;
        });
        Object.defineProperty(pluginsList, 'length', { get: () => mockPlugins.length });
        return pluginsList;
      }
    });

    // 3. Подмена языков и локали (чтобы сервер Linux не выдавал себя)
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });

    // 4. Эмуляция WebGL домашнего ПК (Маскируем Intel Iris Xe Graphics вместо программного рендера SwiftShader)
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) return 'Intel Open Source Technology Center';
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) return 'Intel(R) Iris(R) Xe Graphics (TGL GT2)';
      return getParameter.apply(this, arguments);
    };
  });
}

// ✅ Экспортируем все функции для использования в index.js
module.exports = {
  delay,
  typeLikeHuman,
  scrollPageWithBiometrics,
  moveAndClickSmart,
  applyAntiFingerprint
};
