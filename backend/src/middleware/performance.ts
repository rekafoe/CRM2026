import { Request, Response, NextFunction } from 'express'

interface PerformanceMetrics {
  requestCount: number
  totalResponseTime: number
  averageResponseTime: number
  slowestRequests: Array<{
    method: string
    path: string
    duration: number
    timestamp: Date
  }>
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    slowestRequests: []
  }

  private slowRequestThreshold = 1000 // 1 секунда

  recordRequest(method: string, path: string, duration: number) {
    this.metrics.requestCount++
    this.metrics.totalResponseTime += duration
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount

    // Записываем медленные запросы
    if (duration > this.slowRequestThreshold) {
      this.metrics.slowestRequests.push({
        method,
        path,
        duration,
        timestamp: new Date()
      })

      // Оставляем только последние 50 медленных запросов
      if (this.metrics.slowestRequests.length > 50) {
        this.metrics.slowestRequests = this.metrics.slowestRequests.slice(-50)
      }
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  reset() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      slowestRequests: []
    }
  }
}

const performanceMonitor = new PerformanceMonitor()

export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now()
  const originalSend = res.send

  // Переопределяем метод send для измерения времени ответа
  res.send = function(data: any) {
    const duration = Date.now() - startTime
    
    // Записываем метрики
    performanceMonitor.recordRequest(req.method, req.path, duration)
    
    // Логируем медленные запросы
    if (duration > performanceMonitor['slowRequestThreshold']) {
      console.warn(`🐌 Медленный запрос: ${req.method} ${req.path} - ${duration}ms`)
    }

    // Добавляем заголовки производительности
    res.setHeader('X-Response-Time', `${duration}ms`)
    res.setHeader('X-Request-ID', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

    return originalSend.call(this, data)
  }

  next()
}

export function getPerformanceMetrics() {
  return performanceMonitor.getMetrics()
}

export function resetPerformanceMetrics() {
  performanceMonitor.reset()
}

// Middleware для логирования производительности
export function performanceLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - startTime
    const statusColor = res.statusCode >= 400 ? '🔴' : res.statusCode >= 300 ? '🟡' : '🟢'
    
    console.log(`${statusColor} ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`)
  })

  next()
}

