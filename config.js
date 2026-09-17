// Изолированные параметры конфигурации для AI HAGGLE PRO
module.exports = {
  // Настройки для запуска Puppeteer в Docker-контейнере на Render
  puppeteerOptions: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Критично для экономии оперативной памяти на Render
      
      // Бронебойный прокси-слой: принудительно заворачиваем DNS-запросы внутрь мобильного прокси'--proxy-server=http://HTTPmproxy.site:26013','--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE HTTPmproxy.site']},

  // Настройки интеграции с официальным API DeepSeek
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1', // Официальный рабочий эндпоинт
    model: 'deepseek-chat'
  }
};
