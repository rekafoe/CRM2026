import React, { useState } from 'react'

export const PriceCell: React.FC<{
  value: number
  onChange: (v: number) => void
  className?: string
}> = ({ value, onChange, className }) => {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? inputValue : String(value ?? 0)
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={displayValue}
      onFocus={() => {
        setInputValue(String(value ?? 0))
        setIsFocused(true)
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '' || /^\d*[.,]?\d*$/.test(raw)) setInputValue(raw)
      }}
      onBlur={() => {
        const normalized = inputValue.replace(',', '.')
        if (normalized === '') {
          onChange(0)
        } else {
          const num = parseFloat(normalized)
          if (!Number.isNaN(num) && num >= 0) onChange(num)
        }
        setIsFocused(false)
      }}
    />
  )
}
