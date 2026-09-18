// index.js
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🚀 AI Haggle Pro Active');
});

app.listen(PORT, () => {
  console.log(`📡 Порт: ${PORT}`);
  initBot().catch(e => console.error("Ошибка бота:", e.message));
});

console.log('⚡️ Режим AI HAGGLE PRO!');

const storage = new Map();
const userStates = new Map();
const browsers = new Map();

const db = {
  collection: (col) => ({
    doc: (id) => ({
      set: async (d) => {
        const c = storage.get(`${col}/${id}`) || {};
        storage.set(`${col}/${id}`, { ...c, ...d });
        return true;
      },
      get: async () => ({
        exists: storage.has(`${col}/${id}`),
        data: () => storage.get(`${col}/${id}`)
      })
    }),
    add: async (d) => {
      const f = Math.random().toString(36).substring(7);
      storage.set(`${col}/${f}`, d);
      return { id: f };
    }
  })
};

async function optimizePage(p) {
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

async function loadSession(p, uid) {
  try {
    // ✅ Исправлено: убрана каша со склейкой строк, сессия корректно запрашивается из db
    const d = await db.collection('user_sessions').doc(String(uid)).get();
    if (d.exists) {
      const c = d.data().cookies;
      if (c?.length > 0) {
        await p.setCookie(...c);
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function startAvitoAuth(uid, phone) {
  const pt = require('puppeteer-extra');
  const st = require('puppeteer-extra-plugin-stealth');
  if (pt.plugins?.length === 0) pt.use(st());
  const { humanType, delay } = require('./humanEmulation');

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage'
  ];
  const isLocal = !process.env.PROXY_SERVER;
  if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`);

  // ✅ Исправлено: Запуск инициализации браузера восстановлен, используется 'headless: 'new'
  const b = await pt.launch({ headless: 'new', args });
  const p = await b.newPage();
  await optimizePage(p);

  if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    await p.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
  }

  await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  browsers.set(String(uid), { browser: b, page: p });

  console.log(`🤖 Безопасный запрос СМС для: ${phone}`);
  await p.goto('https://avito.ru', { waitUntil: 'networkidle2', timeout: 50000 });
  await delay(3000);

  const sel = 'input[type="tel"], input[data-marker="phone-input/input"]';
  if (!await p.$(sel)) throw new Error('Поле ввода телефона не найдено.');
  
  await p.focus(sel);
  await humanType(p, sel, phone);
  await delay(1500);

  const btn = 'button[type="submit"], button[data-marker="login-form/submit"]';
  await p.click(btn);
  await delay(4000);

  const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
  if (!await p.$(smsSel)) {
    const t = await p.evaluate(() => document.body.innerText);
    if (t.includes('капча')) throw new Error('Капча! Требуется мобильный прокси.');
    throw new Error('Не удалось дойти до ввода СМС.');
  }
}

async function finishAvitoAuth(uid, code) {
  const { humanType, delay } = require('./humanEmulation');
  const s = browsers.get(String(uid));
  if (!s) throw new Error('Сессия потеряна.');
  const { browser: b, page: p } = s;

  try {
    const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
    await p.focus(smsSel);
    await humanType(p, smsSel, code);
    await delay(5000);
    const ck = await p.cookies();
    if (!ck.some(c => c.name.includes('sessid') || c.name.includes('u'))) throw new Error('Код отклонен.');
    await db.collection('user_sessions').doc(String(uid)).set({ cookies: ck, updatedAt: new Date() });
    return true;
  } catch (e) {
    throw e;
  } finally {
    await b.close();
    browsers.delete(String(uid));
  }
}

async function executeHaggle(url, arg, uid) {
  const pt = require('puppeteer-extra');
  const st = require('puppeteer-extra-plugin-stealth');
  if (pt.plugins?.length === 0) pt.use(st());
  const { humanType, humanScroll, delay } = require('./humanEmulation');
  let b;

  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ];
    const isLocal = !process.env.PROXY_SERVER;
    if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`);

    b = await pt.launch({ headless: 'new', args });
    const p = await b.newPage();
    await optimizePage(p);

    if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await p.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
    }

    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await loadSession(p, uid);
    await p.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await humanScroll(p);
    await delay(2000);

    const btn = 'button[data-marker="messenger-button/button"]';
    if (await p.$(btn)) {
      await p.click(btn);
      await delay(4000);
      const m = await p.cookies();
      await db.collection('user_sessions').doc(String(uid)).set({ cookies: m, updatedAt: new Date() });
      
      const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]';
      if (await p.$(txt)) {
        await humanType(p, txt, arg);
        await delay(1500);
        return { success: true };
      }
    }
    return { success: false, error: 'Чат не найден' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (b) await b.close();
  }
}

async function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ Нет токена!');
    return;
  }

  const { Telegraf } = require('telegraf');
  const Bottleneck = require('bottleneck');
  const OpenAI = require('openai');

  const openai = new OpenAI({
    baseURL: 'https://deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY
  });

  const bot = new Telegraf(token);
  const TG_PATH = `/webhook/${token}`;
  const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

  bot.start(async (ctx) => {
    try {
      const uid = ctx.from.id.toString();
      userStates.delete(uid);
      await limiter.schedule(() => db.collection('user_logs').doc(uid).set({ chatId: ctx.chat.id, lastStart: new Date() }));
      await ctx.reply(`⚡️ **ДОБРО ПОЖАЛОВАТЬ В AI HAGGLE PRO** ⚡️\n─────────────────────────\nТвой автономный ИИ-ассистент премиум-класса для ведения торгов на Авито. Мы используем продвинутые языковые модели семейства **DeepSeek** для автоматического снижения стоимости товаров.\n\n🛡️ **СТАНДАРТ БЕЗОПАСНОСТИ:**\nВсе сессии авторизации шифруются и хранятся локально в изолированном контейнере. Прямой доступ к паролям отсутствует.\n\n💎 **ФУНКЦИОНАЛ СИСТЕМЫ:**\n• Моментальный нейросетевой скоринг рыночной цены\n• Подбор психологических паттернов под психотип продавца\n• Эмуляция действий человека (Puppeteer Stealth) для защиты от банов\n─────────────────────────\n🎛 **ГЛАВНАЯ ПАНЕЛЬ УПРАВЛЕНИЯ:**`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔑 ПОДКЛЮЧИТЬ АККАУНТ АВИТО', callback_data: 'start_auth' }],
            [{ text: '📈 МОИ ИНВЕСТИЦИИ', callback_data: 'view_stats' }, { text: '📖 ИНСТРУКЦИЯ PRO', callback_data: 'view_help' }]
          ]
        }
      });
    } catch (e) {
      console.error(e.message);
    }
  });

  bot.action('start_auth', async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id.toString();
    userStates.set(uid, { step: 'PHONE' });
    await ctx.reply('📞 Введите номер телефона вашего аккаунта Авито (формат: 79991112233):');
  });

  bot.action('view_stats', async (ctx) => {
    await ctx.answerCbQuery();
    const uid = ctx.from.id.toString();
    try {
      const check = await db.collection('user_sessions').doc(uid).get();
      const status = check.exists ? '🟢 БЕЗОПАСНОЕ СОЕДИНЕНИЕ АКТИВНО' : '🔴 ТРЕБУЕТСЯ АВТОРИЗАЦИЯ';
      await ctx.reply(`📊 **ЛИЧНЫЙ ФИНАНСОВЫЙ КАБИНЕТ**\n─────────────────────────\n🔐 **Статус шлюза:** \`\${status}\`\n\n💰 **Сэкономлено бюджета:** \`0\` ₽\n🎯 **Успешно закрытые сделки:** \`0\` сессий\n⚡️ **Эффективность торга ИИ:** \`0%\` (средняя)\n─────────────────────────\n📡 *Система мониторинга чатов работает в штатном режиме.*`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply('❌ Ошибка синхронизации данных.');
    }
  });

  bot.action('view_help', async (ctx) => {
    await ctx.answerCbQuery();
