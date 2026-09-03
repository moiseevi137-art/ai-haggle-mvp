const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE
// ====================================================================
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase успешно инициализирован через Service Account на Render.");
  } else {
    admin.initializeApp();
    console.log("Firebase инициализирован в тестовом режиме / по умолчанию.");
  }
}

const db = admin.firestore();

// ====================================================================
// ВСПУМОГАТЕЛЬНАЯ ФУНКЦИЯ: АЛГОРИТМ ТОРГА (2 ВОЛНЫ)
// ====================================================================
function calculateHaggleStep(initialPrice, currentWave, currentOffer) {
  // Минимальная цена, ниже которой бот падать не имеет права (80% от начальной стоимости)
  const floorPrice = initialPrice * 0.80; 
  let targetPrice = initialPrice;
  let counterOffer = 0;

  if (currentWave === 1) {
    // Волна 1: Пробуем сбить цену максимум на 7%
    targetPrice = initialPrice * 0.93;
    // Предлагаем цену: берем предложение покупателя/продавца, но не опускаемся ниже/выше разумного
    counterOffer = Math.max(targetPrice, currentOffer);
  } else if (currentWave === 2) {
    // Волна 2: Финальный шаг, уступаем до 12%
    targetPrice = initialPrice * 0.88;
    counterOffer = Math.max(targetPrice, currentOffer);
  } else {
    // Если волны закончились, держим жесткий пол цены
    counterOffer = floorPrice;
  }

  // Финальная страховка: робот никогда не назовет цену ниже floorPrice
  if (counterOffer < floorPrice) {
    counterOffer = floorPrice;
  }

  return Math.round(counterOffer);
}

// ====================================================================
// 2. МАРШРУТЫ ДЛЯ СЕРВЕРА
// ====================================================================

// Пинг от cron-job.org
app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает!');
});

// Обработка входящих сообщений/торга
app.post('/webhook', async (req, res) => {
  try {
    const { chatId, initialPrice, currentWave, currentOffer } = req.body;

    // Валидация входящих данных
    if (!chatId || !initialPrice || !currentWave || !currentOffer) {
      return res.status(400).send('Отсутствуют обязательные параметры: chatId, initialPrice, currentWave, currentOffer');
    }

    // Вычисляем наше встречное предложение по алгоритму
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

    // Автоматическая запись шага торга в Firebase Firestore
    const docRef = await db.collection('haggle_logs').add(logData);
    console.log(`[Торг] Шаг записан в Firestore. ID документа: ${docRef.id}`);

    // Отправляем результат обратно (в будущем этот ответ пойдет в мессенджер)
    res.status(200).json({
      success: true,
      message: `Робот рассчитал цену для Волны ${currentWave}`,
      recommendedOffer: ourPriceOffer
    });

  } catch (error) {
    console.error("Ошибка при обработке вебхука торга:", error);
    res.sendStatus(500);
  }
});

// ====================================================================
// 3. ЗАПУСК СЕРВЕРА
// ====================================================================
app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер успешно слушает порт ${port} на хосте 0.0.0.0`);
});
