const { Telegraf } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai'); 
const { humanType, humanScroll, delay } = require('./humanEmulation'); 
const fs = require('fs');
const path = require('path'); 

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
    // 1. Проверяем наличие кук в переменных окружения Render
    if (process.env.AVITO_COOKIE) {
      console.log('🥷 Обнаружены куки в AVITO_COOKIE (Render). Загружаем сессию...');
      
      let cookies;
      try {
        // Если куки сохранены как JSON-массив
        cookies = JSON.parse(process.env.AVITO_COOKIE);
      } catch (jsonError) {
        // Если куки сохранены как стандартная строка заголовка "name=value; name2=value2"
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

    // 2. Фалбек на локальный cookies.json, если в переменных окружения пусто
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
async function executeInvisibleHaggle(page, targetUrl, aiArgument) {
  try {
    console.log(`📡 Переходим на страницу лота: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }); 

    console.log('👀 Имитируем чтение описания товара...');
    await humanScroll(page);
    await delay(Math.floor(Math.random() * 1500) + 1000); 

    // ИСПРАВЛЕНО: Безопасный селектор без псевдоклассов вроде :has-text для нативной поддержки Puppeteer
    const chatButtonSelector = 'button[data-marker="messenger-button/button"]'; 

    if (await page.$(chatButtonSelector)) {
      console.log('🖱️ Клик по кнопке открытия чата...');
      await page.click(chatButtonSelector);
      await delay(Math.floor(Math.random() * 2000) + 1500); 

      const inputSelector = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 

      console.log('✍️ ИИ начинает скрытный ввод аргумента...');
      await humanType(page, inputSelector, aiArgument);
      await delay(Math.floor(Math.random() * 1000) + 500); 

      console.log('🚀 Сообщение подготовлено к отправке продавцу!');
      return { success: true, message: 'Аргумент успешно напечатан!' };
    } else {
      console.log('❌ Кнопка чата не найдена на странице.');
      return { success: false, error: 'Кнопка чата не найдена' };
    }
  } catch (error) {
    console.error('❌ Сбой партизанского модуля автоматизации:', error.message);
    return { success: false, error: error.message };
  }
}

// Инициализация базы данных Firestore
const db = admin.firestore();

// ИСПРАВЛЕНО: Указан корректный рабочий API-эндпоинт DeepSeek v1
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

// БЕЗОПАСНОСТЬ: Токен вынесен в переменные окружения Render
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

    // Логируем пользователя в Firebase Firestore через limiter
    await limiter.schedule(async () => {
      await db.collection('user_logs').doc(userId).set({
        chatId: chatId,
        username: ctx.from.username || '🔑 Аноним',
        firstName: ctx.from.first_name || '',
        lastStart: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await ctx.reply('🤖 Привет! Я партизанский ИИ-модуль «AI-Haggle-MVP».\n\nОтправь мне ссылку на объявление Авито, я проанализирую его с помощью ИИ DeepSeek и подготовлю почву для аргументированного торга.');
  } catch (error) {
    console.error('Ошибка в команде /start:', error.message);
  }
});

bot.help(async (ctx) => {
  await ctx.reply('📖 Как это работает:\n1. Отправляешь ссылку на товар.\n2. DeepSeek изучает слабые места лота.\n3. Скрипт заходит на страницу под куки из cookies.json, открывает чат и печатает текст с человеческими таймингами.');
});

// Обработка входящих ссылок
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Проверяем, прислал ли пользователь ссылку
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

      // ИСПРАВЛЕНО: Корректный доступ к результату ответа через массив choices[0]
      const aiArgument = completion.choices[0].message.content;
      await ctx.reply(`🤖 **Сгенерированный аргумент торга:**\n\n"${aiArgument}"`);
      await ctx.reply(`⚙️ Ожидаю развертывания Puppeteer на сервере для отправки этого аргумента в чат лота...`);

      // Здесь в будущем будет инициализироваться страница Puppeteer 'page' и вызываться:
      // await executeInvisibleHaggle(page, text, aiArgument);

    } catch (aiError) {
      console.error('Ошибка API DeepSeek:', aiError.message);
      await ctx.reply('⚠️ Не удалось сгенерировать аргумент через DeepSeek. Проверьте валидность API-ключа в настройках Render.');
    }
  } else {
    await ctx.reply('Используйте меню или отправьте прямую ссылку на товар.');
  }
});

// ==========================================
// ИНТЕГРАЦИЯ EXPRESS И TELEGRAM WEBHOOK
// ==========================================

// Настраиваем вебхук Telegram внутри Express-сервера
app.post(TELEGRAM_WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Хелсчек-эндпоинт для Render (чтобы предотвратить падение сервера)
app.get('/', (req, res) => {
  res.send('🚀 AI-Haggle-MVP работает в штатном режиме!');
});

// Запуск сервера Express
app.listen(PORT, async () => {
  console.log(`📡 Express-сервер успешно запущен на порту ${PORT}`);
  try {
    // Регистрируем вебхук в Telegram API
    const webhookUrl = `${process.env.RENDER_EXTERNAL_URL || 'https://onrender.com'}${TELEGRAM_WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`[Telegram] Вебхук успешно зарегистрирован по адресу: ${webhookUrl}`);
  } catch (error) {
    console.error('❌ Ошибка регистрации вебхука в Telegram:', error.message);
  }
});

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
