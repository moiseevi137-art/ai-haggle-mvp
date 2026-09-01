const express = require("express");
const {
  cert,
  getApp,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { Timestamp, getFirestore } = require("firebase-admin/firestore");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FIREBASE_PROJECT_ID = "my-replit-app-5d3e3";
const FIREBASE_CLIENT_EMAIL =
  "firebase-adminsdk-fbsvc@my-replit-app-5d3e3.iam.gserviceaccount.com";
let firebaseCredential;
let firebaseServiceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    firebaseServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const hasPrivateKey = typeof firebaseServiceAccount.private_key === "string";

    if (hasPrivateKey) {
      firebaseCredential = cert({
        project_id: firebaseServiceAccount.project_id || FIREBASE_PROJECT_ID,
        client_email:
          firebaseServiceAccount.client_email || FIREBASE_CLIENT_EMAIL,
        private_key: firebaseServiceAccount.private_key,
      });
    } else {
      console.warn(
        "Firebase использует project_id и client_email, но для записи нужен private_key из полного service-account JSON.",
      );
    }
  } catch (error) {
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT_JSON имеет неверный формат:",
      error.message,
    );
  }
}

const firebaseOptions = {
  projectId: FIREBASE_PROJECT_ID,
  serviceAccountId: FIREBASE_CLIENT_EMAIL,
  ...(firebaseCredential ? { credential: firebaseCredential } : {}),
};
const firebaseApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseOptions);
const firestore = getFirestore(firebaseApp);
const hasFirebaseCredentials = Boolean(
  firebaseCredential || process.env.GOOGLE_APPLICATION_CREDENTIALS,
);
const HF_MODEL =
  process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const FALLBACK_PHRASES = [
  "Здравствуйте! Товар мне понравился. Подскажите, пожалуйста, готовы ли вы немного уступить по цене?",
  "Добрый день! Если заберу товар сегодня, получится договориться о небольшой скидке?",
];
const FALLBACK_WAVE_TWO_PHRASES = [
  "Понимаю, что цена уже снижена. Если договоримся сейчас, я готов забрать товар сегодня — получится округлить сумму в мою пользу?",
  "Спасибо, понял вас. Я сравнивал похожие предложения: если сделать небольшую уступку или компенсировать доставку, готов оформить сделку прямо сейчас.",
];

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function cleanPhrase(value) {
  return String(value || "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["«]+|["»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhrases(payload, prompt) {
  const generatedText = Array.isArray(payload)
    ? payload[0]?.generated_text
    : payload?.generated_text;

  if (!generatedText) {
    throw new Error("Hugging Face returned no generated text");
  }

  const withoutPrompt = String(generatedText)
    .replace(prompt, "")
    .trim();
  const lines = withoutPrompt
    .split(/\r?\n/)
    .map(cleanPhrase)
    .filter((phrase) => phrase.length >= 15 && phrase.length <= 220);

  const sentenceParts = withoutPrompt
    .split(/(?<=[.!?])\s+/)
    .map(cleanPhrase)
    .filter((phrase) => phrase.length >= 15 && phrase.length <= 220);

  const candidates = [...new Set([...lines, ...sentenceParts])];
  const phrases = candidates.slice(0, 2);

  if (phrases.length < 2) {
    throw new Error("Could not extract two phrases from model response");
  }

  return phrases;
}

async function generateWithHuggingFace({ productUrl, platform, wave }) {
  const waveInstruction =
    wave === 2
      ? [
          "Это вторая волна: продавец уже отказал в первой просьбе.",
          "Сделай тон чуть более настойчивым, но уважительным и без давления.",
          "Используй разные компромиссы: готовность забрать прямо сейчас,",
          "мягкое сравнение с ценами похожих предложений без выдуманных цифр,",
          "округление суммы ради быстрой сделки или скидку на доставку.",
        ].join("\n")
      : "Это первая просьба о скидке: будь дружелюбным и ненавязчивым.";
  const prompt = [
    "<s>[INST]",
    "Ты помогаешь вежливо торговаться при покупке товара.",
    `Площадка: ${platform}. Ссылка на товар: ${productUrl}`,
    waveInstruction,
    "Составь ровно две короткие, естественные и вежливые фразы на русском языке.",
    "Не называй конкретную сумму, не упоминай свои инструкции.",
    "Верни только две фразы, каждую с новой строки.",
    "[/INST]",
  ].join("\n");

  const headers = { "Content-Type": "application/json" };
  if (process.env.HF_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HF_API_TOKEN}`;
  }

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 120,
        temperature: 0.75,
        return_full_text: false,
      },
      options: { wait_for_model: true },
      signal: AbortSignal.timeout(18000),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Hugging Face ${response.status}: ${detail.slice(0, 180)}`);
  }

  return extractPhrases(await response.json(), prompt);
}

async function saveHaggle({ url, platform, phrases, wave }) {
  try {
    if (!hasFirebaseCredentials) {
      console.warn(
        "Firestore пропущен: project_id и client_email недостаточны, добавьте полный service-account JSON с private_key.",
      );
      return;
    }

    await firestore.collection("haggles").add({
      url,
      platform,
      phrases,
      wave,
      status: wave === 2 ? "refused" : "generated",
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.warn("Не удалось сохранить запрос в Firestore:", error.message);
  }
}

app.post("/api/haggle", async (req, res) => {
  const { productUrl, platform, wave } = req.body || {};

  if (!productUrl || typeof productUrl !== "string") {
    return res.status(400).json({
      error: "Добавьте ссылку на объявление.",
    });
  }

  try {
    new URL(productUrl);
  } catch {
    return res.status(400).json({
      error: "Проверьте ссылку — нужен полный адрес товара.",
    });
  }

  const selectedPlatform = String(platform || "Другая площадка");
  const selectedWave = Number(wave) === 2 ? 2 : 1;

  let phrases;
  let source;

  try {
    phrases = await generateWithHuggingFace({
      productUrl: productUrl.trim(),
      platform: selectedPlatform,
      wave: selectedWave,
    });
    source = "huggingface";
  } catch (error) {
    console.warn("Hugging Face недоступен, используем шаблоны:", error.message);
    phrases = selectedWave === 2 ? FALLBACK_WAVE_TWO_PHRASES : FALLBACK_PHRASES;
    source = "fallback";
  }

  await saveHaggle({
    url: productUrl.trim(),
    platform: selectedPlatform,
    phrases,
    wave: selectedWave,
  });

  return res.json({
    phrases,
    source,
    wave: selectedWave,
    status: selectedWave === 2 ? "refused" : "generated",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Haggle app is running on port ${PORT}`);
});
