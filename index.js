const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 10000;

// Парсинг JSON-тел запросов (критично для мессенджеров)
app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Без дублей)
// ====================================================================
if (admin.apps.length === 0) {
  // На Render передаем ключ сервисного аккаунта через переменную окружения FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase успешно инициализирован через Service Account на Render.");
  } else {
    // Резервный вариант (например, для локального тестирования в Test Mode)
    admin.initializeApp();
    console.log("Firebase инициализирован в тестовом режиме / по умолчанию.");
  }
}

const db = admin.firestore();

// ====================================================================
// 2. МАРШРУТЫ ДЛЯ СЕРВЕРА (Эндпоинты)
// ====================================================================

// Сюда стучится cron-job.org каждые 5 минут
app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает!');
});

// Сюда будут приходить сообщения от Avito/Instagram (когда настроим вебхуки)
app.post('/webhook', async (req, res) => {
  try {
    const messageData = req.body;
    
    // ВСТАВЬТЕ СЮДА ВАШУ ФУНКЦИЮ МАТЕМАТИЧЕСКОГО ТОРГА (Волна 1 и Волна 2):
    // Пример записи шага торга в Firestore:
    // await db.collection('haggle_logs').add({
    //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
    //   data: messageData
    // });

    res.sendStatus(200);
  } catch (error) {
    console.error("Ошибка при обработке вебхука:", error);
    res.sendStatus(500);
  }
});

// ====================================================================
// 3. ЗАПУСК ЕДИНОГО СЕРВЕРА (Только один вызов listen на весь проект!)
// ====================================================================
app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер успешно слушает порт ${port} на хосте 0.0.0.0`);
});
