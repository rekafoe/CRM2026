import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { requireAuthMailApiKey } from '../middleware/authMailApiKey'
import { mailVerificationRateLimit } from '../middleware/rateLimiter'
import {
  enqueueWebsiteEmailVerification,
  WebsiteEmailVerificationValidationError,
} from '../services/websiteEmailVerificationService'

const router = Router()

/**
 * POST /api/mail/website/email-verification
 * Service-to-service шлюз для фиксированного verification-письма сайта.
 */
router.post(
  '/email-verification',
  mailVerificationRateLimit,
  requireAuthMailApiKey,
  asyncHandler(async (req, res) => {
    try {
      const result = await enqueueWebsiteEmailVerification(req.body)
      res.status(202).json({
        ok: true,
        jobId: result.id,
        duplicate: result.duplicate,
        queued: true,
      })
    } catch (error) {
      if (error instanceof WebsiteEmailVerificationValidationError) {
        res.status(400).json({
          error: 'Invalid request body',
          message: error.message,
        })
        return
      }
      throw error
    }
  }),
)

export default router
