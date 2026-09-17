# Базовый образ с актуальной версией Puppeteer и Chromium
FROM ghcr.io/puppeteer/puppeteer:25.11.0

# Переключаемся на root для настройки рабочей директории и копирования файлов
USER root

# Создаем рабочую директорию внутри контейнера
WORKDIR /usr/src/app

# Копируем файлы конфигурации npm
COPY package*.json ./

# Устанавливаем зависимости проекта (включая чистку кеша для экономии памяти)
RUN npm ci --only=production && npm cache clean --force

# Копируем весь исходный код проекта
COPY . .

# Возвращаем безопасного пользователя pptruser, который идет вместе с образом Puppeteer
USER pptruser

# Команда для запуска приложения (в Render поля Build и Start оставляем ПУСТЫМИ)
CMD ["node", "index.js"]
