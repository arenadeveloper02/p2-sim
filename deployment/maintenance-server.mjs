import http from 'node:http'
import { readFile } from 'node:fs/promises'

const PORT = Number(process.env.PORT ?? '80')

const html = await readFile(new URL('./maintenance.html', import.meta.url), 'utf8')

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/api/health') {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ ok: false, maintenance: true }))
    return
  }

  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(html)
})

server.listen(PORT, '0.0.0.0', () => {
  // Intentionally no logging during deploy.
})

