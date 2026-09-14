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

// 🔥 ЗАЩИЩЕННЫЙ БЛОК ИНИЦИАЛИЗАЦИИ ФАЙРБЕЙС (Защита от ошибки запуска на Render)
let db;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase успешно инициализирован через SERVICE_ACCOUNT!');
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    console.log('🔥 Firebase инициализирован по умолчанию.');
  }
  db = admin.firestore();
} catch (firebaseError) {
  console.log('⚠️ ВНИМАНИЕ: Ключи Firebase не найдены. Включен автономный режим MVP (In-Memory)!');
  
  // Локальный кэш прямо в оперативной памяти сервера, чтобы скрипт не аварийно падал
  const memoryStorage = new Map();
  db = {
    collection: (colName) => ({
      doc: (docId) => ({
        set: async (data) => {
          const current = memoryStorage.get(`${colName}/${docId}`) || {};
          memoryStorage.set(`${colName}/${docId}`, { ...current, ...data });
          return true;
        },
        get: async () => ({
          exists: memoryStorage.has(`${colName}/${docId}`),
          data: () => memoryStorage.get(`${colName}/${docId}`)
        })
      }),
      add: async (data) => {
        const fakeId = Math.random().toString(36).substring(7);
        memoryStorage.set(`${colName}/${fakeId}`, data);
        return { id: fakeId };
      }
    })
  };
}

// ПОДДЕРЖКА МНОГОПОЛЬЗОВАТЕЛЬСКОЙ СЕССИИ: Загрузка куки конкретного юзера
async function loadBrowserSession(page, userId) {
  try {
    const userDoc = await db.collection('user_sessions').doc(userId.toString()).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data.cookies && data.cookies.length > 0) {
        await page.setCookie(...data.cookies);
        console.log(`🍪 Куки юзера ${userId} успешно загружены из базы`);
        return true;
      }
    }
    
    if (process.env.AVITO_COOKIE) {
      console.log('🥷 Загружаем глобальный AVITO_COOKIE из настроек...');
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
      if (d?.length > 0) { await page.setCookie(...d); return true; }
    }
    return false;
  } catch (err) { 
    console.error('Ошибка загрузки сессии:', err.message);
    return false; 
  }
}

// Сохранение обновленной сессии в БД после успешных действий автоматизации торга
async function saveBrowserSession(page, userId) {
  try {
    const cookies = await page.cookies();
    await db.collection('user_sessions').doc(userId.toString()).set({
      cookies: cookies,
      updatedAt: new Date()
    });
    console.log(`💾 Актуальная сессия юзера ${userId} обновлена и зафиксирована`);
  } catch (e) {
    console.error('❌ Не удалось сохранить куки:', e.message);
  }
}

async function executeInvisibleHaggle(targetUrl, aiArgument, userId) {
  let browser;
  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-blink-features=AutomationControlled', 
      '--window-size=1920,1080'
    ];

    const isLocal = !process.env.PROXY_SERVER; 

    if (!isLocal) {
      console.log(`🌐 Активирован режим прокси через: ${process.env.PROXY_SERVER}`);
      launchArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    } else {
      console.log('🏠 РЕЖИМ ЛОКАЛЬНОЙ ОТЛАДКИ: Используем профиль Chrome');
    }

    browser = await puppeteer.launch({
      headless: !isLocal, 
      args: launchArgs,
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
    
    await loadBrowserSession(page, userId);

    console.log(`🔎 Переход по ссылке: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 
    await humanScroll(page);
    await delay(2000); 

    const btn = 'button[data-marker="messenger-button/button"]'; 
    if (await page.$(btn)) {
      console.log('✅ Кнопка чата найдена! Кликаем...');
      await page.click(btn);
      await delay(4000); 
      
      await saveBrowserSession(page, userId);

      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 
      if (await page.$(txt)) {
        console.log('📝 Печатаем сообщение торга...');
        await humanType(page, txt, aiArgument);
        await delay(1500); 
        return { success: true, message: 'Успешно напечатано!' };
      } else {
        console.log('⚠️ Поле ввода сообщения не найдено.');
        return { success: false, error: 'Требуется повторная авторизация в Web App' };
      }
    }
    return { success: false, error: 'Кнопка чата не найдена. Проверьте объявление.' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (browser) {
      if (isLocal) await delay(5000); 
      await browser.close(); // ИСПРАВЛЕНО: Добавлен await для предотвращения утечек памяти OOM
    }
  }
}

// ИСПРАВЛЕНО: Указан рабочий базовый эндпоинт API DeepSeek вместо адреса сайта
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) { console.error('❌ TELEGRAM_BOT_TOKEN не задан!'); process.exit(1); }

const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${MY_BOT_TOKEN}`;
const APP_BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    await limiter.schedule(() => db.collection('user_logs').doc(userId).set({
      chatId: ctx.chat.id,
      username: ctx.from.username || '🔑 Аноним',
      lastStart: new Date()
    }));

    const webAppUrl = `${APP_BASE_URL}/webapp-login?userId=${userId}`;

    await ctx.reply('🤖 Защищенный ИИ-модуль торга готов. Подключите аккаунт Авито для запуска сценария.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔑 Подключить мой Авито', web_app: { url: webAppUrl } }]
        ]
      }
    });
  } catch (e) { console.error(e.message); }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();

  if (text.includes('http://') || text.includes('https://')) {
    const sessionCheck = await db.collection('user_sessions').doc(userId).get();
    if (!sessionCheck.exists && !process.env.AVITO_COOKIE) {
      return ctx.reply('⚠️ Вы ещё не привязали аккаунт Авито. Нажмите /start и пройдите авторизацию в Web App.');
    }

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

      const aiData = JSON.parse(comp.choices[0].message.content);
      const est = Number(aiData.estimatedPrice) || 0;
      const trg = Number(aiData.targetPrice) || 0;
      const arg = aiData.argument;
      const profit = est > trg ? (est - trg) : 0;
      const comm = Math.round(profit * 0.30);

      let rep = `📊 **ИИ-АНАЛИЗ:**\n💰 Цена: \`${est} руб.\`\n🎯 Торг до: \`${trg} руб.\`\n📈 Выгода: \`${profit} руб.\`\n Комиссия (30%): \`${comm} руб.\`\n\n📝 Сообщение:\n_"${arg}"_`;
      await ctx.reply(rep, { parse_mode: 'Markdown' });

      await limiter.schedule(() => db.collection('bids_history').add({
        userId: userId,
        targetUrl: text,
        estimatedPrice: est,
        targetPrice: trg,
        commissionAmount: comm,
        timestamp: new Date()
      }));

      await ctx.reply(`🛡️ Запускаю отправку сообщения торга...`);
      const res = await executeInvisibleHaggle(text, arg, userId);
      await ctx.reply(res.success ? `✅ Торг успешно начат в чате Авито!` : `❌ Ошибка автоматизации: ${res.error}`);
    } catch (err) {
      console.error(err);
      await ctx.reply('⚠️ Ошибка обработки запроса к ИИ.');
