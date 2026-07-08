import fs from 'fs'
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer'

const CONTAINER_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--mute-audio',
  '--font-render-hinting=none',
] as const

function resolveChromiumExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
    || process.env.CHROME_BIN?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return fromEnv || undefined
}

export function buildPuppeteerLaunchOptions(extraArgs: string[] = []): LaunchOptions {
  const executablePath = resolveChromiumExecutablePath()
  if (!executablePath) {
    throw new Error(
      'Chromium не найден. Установите chromium в образе Docker или задайте PUPPETEER_EXECUTABLE_PATH (/usr/bin/chromium).',
    )
  }
  return {
    headless: true,
    executablePath,
    args: [...CONTAINER_CHROME_ARGS, ...extraArgs],
  }
}

export async function launchPuppeteerBrowser(extraArgs: string[] = []): Promise<Browser> {
  // В Docker/Railway нет system dbus — иначе Chrome часто падает при старте.
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
    process.env.DBUS_SESSION_BUS_ADDRESS = '/dev/null'
  }
  return puppeteer.launch(buildPuppeteerLaunchOptions(extraArgs))
}
