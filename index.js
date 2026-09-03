const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Прямой ключ)
// ====================================================================
if (admin.apps.length === 0) {
  const serviceAccount = {
    "type": "service_account",
    "project_id": "my-replit-app-5d3e3",
    "private_key_id": "8accfe5ef70245bd0abd3cfad39f02b5c3e7243b",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCddUgbCW+JSIzp\ndpRyej0GBFWXeUe9Ri6U7xVwWBBagV+pc1TW5bdKLY7PWCDE6wS7JKr3c27ZpFZv\nOYf9ANszplMDJ8MxL9a70hZ/K89lFwd1XFWEEUA9+B0Qi6Nte3teiS6zwDRlZlz/\nTjg7E2Js04uRBjyM5UkB+oOTa1VoLUEX16yc716h1kLng9SDrQC+GnrYa2m5u8Xy\ngeQ3LnfI4fkJmsVSqSko+c93wLTciZ8y4R+2DCmVvMmTkMWz3SukL/kOJoo23A1j\nxhThyHkAyFs0+n5sro7nvhv0NqAom/x8PveIm0qR9T8P2gGWQOhB+RQn0BZ6qYAG\njT1FAZglAgMBAAECggEAGIkB51SdEKNBcc+MahoqEBn0zFmVmCSrdYGbsZnHUpL+\nOQVDnwjEesaGjkCJOqX0YsTf7xcJmthEr6gjTIUpou6z2LYFcFCoATRHVSGae4IP\nI3ZzzNRzUjSrMrzPhmvLWXu+zzuP7oz4yL+De5EVsSd1g++Y18uSiMBkaEA9WrIT\n8PtMmI/OApYNMetD/PGMc5yi7WW70OlvCnPLTaA17SeHFLIfVc3UPe1JrfzqIn+G\ncKyxD5Tbn4P0GPA7zyC1TIk5SdgeKssLCXRG0eaVdbden7fTy8zRuJA9KKQhDv66\nUwWaTMfnMC06k1gU74WLuz2nP8k5W9qAnurmkWgtMQKBgQDNJnivKkvniS0N/RsH\nfORm7iAEIKyj+zRxGsXewhAyZQ7/PmLcqTxb/Sf+807aakiuRYz6nAAbZehOoKk5\YT+0MCZe4DAUdHS3iiZDinEZ1XP5U7BvPSi3EdzcGDnioMZwq7NNTgdOEjiHVWQx\nPN6ugX5rC5jMCpnVujBXFNYqcwKBgQDEfJIXHxmfv2pXHCJCpJOe/2F7YTEnpVQX\nraYEa022Q7Mu1VDgV0VxU31kvaLiYfe3ql4HUD9QwnEEmlqk5+kQChWwkGWQQlK7\nt1kEbSp3BujHlLf41XYP2qTXWf/oEZ3CuJT1EuofZHO/1hG7s9576cHkoxKpeHza\nF+51xekVBwKBgA4ghRUC46E5GAorkM3uMshHw5qlKV5NcSoMvu19DaJ6xRKcmDA7\n0zU+dJ+g36A4y3J8xZ2IWpWIafvoIl8aLEnbOvkzlPwDnPn6oHHsOaeexFK6CZ9P\nZdtddokNfgb2LVQa7sj3A5fDt3LSVYjyeR8pOaxjaw05+af3H1cPz0OzAoGAWEnB\nOzJ2SRmxpsK1gkyBKIiIPPBHLhFT3+/fEU1F9gglk322gZe1VF63kXTEpARxUs3y\nwkaErL0yG2dgI4kxaEufw16exFuI4WBZV2vWEPXB0yw4Hk+MZUNRnpKKMrT3tm9K\nP3ToToLMn/6IqVcBOZynyxybXhsNvtHSDImJWjECgYAKkH6IEMCClb/2CLNgU5gs\n9SiDCg2BomtBNFQN+JHGr+Pizh34u27Qpk7ehbFU7Z0F7XRMfw/vJKyO0q6SF4Fh\nO2zkjjUs/mmcyOrA/VJNYN3hyqPzPL8oDPS7yuq5p+5sBsZJ8eUAFdVPQYt345tW\nMaG7vQeXouiH7A9nbhCdfQ==\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-fbsvc@://gserviceaccount.com",
    "client_id": "113378125103630781907",
    "auth_uri": "https://google.com",
    "token_uri": "https://googleapis.com",
    "auth_provider_x509_cert_url": "https://googleapis.com",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40://gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase успешно инициализирован напрямую через код.");
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

// Сюда стучится cron-job.org каждые 5 минут
app.get('/', (req, res) => {
  console.log(`[${new Date().toISOString()}] Ping от cron-job.org получен!`);
  res.send('AI-Haggle Bot успешно запущен и работает!');
});

// Сюда будут приходить сообщения от Avito/Instagram
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

    // Автоматическая запись шага торга в Firebase Firestore
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
