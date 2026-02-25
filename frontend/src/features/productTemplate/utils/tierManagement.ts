export type Tier = { min_qty: number; max_qty?: number; unit_price: number }

export const defaultTiers = (): Tier[] => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 }
]

export const normalizeTiers = (tiers: Tier[]): Tier[] => {
  if (tiers.length === 0) return defaultTiers()

  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)

  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i] = { ...sorted[i], max_qty: sorted[i + 1].min_qty - 1 }
  }

  if (sorted.length > 0) {
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max_qty: undefined }
  }

  return sorted
}

export const addRangeBoundary = (tiers: Tier[], newBoundary: number): Tier[] => {
  if (tiers.length === 0) {
    return [{ min_qty: 1, max_qty: newBoundary - 1, unit_price: 0 }, { min_qty: newBoundary, max_qty: undefined, unit_price: 0 }]
  }

  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  const existingBoundary = sortedTiers.find(t => t.min_qty === newBoundary)
  if (existingBoundary) return sortedTiers

  const targetIndex = sortedTiers.findIndex(t => {
    const max = t.max_qty !== undefined ? t.max_qty + 1 : Infinity
    return newBoundary >= t.min_qty && newBoundary < max
  })

  if (targetIndex === -1) {
    const lastTier = sortedTiers[sortedTiers.length - 1]
    if (lastTier.max_qty === undefined) {
      const newTiers = [...sortedTiers]
      newTiers[newTiers.length - 1] = { ...lastTier, max_qty: newBoundary - 1 }
      newTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
      return normalizeTiers(newTiers)
    }
    sortedTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
    return normalizeTiers(sortedTiers)
  }

  const targetTier = sortedTiers[targetIndex]
  if (newBoundary === targetTier.min_qty) return sortedTiers

  const newTiers = [...sortedTiers]
  newTiers[targetIndex] = { ...targetTier, max_qty: newBoundary - 1 }
  newTiers.splice(targetIndex + 1, 0, { min_qty: newBoundary, max_qty: targetTier.max_qty, unit_price: 0 })

  return normalizeTiers(newTiers)
}

export const editRangeBoundary = (tiers: Tier[], tierIndex: number, newBoundary: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers

  const existingBoundary = sortedTiers.find((t, i) => i !== tierIndex && t.min_qty === newBoundary)
  if (existingBoundary) return sortedTiers

  const editedTier = sortedTiers[tierIndex]
  const newTiers = [...sortedTiers]
  newTiers[tierIndex] = { ...editedTier, min_qty: newBoundary }

  if (tierIndex > 0) {
    newTiers[tierIndex - 1] = { ...newTiers[tierIndex - 1], max_qty: newBoundary - 1 }
  }

  return normalizeTiers(newTiers)
}

export const removeRange = (tiers: Tier[], tierIndex: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers
  if (sortedTiers.length <= 1) return sortedTiers

  const newTiers = [...sortedTiers]
  const removedTier = newTiers[tierIndex]

  if (tierIndex > 0) {
    const prevTier = newTiers[tierIndex - 1]
    newTiers[tierIndex - 1] = { ...prevTier, max_qty: removedTier.max_qty }
  } else if (tierIndex < newTiers.length - 1) {
    const nextTier = newTiers[tierIndex + 1]
    newTiers[tierIndex + 1] = { ...nextTier, min_qty: 1 }
  }

  newTiers.splice(tierIndex, 1)
  return normalizeTiers(newTiers)
}
