# Используем официальный образ Node.js
FROM node:20-slim

# Устанавливаем системные библиотеки Linux для Chrome
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Создаем рабочую директорию
WORKDIR /app

# Копируем манифест зависимостей
COPY package.json ./

# Устанавливаем npm-пакеты, игнорируя любые сломанные postinstall скрипты
RUN npm install --ignore-scripts

# Принудительно очищаем кэш puppeteer и скачиваем чистую стабильную версию Chrome
RUN npx puppeteer browsers clear && npx puppeteer browsers install chrome

# Копируем остальные файлы проекта (index.js, index.html, .puppeteerrc.cjs)
COPY . .

# Открываем порт
EXPOSE 10000

# Запуск приложения
CMD ["node", "index.js"]
