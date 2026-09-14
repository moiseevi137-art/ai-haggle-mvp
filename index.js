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
const userStates = new Map();    
const activeBrowsers = new Map(); 

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
      if (data.cookies?.length > 0) { await page.setCookie(...data.cookies); return true; }
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
    return false;
  } catch (err) { return false; }
}

async function startAvitoAuth(userId, phoneNumber) {
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'];
  if (process.env.PROXY_SERVER) launchArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
  const browser = await puppeteer.launch({ headless: true, args: launchArgs });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  activeBrowsers.set(userId, { browser, page });
  await page.goto('https://avito.ru', { waitUntil: 'networkidle2', timeout: 50000 });
  await delay(2000);
  const inputSelector = 'input[type="tel"], input[data-marker="phone-input/input"]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.focus(inputSelector);
  await humanType(page, inputSelector, phoneNumber);
  await delay(1500);
  const submitBtn = 'button[type="submit"], button[data-marker="login-form/submit"]';
  await page.click(submitBtn);
  await delay(4000);
  const smsSelector = 'input[type="number"], input[data-marker="sms-code-input/input"]';
  const hasSmsField = await page.$(smsSelector).then(el => !!el);
  if (!hasSmsField) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('капча') || bodyText.includes('картинке')) throw new Error('Авито выдало капчу. Требуются мобильные прокси.');
    throw new Error('Не удалось дойти до ввода СМС. Проверьте номер.');
  }
}

async function finishAvitoAuth(userId, smsCode) {
  const session = activeBrowsers.get(userId);
  if (!session) throw new Error('Сессия авторизации потеряна. Начните сначала.');
  const { browser, page } = session;
  try {
    const smsSelector = 'input[type="number"], input[data-marker="sms-code-input/input"]';
    await page.focus(smsSelector);
    await humanType(page, smsSelector, smsCode);
    await delay(5000);
    const cookies = await page.cookies();
    const hasSessId = cookies.some(c => c.name.includes('sessid') || c.name.includes('u'));
    if (hasSessId) {
      await db.collection('user_sessions').doc(userId).set({ cookies, updatedAt: new Date() });
      return true;
    } else { throw new Error('Код СМС отклонен Авито.'); }
  } finally {
    await browser.close();
    activeBrowsers.delete(userId);
  }
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
      const currentCookies = await page.cookies();
      await db.collection('user_sessions').doc(userId).set({ cookies: currentCookies, updatedAt: new Date() });
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
    userStates.delete(userId);
    await limiter.schedule(() => db.collection('user_logs').doc(userId).set({ chatId: ctx.chat.id, username: ctx.from.username || '🔑 Аноним', lastStart: new Date() }));
    await ctx.reply('🤖 ИИ-модуль торга готов. Подключите Авито в диалоге:', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Привязать мой Авито', callback_data: 'start_auth' }]] }
    });
  } catch (e) { console.error(e.message); }
});

bot.action('start_auth', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  userStates.set(userId, { step: 'WAITING_FOR_PHONE' });
  await ctx.reply('📞 Отправьте номер телефона Авито в формате: 79991112233');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id.toString();
  const state = userStates.get(userId);

  if (state?.step === 'WAITING_FOR_PHONE') {
    if (!/^\d{11}$/.test(text)) return ctx.reply('❌ Номер должен состоять строго из 11 цифр (например, 79991112233):');
    await ctx.reply('⏳ Робот запрашивает СМС код от Авито... Подождите 10-15 секунд.');
    try {
      await startAvitoAuth(userId, text);
      userStates.set(userId, { step: 'WAITING_FOR_SMS' });
      await ctx.reply('💬 Авито выслало код. Введите его сюда цифрами:');
    } catch (err) {
      userStates.delete(userId);
      if (activeBrowsers.has(userId)) { await activeBrowsers.get(userId).browser.close(); activeBrowsers.delete(userId); }
      await ctx.reply(`❌ Ошибка Авито: ${err.message}\nНачните заново с команды /start`);
    }
    return;
  }

  if (state?.step === 'WAITING_FOR_SMS') {
    await ctx.reply('⚙️ Проверяю код подтверждения...');
    try {
      const success = await finishAvitoAuth(userId, text);
      if (success) {
        userStates.delete(userId);
        await ctx.reply('🎉 Магия сработала! Ваш профиль успешно подключен. Теперь вы можете отправлять ссылки на товары для автоматического торга.');
      }
    } catch (err) {
      userStates.delete(userId);
      await ctx.reply(`❌ Сбой проверки СМС: ${err.message}\nНажмите /start для новой попытки.`);
    }
    return;
  }

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
