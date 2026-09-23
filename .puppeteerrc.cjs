const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Скачиваем Chrome прямо в папку проекта, чтобы Render её не удалил
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
