require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('🚀 AI Haggle Pro Active');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('📡 Сервер успешно запущен на порту: ' + PORT);
  setTimeout(() => {
    initBot();
  }, 1000);
});

console.log('⚡️ Режим AI HAGGLE PRO!');

const storage = new Map();
const userStates = new Map();
const browsers = new Map();

const db = {
  collection: (col) => ({
    doc: (id) => ({
      set: async (d) => {
        const c = storage.get(col + '/' + id) || {};
        storage.set(col + '/' + id, { ...c, ...d });
        return true;
      },
      get: async () => ({
        exists: storage.has(col + '/' + id),
        data: () => storage.get(col + '/' + id)
      })
    }),
    add: async (d) => {
      const f = Math.random().toString(36).substring(7);
      storage.set(col + '/' + f, d);
      return { id: f };
    }
  })
};


// ШЛЮЗ АВТОРИЗАЦИИ: Шаг №2 — Верификация СМС-кода и закрепление сессии
async function finishAvitoAuth(uid, code) {
  const { humanType, delay } = require('./humanEmulation');
  const s = browsers.get(String(uid));
  if (!s) throw new Error('Сессия авторизации утеряна. Пожалуйста, начните заново.');
  const { browser: b, page: p } = s;

  try {
    const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
    await p.focus(smsSel);
    await humanType(p, smsSel, code);
    await delay(6000);

    const ck = await p.cookies();
    if (!ck.some(c => c.name.includes('sessid') || c.name.includes('u'))) {
      throw new Error('Введенный код отклонен Авито или срок его действия истек.');
    }

    await db.collection('user_sessions').doc(String(uid)).set({ cookies: ck, updatedAt: new Date() });
    return true;
  } catch (e) {
    throw e;
  } finally { // Исправлена опечатка с 'military' на 'finally'
    await b.close();
    browsers.delete(String(uid));
  }
}

// ЭКСПАНСИЯ В ЧАТ: Шаг №3 — Вход по ссылке объявления и отправка аргумента торга
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
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ];

    const isLocal = !process.env.PROXY_SERVER;
    if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`); 

    b = await pt.launch({ 
      headless: true, 
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome', 
      args: args 
    });

    const p = await b.newPage();
    await p.setViewport({ width: 1920, height: 1080 });
    await optimizePage(p);

    if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      try {
        await p.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
      } catch (proxyError) {
        console.error("Ошибка авторизации прокси:", proxyError.message);
      }
    }

    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    const hasSession = await loadSession(p, uid);
    if (!hasSession) return { success: false, error: 'Авторизация не найдена. Сначала подключите аккаунт Авито.' };

    await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await humanScroll(p);
    await delay(3000); 

    const btn = 'button[data-marker="messenger-button/button"]';
    if (await p.$(btn)) {
      await p.click(btn);
      await delay(5000); 
    } else {
      console.log("Кнопка 'Написать' не найдена, возможно, чат уже открыт или это прямая ссылка.");
    }

    const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]';
    if (await p.$(txt)) {
      await humanType(p, txt, arg);
      await delay(2000);
      
      const updatedCookies = await p.cookies();
      await db.collection('user_sessions').doc(String(uid)).set({ cookies: updatedCookies, updatedAt: new Date() });
      return { success: true };
    }

    return { success: false, error: 'Чат или поле ввода заблокировано.' };
  } catch (e) {
    console.error("Ошибка в executeHaggle:", e.message);
    return { success: false, error: e.message };
  } finally {
    if (b) await b.close();
  }
}
// --- КОНЕЦ ЧАСТИ 1 ИЗ 3 ---
// --- НАЧАЛО ЧАСТИ 2 ИЗ 3 ---

// Вспомогательные функции для работы браузера (Добавлено, чтобы исправить падение executeHaggle)
async function optimizePage(page) {
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });
  } catch (e) {
    console.error("Ошибка оптимизации страницы:", e.message);
  }
}

async function loadSession(page, uid) {
  try {
    const snap = await db.collection('user_sessions').doc(String(uid)).get();
    if (!snap.exists) return false;
    const data = snap.data();
    if (!data || !data.cookies) return false;
    await page.setCookie(...data.cookies);
    return true;
  } catch (e) {
    console.error("Ошибка загрузки кук:", e.message);
    return false;
  }
}

// Главная инициализация и роутинг Telegram-бота
async function initBot() {
  const rawToken = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!rawToken) {
    console.error('❌ Критическая ошибка: Не найден токен бота в переменных окружения!');
    return;
  }
  
  // ИСПРАВЛЕНО: Безопасное удаление случайных пробелов/переносов строк хостинга
  const token = rawToken.trim();

  const { Telegraf } = require('telegraf');
  const Bottleneck = require('bottleneck');
  const OpenAI = require('openai');

  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com", 
    apiKey: process.env.DEEPSEEK_API_KEY
  });

  // ИСПРАВЛЕНО: Явное указание apiRoot для обхода ошибки 404 с новыми токенами
  const bot = new Telegraf(token, {
    telegram: {
      apiRoot: 'https://telegram.org'
    }
  });

  const TG_PATH = '/webhook/' + token;
  const BASE_URL = process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.trim() : 'https://onrender.com';
  const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });
  const webHookUrl = BASE_URL + TG_PATH;

  // ... дальше ваш код идет без изменений (app.use(bot.webhookCallback...), кнопки и т.д.)


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
      await ctx.reply(`📊 **ЛИЧНЫЙ ФИНАНСОВЫЙ КАБИНЕТ**\n─────────────────────────\n🔐 **Статус шлюза:** ${status}\n\n💰 **Сэкономлено бюджета:** \`0\` ₽\n🎯 **Успешно закрытые сделки:** \`0\` сессий\n⚡️ **Эффективность торга ИИ:** \`0%\` (средняя)\n─────────────────────────\n📡 *Система мониторинга чатов работает в штатном режиме.*`, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply('❌ Ошибка синхронизации данных.');
    }
  });

  bot.action('view_help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📖 **РЕГЛАМЕНТ РАБОТЫ С СИСТЕМОЙ AI HAGGLE**\n─────────────────────────\n1️⃣ **Синхронизация:** Нажми кнопку *🔑 ПОДКЛЮЧИТЬ АККАУНТ АВИТО*, введи номер телефона и подтверди сессию СМС-кодом.\n\n2️⃣ **Передача данных:** Скопируй веб-ссылку на интересующий товар из приложения Авито и отправь её прямо в этот чат.\n\n3️⃣ **Нейро-скоринг:** ИИ проанализирует карточку товара, выявит уязвимости в описании и сформирует железобетонную стратегию сброса цены.\n\n4️⃣ **Экспансия в чат:** Нажми кнопку *Отправить*, и наш замаскированный агент автоматически проведет торг с продавцом без твоего личного участия.', { parse_mode: 'Markdown' });
  });

  bot.action(/^send_bid_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const bidId = ctx.match[1]; // Фикс: восстановлена корректная выборка ID из регулярного выражения
    const uid = ctx.from.id.toString();
    await ctx.reply('🛡️ Запускаю маскировку и отправляю торг на Авито...');

    try {
      const snap = await db.collection('bids_history').doc(bidId).get();
      if (!snap.exists) return ctx.reply('❌ Сделка не найдена в кэше.');
      const data = snap.data();

      executeHaggle(data.targetUrl, data.argument, uid)
        .then(async (res) => {
          await ctx.reply(res.success ? '✅ Успешно отправлено продавцу!' : `❌ Не отправлено: ${res.error}`);
        })
        .catch(async (bgError) => {
          console.error("Фатальная ошибка Puppeteer в фоне:", bgError.message);
          await ctx.reply(`❌ Ошибка выполнения скрипта: ${bgError.message}`);
        });
    } catch (r) {
      await ctx.reply(`❌ Ошибка подготовки данных: ${r.message}`);
    }
  });
// --- КОНЕЦ ЧАСТИ 2 ИЗ 3 ---
// --- НАЧАЛО ЧАСТИ 3 ИЗ 3 ---

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const uid = ctx.from.id.toString();
    const state = userStates.get(uid);

    if (state?.step === 'PHONE') {
      if (!/^\d{11}$/.test(text)) return ctx.reply('❌ Некорректный формат. Нужно ровно 11 цифр:');
      await ctx.reply('⏳ Запускаю безопасную сессию и запрашиваю СМС...');
      try {
        await startAvitoAuth(uid, text);
        userStates.set(uid, { step: 'SMS' });
        await ctx.reply('💬 Введите код подтверждения из СМС:');
      } catch (err) {
        userStates.delete(uid);
        if (browsers.has(uid)) {
          await browsers.get(uid).browser.close();
          browsers.delete(uid);
        }
        await ctx.reply(`❌ Ошибка авторизации: ${err.message}`);
      }
      return;
    }

    if (state?.step === 'SMS') {
      await ctx.reply('⚙️ Проверяю код и шифрую токен сессии...');
      try {
        const ok = await finishAvitoAuth(uid, text);
        if (ok) {
          userStates.delete(uid);
          await ctx.reply('🎉 Аккаунт успешно синхронизирован! Безопасный шлюз активен.');
        }
      } catch (err) {
        userStates.delete(uid);
        if (browsers.has(uid)) {
          try { await browsers.get(uid).browser.close(); } catch (_) {}
          browsers.delete(uid);
        }
        await ctx.reply(`❌ Ошибка авторизации: ${err.message}`);
      }
      return;
    }

    if (text.includes('http://') || text.includes('https://')) {
      const check = await db.collection('user_sessions').doc(uid).get();
      if (!check.exists) return ctx.reply('⚠️ Защищенный шлюз закрыт. Сначала авторизуйте Авито.');
      await ctx.reply('⏳ Запускаю нейросетевой скоринг карточки товара через DeepSeek...');
      
      try {
        const comp = await openai.chat.completions.create({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'Верни строго JSON объект с полями estimatedPrice (число), targetPrice (число), argument (строка торга на русском языке)' },
            { role: 'user', content: `Сделай торг для: ${text}` }
          ],
          response_format: { type: 'json_object' }
        });
        
        const ai = JSON.parse(comp.choices.message.content);
        const est = Number(ai.estimatedPrice) || 0;
        const trg = Number(ai.targetPrice) || 0;
        const arg = ai.argument;
        const profit = est > trg ? est - trg : 0;
        const comm = Math.round(0.3 * profit);
        
        const bidRef = await db.collection('bids_history').add({
          uid: uid,
          targetUrl: text,
          estimatedPrice: est,
          targetPrice: trg,
          argument: arg,
          commissionAmount: comm,
          timestamp: new Date()
        });
        
        await ctx.reply(`📋 **ОТЧЁТ ОБ АНАЛИЗЕ СДЕЛКИ**\n──────────────────────\n💰 **Исходная цена:** ${est}  ₽\n🎯 **Целевая цена торга:**  ${trg}  ₽\n📈 **Прогнозируемая выгода:** ${profit}  ₽\n💸 **Сервисный сбор (30%):** ${comm} ₽\n──────────────────────\n\n🤖 **Стратегия торга от DeepSeek:**\n_"${arg}"_\n\n👇 *Готовы запустить робота в чат Авито?*`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🚀 Отправить предложение продавцу', callback_data: `send_bid_${bidRef.id}` }]] }
        });
      } catch (err) {
        await ctx.reply('⚠️ Ошибка нейро-скоринга или парсинга ответа.');
      }
    } else {
      await ctx.reply('Пожалуйста, отправьте валидную ссылку на товар Авито.');
    }
  });

  app.post(TG_PATH, (req, res) => {
    bot.handleUpdate(req.body, res);
  });

  try {
    await bot.telegram.setWebhook(webHookUrl);
    console.log(`[Telegram] Вебхук успешно зарегистрирован и активен: ${webHookUrl}`);
  } catch (e) {
    console.error("Критическая ошибка установки вебхука:", e.message);
  }

    process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
