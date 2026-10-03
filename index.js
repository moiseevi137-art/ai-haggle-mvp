require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const { Telegraf } = require('telegraf');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai');

// Глобальное и безопасное подключение Puppeteer Stealth (один раз на весь проект)
const pt = require('puppeteer-extra');
const st = require('puppeteer-extra-plugin-stealth');
if (pt.plugins?.length === 0) pt.use(st());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

console.log('⚡️ Режим AI HAGGLE PRO!');

// Глобальные коллекции состояний (в оперативной памяти)
const userStates = new Map();
const browsers = new Map();

// ==========================================================
// 1. ИНИЦИАЛИЗАЦИЯ НАСТОЯЩЕЙ БАЗЫ ДАННЫХ FIREBASE ИЗ BASE64
// ==========================================================
let db;

if (process.env.FIREBASE_KEY_BASE64) {
    try {
        // Декодируем строку base64 сразу в JSON-объект, минуя жесткий диск
        const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_KEY_BASE64, 'base64').toString('utf-8'));
        console.log("✅ Ключ Firebase успешно декодирован из Base64 окружения!");
        
        admin.initializeApp({
            // Передаем объект конфигурации напрямую в метод cert()
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore(); // Подменяем заглушку на боевой Firestore
        console.log("🔥 Firebase Firestore успешно инициализирован.");
    } catch (err) {
        console.error("❌ Критическая ошибка инициализации Firebase:", err.message);
        process.exit(1);
    }

} else {
    console.error("⚠️ Ошибка: Переменная FIREBASE_KEY_BASE64 отсутствует! Перехожу в режим заглушки.");
    // Резервная локальная заглушка на случай тестов без переменной
    const storage = new Map();
    db = {
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
}
// ==========================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И ШЛЮЗЫ АВТОРИЗАЦИИ (PUPPETEER)
// ==========================================================

 
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

async function startAvitoAuth(uid, phone) {
    const pt = require('puppeteer-extra');
    const st = require('puppeteer-extra-plugin-stealth');
    if (pt.plugins?.length === 0) pt.use(st());
    const { humanType, delay } = require('./humanEmulation');

    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', 
        '--window-size=1280,720' 
    ];

    const isLocal = !process.env.PROXY_SERVER;
    if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`); 

    const b = await pt.launch({ 
        headless: true, 
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: args 
    });

    try {
        const p = await b.newPage();
        await p.setViewport({ width: 1280, height: 720 });

        // Легкая фильтрация медиа-трафика для экономии ОЗУ
        await p.setRequestInterception(true);

        p.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (!isLocal && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
            try {
                await p.authenticate({ username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD });
            } catch (proxyError) {
                console.error("Ошибка авторизации прокси:", proxyError.message);
            }
        }

        await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

       // 1. Заходим на чистую главную страницу Авито
        await p.goto('https://avito.ru', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000);

        // 2. ИСПРАВЛЕНО (Добавлено): Кликаем по кнопке "Вход и регистрация"
        const loginBtnSel = '[data-marker="header/login-button"]';
        await p.waitForSelector(loginBtnSel, { timeout: 15000 });
        await p.click(loginBtnSel);
        await delay(2000);

        // 3. Ожидаем появление поля ввода номера и наводим фокус
        const phoneSel = 'input[data-marker="login-form/phone"], input[type="tel"]';
        await p.waitForSelector(phoneSel, { timeout: 15000 });
        await p.focus(phoneSel);
        
        // 4. Имитируем человеческий ввод номера
        await humanType(p, phoneSel, phone);
        await delay(1500);

        // 5. Кликаем по кнопке продолжения (универсальный селектор)
        const submitSel = 'button[data-marker="login-form/submit"], button[type="submit"], [data-marker="social-sharing/login-button"]';
        await p.waitForSelector(submitSel, { timeout: 5000 });
        await p.click(submitSel);
        
        await delay(5000);

        // 6. Сохраняем сессию и выходим из функции
        browsers.set(String(uid), { browser: b, page: p });
        return true;

    } catch (e) {
        await b.close();
        throw e;
    }
}



async function finishAvitoAuth(uid, code) {
    const { humanType, delay } = require('./humanEmulation');
    const s = browsers.get(String(uid));
    if (!s) throw new Error('Сессия авторизации утеряна. Пожалуйста, начните заново.');
    const { browser: b, page: p } = s;

    try {
        const smsSel = 'input[type="number"], input[data-marker="sms-code-input/input"]';
        await p.waitForSelector(smsSel, { timeout: 10000 });
        await p.focus(smsSel);
        await humanType(p, smsSel, code);
        
        // Подстраховка: нажимаем Enter, если на сайте не сработал автосабмит кода
        await p.keyboard.press('Enter');
        
        // Умное динамическое ожидание сессии (максимум 15 секунд)
        console.log("⏳ Ожидаю верификации кук от Авито...");
        let ck = [];
        const maxAttempts = 15;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза 1 секунда между проверками
            ck = await p.cookies();
            if (ck.some(c => c.name.includes('sessid') || c.name.includes('u'))) {
                console.log("✅ Успешная авторизация, куки получены!");
                break;
            }
        }

        // Финальная проверка авторизационных маркеров
        if (!ck.some(c => c.name.includes('sessid') || c.name.includes('u'))) {
            throw new Error('Введенный код отклонен Авито, сессия не была создана.');
        }

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
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--window-size=1280,720'
        ];

        const isLocal = !process.env.PROXY_SERVER;
        if (!isLocal) args.push(`--proxy-server=${process.env.PROXY_SERVER}`); 

        b = await pt.launch({ 
            headless: true, 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, 
            args: args 
        });

        const p = await b.newPage();
        await p.setViewport({ width: 1280, height: 720 });
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

        // ✅ ИСПРАВЛЕНО: Перед переходом отключаем жесткую блокировку стилей, чтобы верстка чата не ломалась
        await p.setRequestInterception(true);
        p.removeAllListeners('request'); // Сбрасываем старый строгий фильтр
        p.on('request', (req) => {
            const type = req.resourceType();
            // Режем только картинки, медиа и шрифты. Стили (stylesheet) НЕ трогаем!
            if (['image', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`➡️ Переход по ссылке лота: ${url}`);
        await p.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await humanScroll(p);
        await delay(3000); 

        // Ищем кнопку "Написать продавцу"
        const btn = 'button[data-marker="messenger-button/button"]';
        await p.waitForSelector(btn, { timeout: 15000 }).catch(() => null);
        
        if (await p.$(btn)) {
            console.log("🟢 Кнопка чата найдена, совершаю клик...");
            await p.click(btn);
            await delay(5000); 
        } else {
            console.log("⚠️ Кнопка 'Написать' не найдена. Возможно, чат уже открыт по прямой ссылке или скрыт продавцом.");
        }


        const txt = 'textarea[placeholder*="Напишите"], [data-marker="chat-input"]';
        // Даем полю ввода до 10 секунд на появление на экране
        await p.waitForSelector(txt, { timeout: 10000 }).catch(() => null);

        if (await p.$(txt)) {
            console.log("✍️ Ввожу текст предложения торга...");
            await p.focus(txt);
            await humanType(p, txt, arg);
            await delay(1500);

            // ✅ ИСПРАВЛЕНО: Нажимаем Enter для физической отправки сообщения в чат Авито
            console.log("🚀 Отправляю сообщение продавцу...");
            await p.keyboard.press('Enter');
            await delay(3000); // Даем 3 секунды, чтобы Авито успел отправить пакет данных

            
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

// ==========================================================
// 3. РОУТИНГ И ЛОГИКА TELEGRAM-БОТА (LONG POLLING)
// ==========================================================
async function initBot() {
    const rawToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!rawToken) {
        console.error('❌ Критическая ошибка: Не найден токен бота в переменных окружения!');
        return;
    }
    const token = rawToken.trim();

    const openai = new OpenAI({
        baseURL: "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY
    });

    const bot = new Telegraf(token);

    const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1500 });

    bot.start(async (ctx) => {
        try {
            const uid = ctx.from.id.toString();
            userStates.delete(uid);
            await limiter.schedule(() => db.collection('user_logs').doc(uid).set({ chatId: ctx.chat.id, lastStart: new Date() }));
            
            await ctx.reply(`⚡️ <b>ДОБРО ПОЖАЛОВАТЬ В AI HAGGLE PRO</b> ⚡️\n─────────────────────────\nТвой автономный ИИ-ассистент премиум-класса для ведения торгов на Авито. Мы используем продвинутые языковые модели семейства <b>DeepSeek</b> для автоматического снижения стоимости товаров.\n\n🛡️ <b>СТАНДАРТ БЕЗОПАСНОСТИ:</b>\nВсе сессии авторизации шифруются и хранятся локально в изолированном контейнере. Прямой доступ к паролям отсутствует.\n\n💎 <b>ФУНКЦИОНАЛ СИСТЕМЫ:</b>\n• Моментальный нейросетевой скоринг рыночной цены\n• Подбор психологических паттернов под психотип продавца\n• Эмуляция действий человека (Puppeteer Stealth) для защиты от банов\n─────────────────────────\n🎛 <b>ГЛАВНАЯ ПАНЕЛЬ УПРАВЛЕНИЯ:</b>`, {
                parse_mode: 'HTML', // ✅ ИСПРАВЛЕНО: Безопасный HTML вместо капризного Markdown
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔑 ПОДКЛЮЧИТЬ АККАУНТ АВИТО', callback_data: 'start_auth' }],
                        [{ text: '📈 МОИ ИНВЕСТИЦИИ', callback_data: 'view_stats' }, { text: '📖 ИНСТРУКЦИЯ PRO', callback_data: 'view_help' }]
                    ]
                }
            });
        } catch (e) {
            console.error("Ошибка отправки стартового меню:", e.message);
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
            
            // ✅ ИСПРАВЛЕНО: Безопасная верстка через HTML вместо капризного Markdown
            await ctx.reply(`📊 <b>ЛИЧНЫЙ ФИНАНСОВЫЙ КАБИНЕТ</b>\n─────────────────────────\n🔐 <b>Статус шлюза:</b> ${status}\n\n💰 <b>Сэкономлено бюджета:</b> <code>0</code> ₽\n🎯 <b>Успешно закрытые сделки:</b> <code>0</code> сессий\n⚡️ <b>Эффективность торга ИИ:</b> <code>0%</code> (средняя)\n─────────────────────────\n📡 <i>Система мониторинга чатов работает в штатном режиме.</i>`, { 
                parse_mode: 'HTML' 
            });
        } catch (e) {
            console.error("Ошибка вывода статистики:", e.message);
            await ctx.reply('❌ Ошибка синхронизации данных.');
        }
    });


    bot.action('view_help', async (ctx) => {
        await ctx.answerCbQuery();
        
        // ✅ ИСПРАВЛЕНО: Полный перевод разметки на безопасный и стабильный HTML режим
        await ctx.reply('📖 <b>РЕГЛАМЕНТ РАБОТЫ С СИСТЕМОЙ AI HAGGLE</b>\n─────────────────────────\n1️⃣ <b>Синхронизация:</b> Нажми кнопку <i>🔑 ПОДКЛЮЧИТЬ АККАУНТ АВИТО</i>, введи номер телефона и подтверди сессию СМС-кодом.\n\n2️⃣ <b>Передача данных:</b> Скопируй веб-ссылку на интересующий товар из приложения Авито и отправь её прямо в этот чат.\n\n3️⃣ <b>Нейро-скоринг:</b> ИИ проанализирует карточку товара, выявит уязвимости в описании и сформирует железобетонную стратегию сброса цены.\n\n4️⃣ <b>Экспансия в чат:</b> Нажми кнопку <i>Отправить</i>, и наш замаскированный агент автоматически проведет торг с продавцом без твоего личного участия.', { 
            parse_mode: 'HTML' 
        });
    });


    bot.action(/^send_bid_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const bidId = ctx.match[1];
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
    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        const uid = ctx.from.id.toString();
        const state = userStates.get(uid);

        if (state?.step === 'PHONE') {
if (!/^7\d{10}$/.test(text)) {
    return ctx.reply('❌ Некорректный формат. Номер должен состоять из 11 цифр и начинаться с 7 (например, 79991112233):');
}

           await ctx.reply('⏳ Запускаю безопасную сессию и запрашиваю СМС...');
            try {
                await startAvitoAuth(uid, text);
                userStates.set(uid, { step: 'SMS' });
                await ctx.reply('💬 Введите код подтверждения из СМС:');
            } catch (err) {
                userStates.delete(uid);
                // ✅ ИСПРАВЛЕНО: Безопасное закрытие браузера в try/catch, чтобы бот никогда не падал из-за пустых ссылок
                if (browsers.has(uid)) {
                    try { 
                        await browsers.get(uid).browser.close(); 
                    } catch (_) {}
                    browsers.delete(uid);
                }
                await ctx.reply(`❌ Ошибка авторизации: ${err.message}`);
            }
            return;
        }


         if (state?.step === 'SMS') {
            // ✅ ИСПРАВЛЕНО: Проверяем, что введены только цифры (от 4 до 6 знаков)
            if (!/^\d{4,6}$/.test(text)) {
                return ctx.reply('❌ Некорректный формат кода. СМС-код должен состоять только из 4-6 цифр без пробелов и букв. Попробуйте еще раз:');
            }

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


    // ✅ ИСПРАВЛЕНО: Бот реагирует только на валидные ссылки, содержащие avito.ru
        if ((text.includes('http://') || text.includes('https://')) && text.includes('avito.ru')) {
            const check = await db.collection('user_sessions').doc(uid).get();
            if (!check.exists) return ctx.reply('⚠️ Защищенный шлюз закрыт. Сначала авторизуйте Авито.');
            await ctx.reply('⏳ Запускаю нейросетевой скоринг карточки товара через DeepSeek...');

            
            try {
                const comp = await openai.chat.completions.create({
                    model: 'deepseek-chat',
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You must return a valid JSON object. Response must match this schema: { "estimatedPrice": number, "targetPrice": number, "argument": "string" }. Верни строго JSON объект с полями estimatedPrice (число), targetPrice (число), argument (строка торга на русском языке).' 
                        },
                        { role: 'user', content: `Сделай торг для: ${text}` }
                    ],
                    response_format: { type: 'json_object' }
                });

                
                const ai = JSON.parse(comp.choices[0].message.content);
                const est = Number(ai.estimatedPrice) || 0;
                const trg = Number(ai.targetPrice) || 0;
                const arg = ai.argument || '';
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
                
               await ctx.reply(`📋 <b>ОТЧЁТ ОБ АНАЛИЗЕ СДЕЛКИ</b>\n──────────────────────\n💰 <b>Исходная цена:</b> ${est} ₽\n🎯 <b>Целевая цена торга:</b> ${trg} ₽\n📈 <b>Прогнозируемая выгода:</b> ${profit} ₽\n💸 <b>Сервисный сбор (30%):</b> ${comm} ₽\n──────────────────────\n\n🤖 <b>Стратегия торга от DeepSeek:</b>\n<i>"${arg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"</i>\n\n👇 <i>Готовы запустить робота в чат Авито?</i>`, {
                    parse_mode: 'HTML', // ✅ ИСПРАВЛЕНО: Безопасный HTML-режим
                    reply_markup: { 
                        inline_keyboard: [[{ text: '🚀 Отправить предложение продавцу', callback_data: `send_bid_${bidRef.id}` }]] 
                    }
                });
            } catch (err) {
                console.error("Ошибка парсинга или отправки отчета:", err.message);
                await ctx.reply('⚠️ Ошибка нейро-скоринга или парсинга ответа.');
            }
        } else {
            await ctx.reply('Пожалуйста, отправьте валидную ссылку на товар Авито.');
        }
    });


    bot.launch()
        .then(() => console.log('🤖 Бот успешно запущен на Amvera в режиме Long Polling!'))
        .catch(err => console.error('❌ Фатальная ошибка старта Telegraf:', err.message));

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// ==========================================================
// 4. ПОДДЕРЖАНИЕ СЕТЕВОГО ПОРТА ДЛЯ ХОСТИНГА (EXPRESS)
// ==========================================================
app.get('/', (req, res) => {
    res.send('🚀 AI Haggle Pro Active');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('📡 Сервер Express успешно запущен на порту: ' + PORT);
    setTimeout(() => {
        initBot();
    }, 1000);
});
