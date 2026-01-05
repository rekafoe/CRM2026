import React, { useState, useEffect, ReactNode } from 'react'
import './AnimatedTransition.css'

interface AnimatedTransitionProps {
  children: ReactNode
  show: boolean
  animation?: 'fade' | 'slide' | 'scale' | 'bounce'
  duration?: number
  delay?: number
  className?: string
}

export const AnimatedTransition: React.FC<AnimatedTransitionProps> = ({
  children,
  show,
  animation = 'fade',
  duration = 300,
  delay = 0,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(show)
  const [shouldRender, setShouldRender] = useState(show)

  useEffect(() => {
    if (show) {
      setShouldRender(true)
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, delay)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [show, duration, delay])

  if (!shouldRender) {
    return null
  }

  const animationClass = `animate-${animation}-${isVisible ? 'in' : 'out'}`
  const style = {
    animationDuration: `${duration}ms`,
    animationDelay: `${delay}ms`
  }

  return (
    <div 
      className={`animated-transition ${animationClass} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

// Специализированные компоненты для разных типов анимаций
export const FadeTransition: React.FC<Omit<AnimatedTransitionProps, 'animation'>> = (props) => (
  <AnimatedTransition {...props} animation="fade" />
)

export const SlideTransition: React.FC<Omit<AnimatedTransitionProps, 'animation'>> = (props) => (
  <AnimatedTransition {...props} animation="slide" />
)

export const ScaleTransition: React.FC<Omit<AnimatedTransitionProps, 'animation'>> = (props) => (
  <AnimatedTransition {...props} animation="scale" />
)

export const BounceTransition: React.FC<Omit<AnimatedTransitionProps, 'animation'>> = (props) => (
  <AnimatedTransition {...props} animation="bounce" />
)
