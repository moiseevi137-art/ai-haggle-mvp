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

// Инициализация бота с вашим токеном напрямую
const MY_BOT_TOKEN = 'ВАШ_ТОКЕН_ИЗ_BOTFATHER'; 

const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = `/webhook/${MY_BOT_TOKEN}`;


// НАСТРОЙКА ИНТЕРВАЛОВ И ОЧЕРЕДИ (Rate Limiting)
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1500,
  highWater: 50,
  strategy: Bottleneck.strategy.LEAK
});

// Имитация человеческой паузы
const humanDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

// === ОБРАБОТЧИКИ КОМАНД ===

// Команда /start
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
    console.error("Ошибка в команде /start:", error.message);
  }
});

// Команда /help
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
    console.error('Ошибка в команде /help:', error.message);
  }
});

// Обработка текстовых сообщений
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

// Интеграция с Express
app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));

// Проверка работоспособности
app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Сервер опрашивается`);
  res.send('Сервер торга MVP работает с защитой Rate Limiting!');
});

// ЗАПУСК СЕРВЕРА И АВТОМАТИЧЕСКАЯ УСТАНОВКА ВЕБХУКА
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT} с защитой Bottleneck`);
  
  try {
    // Бот сам регистрирует свой адрес в Telegram при старте сервера!
    const SERVER_URL = 'https://onrender.com';
    const webhookUrl = `${SERVER_URL}/webhook/${process.env.BOT_TOKEN}`;
    
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`[Telegram] Вебхук автоматически обновлен: ${webhookUrl}`);
  } catch (error) {
    console.error('[Telegram] Ошибка авто-установки вебхука:', error.message);
  }
});

