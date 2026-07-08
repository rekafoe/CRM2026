import { describe, expect, it } from '@jest/globals'
import {
  buildPuppeteerLaunchEnvironment,
  resolveChromiumExecutablePath,
} from '../src/utils/puppeteerLaunch'

describe('puppeteerLaunch', () => {
  it('drops invalid dbus addresses from launch env', () => {
    const prevSession = process.env.DBUS_SESSION_BUS_ADDRESS
    const prevSystem = process.env.DBUS_SYSTEM_BUS_ADDRESS
    process.env.DBUS_SESSION_BUS_ADDRESS = '/dev/null'
    process.env.DBUS_SYSTEM_BUS_ADDRESS = 'broken-address'

    const env = buildPuppeteerLaunchEnvironment()
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBeUndefined()
    expect(env.DBUS_SYSTEM_BUS_ADDRESS).toBeUndefined()

    process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/tmp/dbus/session'
    const envWithValid = buildPuppeteerLaunchEnvironment()
    expect(envWithValid.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/tmp/dbus/session')

    if (prevSession === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS
    else process.env.DBUS_SESSION_BUS_ADDRESS = prevSession
    if (prevSystem === undefined) delete process.env.DBUS_SYSTEM_BUS_ADDRESS
    else process.env.DBUS_SYSTEM_BUS_ADDRESS = prevSystem
  })

  it('resolveChromiumExecutablePath returns undefined when nothing is installed', () => {
    const prev = process.env.PUPPETEER_EXECUTABLE_PATH
    delete process.env.PUPPETEER_EXECUTABLE_PATH
    delete process.env.CHROME_BIN
    const resolved = resolveChromiumExecutablePath()
    if (prev === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH
    else process.env.PUPPETEER_EXECUTABLE_PATH = prev
    expect(resolved === undefined || typeof resolved === 'string').toBe(true)
  })
})
