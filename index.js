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

async function loadBrowserSession(page) {
  try {
    if (process.env.AVITO_COOKIE) {
      console.log('🥷 Загружаем AVITO_COOKIE...');
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
  } catch (err) { return false; }
}

async function executeInvisibleHaggle(targetUrl, aiArgument) {
  let browser;
  try {
    const launchArgs = [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-blink-features=AutomationControlled', 
      '--window-size=1920,1080'
    ];

    // ИНТЕГРАЦИЯ ПРОКСИ: Подтягиваем мобильные/резидентские прокси РФ из настроек Render
    if (process.env.PROXY_SERVER) {
      console.log(`🌐 Активирован режим прокси через: ${process.env.PROXY_SERVER}`);
      launchArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    } else {
      console.log('⚠️ ВНИМАНИЕ: PROXY_SERVER не задан в Render! Запрос пойдет с IP хостинга.');
    }

    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs
    });
    
    const page = await browser.newPage();

    // АВТОРИЗАЦИЯ ПРОКСИ: Передаем логин и пароль, если они защищены
    if (process.env.PROXY_SERVER && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await page.authenticate({
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD
      });
    }

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await loadBrowserSession(page);

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 
    await humanScroll(page);
    await delay(2000); 

    const btn = 'button[data-marker="messenger-button/button"]'; 
    if (await page.$(btn)) {
      await page.click(btn);
      await delay(3000); 
      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 
      await humanType(page, txt, aiArgument);
      await delay(1500); 
      return { success: true, message: 'Успешно напечатано!' };
    }
    return { success: false, error: 'Кнопка чата не найдена' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (browser) await browser.close();
  }
}

// ИСПРАВЛЕНО: Указан корректный эндпоинт API DeepSeek вместо общего адреса сайта
const openai = new OpenAI({
  baseURL: 'https://deepseek.com', 
  apiKey: process.env.DEEPSEEK_API_KEY   
}); 

const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) { process.exit(1); }

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

      // ИСПРАВЛЕНО: Восстановлен корректный доступ к свойству choices[0]
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
  } catch (e) { console.error(e.message); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
