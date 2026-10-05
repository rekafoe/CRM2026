export function earningRoleLabel(earningType?: string | null): string {
  switch (earningType) {
    case 'contact':
      return 'Контактёр'
    case 'responsible':
      return 'Ответственный'
    case 'design_author':
      return 'Автор макета'
    default:
      return 'Исполнитель'
  }
}
