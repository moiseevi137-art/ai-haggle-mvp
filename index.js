const express = require('express');
const admin = require('firebase-admin');
const { Telegraf } = require('telegraf'); 
const app = express();

app.use(express.json());

// Конфигурация Telegram-бота из переменных окружения Render
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RENDER_URL = 'https://ai-haggle-mvp-service.onrender.com'; 

const TELEGRAM_WEBHOOK_PATH = `/webhook/${TOKEN}`;

// Проверка токена
if (!TOKEN) {
  console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная TELEGRAM_BOT_TOKEN не задана в Environment!");
  process.exit(1);
}

// Инициализация Telegraf бота
const bot = new Telegraf(TOKEN);

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE
// ====================================================================
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const serviceAccount = JSON.parse(jsonString);
      
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase успешно инициализирован через единый JSON на Render.");
    } catch (parseError) {
      console.error("Ошибка парсинга JSON-ключа Firebase:", parseError.message);
      admin.initializeApp({ projectId: 'haggle-bot-2026' });
    }
  } else {
    admin.initializeApp({ projectId: 'haggle-bot-2026' });
    console.log("Предупреждение: Переменная FIREBASE_SERVICE_ACCOUNT не найдена. Запущено по умолчанию.");
  }
}

const db = admin.firestore();

// ====================================================================
// 2. ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: АЛГОРИТМ ТОРГА (2 ВОЛНЫ)
// ====================================================================
function calculateHaggleStep(initialPrice, currentWave, currentOffer) {
  const floorPrice = initialPrice * 0.80; 
  let targetPrice = initialPrice;
  let counterOffer = 0;

  if (currentWave === 1) {
    targetPrice = initialPrice * 0.93;
    counterOffer = Math.max(targetPrice, currentOffer);
  } else if (currentWave === 2) {
    targetPrice = initialPrice * 0.88;
    counterOffer = Math.max(targetPrice, currentOffer);
  } else {
    counterOffer = floorPrice;
  }

  if (counterOffer < floorPrice) {
    counterOffer = floorPrice;
  }

  return Math.round(counterOffer);
}

// ====================================================================
// 3. ЛОГИКА TELEGRAM БОТА (Через Telegraf)
// ====================================================================

const { Telegraf } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const Bottleneck = require('bottleneck');

// Инициализация Express
const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}
const db = admin.firestore();

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN}`;

// НАСТРОЙКА ИНТЕРВАЛОВ И ОЧЕРЕДИ
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1500,
  highWater: 50,
  strategy: Bottleneck.strategy.LEAK
});

// Имитация паузы "как у человека"
const humanDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

// === ОБРАБОТЧИКИ КОМАНД ===

// Обработка команды /start
bot.start(async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const firstName = ctx.from.first_name || 'Пользователь';

    const welcomeText = 
      `Привет, ${firstName}! 🧠\n\n` +
      `Добро пожаловать в MVP ИИ-помощника торгов ai_haggle_mvp_bot.\n\n` +
      `Доступные ИИ-модули:\n` +
      `➡️ Текст: DeepSeek & ChatGPT\n` +
      `➡️ Графика: NanoBanana\n\n` +
      `Отправьте мне параметры торга или ваше предложение!`;

    await limiter.schedule(() => ctx.reply(welcomeText));

    await db.collection('user_logs').doc(String(chatId)).set({
      firstName: firstName,
      status: 'started',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Firestore] Пользователь ${chatId} залогирован.`);
  } catch (error) {
    console.error("Ошибка в боте при команде /start:", error.message);
  }
});

// Обработка команды /help
bot.help(async (ctx) => {
  try {
    const helpMessage = 
      `📖 *Справка по использованию бота*\n\n` +
      `Этот бот создан для проведения прозрачных и быстрых торгов между покупателями и продавцами.\n\n` +
      `*Доступные команды:*\n` +
      `/start — Перезапустить бота и проверить статус\n` +
      `/help — Показать это справочное меню\n\n` +
      `*Доступные ИИ-модули:*\n` +
      `🤖 *DeepSeek & ChatGPT* — для генерации аргументов торга\n` +
      `🎨 *NanoBanana* — для визуализации графики/лотов\n\n` +
      `💡 _Если бот ведет себя некорректно, отправьте /start для перезапуска сессии._`;

    await limiter.schedule(() => ctx.replyWithMarkdown(helpMessage));
  } catch (error) {
    console.error('Ошибка при отправке справки:', error.message);
  }
});

// Ответ на любое другое текстовое сообщение
bot.on('text', async (ctx) => {
  try {
    await limiter.schedule(async () => {
      await humanDelay(); 
      await ctx.reply(`Принял ваш запрос! Модули DeepSeek/ChatGPT готовы в безопасном режиме обработать сценарий торга...`);
    });
  } catch (error) {
    console.error('Ошибка в обработчике текста:', error.message);
  }
});

// Интегрируем обработчик Telegraf в Express как Middleware
app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));

// Базовый эндпоинт для проверки работы сервера
app.get('/', (req, res) => {
  res.send('Сервер торга MVP работает с защитой Rate Limiting!');
});

// Запуск сервера Express
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT} с защитой Bottleneck`);
});


// ====================================================================
// 4. МАРШРУТЫ ДЛЯ СЕРВЕРА (Эндпоинты Express)
// ====================================================================

app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает с новой базой!');
});

// Старый эндпоинт для тестов ReqBin
app.post('/webhook', async (req, res) => {
  try {
    const { chatId, initialPrice, currentWave, currentOffer } = req.body;

    if (!chatId || !initialPrice || !currentWave || !currentOffer) {
      return res.status(400).send('Отсутствуют обязательные параметры');
    }

    const ourPriceOffer = calculateHaggleStep(
      parseFloat(initialPrice), 
      parseInt(currentWave), 
      parseFloat(currentOffer)
    );

    res.status(200).json({ status: "success", ourPriceOffer });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Запуск сервера и автоматическая привязка вебхука в Telegram
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  try {
    const fullWebhookUrl = `${RENDER_URL}${TELEGRAM_WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`[Telegraf] Вебхук успешно зарегистрирован на адрес: ${fullWebhookUrl}`);
  } catch (error) {
    console.error("Ошибка регистрации вебхука в Telegram:", error.message);
  }
});
