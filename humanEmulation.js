// humanEmulation.js

/**
 * Задержка на указанное количество миллисекунд
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Имитирует печать текста реальным человеком с рваным темпом
 * @param {object} page - объект страницы Playwright/Puppeteer
 * @param {string} selector - селектор поля ввода (куда писать)
 * @param {string} text - текст аргумента от ИИ
 */
async function humanType(page, selector, text) {
    await page.focus(selector);
    
    for (const char of text) {
        // Случайная задержка между нажатиями клавиш (от 50 до 180 мс)
        const charDelay = Math.floor(Math.random() * (180 - 50 + 1)) + 50;
        await page.type(selector, char);
        await delay(charDelay);
        
        // Симуляция "задумчивости" человека: 3% шанс сделать микропаузу посреди текста
        if (Math.random() < 0.03) {
            const thinkingDelay = Math.floor(Math.random() * (1200 - 400 + 1)) + 400;
            await delay(thinkingDelay);
        }
    }
}

/**
 * Имитирует человеческий скролл страницы (например, чтение описания товара)
 */
async function humanScroll(page) {
    // Случайное расстояние для скролла вниз
    const distance = Math.floor(Math.random() * (400 - 200 + 1)) + 200;
    await page.evaluate((y) => window.scrollBy(0, y), distance);
    // Пауза "на почитать"
    await delay(Math.floor(Math.random() * (2000 - 800 + 1)) + 800);
}

module.exports = { humanType, humanScroll, delay };
