import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import express, { Request, Response } from 'express'
import { compressionMiddleware } from '../middleware/compression'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x11, 0x22, 0x33, 0x44])

type RawResponse = {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

function rawGet(port: number, urlPath: string, acceptEncoding = 'gzip, deflate, br'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method: 'GET',
        headers: { 'accept-encoding': acceptEncoding },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function expectRawJpeg(res: RawResponse): void {
  expect(res.status).toBe(200)
  expect(res.headers['content-encoding']).toBeUndefined()
  expect(res.body.equals(JPEG)).toBe(true)
}

describe('compressionMiddleware', () => {
  let server: http.Server
  let port = 0
  let jpegPath = ''

  beforeAll(async () => {
    jpegPath = path.join(os.tmpdir(), `template-asset-${process.pid}.jpg`)
    fs.writeFileSync(jpegPath, JPEG)

    const app = express()
    app.use(compressionMiddleware)
    const sendJpeg = (_req: Request, res: Response) => {
      res.type('image/jpeg')
      res.sendFile(jpegPath)
    }

    app.get('/api/design-templates/public/:id/assets/:fileId/content', sendJpeg)
    app.get('/api/design-templates/public/:id/assets/:fileId/thumb', sendJpeg)
    app.get('/api/design-templates/:id/assets/:fileId/content', sendJpeg)
    app.get('/api/design-assets/public/:id/content', sendJpeg)
    app.get('/api/design-assets/:id/thumb', sendJpeg)
    app.get('/api/public-editor/drafts/:token/files/:fileId/content', sendJpeg)
    app.get('/api/design-fonts/public/:id/content', sendJpeg)
    app.get('/api/knowledge/assets/:id/content', sendJpeg)
    app.get('/api/uploads/photo.jpg', sendJpeg)
    app.get('/api/design-templates/public/:id', (_req, res) => {
      res.json({ id: 152, name: 'ПАПА' })
    })
    app.get('/api/text', (_req, res) => {
      res.type('text/plain')
      res.send('hello-editor')
    })
    app.get('/api/buffer-image', (_req, res) => {
      res.type('image/jpeg')
      res.send(JPEG)
    })

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no port')
    port = addr.port
  })

  afterAll(async () => {
    fs.rmSync(jpegPath, { force: true })
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('отдаёт JPEG шаблона 152 без Content-Encoding: gzip', async () => {
    const res = await rawGet(port, '/api/design-templates/public/152/assets/29/content')
    expectRawJpeg(res)
    expect(String(res.headers['content-type'] || '')).toContain('image/jpeg')
  })

  it('не помечает gzip-ом thumb и админский content того же шаблона', async () => {
    expectRawJpeg(await rawGet(port, '/api/design-templates/public/152/assets/32/thumb'))
    expectRawJpeg(await rawGet(port, '/api/design-templates/152/assets/30/content?cache=1'))
  })

  it('не помечает gzip-ом клипарт и вставку фото из черновика', async () => {
    expectRawJpeg(await rawGet(port, '/api/design-assets/public/5/content'))
    expectRawJpeg(await rawGet(port, '/api/design-assets/5/thumb'))
    expectRawJpeg(await rawGet(port, '/api/public-editor/drafts/tok/files/94/content'))
  })

  it('оставляет шрифты, uploads и прочий sendFile без ложного gzip', async () => {
    expectRawJpeg(await rawGet(port, '/api/design-fonts/public/1/content'))
    expectRawJpeg(await rawGet(port, '/api/uploads/photo.jpg'))
    expectRawJpeg(await rawGet(port, '/api/knowledge/assets/7/content'))
  })

  it('по-прежнему жмёт JSON шаблона и текст', async () => {
    const json = await rawGet(port, '/api/design-templates/public/152')
    expect(json.status).toBe(200)
    expect(json.headers['content-encoding']).toBe('gzip')
    expect(json.body.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))).toBe(true)
    expect(JSON.parse(zlib.gunzipSync(json.body).toString('utf8'))).toEqual({ id: 152, name: 'ПАПА' })

    const text = await rawGet(port, '/api/text')
    expect(text.headers['content-encoding']).toBe('gzip')
    expect(zlib.gunzipSync(text.body).toString('utf8')).toBe('hello-editor')
  })

  it('жмёт res.send(buffer) валидным gzip, а не сырыми байтами под заголовком', async () => {
    const res = await rawGet(port, '/api/buffer-image')
    expect(res.status).toBe(200)
    expect(res.headers['content-encoding']).toBe('gzip')
    expect(zlib.gunzipSync(res.body).equals(JPEG)).toBe(true)
  })

  it('без Accept-Encoding отдаёт JSON как есть', async () => {
    const res = await rawGet(port, '/api/design-templates/public/152', 'identity')
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(JSON.parse(res.body.toString('utf8'))).toEqual({ id: 152, name: 'ПАПА' })
  })
})
