require('dotenv').config(); // Подключаем локальные переменные из .env файла
const { Telegraf } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai'); 
const fs = require('fs');
const path = require('path'); 

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { humanType, humanScroll, delay } = require('./humanEmulation'); 

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000; 

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
} 
const db = admin.firestore();

// Функция загрузки сохраненной сессии
async function loadBrowserSession(page) {
  try {
    if (process.env.AVITO_COOKIE) {
      console.log('🥷 Загружаем AVITO_COOKIE из переменных окружения...');
      let cookies;
      try { cookies = JSON.parse(process.env.AVITO_COOKIE); } 
      catch (e) {
        cookies = process.env.AVITO_COOKIE.split(';').map(p => {
          const [n, ...v] = p.trim().split('=');
          return { name: n, value: v.join('='), domain: '.avito.ru', path: '/' };
        });
      }
      if (cookies?.length > 0) {
        await page.setCookie(...cookies);
        return true;
      }
    }
    const pth = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(pth)) {
      const d = JSON.parse(fs.readFileSync(pth, 'utf8'));
      if (d?.length > 0) { 
        await page.setCookie(...d); 
        console.log('🍪 Куки успешно загружены из cookies.json');
        return true; 
      }
    }
    return false;
  } catch (err) { return false; }
}

// Новая функция сохранения сессии Васи
async function saveBrowserSession(page) {
  try {
    const cookies = await page.cookies();
    const pth = path.join(__dirname, 'cookies.json');
    fs.writeFileSync(pth, JSON.stringify(cookies, null, 2));
    console.log('💾 Сессия (куки) Васи успешно сохранена в cookies.json');
  } catch (e) {
    console.error('❌ Не удалось сохранить куки:', e.message);
  }
}

async function executeInvisibleHaggle(targetUrl, aiArgument) {
  let browser;
  try {
    const launchArgs = [
      '--disable-setuid-sandbox', 
      '--disable-blink-features=AutomationControlled', 
    ];

    // Динамическое переключение: локальный режим без прокси ИЛИ боевой с прокси
    const isLocal = !process.env.PROXY_SERVER; 

    if (!isLocal) {
      console.log(`🌐 Активирован режим прокси через: ${process.env.PROXY_SERVER}`);
      launchArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    } else {
      console.log('🏠 РЕЖИМ ЛОКАЛЬНОЙ ОТЛАДКИ: Окно открыто, используем профиль Chrome');
    }

    browser = await puppeteer.launch({
      headless: !isLocal, // Локально запускается в ВИДИМОМ режиме, на сервере — в скрытом
      args: launchArgs,
      // Сохраняем кэш и данные браузера локально, чтобы Авито не выдавало капчу
      userDataDir: isLocal ? path.join(__dirname, 'chrome_user_data') : undefined 
    });
    
    const page = await browser.newPage();

    if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await page.authenticate({
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
      });
    }

    await page.setViewport(isLocal ? { width: 1280, height: 800 } : { width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    await loadBrowserSession(page);

    console.log(`🔎 Переход по ссылке: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 
    await humanScroll(page);
    await delay(2000); 

    const btn = 'button[data-marker="messenger-button/button"]'; 
    if (await page.$(btn)) {
      console.log('✅ Кнопка чата найдена! Кликаем...');
      await page.click(btn);
      await delay(4000); // Ожидаем прогрузки окна чата
      
      // Автоматически перехватываем и сохраняем обновленные куки авторизации
      await saveBrowserSession(page);

      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 
      if (await page.$(txt)) {
        console.log('📝 Печатаем сообщение торга...');
        await humanType(page, txt, aiArgument);
        await delay(1500); 
        return { success: true, message: 'Успешно напечатано!' };
      } else {
        console.log('⚠️ Поле ввода сообщения не найдено. Возможно, требуется авторизация.');
        return { success: false, error: 'Требуется ручная авторизация аккаунта Васи в браузере!' };
      }
    }
    return { success: false, error: 'Кнопка чата не найдена. Проверьте объявление.' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (browser) {
      // Локально даем паузу посмотреть на результат перед закрытием
      if (isLocal) await delay(5000); 
      await browser.close();
    }
  }
}

// ИСПРАВЛЕНО: Указан рабочий эндпоинт API DeepSeek вместо адреса сайта
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN не задан!'); process.exit(1); }

const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${MY_BOT_TOKEN}`;

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

bot.start(async (ctx) => {
  try {
    await limiter.schedule(() => db.collection('user_logs').doc(ctx.from.id.toString()).set({
      chatId: ctx.chat.id,
      username: ctx.from.username || '🔑 Аноним',
      lastStart: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }));
    await ctx.reply('🤖 Защищенный ИИ-модуль запущен. Отправьте ссылку на Авито.');
  } catch (e) { console.error(e.message); }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.includes('http://') || text.includes('https://')) {
    await ctx.reply('⏳ Анализирую сделку через ИИ...');
    try {
      const comp = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Верни ответ СТРОГО в формате JSON с полями: {\"estimatedPrice\": число, \"targetPrice\": число, \"argument\": \"текст торга\"}" },
          { role: "user", content: `Сделай торг для: ${text}` }
        ],
        response_format: { type: "json_object" }
      });

      // ИСПРАВЛЕНО: Добавлен choices[0] для корректного чтения ответа ИИ
      const aiData = JSON.parse(comp.choices[0].message.content);
      const est = Number(aiData.estimatedPrice) || 0;
      const trg = Number(aiData.targetPrice) || 0;
      const arg = aiData.argument;
      const profit = est > trg ? (est - trg) : 0;
      const comm = Math.round(profit * 0.30);

      let rep = `📊 **ИИ-АНАЛИЗ:**\n💰 Цена: \`${est} руб.\`\n🎯 Торг до: \`${trg} руб.\`\n📈 Выгода: \`${profit} руб.\`\n Commission (30%): \`${comm} руб.\`\n\n📝 Сообщение:\n_"${arg}"_`;
      await ctx.reply(rep, { parse_mode: 'Markdown' });

      await limiter.schedule(() => db.collection('bids_history').add({
        userId: ctx.from.id.toString(),
        targetUrl: text,
        estimatedPrice: est,
        targetPrice: trg,
        commissionAmount: comm,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }));

      await ctx.reply(`🛡️ Запускаю маскированную отправку...`);
      const res = await executeInvisibleHaggle(text, arg);
      await ctx.reply(res.success ? `✅ Сообщение напечатано!` : `❌ Ошибка автоматизации: ${res.error}`);
    } catch (err) {
      console.error(err);
      await ctx.reply('⚠️ Ошибка обработки запроса.');
    }
  } else {
    await ctx.reply('Отправьте валидную ссылку.');
  }
});

app.post(TELEGRAM_WEBHOOK_PATH, (req, res) => { bot.handleUpdate(req.body, res); });
app.get('/', (req, res) => { res.send('🚀 Сервер активен'); });

app.listen(PORT, async () => {
  console.log(`📡 Порт: ${PORT}`);
  try {
    const url = `${process.env.RENDER_EXTERNAL_URL || 'https://onrender.com'}${TELEGRAM_WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(url);
    console.log(`[Telegram] Вебхук зарегистрирован!`);
  } catch (e) { console.error('Инфо по вебхуку:', e.message); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
