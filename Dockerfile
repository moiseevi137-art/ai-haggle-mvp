FROM ghcr.io/puppeteer/puppeteer:25.11.0USER rootWORKDIR /usr/src/appCOPY package*.json ./RUN npm ci --only=production && npm cache clean --forceCOPY . .USER pptruserCMD ["node", "index.js"]
