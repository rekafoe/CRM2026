import fs from 'fs'
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer'

const CHROME_PATH_FILE = process.env.PUPPETEER_EXECUTABLE_PATH_FILE?.trim()
  || '/usr/src/app/.chrome-path'

const CONTAINER_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
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
  '--disable-breakpad',
  '--disable-crash-reporter',
  '--disable-features=DBusSessionBus,TranslateUI',
] as const

const SYSTEM_CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
] as const

const DBUS_ENV_KEYS = ['DBUS_SESSION_BUS_ADDRESS', 'DBUS_SYSTEM_BUS_ADDRESS'] as const

function isExistingFile(path: string | undefined): path is string {
  return Boolean(path && fs.existsSync(path))
}

function isValidDbusAddress(value: string): boolean {
  return /^(unix:|tcp:|autolaunch:)/.test(value)
}

function readChromePathFromBuildFile(): string | undefined {
  if (!isExistingFile(CHROME_PATH_FILE)) return undefined
  const fromFile = fs.readFileSync(CHROME_PATH_FILE, 'utf8').trim()
  return isExistingFile(fromFile) ? fromFile : undefined
}

function resolveBundledChromiumPath(): string | undefined {
  const fromBuildFile = readChromePathFromBuildFile()
  if (fromBuildFile) return fromBuildFile

  try {
    const bundled = puppeteer.executablePath()
    return isExistingFile(bundled) ? bundled : undefined
  } catch {
    return undefined
  }
}

export function resolveChromiumExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
    || process.env.CHROME_BIN?.trim()
  if (isExistingFile(fromEnv)) return fromEnv

  const bundled = resolveBundledChromiumPath()
  if (bundled) return bundled

  for (const candidate of SYSTEM_CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }

  return fromEnv || undefined
}

export function buildPuppeteerLaunchEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of DBUS_ENV_KEYS) {
    const value = env[key]?.trim()
    if (!value || value === '/dev/null' || !isValidDbusAddress(value)) {
      delete env[key]
    }
  }
  return env
}

export function buildPuppeteerLaunchOptions(extraArgs: string[] = []): LaunchOptions {
  const executablePath = resolveChromiumExecutablePath()
  if (!executablePath) {
    throw new Error(
      'Chromium не найден. В Docker: npx puppeteer browsers install chrome.',
    )
  }
  return {
    headless: true,
    executablePath,
    env: buildPuppeteerLaunchEnvironment(),
    args: [...CONTAINER_CHROME_ARGS, ...extraArgs],
  }
}

export async function launchPuppeteerBrowser(extraArgs: string[] = []): Promise<Browser> {
  const primary = buildPuppeteerLaunchOptions(extraArgs)
  const candidates = [primary.executablePath, resolveBundledChromiumPath()].filter(
    (value, index, list): value is string => Boolean(value && list.indexOf(value) === index),
  )

  let lastError: unknown
  for (const executablePath of candidates) {
    try {
      console.info(`[puppeteer] launching Chrome at ${executablePath}`)
      return await puppeteer.launch({
        ...primary,
        executablePath,
      })
    } catch (error) {
      lastError = error
      console.warn(`[puppeteer] launch failed for ${executablePath}`, error)
    }
  }

  throw lastError
}
