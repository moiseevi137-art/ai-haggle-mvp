const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// ====================================================================
// 1. ИНИЦИАЛИЗАЦИЯ FIREBASE (Свежий рабочий ключ)
// ====================================================================
if (admin.apps.length === 0) {
  const serviceAccount = {
    "type": "service_account",
    "project_id": "my-replit-app-5d3e3",
    "private_key_id": "619679fb59326618919d57ff1d7b8c1a1d39033e",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDUO1TuYtKP6zh2\nZhT7Ih/uLheedN/kXXA3yKQIlbTu1Afi6/DLtsFmG/bWZ2Cjh9UiwveiD6EH39Uk\nfYXctguNKQzlRKzvFeLknvqgXMoLA9KIXxt/CFPI2kk0QAhA13BCX4LUaQQ81SKI\nMlag+bH4ChYYjMYGR/hrrgC4yKw+MX0iz49a63Rjq428Ji74TXPeYX784F+hp055G\nO77X7/AI/tSUCZLXDZ1JqjOJWDm/uKQI4Y8q+RxQ/H7z+TcPXiCW7YLiZC8DeVfPl\nAILGchRHGqSaWaTYRK6c4EZq1ijg6vZlfnc504PQSZ9ifM8HAigQUIvSFxw/PVwz\nSDUm+PT5AgMBAAECgg+EAA7+55ALKNhFGobjIksMV407cdfJvPgkfLAJsULEsTV0L\nd/Ozq4rikbDZbwzLxTe8s8IpPlXzrJWZ80IQX5y2SYZkcZcBTbE08oA9wcrB0D3/\nYGSlsgcYoR9R/w1JLV62NJtGpAU9i5bhkZxUsWgZNbwxaWUSJTJi5q67TNbmjb6H\njA55/GNI+nbPZo1p+HkVIG8Qd5UgQRxT+6H3z1l8fZ8itRh1IlxHVbHOiKPXkIK1z\n+EhgPD/YaJVh9OBE9u9lJYLndppYduGZz/Ng4ecV+l6HHLM9PDIQFNqkZ1e0+d4v\n/OYe2s+Bu0vBJvrnWayLtud5W2m2/DlOXFtpnp4NyTQKBgQD88oTlYdtNfKHlIDSc\nPt83tD1it/OrULzFXuXoJj7rHikJVQLpa33id3b/F+dvEol+HacVssYEIBcJQsdea\nSU3Qat+FmITlzFlpgm8WP3UcRkV/auxjMpS/y8NtstJpdmY2JgD9BJUXZKH2YOoP\nbVX4mNCQChcZs2S7QLBDQC7zYwKBgQDWywWYVY5tzIGM2n3cyZH2GjI7L/WwZ3aY\nJq8thz4UH1+MRN+WGnVz/rWJ9uu5FMTHfOevWKZMXf8Esu1jmFIM4HO3M7mN6+vqL\nXmXsOHSg/yw9T+34k6LAP+NxKFOUnCn4ZaYSvsy08bYal6s0cGha+zU6VwPiGNxe\nqBv/Vca68wKBgQD52hg5d+qmZIiKCcDN4TC+FlRYUbnIK+z6zF0ubbDSj60bQbSp\nmnrzGuwY16TMSzP8rVbMoZ0BrqadDL4Z8XSCfT6i+N+1GZ/sH2HZSP9F2YfGb3hm\nF81kkkJM9+kju0Xvu2qU5R7B5NfbhpiMs7+Putgu1a7Ibud6zNBenpht6XwKBgQCz\n5EVDWCR5gRXfSf6vs4Izg60eNQSoQX7p3zxH/UTYxY3YhLZdmLtV8rVIXyz9TY+h\nI9NG4BAnVXIIFXMMPr45WqKPhRqa6Xn8z4q9VGsZi50ZnJ/J2JwuN1PdqdCWXlQo\nXbnBaVs5EFdb3jrdKGeoRLx+HqCjwa7Hk9Ra9urE+UQKBgQCns/jvjehDPd4BQQqz\nOaukh96zPqKwmHsO34p4Y2Q3fe0Tmrg/3SAxTpGje6K8cBrGDo4lzWoIGySQ7h5+C\n1l3FzTSfsCdE6QKhyDA0wCiR+1DWEv+8zclCPRQh2eKHVhPIWmiVSAzliNFeGbG9\nq7PUFdhTKLgBgw8HJaG4Ocsvqg==\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'),
    "client_email": "firebase-adminsdk-fbsvc@my-replit-app-5d3e3.iam.gserviceaccount.com",
    "client_id": "113378125103630781907",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40my-replit-app-5d3e3.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase успешно инициализирован через новый прямой ключ.");
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
