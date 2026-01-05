export const getTodayString = (): string => {
  return new Date().toISOString().slice(0, 10)
}

export const getCurrentTimestamp = (): string => {
  return new Date().toISOString()
}
