// Изолированные параметры конфигурации для AI HAGGLE PRO
module.exports = {
  // Настройки для запуска Puppeteer, полностью оптимизированные под Amvera (1 ГБ ОЗУ)
  puppeteerOptions: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    headless: true, // В свежих версиях Puppeteer пишется true вместо 'new'
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Критично для экономии оперативной памяти (1 ГБ ОЗУ)
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,720',
      
      // Динамический прокси-слой: если в Amvera задан PROXY_SERVER, он применится автоматически
      ...(process.env.PROXY_SERVER ? [`--proxy-server=${process.env.PROXY_SERVER}`] : []),
      // Бронебойные правила резолва для прокси с безопасной проверкой URL
      ...(process.env.PROXY_SERVER ? (() => {
        try {
          return ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ' + new URL(process.env.PROXY_SERVER).hostname];
        } catch (e) {
          return [];
        }
      })() : [])
    ]
  },

  // Настройки интеграции с официальным API DeepSeek
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1', // Официальный рабочий эндпоинт
    model: 'deepseek-chat'
  }
};
