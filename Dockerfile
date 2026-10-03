# Используем официальный легкий образ Node.js
FROM node:20-slim

# Устанавливаем системные библиотеки Linux для Chrome + ОБЯЗАТЕЛЬНЫЙ unzip
RUN apt-get update && apt-get install -y \
    unzip \
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

# Устанавливаем npm-пакеты, игнорируя тяжелые postinstall скрипты при сборке
RUN npm install --ignore-scripts

# Копируем остальные файлы проекта (index.js, index.html, .puppeteerrc.cjs, amvera.yml)
COPY . .

# Переменная окружения, указывающая Puppeteer использовать локальный кэш проекта
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Открываем порт
EXPOSE 10000

# Команда запуска: сначала быстро скачиваем/проверяем Chrome, затем сразу запускаем сервер
CMD npx puppeteer browsers install chrome && node index.js
