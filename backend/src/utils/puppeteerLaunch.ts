import fs from 'fs'
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer'

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

function resolveBundledChromiumPath(): string | undefined {
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

  for (const candidate of SYSTEM_CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }

  const bundled = resolveBundledChromiumPath()
  if (bundled) return bundled

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
      'Chromium не найден. В Docker: apt install chromium или npx puppeteer browsers install chrome.',
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
  const options = buildPuppeteerLaunchOptions(extraArgs)
  try {
    return await puppeteer.launch(options)
  } catch (error) {
    const executablePath = options.executablePath
    const bundled = resolveBundledChromiumPath()
    const canRetryWithBundled = Boolean(
      bundled
      && executablePath
      && bundled !== executablePath,
    )
    if (!canRetryWithBundled) throw error

    console.warn(
      `[puppeteer] launch failed with ${executablePath}, retrying bundled Chrome at ${bundled}`,
    )
    return puppeteer.launch({
      ...options,
      executablePath: bundled,
    })
  }
}
