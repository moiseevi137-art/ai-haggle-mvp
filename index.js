const { Telegraf } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai'); 
const fs = require('fs');
const path = require('path'); 

// ИМПОРТ ЗАЩИЩЕННОГО БРАУЗЕРА И ПЛАГИНОВ СКРЫТНОСТИ
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// Активируем невидимый режим для обхода анти-фрод систем площадок
puppeteer.use(StealthPlugin());

const { humanType, humanScroll, delay } = require('./humanEmulation'); 

// Инициализация Express
const app = express();
app.use(express.json()); // Обязательно для парсинга JSON от вебхуков Telegram
const PORT = process.env.PORT || 3000; 

// Инициализация Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
} 

//==========================================
// ВСПОМОГАТЕЛЬНЫЕ СИСТЕМНЫЕ ФУНКЦИИ ИИ И БРАУЗЕРА
//==========================================

/** 
 * Вспомогательная функция для загрузки сессии Авито/Юлы
 * Приоритетно берет куки из переменной окружения Render (AVITO_COOKIE) или из cookies.json
 */
async function loadBrowserSession(page) {
  try {
    if (process.env.AVITO_COOKIE) {
      console.log('🥷 Обнаружены куки в AVITO_COOKIE (Render). Загружаем сессию...');
      
      let cookies;
      try {
        cookies = JSON.parse(process.env.AVITO_COOKIE);
      } catch (jsonError) {
        console.log('⚠️ AVITO_COOKIE не в JSON формате. Парсим как строку заголовка...');
        cookies = process.env.AVITO_COOKIE.split(';').map(pair => {
          const [name, ...valueParts] = pair.trim().split('=');
          return {
            name: name,
            value: valueParts.join('='),
            domain: '.avito.ru',
            path: '/'
          };
        });
      }

      if (cookies && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log('✅ Сессия из AVITO_COOKIE успешно импортирована в браузер!');
        return true;
      }
    }

    const cookiesPath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
      const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesData);
      if (cookies && cookies.length > 0) {
        console.log('📁 Файл cookies.json обнаружен. Загружаем сессию из файла...');
        await page.setCookie(...cookies);
        return true;
      }
    }

    console.log('⚠️ Куки не найдены ни в Render, ни в cookies.json. Бот откроет чистую страницу.');
    return false;
  } catch (error) {
    console.error('❌ Ошибка при загрузке кук сессии:', error.message);
    return false;
  }
}

/** 
 * Главный партизанский модуль интеграции
 * Берет текст от DeepSeek и отправляет в чат площадки, полностью имитируя человека
 */
async function executeInvisibleHaggle(targetUrl, aiArgument) {
  let browser;
  try {
    console.log('🛡️ Запуск защищенного инстанса Chrome...');
    browser = await puppeteer.launch({
      headless: true, // Запуск на сервере в фоне
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Скрывает флаг автоматизации
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    // Эмуляция реального FullHD экрана обычного человека
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    // Подмена User-Agent на актуальный Windows-браузер, убираем упоминания HeadlessChrome
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Подгружаем куки для авторизации без капчи
    await loadBrowserSession(page);

    console.log(`📡 Переходим на страницу лота: ${targetUrl}`);
    // Имитируем реальное поведение: плавный заход на сайт
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 

    console.log('👀 Имитируем чтение описания товара...');
    await humanScroll(page);
    await delay(Math.floor(Math.random() * 2000) + 1500); 

    const chatButtonSelector = 'button[data-marker="messenger-button/button"]'; 

    if (await page.$(chatButtonSelector)) {
      console.log('鼠标 Клик по кнопке открытия чата...');
      await page.click(chatButtonSelector);
      // Задержка на рендеринг окна чата
      await delay(Math.floor(Math.random() * 2500) + 2000); 

      const inputSelector = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 

      console.log('✍️ ИИ начинает скрытный ввод аргумента...');
      await humanType(page, inputSelector, aiArgument);
      await delay(Math.floor(Math.random() * 1500) + 1000); 

      console.log('🚀 Сообщение подготовлено к отправке продавцу!');
      return { success: true, message: 'Аргумент успешно напечатан!' };
    } else {
      console.log('❌ Кнопка чата не найдена на странице. Возможно, куки устарели или лот заблокирован.');
      return { success: false, error: 'Кнопка чата не найдена' };
    }
  } catch (error) {
    console.error('❌ Сбой партизанского модуля автоматизации:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      console.log('关闭 Закрываем сессию защищенного браузера...');
      await browser.close();
    }
  }
}

// Инициализация базы данных Firestore
const db = admin.firestore();

// Указан корректный рабочий API-эндпоинт DeepSeek v1
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

// Токен вынесен в переменные окружения Render
const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Переменная TELEGRAM_BOT_TOKEN не задана в настройках Render!');
  process.exit(1);
}

const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${MY_BOT_TOKEN}`;

// Настройка очередей (Rate Limiting)
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1500,
  highWater: 50,
  strategy: Bottleneck.strategy.LEAK
});

// === ОБРАБОТЧИКИ КОМАНД ===

bot.start(async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id.toString();

    await limiter.schedule(async () => {
      await db.collection('user_logs').doc(userId).set({
        chatId: chatId,
        username: ctx.from.username || '🔑 Аноним',
        firstName: ctx.from.first_name || '',
        lastStart: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await ctx.reply('🤖 Привет! Я защищенный ИИ-модуль «AI-Haggle-MVP».\n\nОтправь мне ссылку на объявление Авито, я проанализирую его с помощью ИИ DeepSeek и автоматически предложу торг в чате.');
  } catch (error) {
    console.error('Ошибка в команде /start:', error.message);
  }
});

bot.help(async (ctx) => {
  await ctx.reply('📖 Как это работает:\n1. Отправляешь ссылку на товар.\n2. DeepSeek изучает слабые места лота.\n3. Скрипт заходит под маскировкой Stealth-плагинов, подгружает AVITO_COOKIE, открывает чат и печатает текст с человеческой задержкой.');
});

// Обработка входящих ссылок
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text.includes('http://') || text.includes('https://')) {
    await ctx.reply('⏳ Запускаю DeepSeek ИИ для анализа лота и формирования стратегии торга...');

    try {
      // Запрос к DeepSeek ИИ для генерации аргумента торга
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Ты — профессиональный закупщик и мастер вежливого торга. Твоя цель — написать короткое, убедительное и вежливое сообщение продавцу на Авито, чтобы снизить цену на 10-15%. Используй живой человеческий язык, не используй шаблонные фразы роботов." },
          { role: "user", content: `Сгенерируй сообщение для торга по этой ссылке: ${text}` }
        ],
        max_tokens: 150
      });

      const aiArgument = completion.choices[0].message.content;
      await ctx.reply(`🤖 **Сгенерированный аргумент торга:**\n\n"${aiArgument}"`);
      await ctx.reply(`🛡️ Запускаю маскированный модуль автоматизации на сервере для печати сообщения...`);

      // ЗАПУСК ЗАЩИЩЕННОГО БРАУЗЕРА
      const result = await executeInvisibleHaggle(text, aiArgument);
      
      if (result.success) {
        await ctx.reply(`✅ Действие успешно выполнено: ${result.message}`);
      } else {
        await ctx.reply(`❌ Робот не смог завершить процесс: ${result.error}`);
      }

    } catch (aiError) {
      console.error('Ошибка API DeepSeek:', aiError.message);
      await ctx.reply('⚠️ Не удалось выполнить цепочку. Проверьте валидность API-ключей в настройках Render.');
    }
  } else {
    await ctx.reply('Используйте меню или отправьте прямую ссылку на товар.');
  }
});

// ==========================================
// ИНТЕГРАЦИЯ EXPRESS И TELEGRAM WEBHOOK
// ==========================================

app.post(TELEGRAM_WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.get('/', (req, res) => {
  res.send('🚀 AI-Haggle-MVP работает в защищенном режиме!');
});

// Запуск сервера Express
app.listen(PORT, async () => {
  console.log(`📡 Express-сервер успешно запущен на порту ${PORT}`);
  try {
    const webhookUrl = `${process.env.RENDER_EXTERNAL_URL || 'https://onrender.com'}${TELEGRAM_WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`[Telegram] Вебхук успешно зарегистрирован по адресу: ${webhookUrl}`);
  } catch (error) {
    console.error('❌ Ошибка регистрации вебхука в Telegram:', error.message);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
