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
    
    // Проверяем длину: для коротких текстов (СМС/телефоны) опечатки отключены
    const allowTypos = text.length > 15;
    
    for (const char of text) {
        // Рандомная задержка нажатия и удержания клавиши (от 60 до 150 мс)
        const charDelay = Math.floor(Math.random() * (150 - 60 + 1)) + 60;
        
        // Симуляция опечатки: срабатывает ВМЕСТО правильного символа
        if (allowTypos && Math.random() < 0.03 && char !== ' ') {
            const wrongChars = 'фывапролджэйцукенгшщзхъ';
            const randomWrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
            
            // Печатаем НЕПРАВИЛЬНЫЙ символ через keyboard, так как фокус уже на инпуте
            await page.keyboard.type(randomWrongChar);
            await delay(Math.floor(Math.random() * 150) + 100);
            
            // Стираем его
            await page.keyboard.press('Backspace');
            await delay(Math.floor(Math.random() * 150) + 100);
        }
        
        // Печатаем ПРАВИЛЬНЫЙ символ
        await page.keyboard.type(char);
        await delay(charDelay);
        
        // Симуляция "задумчивости" на пробелах
        if (char === ' ' && Math.random() < 0.40) {
            await delay(Math.floor(Math.random() * (400 - 150 + 1)) + 150);
        }
        
        // 3% шанс сделать глубокую паузу посреди текста (подумать над фразой)
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
    const totalDistance = Math.floor(Math.random() * (600 - 300 + 1)) + 300;
    const steps = 10;
    const stepDistance = Math.floor(totalDistance / steps);
    
    for (let i = 0; i < steps; i++) {
        await page.evaluate((y) => window.scrollBy(0, y), stepDistance);
        await delay(Math.floor(Math.random() * (150 - 50 + 1)) + 50);
    }
    
    await delay(Math.floor(Math.random() * (2500 - 1200 + 1)) + 1200);
}

module.exports = { humanType, humanScroll, delay };
