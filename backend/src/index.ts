import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { config } from './config/app'

// Load environment variables
dotenv.config()

const app = express()

// Basic middleware
app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Basic API routes for testing
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' })
})

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

// Start server
const port = process.env.PORT || 3001
console.log(`🔄 Starting server on port ${port}...`)

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`)
  console.log(`🌐 CORS origin: ${config.corsOrigin}`)
  console.log(`🏥 Health check: http://0.0.0.0:${port}/health`)
})