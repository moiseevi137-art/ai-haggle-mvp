FROM ghcr.io/puppeteer/puppeteer:25.11.0

USER root

WORKDIR /usr/src/app

# Копируем конфигурационные файлы зависимостей
COPY package*.json ./

# Чистая установка всех зависимостей из package.json для гарантированной работы require()
RUN npm ci

# Копируем весь остальной код проекта
COPY . .

# Открываем порт для Express-сервера Render
EXPOSE 10000

# Переключаемся на безопасного пользователя puppeteer
USER pptruser

# Стартовая команда
CMD ["node", "index.js"]
