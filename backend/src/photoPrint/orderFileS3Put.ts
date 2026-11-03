import { createHash, createHmac } from 'crypto'

type S3Config = {
  endpoint: URL
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  forcePathStyle: boolean
}

const SERVICE = 's3'
const MULTIPART_PART_BYTES = 8 * 1024 * 1024
const SINGLE_PUT_MAX_BYTES = 32 * 1024 * 1024

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} не настроен`)
  return value
}

function s3Config(): S3Config {
  return {
    endpoint: new URL(requiredEnv('ORDER_FILES_S3_ENDPOINT')),
    bucket: requiredEnv('ORDER_FILES_S3_BUCKET'),
    region: process.env.ORDER_FILES_S3_REGION?.trim() || 'us-east-1',
    accessKeyId: requiredEnv('ORDER_FILES_S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('ORDER_FILES_S3_SECRET_ACCESS_KEY'),
    sessionToken: process.env.ORDER_FILES_S3_SESSION_TOKEN?.trim() || undefined,
    forcePathStyle: process.env.ORDER_FILES_S3_FORCE_PATH_STYLE !== 'false',
  }
}

function downloadTokenSecret(): string {
  return process.env.ORDER_FILES_DOWNLOAD_TOKEN_SECRET?.trim() || requiredEnv('WEBSITE_ORDER_API_KEY')
}

function amzTimestamp(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amzDate: iso, dateStamp: iso.slice(0, 8) }
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function signingKey(config: S3Config, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, config.region)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function objectUrl(config: S3Config, key: string): URL {
  const url = new URL(config.endpoint.toString())
  const encodedKey = encodeKeyPath(key)
  if (config.forcePathStyle) {
    url.pathname = `/${config.bucket}/${encodedKey}`
  } else {
    url.hostname = `${config.bucket}.${url.hostname}`
    url.pathname = `/${encodedKey}`
  }
  return url
}

function canonicalUri(config: S3Config, key: string): string {
  const encodedKey = encodeKeyPath(key)
  return config.forcePathStyle ? `/${config.bucket}/${encodedKey}` : `/${encodedKey}`
}

function credentialScope(config: S3Config, dateStamp: string): string {
  return `${dateStamp}/${config.region}/${SERVICE}/aws4_request`
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function safeFileKeyPart(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export function orderFileS3Key(crmOrderId: number, filename: string): string {
  const folder = filename.toLowerCase().endsWith('.pdf') ? 'production' : 'processed'
  return `orders/${crmOrderId}/${folder}/${safeFileKeyPart(filename)}`
}

function publicBaseUrl(): string {
  return (process.env.ORDER_FILES_PUBLIC_BASE_URL?.trim() || 'https://printcore.by').replace(/\/+$/, '')
}

function orderFileDownloadToken(crmOrderId: number, key: string): string {
  return createHmac('sha256', downloadTokenSecret()).update(`${crmOrderId}:${key}`, 'utf8').digest('hex')
}

export function createOrderFileCrmDownloadUrl(crmOrderId: number, filename: string): string {
  const key = orderFileS3Key(crmOrderId, filename)
  const url = new URL(`/api/orders/files/${crmOrderId}/${encodeURIComponent(filename)}`, `${publicBaseUrl()}/`)
  url.searchParams.set('token', orderFileDownloadToken(crmOrderId, key))
  return url.toString()
}

function authorizationForRequest(params: {
  config: S3Config
  method: 'PUT' | 'POST' | 'DELETE'
  key: string
  query: string
  payloadHash: string
  mime: string
  amzDate: string
  dateStamp: string
  host: string
}): string {
  const { config, method, key, query, payloadHash, mime, amzDate, dateStamp, host } = params
  const tokenHeader = config.sessionToken ? `x-amz-security-token:${config.sessionToken}\n` : ''
  const signedHeaders = config.sessionToken
    ? 'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token'
    : 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders =
    `content-type:${mime}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    tokenHeader
  const canonicalRequest = [method, canonicalUri(config, key), query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = credentialScope(config, dateStamp)
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(config, dateStamp)).update(stringToSign, 'utf8').digest('hex')
  return `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

async function s3SignedRequest(params: {
  config: S3Config
  method: 'PUT' | 'POST' | 'DELETE'
  key: string
  query?: URLSearchParams
  body?: Buffer
  mime: string
}): Promise<Response> {
  const body = params.body ?? Buffer.alloc(0)
  const payloadHash = sha256Hex(body)
  const { amzDate, dateStamp } = amzTimestamp()
  const query = params.query ? canonicalQuery(params.query) : ''
  const url = objectUrl(params.config, params.key)
  if (query) url.search = query
  const headers: Record<string, string> = {
    Authorization: authorizationForRequest({
      config: params.config,
      method: params.method,
      key: params.key,
      query,
      payloadHash,
      mime: params.mime,
      amzDate,
      dateStamp,
      host: url.host,
    }),
    'Content-Type': params.mime,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
  }
  if (params.config.sessionToken) headers['X-Amz-Security-Token'] = params.config.sessionToken
  const payload = body.byteLength === 0 ? undefined : new Uint8Array(body)
  return fetch(url, { method: params.method, headers, body: payload })
}

async function uploadBufferSinglePut(config: S3Config, key: string, body: Buffer, mime: string): Promise<void> {
  const response = await s3SignedRequest({ config, method: 'PUT', key, body, mime })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text.slice(0, 800) || `S3 upload ${response.status} ${response.statusText}`)
  }
}

async function uploadBufferMultipart(config: S3Config, key: string, body: Buffer, mime: string): Promise<void> {
  const createResponse = await s3SignedRequest({
    config,
    method: 'POST',
    key,
    query: new URLSearchParams({ uploads: '' }),
    mime,
  })
  if (!createResponse.ok) {
    const text = await createResponse.text().catch(() => '')
    throw new Error(text.slice(0, 800) || `S3 multipart init ${createResponse.status}`)
  }
  const createXml = await createResponse.text()
  const uploadId = createXml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1]
  if (!uploadId) throw new Error('S3 multipart init: нет UploadId')

  const parts: Array<{ partNumber: number; etag: string }> = []
  try {
    for (let offset = 0, partNumber = 1; offset < body.length; partNumber += 1) {
      const chunk = body.subarray(offset, Math.min(offset + MULTIPART_PART_BYTES, body.length))
      offset += chunk.length
      const partResponse = await s3SignedRequest({
        config,
        method: 'PUT',
        key,
        query: new URLSearchParams({ partNumber: String(partNumber), uploadId }),
        body: Buffer.from(chunk),
        mime: 'application/octet-stream',
      })
      if (!partResponse.ok) {
        const text = await partResponse.text().catch(() => '')
        throw new Error(text.slice(0, 800) || `S3 multipart part ${partNumber} ${partResponse.status}`)
      }
      const etag = partResponse.headers.get('etag')
      if (!etag) throw new Error(`S3 multipart part ${partNumber}: нет ETag`)
      parts.push({ partNumber, etag })
    }

    const completeXml =
      '<CompleteMultipartUpload>' +
      parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`).join('') +
      '</CompleteMultipartUpload>'
    const completeResponse = await s3SignedRequest({
      config,
      method: 'POST',
      key,
      query: new URLSearchParams({ uploadId }),
      body: Buffer.from(completeXml),
      mime: 'application/xml',
    })
    if (!completeResponse.ok) {
      const text = await completeResponse.text().catch(() => '')
      throw new Error(text.slice(0, 800) || `S3 multipart complete ${completeResponse.status}`)
    }
  } catch (error) {
    await s3SignedRequest({
      config,
      method: 'DELETE',
      key,
      query: new URLSearchParams({ uploadId }),
      mime: 'application/octet-stream',
    }).catch(() => undefined)
    throw error
  }
}

export async function uploadOrderPdfToS3(params: {
  crmOrderId: number
  filename: string
  body: Buffer
}): Promise<{ bucket: string; key: string; url: string; size: number; checksum: string }> {
  const config = s3Config()
  const key = orderFileS3Key(params.crmOrderId, params.filename)
  const checksum = `sha256:${sha256Hex(params.body)}`
  if (params.body.length > SINGLE_PUT_MAX_BYTES) {
    await uploadBufferMultipart(config, key, params.body, 'application/pdf')
  } else {
    await uploadBufferSinglePut(config, key, params.body, 'application/pdf')
  }
  return {
    bucket: config.bucket,
    key,
    url: createOrderFileCrmDownloadUrl(params.crmOrderId, params.filename),
    size: params.body.byteLength,
    checksum,
  }
}
