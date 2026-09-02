app.post('/api/negotiate', async (req, res) => {
  const { userId, userMessage, currentWave, itemPrice } = req.body;

  // Исходные данные товара (если не переданы, ставим базовые)
  const initialPrice = Number(itemPrice) || 5000; 
  const minAllowedPrice = initialPrice * 0.80; // Минимальный порог: не отдаем со скидкой более 20%
  
  let botResponse = "";
  let nextWave = currentWave || 1;
  
  // Пытаемся вытащить цифру (предложение покупателя) из его сообщения
  const userOfferMatch = userMessage.match(/\d+/);
  const userOffer = userOfferMatch ? Number(userOfferMatch[0]) : null;

  if (nextWave === 1) {
    // ПЕРВАЯ ВОЛНА ТОРГА
    const counterOffer1 = Math.round(initialPrice * 0.93); // Предлагаем скидку 7%
    
    if (userOffer && userOffer >= counterOffer1) {
      botResponse = `Отличное предложение! Я согласен на ${userOffer} руб. Оформляем сделку?`;
      nextWave = 3; // Сделка закрыта
    } else {
      botResponse = `Привет! Предложенная цена маловата. Отдать за столько не могу, но готов немного уступить. Как насчет ${counterOffer1} руб.?`;
      nextWave = 2; // Переходим ко второй волне
    }
  } else if (nextWave === 2) {
    // ВТОРАЯ ВОЛНА ТОРГА (Финальный раунд)
    const counterOffer2 = Math.round(initialPrice * 0.88); // Наш крайний шаг: скидка 12%
    
    if (userOffer && userOffer >= minAllowedPrice) {
      botResponse = `Ладно, ваше предложение в ${userOffer} руб. проходит по моему лимиту. По рукам, забирайте!`;
      nextWave = 3;
    } else {
      botResponse = `Слушайте, ${counterOffer2} руб. — это моя самая последняя цена. Ниже продавать совсем невыгодно. Берете?`;
      nextWave = 3; // Торг окончен в любом случае
    }
  } else {
    // ТОРГ УЖЕ ОКОНЧЕН
    botResponse = `Мы уже завершили обсуждение этого товара. Напишите по поводу других объявлений!`;
  }

  // Сохраняем историю торга в Firebase Firestore
  if (db) {
    try {
      await db.collection('haggles').add({
        userId: userId || "guest",
        userMessage,
        botResponse,
        wave: currentWave,
        finalPrice: userOffer || initialPrice,
        timestamp: new Date()
      });
    } catch (e) {
      console.error("Ошибка записи в Firestore:", e);
    }
  }

  // Возвращаем ответ фронтенду
  res.json({ text: botResponse, nextWave });
});
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// Базовый ответ для Render и cron-job.org
app.get('/', (req, res) => {
  res.send('AI-Haggle Bot успешно запущен и работает!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер прослушивает порт ${port}`);
});

// === НИЖЕ ДОЛЖЕН ИДТИ ВАШ ТЕКУЩИЙ КОД ТОРГА И FIREBASE ===
// (Ваш код из волны 1, волны 2 и подключения к Firestore...)
