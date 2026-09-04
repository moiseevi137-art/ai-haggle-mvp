const express = require('express');
const admin = require('firebase-admin');
const app = express();

app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Надежная и чистая)
// ====================================================================
if (admin.apps.length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'haggle-bot-2026';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n')
        })
      });
      console.log("Firebase успешно инициализирован через раздельные переменные на Render.");
    } catch (error) {
      console.error("Ошибка при инициализации Firebase cert:", error);
    }
  } else {
    admin.initializeApp({ projectId: projectId });
    console.log(`Предупреждение: Ключи не найдены. Firebase запущен в ограниченном режиме для проекта ${projectId}`);
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

    // Записываем лог торга в новую коллекцию "haggles" в Firestore
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
