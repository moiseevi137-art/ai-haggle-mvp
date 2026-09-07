const express = require('express');
const admin = require('firebase-admin');
const { Telegraf } = require('telegraf'); // Подключаем Telegraf
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

// Обработка команды /start
bot.start(async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const firstName = ctx.from.first_name || 'Пользователь';

    const welcomeText = 
      `Привет, ${firstName}! 🧠\n\n` +
      `Добро пожаловать в MVP ИИ-помощника торгов **ai_haggle_mvp_bot**.\n\n` +
      `Доступные ИИ-модули:\n` +
      `➡️ Текст: DeepSeek & ChatGPT\n` +
      `➡️ Графика: NanoBanana\n\n` +
      `Отправьте мне параметры торга или ваше предложение!`;

    await ctx.replyWithMarkdown(welcomeText);

    // Сохраняем логи в Firestore
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

// Ответ на любое другое текстовое сообщение
bot.on('text', async (ctx) => {
  await ctx.reply(`Принял ваш запрос! Модули DeepSeek/ChatGPT готовятся обработать сценарий торга...`);
});

// Интегрируем обработчик Telegraf в Express как Middleware
app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));

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

    const logData = {
      chatId: chatId,
      initialPrice: initialPrice,
      wave: currentWave,
      theirOffer: currentOffer,
      ourCounterOffer: ourPriceOffer,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('haggles').add(logData);
    res.status(200).json({ success: true, ourOffer: ourPriceOffer });
  } catch (error) {
    console.error("Ошибка внутри старого вебхука:", error);
    res.status(500).send("Внутренняя ошибка сервера");
  }
});

// ====================================================================
// 5. ЗАПУСК СЕРВЕРА И АВТО-УСТАНОВКА ВЕБХУКА ЧЕРЕЗ TELEGRAF
// ====================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  
  try {
    const fullWebhookUrl = `${RENDER_URL}${TELEGRAM_WEBHOOK_PATH}`;
    // Telegraf сам делает безопасный и правильный запрос к Telegram API
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`[Telegraf] Вебхук успешно зарегистрирован на адрес: ${fullWebhookUrl}`);
  } catch (err) {
    console.error(`[Telegraf] Ошибка автоматической установки вебхука:`, err.message);
  }
});
