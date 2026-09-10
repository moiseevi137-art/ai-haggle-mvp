const { Telegraf } = require('telegraf');
const express = require('express');
const admin = require('firebase-admin');
const Bottleneck = require('bottleneck');
const OpenAI = require('openai'); // Подключаем ИИ
const { humanType, humanScroll, delay } = require('./humanEmulation'); 

// Инициализация Express
const app = express();
const PORT = process.env.PORT || 3000; 

// Инициализация Firebase Admin SDK
if (!admin.apps.length) {
admin.initializeApp({
credential: admin.credential.applicationDefault()
});
} 

//==========================================
// ВСПОМОГАТЕЛЬНЫЕ СИСТЕМНЫЕ ФУНКЦИИ ИИ И БРАУЗЕРА
//==========================================
const fs = require('fs');
const path = require('path'); 

/** 

* Вспомогательная функция для загрузки сессии Авито/Юлы
* Используется, чтобы бесплатно обходить капчу и авторизацию
*/
async function loadBrowserSession(page) {
const cookiesPath = path.join(__dirname, 'cookies.json');
try {
if (fs.existsSync(cookiesPath)) {
const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
const cookies = JSON.parse(cookiesData);
if (cookies && cookies.length > 0) {
console.log('🥷 Обнаружены сохраненные куки. Загружаем сессию...');
await page.setCookie(...cookies);
return true;
}
}
console.log('⚠️ Файл cookies.json пуст или отсутствует. Бот откроет чистую страницу.');
return false;
} catch (error) {
console.error('❌ Ошибка при загрузке cookies.json:', error.message);
return false;
}
}

/** 

* Главный партизанский модуль интеграции
* Берет текст от DeepSeek и отправляет в чат площадки, полностью имитируя человека
*/
async function executeInvisibleHaggle(page, targetUrl, aiArgument) {
try {
console.log(📡 Переходим на страницу лота: ${targetUrl});
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }); 

console.log('👀 Имитируем чтение описания товара...');
await humanScroll(page);
await delay(Math.floor(Math.random() * 1500) + 1000); 

const chatButtonSelector = 'button[data-marker="messenger-button/button"], button:has-text("Написать")'; 

if (await page.$(chatButtonSelector)) {
console.log('🖱️ Клик по кнопке открытия чата...');
await page.click(chatButtonSelector);
await delay(Math.floor(Math.random() * 2000) + 1500); 

const inputSelector = 'textarea[placeholder*="Напишите"], data-marker="chat-input"'; 

console.log('✍️ ИИ начинает скрытный ввод аргумента...');
await humanType(page, inputSelector, aiArgument);
await delay(Math.floor(Math.random() * 1000) + 500); 

console.log('🚀 Сообщение подготовлено к отправке продавцу!');
return { success: true, message: 'Аргумент успешно напечатан!' };
} else {
console.log('❌ Кнопка чата не найдена на странице.');
return { success: false, error: 'Кнопка чата не найдена' };
}
} catch (error) {
console.error('❌ Сбой партизанского модуля автоматизации:', error.message);
return { success: false, error: error.message };
}
}

// Инициализация базы данных Firestore
const db = admin.firestore();
// Инициализация ИИ DeepSeek (через OpenAI SDK)
const openai = new OpenAI({
baseURL: 'https://deepseek.com', // Экономичный и мощный DeepSeek
apiKey: process.env.DEEPSEEK_API_KEY   // Берем ключ из настроек Render
}); 

// Инициализация бота
const MY_BOT_TOKEN = '8982856560:AAEbZKCsfF4co_Fyy3IdTlG6-USxzVnTVmc';
const bot = new Telegraf(MY_BOT_TOKEN);
const TELEGRAM_WEBHOOK_PATH = /webhook/${MY_BOT_TOKEN};

// Настройка очередей (Rate Limiting)
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1500,
  highWater: 50,
  strategy: Bottleneck.strategy.LEAK
});

// === ОБРАБОТЧИКИ КОМАНД ===

bot.start(async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const firstName = ctx.from.first_name || 'Пользователь';
    const welcomeText = `Привет, ${firstName}! 🧠\n\nОтправьте мне ссылку на товар (Авито/WB/Ozon) или опишите ситуацию. Настоящий ИИ составит убойный аргумент для торга и собьет цену!`;
    await limiter.schedule(() => ctx.reply(welcomeText));
  } catch (error) {
    console.error("Ошибка в /start:", error.message);
  }
});

bot.help(async (ctx) => {
  try {
    const helpMessage = `📖 *Справка по использованию бота*\n\nОтправьте боту ссылку на вещь или предложение. ИИ проанализирует её и выдаст скрипт переговоров.\n\n*Наша бизнес-модель:* Бот торгуется бесплатно, но берет комиссию 30% строго от сэкономленной для вас суммы!`;
    await limiter.schedule(() => ctx.replyWithMarkdown(helpMessage));
  } catch (error) {
    console.error('Ошибка в /help:', error.message);
  }
});

// РАБОТА С РЕАЛЬНЫМ ИИ DEEPSEEK
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  try {
    await limiter.schedule(async () => {
      // Сообщаем пользователю, что ИИ включился в работу
      const statusMessage = await ctx.reply(`🧠 ИИ DeepSeek генерирует стратегию торга... Подождите несколько секунд.`);

      // Промпт-инструкция для ИИ
      const systemInstruction = 
        "Ты — профессиональный ИИ-переговорщик и жесткий закупщик. Твоя задача — проанализировать запрос пользователя (товар или ссылку) " +
        "и составить психологически выверенный, аргументированный скрипт торга для снижения цены. " +
        "Используй реальные живые зацепки: самовывоз, оплата наличными прямо сейчас, мелкие дефекты, рыночная переоцененность. " +
        "Ответ выдай СТРОГО в формате JSON с полями:\n" +
        "1. estimatedPrice (средняя цена товара числом, например 15000)\n" +
        "2. targetPrice (целевая цена после торга числом, например 13000)\n" +
        "3. argument (один мощный текст сообщения продавцу)";

      // Запрос к нейросети
      const completion = await openai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userText }
        ],
        response_format: { type: 'json_object' } // Просим ИИ ответить строго в JSON
      });

      // Парсим ответ от ИИ
      const aiData = JSON.parse(completion.choices[0].message.content);
      
      // Считаем экономику (30% нашей комиссии)
      const savedMoney = aiData.estimatedPrice - aiData.targetPrice;
      const ourCommission = Math.round(savedMoney * 0.30);

      const responseText = 
        `🤖 *Разбор от реального ИИ:* \n\n` +
        `💵 *Ориентировочная цена:* ${aiData.estimatedPrice} руб.\n` +
        `🎯 *Предлагаем продавцу:* ${aiData.targetPrice} руб.\n\n` +
        `🔥 *Ваша выгода:* ${savedMoney} руб.\n` +
        `💳 *Наша комиссия (30%):* ${ourCommission > 0 ? ourCommission : 0} руб.\n\n` +
        `💬 *Скрипт для отправки продавцу (скопируйте и отправьте):*\n` +
        `_"${aiData.argument}"_`;

      // Удаляем сообщение со статусом загрузки и присылаем финальный ответ ИИ
      try { await ctx.deleteMessage(statusMessage.message_id); } catch(e){}
      await ctx.replyWithMarkdown(responseText);

      // Пишем транзакцию в Firestore
      await db.collection('bids_history').add({
        chatId: chatId,
        userQuery: userText,
        savedMoney: savedMoney,
        commission: ourCommission,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch (error) {
    console.error('Ошибка при запросе к DeepSeek:', error.message);
    await ctx.reply('⚠️ Произошла заминка при связи с ИИ. Попробуйте отправить запрос еще раз.');
  }
});

// Интеграция с Express
app.use(bot.webhookCallback(TELEGRAM_WEBHOOK_PATH));

app.get('/', (req, res) => {
  res.send('Сервер торга MVP работает с реальным ИИ DeepSeek!');
});

// ЗАПУСК СЕРВЕРА И АВТОМАТИЧЕСКАЯ УСТАНОВКА ВЕБХУКА
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT} с ИИ-лимитером`);
  
  try {
    // Жестко фиксируем правильную и полную ссылку вашего сервера Render
    const absoluteServerUrl = 'https://ai-haggle-mvp-service.onrender.com';
    const webhookUrl = `${absoluteServerUrl}/webhook/${MY_BOT_TOKEN}`;
    
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`[Telegram] Вебхук окончательно обновлен на полный URL: ${webhookUrl}`);
  } catch (error) {
    console.error('[Telegram] Ошибка авто-установки вебхука:', error.message);
  }
});
