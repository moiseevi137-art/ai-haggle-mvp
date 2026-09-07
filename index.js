const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios'); // Добавили для авто-настройки вебхука
const app = express();

app.use(express.json());

// Переменные для Telegram-бота
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RENDER_URL = 'https://onrender.com'; 
const TELEGRAM_WEBHOOK_PATH = `/webhook/${TOKEN}`;

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Надёжная через одну переменную JSON)
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
// 3. МАРШРУТЫ ДЛЯ СЕРВЕРА (Эндпоинты)
// ====================================================================

app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает с новой базой!');
});

// --- ЭНДПОИНТ ДЛЯ TELEGRAM БОТА ---
app.post(TELEGRAM_WEBHOOK_PATH, async (req, res) => {
  try {
    const update = req.body;

    // Проверяем, что пришло именно текстовое сообщение
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const firstName = update.message.from.first_name || 'Пользователь';

      // Если пользователь нажал /start
      if (text === '/start') {
        const welcomeText = 
          `Привет, ${firstName}! 🧠\n\n` +
          `Добро пожаловать в MVP ИИ-помощника торгов **ai_haggle_mvp_bot**.\n\n` +
          `Доступные ИИ-модули:\n` +
          `➡️ Текст: DeepSeek & ChatGPT\n` +
          `➡️ Графика: NanoBanana\n\n` +
          `Отправьте мне параметры торга или ваше предложение!`;

        // Отправляем ответ в Telegram
        await axios.post(`https://telegram.org{TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'Markdown'
        });

        // Сохраняем лог активации в Firestore
        await db.collection('user_logs').doc(String(chatId)).set({
          firstName: firstName,
          status: 'started',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        // На любое другое сообщение отвечаем стандартной заглушкой (пока не подключен ИИ)
        await axios.post(`https://telegram.org{TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `Принял ваш запрос! Модули DeepSeek/ChatGPT готовятся обработать сценарий торга...`
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("Ошибка при обработке сообщения Telegram:", error.message);
    res.status(200).send('OK'); // Возвращаем 200, чтобы Telegram не спамил повторами при ошибках
  }
});

// --- ВАШ СТАРЫЙ ЭНДПОИНТ (Для тестов ReqBin) ---
app.post('/webhook', async (req, res) => {
  try {
    const { chatId, initialPrice, currentWave, currentOffer } = req.body;

    if (!chatId || !initialPrice || !currentWave || !currentOffer) {
      return res.status(400).send('Отсутствуют обязательные параметры: chatId, initialPrice, currentWave, currentOffer');
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
    console.log(`[Firestore] Лог торга для чата ${chatId} успешно сохранен.`);

    res.status(200).json({
      success: true,
      ourOffer: ourPriceOffer
    });

  } catch (error) {
    console.error("Ошибка внутри вебхука:", error);
    res.status(500).send("Внутренняя ошибка сервера");
  }
});

// ====================================================================
// 4. ЗАПУСК И АВТОМАТИЧЕСКАЯ РЕГИСТРАЦИЯ ВЕБХУКА
// ====================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  
  // Автоматический пинг Telegram для привязки вебхука
  if (TOKEN) {
    try {
      const fullWebhookUrl = `${RENDER_URL}${TELEGRAM_WEBHOOK_PATH}`;
      
      // Полностью чистый и фиксированный URL к API Telegram без ручных склеек
      const telegramApiUrl = `https://telegram.org{TOKEN}/setWebhook`;
      
      const response = await axios.post(telegramApiUrl, {
        url: fullWebhookUrl
      });
      
      console.log(`[Telegram Webhook] Авто-настройка:`, response.data.description || 'Успешно поставлен');
    } catch (err) {
      console.error(`[Telegram Webhook] Ошибка авто-настройки:`, err.message);
    }
  } else {
    console.log("[Telegram Webhook] Предупреждение: TELEGRAM_BOT_TOKEN не задан в Environment.");
  }
});
