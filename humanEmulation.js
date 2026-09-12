// humanEmulation.js

/**
 * Задержка на указанное количество миллисекунд
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Имитирует печать текста реальным человеком с рваным темпом,
 * правильным удержанием клавиш и редкими микро-опечатками.
 */
async function humanType(page, selector, text) {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.focus(selector);
    
    for (const char of text) {
        // Рандомная задержка нажатия и удержания клавиши (от 60 до 150 мс)
        const charDelay = Math.floor(Math.random() * (150 - 60 + 1)) + 60;
        
        // Передаем delay прямо внутрь Puppeteer, чтобы эмулировать keydown/keyup
        await page.type(selector, char, { delay: charDelay });
        
        // Симуляция "задумчивости" на пробелах (человек разделяет мысли между словами)
        if (char === ' ' && Math.random() < 0.40) {
            await delay(Math.floor(Math.random() * (400 - 150 + 1)) + 150);
        }

        // 2% шанс сделать опечатку и сразу её исправить (имитация живого человека)
        if (Math.random() < 0.02 && char !== ' ') {
            const wrongChars = 'фывапролджэйцукенгшщзхъ';
            const randomWrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
            
            await page.type(selector, randomWrongChar, { delay: 50 });
            await delay(Math.floor(Math.random() * 200) + 150);
            await page.keyboard.press('Backspace', { delay: 50 });
            await delay(Math.floor(Math.random() * 200) + 100);
        }
        
        // 3% шанс сделать глубокую паузу посреди текста
        if (Math.random() < 0.03) {
            const thinkingDelay = Math.floor(Math.random() * (1000 - 300 + 1)) + 300;
            await delay(thinkingDelay);
        }
    }
}

/**
 * Имитирует естественный плавный человеческий скролл страницы частями
 */
async function humanScroll(page) {
    // Определяем общую дистанцию скролла (например, от 300 до 600 пикселей)
    const totalDistance = Math.floor(Math.random() * (600 - 300 + 1)) + 300;
    
    // Разбиваем скролл на 10 мелких шагов, чтобы он выглядел плавным
    const steps = 10;
    const stepDistance = Math.floor(totalDistance / steps);
    
    for (let i = 0; i < steps; i++) {
        await page.evaluate((y) => window.scrollBy(0, y), stepDistance);
        // Микропауза между движениями пальца/колесика мыши
        await delay(Math.floor(Math.random() * (150 - 50 + 1)) + 50);
    }
    
    // Финальная пауза "на чтение текста"
    await delay(Math.floor(Math.random() * (2500 - 1200 + 1)) + 1200);
}

module.exports = { humanType, humanScroll, delay };
