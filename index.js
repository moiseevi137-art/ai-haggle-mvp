const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Безопасная через Environment Variables)
// ====================================================================
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // Автоматически чиним переносы строк, которые ломает мобильный браузер
      const cleanKey = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n/g, '\n');
      const serviceAccount = JSON.parse(cleanKey);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase успешно инициализирован через переменные окружения на Render.");
    } catch (parseError) {
      console.error("Ошибка чтения JSON-ключа из настроек Render:", parseError);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
    console.log("Firebase инициализирован по умолчанию (переменная не найдена).");
  }
}

const db = admin.firestore();

// ====================================================================
// ВСПУМОГАТЕЛЬНАЯ ФУНКЦИЯ: АЛГОРИТМ ТОРГА (2 ВОЛНЫ)
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
// 2. МАРШРУТЫ ДЛЯ СЕРВЕРА (Эндпоинты)
// ====================================================================

app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает!');
});

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

    // Запись шага торга в Firebase Firestore
    const docRef = await db.collection('haggle_logs').add(logData);
    console.log(`[Торг] Шаг записан в Firestore. ID документа: ${docRef.id}`);

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
// 3. ЗАПУСК ЕДИНОГО СЕРВЕРА
// ====================================================================
app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер успешно слушает порт ${port} на хосте 0.0.0.0`);
});
