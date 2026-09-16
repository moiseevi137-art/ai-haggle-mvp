# ИСПОЛЬЗУЕМ ОФИЦИАЛЬНЫЙ ОБРАЗ PUPPETEER СО ВСТРОЕННЫМ CHROME
FROM ghcr.io/puppeteer/puppeteer:22.12.1

# Переключаемся под администратора для настройки папки
USER root

# Создаем рабочую папку в контейнере
WORKDIR /app

# Копируем файлы конфигурации проекта
COPY package*.json ./

# Устанавливаем библиотеки без запуска кастомных скриптов скачивания
RUN npm ci --omit=dev

# Копируем весь остальной код проекта (включая index.js и humanEmulation.js)
COPY . .

# Возвращаем безопасного пользователя puppeteer
USER pptruser

# Открываем порт шлюза для Render
EXPOSE 10000

# Запускаем нашего бота AI HAGGLE PRO
CMD ["node", "index.js"]
