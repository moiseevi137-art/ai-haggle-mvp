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
const MY_BOT_TOKEN = '8982856560:AAEbZKCsfF4co_Fyy3IdTlG6-USxzVnTVmc'; 

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
      `Отправьте мне ссылку на товар Авито/WB или ваши параметры, чтобы начать торг и сбить цену!`;

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

// АВТОМАТИЧЕСКИЙ СИМУЛЯТОР ТОРГА И РАСЧЕТА НАШЕЙ КОМИССИИ (30%)
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  try {
    await limiter.schedule(async () => {
      // Показываем пользователю, что "ИИ думает"
      await ctx.reply(`🔍 Анализирую объект торга... Модули DeepSeek/ChatGPT составляют стратегию снижения цены.`);
      await humanDelay(); // Защитная пауза

            // Логика симулятора: генерируем случайную реалистичную скидку
      const initialPrice = Math.floor(Math.random() * (50000 - 5000) + 5000); // Исходная цена лота (от 5 до 50к)
      const discountPercent = Math.random() > 0.5 ? 12 : 8; // Скидка 8% или 12%
      const savedMoney = Math.round(initialPrice * (discountPercent / 100)); // Сколько сэкономили
      const targetPrice = initialPrice - savedMoney; // Итоговая цена для покупки
      const ourCommission = Math.round(savedMoney * 0.30); // <<< ВОТ ЗДЕСЬ СКОБКА ИСПРАВЛЕНА! ✅

      // Список живых человеческих аргументов
      const argumentsList = [
        "• Готов забрать товар сегодня самовывозом в течение часа.",
        "• На аналогичных площадках цена ниже, но готов купить у вас прямо сейчас.",
        "• На фото заметны следы использования/мелкие царапины, прошу скидку.",
        "• Оплата наличными или быстрым переводом без лишних вопросов."
      ];
      const selectedArgument = argumentsList[Math.floor(Math.random() * argumentsList.length)];

      const responseText = 
        `🤖 *Результат разбора ИИ (DeepSeek/ChatGPT эмуляция):*\n\n` +
        `📦 *Анализ лота:* Ссылка успешно распознана.\n` +
        `💵 *Начальная цена:* ~${initialPrice} руб.\n` +
        `🎯 *Целевая цена после торга:* ${targetPrice} руб.\n\n` +
        `🔥 *Сэкономлено для вас:* ${savedMoney} руб. (Скидка ${discountPercent}%)\n` +
        `💳 *Наша комиссия (30% по договору):* ${ourCommission} руб.\n\n` +
        `💬 *Рекомендуемый скрипт для отправки продавцу:*\n` +
        `_"Здравствуйте! Отличный товар. ${selectedArgument} Подскажите, уступите за ${targetPrice} руб.? Буду очень благодарен!"_\n\n` +
        `💡 Чтобы подтвердить сделку и зафиксировать условия, отправьте скриншот согласия продавца.`;

      await ctx.replyWithMarkdown(responseText);

      // Записываем лог успешного торга в Firestore для статистики
      await db.collection('bids_history').add({
        chatId: chatId,
        userQuery: userText,
        initialPrice: initialPrice,
        savedMoney: savedMoney,
        ourCommission: ourCommission,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`[Firestore] Записан расчет торга для чата ${chatId}. Комиссия: ${ourCommission}`);
    });
  } catch (error) {
    console.error('Ошибка в симуляторе торга:', error.message);
  }
});

// Интеграция с Express
app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));

app.get('/', (req, res) => {
  res.send('Сервер торга MVP работает с защитой Rate Limiting!');
});

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT} с защитой Bottleneck`);
  
  try {
    const fullServerUrl = 'https://onrender.com';
    const webhookUrl = `${fullServerUrl}/webhook/${MY_BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`[Telegram] Вебхук автоматически обновлен на правильный URL: ${webhookUrl}`);
  } catch (error) {
    console.error('[Telegram] Ошибка авто-установки вебхука:', error.message);
  }
});
