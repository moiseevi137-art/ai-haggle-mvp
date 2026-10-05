/**
 * Усиленный модуль эмуляции человека под защиту Авито
 */

const delay = (min, max) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
};

// 1. Имитация естественного посимвольного ввода с микро-опечатками
async function typeLikeHuman(page, selector, text) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  await element.focus();
  await delay(300, 700);

  for (const char of text) {
    await page.keyboard.type(char);
    // Рандомная задержка между клавишами (имитируем реальную скорость печати)
    await delay(80, 250);
    
    // Редкие микро-паузы (задумался на долю секунды)
    if (Math.random() > 0.85) {
      await delay(400, 800);
    }
  }
  await delay(600, 1200);
}

// 2. Реалистичный волновой скроллинг страницы для генерации «глубины просмотра»
async function scrollPageWithBiometrics(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = Math.floor(Math.random() * 40) + 60; // случайный шаг скролла
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        // Если доскроллили до конца или сработал рандомный стоп-фактор
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, Math.floor(Math.random() * 100) + 100);
    });
  });
  await delay(1500, 3000);
}

// 3. Умный клик по случайной координате кнопки с предварительным подведением курсора
async function moveAndClickSmart(page, selector) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  const box = await element.boundingBox();

  if (box) {
    // Кликаем не в центр, а в случайное смещение внутри геометрии кнопки
    const x = box.x + (box.width * (0.2 + Math.random() * 0.6));
    const y = box.y + (box.height * (0.2 + Math.random() * 0.6));

    // Движение мыши шагами, имитируя человеческую руку
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
    await delay(150, 400);
    await page.mouse.click(x, y);
  } else {
    await page.click(selector);
  }
  await delay(1000, 2000);
}

// 4. Маскировка параметров WebDriver прямо на лету внутри страницы
async function applyAntiFingerprint(page) {
  await page.evaluateOnNewDocument(() => {
    // Удаляем флаг автоматизации
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // Симулируем наличие плагинов в браузере
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // Переопределяем языки
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
  });
}

module.exports = {
  delay,
  typeLikeHuman,
  scrollPageWithBiometrics,
  moveAndClickSmart,
  applyAntiFingerprint
};
