export type DesignActor = {
  id: number
  role: string
}

export function isDesignCatalogAdmin(role: string | null | undefined): boolean {
  return String(role || '') === 'admin'
}

/** Сотрудники CRM. Роль client — покупатель, не рабочее место. */
export function canUseDesignCatalog(role: string | null | undefined): boolean {
  return String(role || '').trim().toLowerCase() !== 'client'
}

export function canEditDesign(
  actor: DesignActor,
  template: { uploaded_by_user_id?: number | null },
): boolean {
  if (isDesignCatalogAdmin(actor.role)) return true
  return template.uploaded_by_user_id != null && Number(template.uploaded_by_user_id) === Number(actor.id)
}

export function canEditDesignFamily(
  actor: DesignActor,
  variants: Array<{ uploaded_by_user_id?: number | null }>,
): boolean {
  if (isDesignCatalogAdmin(actor.role)) return true
  if (variants.length === 0) return false
  return variants.every((variant) => canEditDesign(actor, variant))
}
