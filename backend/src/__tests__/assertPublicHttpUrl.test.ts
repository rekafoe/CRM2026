import { assertPublicHttpUrl, assertPublicHost } from '../utils/assertPublicHttpUrl'

describe('assertPublicHttpUrl (SSRF guard)', () => {
  it('rejects empty / non-http schemes', async () => {
    await expect(assertPublicHttpUrl('')).rejects.toThrow(/Пустая/)
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/HTTP/)
    await expect(assertPublicHttpUrl('ftp://example.com/a')).rejects.toThrow(/HTTP/)
  })

  it('rejects loopback and link-local literals', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/latest/meta-data/')).rejects.toThrow(/недоступен/i)
    await expect(assertPublicHttpUrl('http://0.0.0.0/')).rejects.toThrow(/недоступен/i)
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/недоступен/i)
    await expect(assertPublicHttpUrl('http://localhost/admin')).rejects.toThrow(/недоступен/i)
  })

  it('rejects private RFC1918 ranges', async () => {
    await expect(assertPublicHttpUrl('http://10.0.0.5/secret')).rejects.toThrow(/недоступен/i)
    await expect(assertPublicHttpUrl('http://192.168.1.1/')).rejects.toThrow(/недоступен/i)
    await expect(assertPublicHttpUrl('http://172.16.0.1/')).rejects.toThrow(/недоступен/i)
  })

  it('allows public https hosts by hostname (dns may resolve)', async () => {
    // example.com — зарезервирован, резолвится в публичные адреса
    await expect(assertPublicHost('example.com')).resolves.toBeUndefined()
    const url = await assertPublicHttpUrl('https://example.com/path?x=1')
    expect(url).toMatch(/^https:\/\/example\.com\//)
  })
})
