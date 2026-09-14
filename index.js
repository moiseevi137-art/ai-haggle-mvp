require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
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

console.log('🚀 Автономный режим MVP (Память Render)!');
const memoryStorage = new Map();
const db = {
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

async function loadBrowserSession(page, userId) {
  try {
    const userDoc = await db.collection('user_sessions').doc(userId.toString()).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data.cookies?.length > 0) {
        await page.setCookie(...data.cookies);
        return true;
      }
    }
    if (process.env.AVITO_COOKIE) {
      let cookies;
      try { cookies = JSON.parse(process.env.AVITO_COOKIE); } 
      catch (e) {
        cookies = process.env.AVITO_COOKIE.split(';').map(p => {
          const [n, ...v] = p.trim().split('=');
          return { name: n, value: v.join('='), domain: '.avito.ru', path: '/' };
        });
      }
      if (cookies?.length > 0) { await page.setCookie(...cookies); return true; }
    }
    const pth = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(pth)) {
      const d = JSON.parse(fs.readFileSync(pth, 'utf8'));
      if (d?.length > 0) { await page.setCookie(...d); return true; }
    }
    return false;
  } catch (err) { return false; }
}

async function saveBrowserSession(page, userId) {
  try {
    const cookies = await page.cookies();
    await db.collection('user_sessions').doc(userId.toString()).set({ cookies: cookies, updatedAt: new Date() });
  } catch (e) { console.error(e.message); }
}

async function executeInvisibleHaggle(targetUrl, aiArgument, userId) {
  let browser;
  try {
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080'];
    const isLocal = !process.env.PROXY_SERVER; 
    if (!isLocal) launchArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);

    browser = await puppeteer.launch({ headless: !isLocal, args: launchArgs, userDataDir: isLocal ? path.join(__dirname, 'chrome_user_data') : undefined });
    const page = await browser.newPage();

    if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await page.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
    }

    await page.setViewport(isLocal ? { width: 1280, height: 800 } : { width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await loadBrowserSession(page, userId);

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }); 
    await humanScroll(page);
    await delay(2000); 

    const btn = 'button[data-marker="messenger-button/button"]'; 
    if (await page.$(btn)) {
      await page.click(btn);
      await delay(4000); 
      await saveBrowserSession(page, userId);

      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 
      if (await page.$(txt)) {
        await humanType(page, txt, aiArgument);
        await delay(1500); 
        return { success: true };
      }
      return { success: false, error: 'Поле ввода не найдено' };
    }
    return { success: false, error: 'Кнопка чата не найдена' };
  } catch (e) { return { success: false, error: e.message }; } 
  finally { if (browser) await browser.close(); }
}

const openai = new OpenAI({ baseURL: 'https://deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY }); 
const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!MY_BOT_TOKEN) { process.exit(1); }

const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${MY_BOT_TOKEN}`;
const APP_BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    await limiter.schedule(() => db.collection('user_logs').doc(userId).set({ chatId: ctx.chat.id, username: ctx.from.username || '🔑 Аноним', lastStart: new Date() }));
    const webAppUrl = `${APP_BASE_URL}/webapp-login?userId=${userId}`;
    await ctx.reply('🤖 ИИ-модуль торга готов. Подключите Авито:', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Подключить мой Авито', web_app: { url: webAppUrl } }]] }
    });
  } catch (e) { console.error(e.message); }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id.toString();
  if (text.includes('http://') || text.includes('https://')) {
    const sessionCheck = await db.collection('user_sessions').doc(userId).get();
    if (!sessionCheck.exists && !process.env.AVITO_COOKIE) {
      return ctx.reply('⚠️ Сначала нажмите /start и привяжите аккаунт Авито.');
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

      await ctx.reply(`📊 **ИИ-АНАЛИЗ:**\n💰 Цена: \`${est} руб.\`\n🎯 Торг до: \`${trg} руб.\`\n📈 Выгода: \`${profit} руб.\`\nКомиссия (30%): \`${comm} руб.\`\n\n📝 Предложение:\n_"${arg}"_`, { parse_mode: 'Markdown' });
      await db.collection('bids_history').add({ userId, targetUrl: text, estimatedPrice: est, targetPrice: trg, commissionAmount: comm, timestamp: new Date() });
      
      await ctx.reply(`🛡️ Запускаю отправку...`);
      const res = await executeInvisibleHaggle(text, arg, userId);
      await ctx.reply(res.success ? `✅ Сообщение отправлено!` : `❌ Ошибка автоматизации: ${res.error}`);
    } catch (err) { await ctx.reply('⚠️ Ошибка запроса к ИИ.'); }
  } else { await ctx.reply('Отправьте валидную ссылку.'); }
});

app.get('/webapp-login', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Авито</title><script src="https://telegram.org"></script><style>body{font-family:sans-serif;background:#f4f6f9;text-align:center;margin:0;padding:15px}.card{background:#fff;padding:20px;border-radius:12px}iframe{width:100%;height:400px;border:1px solid #eee;border-radius:8px;margin-top:15px}button{background:#007bff;color:#fff;border:none;padding:12px;border-radius:8px;width:100%;margin-top:15px;font-weight:700;cursor:pointer}</style></head><body><div class="card"><h3>Вход в Авито</h3><p style="font-size:13px;color:#666">Войдите в профиль во фрейме и нажмите синхронизацию.</p><iframe src="https://avito.ru"></iframe><button onclick="sync()">✅ Синхронизировать профиль</button></div><script>window.Telegram.WebApp.ready();window.Telegram.WebApp.expand();async function sync(){const t=prompt("Вставьте строку cookie Авито:");if(!t)return;const r=await fetch('/api/save-cookies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:"${req.query.userId}",cookiesRaw:t})});const d=await r.json();if(d.success){alert("🎉 Подключено!");window.Telegram.WebApp.close()}else{alert("Ошибка")}}</script></body></html>`);
});

app.post('/api/save-cookies', async (req, res) => {
  try {
    const { userId, cookiesRaw } = req.body;
    if (!userId || !cookiesRaw) return res.status(400).json({ success: false });
    const parsedCookies = cookiesRaw.split(';').map(p => {
      const [n, ...v] = p.trim().split('=');
      return { name: n, value: v.join('='), domain: '.avito.ru', path: '/' };
    });
    await db.collection('user_sessions').doc(userId.toString()).set({ cookies: parsedCookies, updatedAt: new Date() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post(TELEGRAM_WEBHOOK_PATH, (req, res) => { bot.handleUpdate(req.body, res); });
app.get('/', (req, res) => { res.send('🚀 Сервер активен'); });

app.listen(PORT, async () => {
  console.log(`📡 Порт: ${PORT}`);
  try {
    await bot.telegram.setWebhook(`${APP_BASE_URL}${TELEGRAM_WEBHOOK_PATH}`);
    console.log(`[Telegram] Вебхук зарегистрирован!`);
  } catch (e) { console.error(e.message); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
