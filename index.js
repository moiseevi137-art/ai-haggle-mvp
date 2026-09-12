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

const db = admin.firestore();

//==========================================
// ВСПОМОГАТЕЛЬНЫЕ СИСТЕМНЫЕ ФУНКЦИИ ИИ И БРАУЗЕРА
//==========================================

/** 
 * Вспомогательная функция для загрузки сессии Авито/Юлы
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
 */
async function executeInvisibleHaggle(targetUrl, aiArgument) {
  let browser;
  try {
    console.log('🛡️ Запуск защищенного инстанса Chrome...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    await loadBrowserSession(page);

    console.log(`📡 Переходим на страницу лота: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 

    console.log('👀 Имитируем чтение описания товара...');
    await humanScroll(page);
    await delay(Math.floor(Math.random() * 2000) + 1500); 

    const chatButtonSelector = 'button[data-marker="messenger-button/button"]'; 

    if (await page.$(chatButtonSelector)) {
      console.log('🖱️ Клик по кнопке открытия чата...');
      await page.click(chatButtonSelector);
      await delay(Math.floor(Math.random() * 2500) + 2000); 

      const inputSelector = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 

      console.log('✍️ ИИ начинает скрытный ввод аргумента...');
      await humanType(page, inputSelector, aiArgument);
      await delay(Math.floor(Math.random() * 1500) + 1000); 

      console.log('🚀 Сообщение подготовлено к отправке продавцу!');
      return { success: true, message: 'Аргумент успешно напечатан!' };
    } else {
      console.log('❌ Кнопка чата не найдена на странице.');
      return { success: false, error: 'Кнопка чата не найдена' };
    }
  } catch (error) {
    console.error('❌ Сбой партизанского модуля автоматизации:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      console.log('🤖 Закрываем сессию защищенного браузера...');
      await browser.close();
    }
  }
}

// Инициализация ИИ DeepSeek v1
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

// Токен бота из переменных окружения Render
const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Переменная TELEGRAM_BOT_TOKEN не задана!');
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
  await ctx.reply('📖 Как это работает:\n1. Отправляешь ссылку на товар.\n2. DeepSeek изучает слабые места лота.\n3. Скрипт заходит под маскировкой Stealth-плагинов, открывает чат и печатает текст с человеческой задержкой.');
});

// Обработка входящих ссылок
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();

  if (text.includes('http://') || text.includes('https://')) {
    await ctx.reply('⏳ Запускаю DeepSeek ИИ для структурного анализа лота и формирования выгоды...');

    try {
      // МОДЕРНИЗАЦИЯ: Запрос к DeepSeek ИИ в строгом формате JSON
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { 
            role: "system", 
            content: `Ты — жесткий, но вежливый переговорщик и закупщик. Твоя цель — снизить цену на лот на 10-15%. 
            Ты должен проанализировать запрос и вернуть ответ СТРОГО в формате JSON со следующими полями:
            {
              "estimatedPrice": число (ориентировочная текущая цена товара в рублей, если цена неизвестна — извлеки или предположи на основе контекста),
              "targetPrice": число (целевая сниженная цена после торга в рублях),
              "argument": "короткий, хитрый, живой и вежливый человеческий текст сообщения продавцу с аргументами вроде самовывоза, дефектов или оплаты наличными. Без роботских шаблонов"
            }` 
          },
          { role: "user", content: `Проанализируй этот лот и сформируй стратегию торга: ${text}` }
        ],
        response_format: { type: "json_object" }
      });

      // Парсим структурированный JSON-ответ от ИИ
      const aiData = JSON.parse(completion.choices[0].message.content);
      
      const estimated = Number(aiData.estimatedPrice) || 0;
      const target = Number(aiData.targetPrice) || 0;
      const argumentText = aiData.argument;

      // Вычисляем чистую выгоду пользователя и 30% комиссии сервиса
      const userProfit = estimated > target ? (estimated - target) : 0;
      const serviceCommission = Math.round(userProfit * 0.30);

      // Отправляем финансовый отчет пользователю в чат
      let financialReport = `📊 **ИИ-АНАЛИЗ СДЕЛКИ:**\n\n`;
      financialReport += `💵 Ориентировочная цена: \`${estimated} руб.\`\n`;
      financialReport += `🎯 Целевая цена после торга: \`${target} руб.\`\n`;
      financialReport += `📈 Ваша чистая выгода: \`${userProfit} руб.\`\n`;
      financialReport += `💰 Наша комиссия сервиса (30%): \`${serviceCommission} руб.\`\n\n`;
      financialReport += `📝 **Текст сообщения продавцу:**\n_"${argumentText}"_`;

      await ctx.reply(financialReport, { parse_mode: 'Markdown' });

      // СОХРАНЕНИЕ ТРАНЗАКЦИИ В FIRESTORE
      await limiter.schedule(async () => {
        await db.collection('bids_history').add({
          userId: userId,
          username: ctx.from.username || '🔑 Аноним',
          targetUrl: text,
          estimatedPrice: estimated,
          targetPrice: target,
          calculatedProfit: userProfit,
          commissionAmount: serviceCommission,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      await ctx.reply(`🛡️ Автоматизация запущена! Перехожу по ссылке лота для ввода сообщения...`);

      // Запуск невидимого браузера
      const result = await executeInvisibleHaggle(text, argumentText);
      
      if (result.success) {
        await ctx.reply(`✅ Сообщение с торгом успешно напечатано в чате продавца!`);
      } else {
        await ctx.reply(`❌ Робот не смог напечатать сообщение: ${result.error}`);
      }

    } catch (error) {
