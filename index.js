require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai'); 
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { humanType, humanScroll, delay } = require('./humanEmulation'); 

// 1. ИНИЦИАЛИЗАЦИЯ EXPRESS И МГНОВЕННЫЙ ЗАПУСК ПОРТА ДЛЯ RENDER
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000; 

app.get('/', (req, res) => { res.send('🚀 Сервер активен'); });

app.listen(PORT, () => {
  console.log(`📡 Порт: ${PORT}. Сервер успешно поднят и слушает запросы Render.`);
});

console.log('🚀 Режим MVP (В памяти Render)!');
const storage = new Map();
const userStates = new Map();    
const browsers = new Map(); 

const db = {
  collection: (col) => ({
    doc: (id) => ({
      set: async (d) => {
        const cur = storage.get(`${col}/${id}`) || {};
        storage.set(`${col}/${id}`, { ...cur, ...d });
        return true;
      },
      get: async () => ({
        exists: storage.has(`${col}/${id}`),
        data: () => storage.get(`${col}/${id}`)
      })
    }),
    add: async (d) => {
      const fId = Math.random().toString(36).substring(7);
      storage.set(`${col}/${fId}`, d);
      return { id: fId };
    }
  })
};

async function loadSession(page, uid) {
  try {
    const doc = await db.collection('user_sessions').doc(uid.toString()).get();
    if (doc.exists) {
      const d = doc.data();
      if (d.cookies?.length > 0) { await page.setCookie(...d.cookies); return true; }
    }
    return false;
  } catch (e) { return false; }
}

async function startAvitoAuth(uid, phone) {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'];
  const isLocal = !process.env.PROXY_SERVER;

  if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`);
  
  const browser = await puppeteer.launch({ headless: true, args });
  const page = await browser.newPage();
  
  // АВТОРИЗАЦИЯ ПРОКСИ ДЛЯ СМС: Передаем логин и пароль мобильного прокси
  if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    await page.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
  }

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  browsers.set(uid, { browser, page });
  
  console.log(`🤖 Запрос СМС через прокси для: ${phone}`);
  // Переходим сразу на страницу логина, чтобы открылась форма ввода телефона
  await page.goto('https://avito.ru', { waitUntil: 'networkidle2', timeout: 50000 });
  await delay(3000);

  const sel = 'input[type="tel"], input[data-marker="phone-input/input"]';
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.focus(sel);
  await humanType(page, sel, phone);
  await delay(1500);
  
  const btn = 'button[type="submit"], button[data-marker="login-form/submit"]';
  await page.click(btn);
  await delay(4000);
  
  const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
  const hasSms = await page.$(smsSel).then(el => !!el);
  if (!hasSms) {
    const txt = await page.evaluate(() => document.body.innerText);
    if (txt.includes('капча')) throw new Error('Капча! Нужен чистый мобильный прокси.');
    throw new Error('Не удалось дойти до ввода СМС.');
  }
}

async function finishAvitoAuth(uid, code) {
  const sess = browsers.get(uid);
  if (!sess) throw new Error('Сессия потеряна. Начните сначала.');
  const { browser, page } = sess;
  try {
    const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
    await page.focus(smsSel);
    await humanType(page, smsSel, code);
    await delay(5000);
    const cookies = await page.cookies();
    const isOk = cookies.some(c => c.name.includes('sessid') || c.name.includes('u'));
    if (isOk) {
      await db.collection('user_sessions').doc(uid).set({ cookies, updatedAt: new Date() });
      return true;
    } else { throw new Error('Код СМС отклонен.'); }
  } finally {
    await browser.close();
    browsers.delete(uid);
  }
}

async function executeHaggle(url, arg, uid) {
  let browser;
  try {
    const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'];
    const isLocal = !process.env.PROXY_SERVER;

    if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    
    browser = await puppeteer.launch({ headless: true, args });
    const page = await browser.newPage();
    
    // АВТОРИЗАЦИЯ ПРОКСИ ДЛЯ ТОРГА
    if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await page.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
    }

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await loadSession(page, uid);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }); 
    await humanScroll(page);
    await delay(2000); 
    
    const btn = 'button[data-marker="messenger-button/button"]'; 
    if (await page.$(btn)) {
      await page.click(btn);
      await delay(4000); 
      const ck = await page.cookies();
      await db.collection('user_sessions').doc(uid).set({ cookies: ck, updatedAt: new Date() });
      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]'; 
      if (await page.$(txt)) {
        await humanType(page, txt, arg);
        await delay(1500); 
        return { success: true };
      }
    }
    return { success: false, error: 'Кнопка чата или инпут не найдены' };
  } catch (e) { return { success: false, error: e.message }; } 
  finally { if (browser) await browser.close(); }
}

const openai = new OpenAI({ baseURL: 'https://deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY }); 
const MY_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!MY_BOT_TOKEN) { 
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_BOT_TOKEN отсутствует в настройках!');
  process.exit(1); 
}

const bot = new Telegraf(MY_BOT_TOKEN);
const TG_PATH = `/webhook/${MY_BOT_TOKEN}`;
const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

bot.start(async (ctx) => {
  try {
    const uid = ctx.from.id.toString();
    userStates.delete(uid);
    await limiter.schedule(() => db.collection('user_logs').doc(uid).set({ chatId: ctx.chat.id, lastStart: new Date() }));
    await ctx.reply('🤖 ИИ-модуль торга готов. Подключите Авито:', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Привязать мой Авито', callback_data: 'start_auth' }]] }
    });
  } catch (e) { console.error(e.message); }
});

bot.action('start_auth', async (ctx) => {
  await ctx.answerCbQuery();
  const uid = ctx.from.id.toString();
  userStates.set(uid, { step: 'PHONE' });
  await ctx.reply('📞 Отправьте ваш номер Авито в формате: 79991112233');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const uid = ctx.from.id.toString();
  const state = userStates.get(uid);

  if (state?.step === 'PHONE') {
    if (!/^\d{11}$/.test(text)) return ctx.reply('❌ Введите строго 11 цифр (например, 79991112233):');
    await ctx.reply('⏳ Запрашиваю СМС от Авито... Подождите 10-15 сек.');
    try {
      await startAvitoAuth(uid, text);
      userStates.set(uid, { step: 'SMS' });
      await ctx.reply('💬 Авито выслало код. Введите его сюда цифрами:');
    } catch (err) {
      userStates.delete(uid);
      if (browsers.has(uid)) { await browsers.get(uid).browser.close(); browsers.delete(uid); }
      await ctx.reply(`❌ Ошибка: ${err.message}\nНачните заново с команды /start`);
    }
    return;
  }

  if (state?.step === 'SMS') {
    await ctx.reply('⚙️ Проверяю код подтверждения...');
    try {
      const ok = await finishAvitoAuth(uid, text);
      if (ok) {
        userStates.delete(uid);
        await ctx.reply('🎉 Магия сработала! Ваш профиль подключен. Теперь вы можете отправлять ссылки для торга.');
      }
    } catch (err) {
      userStates.delete(uid);
      await ctx.reply(`❌ Сбой проверки: ${err.message}\nНажмите /start для новой попытки.`);
    }
    return;
  }

  if (text.includes('http://') || text.includes('https://')) {
    const check = await db.collection('user_sessions').doc(uid).get();
    if (!check.exists) return ctx.reply('⚠️ Сначала нажмите /start и привяжите Авито.');
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
      const ai = JSON.parse(comp.choices[0].message.content);
      const est = Number(ai.estimatedPrice) || 0;
      const trg = Number(ai.targetPrice) || 0;
      const arg = ai.argument;
      const profit = est > trg ? (est - trg) : 0;
      const comm = Math.round(profit * 0.30);

      await ctx.reply(`📊 **ИИ-АНАЛИЗ:**\n💰 Цена: \`${est} руб.\`\n🎯 Торг до: \`${trg} руб.\`\n📈 Выгода: \`${profit} руб.\`\nКомиссия (30%): \`${comm} руб.\`\n\n📝 Предложение:\n_"${arg}"_`, { parse_mode: 'Markdown' });
      await db.collection('bids_history').add({ uid, targetUrl: text, estimatedPrice: est, targetPrice: trg, commissionAmount: comm, timestamp: new Date() });
      
      await ctx.reply(`🛡️ Запускаю отправку торга в чат Авито...`);
      const res = await executeHaggle(text, arg, uid);
