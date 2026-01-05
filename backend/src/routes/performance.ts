// Временно отключено из-за ошибок TypeScript
/*
import { Router } from 'express'
import { getPerformanceMetrics, resetPerformanceMetrics } from '../middleware/performance'
import { CacheService } from '../services/cacheService'
import { asyncHandler } from '../middleware'

const router = Router()

// Получить метрики производительности
router.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = getPerformanceMetrics()
  const cacheStats = CacheService.getStats()
  
  res.json({
    performance: metrics,
    cache: cacheStats,
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      rss: process.memoryUsage().rss
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
}))

// Сбросить метрики
router.post('/reset', asyncHandler(async (req, res) => {
  resetPerformanceMetrics()
  CacheService.clear()
  
  res.json({ message: 'Метрики сброшены' })
}))

// Получить статистику кэша
router.get('/cache', asyncHandler(async (req, res) => {
  const stats = CacheService.getStats()
  res.json(stats)
}))

// Очистить кэш
router.post('/cache/clear', asyncHandler(async (req, res) => {
  CacheService.clear()
  res.json({ message: 'Кэш очищен' })
}))

// Получить информацию о системе
router.get('/system', asyncHandler(async (req, res) => {
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
    env: process.env.NODE_ENV || 'development'
  })
}))

export default router
*/

// Временный экспорт пустого роутера
export default (() => {
  const router = require('express').Router();
  return router;
})();

