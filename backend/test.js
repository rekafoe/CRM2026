console.log('Test script running...')

const http = require('http')

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Hello World\n')
})

server.listen(3002, () => {
  console.log('Server running at http://localhost:3002/')
})
