import type { IconName } from '../../ui/AppIcon';

/** Маппинг типа продукта на имя иконки AppIcon */
export const getProductIconName = (productType: string): IconName => {
  const map: Record<string, IconName> = {
    flyers: 'document',
    business_cards: 'card',
    booklets: 'document',
    posters: 'image',
    brochures: 'document',
    stickers: 'clipboard',
    envelopes: 'document',
    labels: 'clipboard',
    blanks: 'clipboard',
    calendars: 'calendar',
    badges: 'clipboard',
    business_forms: 'document',
    forms: 'clipboard',
    magnetic_cards: 'package',
    posters_large: 'image',
    perforated_cards: 'scissors',
    wall_calendars: 'calendar',
    table_calendars: 'calendar',
    notebooks: 'document',
    folders: 'folder',
    menus: 'document',
    invitations: 'document',
    certificates: 'document',
    banners: 'image',
    stands: 'image',
    t_shirts: 'package',
    bags: 'package',
    pens: 'pencil',
    mugs: 'package',
    keychains: 'package',
    coasters: 'package',
    mouse_pads: 'package',
    puzzles: 'puzzle',
    photo_albums: 'image',
    photo_cards: 'image',
    photo_wallpaper: 'image',
    flags: 'image',
    table_tents: 'clipboard',
    placemats: 'document',
    table_numbers: 'clipboard',
    seating_cards: 'card',
    wedding_invitations: 'document',
    wedding_place_cards: 'document',
    wedding_labels: 'document',
    wedding_scrolls: 'document',
    wedding_boxes: 'package',
    wedding_disc_labels: 'package',
    wedding_disc_boxes: 'package',
  };
  return map[productType] || 'package';
};



