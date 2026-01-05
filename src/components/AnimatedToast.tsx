import React, { useState, useEffect } from 'react'
import { FadeTransition } from './AnimatedTransition'
import './AnimatedToast.css'

export interface ToastProps {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  onClose: (id: string) => void
}

export const AnimatedToast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration])

  const handleClose = () => {
    setIsVisible(false)
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return 'ℹ️'
    }
  }

  return (
    <FadeTransition show={isVisible} onExited={() => onClose(id)}>
      <div className={`toast toast-${type}`}>
        <div className="toast-content">
          <div className="toast-icon">
            {getIcon()}
          </div>
          <div className="toast-text">
            <div className="toast-title">{title}</div>
            {message && <div className="toast-message">{message}</div>}
          </div>
          <button 
            className="toast-close"
            onClick={handleClose}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
        <div className="toast-progress">
          <div 
            className="toast-progress-bar"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      </div>
    </FadeTransition>
  )
}

interface ToastContainerProps {
  toasts: ToastProps[]
  onClose: (id: string) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <AnimatedToast
          key={toast.id}
          {...toast}
          onClose={onClose}
        />
      ))}
    </div>
  )
}
