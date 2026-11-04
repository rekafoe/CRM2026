import {
  applyLibraryFontFallbacksToDesignState,
  buildRequiredFontEntries,
  extractUsedFontFamiliesFromDesignState,
  normalizeDesignStateFontFamilies,
} from '../src/utils/extractDesignStateFonts'

describe('applyLibraryFontFallbacksToDesignState', () => {
  it('не подменяет Corel Arial шрифтом из библиотеки по id слоя', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_voguella',
            fontFamily: 'Arial',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Arial')
  })

  it('подставляет шрифт при пустом fontFamily по id слоя text_voguella', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_voguella',
            fontFamily: '',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Voguella')
  })

  it('пустой fontFamily без совпадения в библиотеке → Arial', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_1',
            fontFamily: '',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Arial')
  })

  it('не перезаписывает неизвестный не-generic шрифт из SVG по id слоя', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_voguella',
            fontFamily: 'Ceremonious One',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Ceremonious One')
  })

  it('text_time не матчит Happy Time Two через substring', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_time',
            fontFamily: 'Arial',
            text: '10:00',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Happy Time Two',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Arial')
  })

  it('не трогает слой, если font-family уже есть в библиотеке CRM', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_voguella',
            fontFamily: 'Ceremonious One',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }, {
      family_name: 'Ceremonious One',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Ceremonious One')
  })
})

describe('normalizeDesignStateFontFamilies', () => {
  it('нормализует fontFamily внутри styles', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'i-text',
            fontFamily: 'Voguella',
            text: 'Что я в тебе люблю',
            styles: {
              0: {
                12: { fontFamily: 'CeremoniousOne' },
              },
            },
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Ceremonious One',
      name_aliases: ['CeremoniousOne-Regular'],
    }]) as typeof designState
    const obj = (normalized.pages[0].fabricJSON as {
      objects: Array<{ styles: Record<string, Record<string, { fontFamily: string }>> }>
    }).objects[0]
    expect(obj.styles[0][12].fontFamily).toBe('Ceremonious One')
  })

  it('приводит fontFamily из SVG к family_name библиотеки по compact key', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'CeremoniousOne',
            text: 'Hello',
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Ceremonious One',
      name_aliases: ['CeremoniousOne-Regular'],
    }]) as typeof designState
    const obj = (normalized.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Ceremonious One')
  })

  it('снимает ofont.ru_ и Bold при сопоставлении с библиотекой CRM', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'ofont.ru_Shampanskoe Bold',
            text: 'Текст',
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Shampanskoe',
      name_aliases: [],
    }]) as typeof designState
    const obj = (normalized.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Shampanskoe')
  })

  it('приводит усечённое имя Sign That к family_name библиотеки', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'Sign That',
            text: 'Hello',
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Sign That S (kerning)',
    }]) as typeof designState
    const obj = (normalized.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Sign That S (kerning)')
  })

  it('ставит вес и стиль файла, если начертание не Regular', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'Comfortaa',
            fontWeight: 'normal',
            fontStyle: 'normal',
            text: 'Hello',
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Comfortaa',
      weight: '700',
      style: 'normal',
    }]) as typeof designState
    const obj = (normalized.pages[0].fabricJSON as {
      objects: Array<{ fontFamily: string; fontWeight: string; fontStyle: string }>
    }).objects[0]
    expect(obj.fontFamily).toBe('Comfortaa')
    expect(obj.fontWeight).toBe('700')
    expect(obj.fontStyle).toBe('normal')
  })

  it('не сбрасывает жирность, если файл Regular или начертание закреплено', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'Voguella',
            fontWeight: 'bold',
            fontStyle: 'normal',
            text: 'Hello',
          }, {
            type: 'textbox',
            fontFamily: 'Comfortaa',
            fontWeight: 'normal',
            fontStyle: 'normal',
            fontVariantPinned: true,
            text: 'Pinned',
          }],
        },
      }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Voguella',
      weight: '400',
      style: 'normal',
    }, {
      family_name: 'Comfortaa',
      weight: '700',
      style: 'normal',
    }]) as typeof designState
    const objects = (normalized.pages[0].fabricJSON as {
      objects: Array<{ fontWeight: string; fontStyle: string }>
    }).objects
    expect(objects[0].fontWeight).toBe('bold')
    expect(objects[1].fontWeight).toBe('normal')
    expect(objects[1].fontStyle).toBe('normal')
  })

  it('не меняет JSON текста Manrope, если в библиотеке Regular 400', () => {
    const object = {
      type: 'textbox',
      fontFamily: 'Manrope',
      fontWeight: '600',
      fontStyle: 'normal',
      text: 'Визитка',
    }
    const designState = {
      pages: [{ fabricJSON: { objects: [object] } }],
    }
    const normalized = normalizeDesignStateFontFamilies(designState, [{
      family_name: 'Manrope',
      weight: '400',
      style: 'normal',
    }]) as typeof designState
    const next = (normalized.pages[0].fabricJSON as { objects: Array<typeof object> }).objects[0]
    expect(JSON.stringify(next)).toBe(JSON.stringify(object))
  })
})

describe('extractUsedFontFamiliesFromDesignState textStyleRuns', () => {
  it('собирает шрифты из textStyleRuns', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            fontFamily: 'Voguella',
            text: 'Что я в тебе люблю',
            textStyleRuns: [
              { start: 0, end: 12, fontFamily: 'Voguella' },
              { start: 12, end: 17, fontFamily: 'Ceremonious One' },
            ],
          }],
        },
      }],
    }
    const families = extractUsedFontFamiliesFromDesignState(designState)
    expect(families).toEqual(expect.arrayContaining(['Voguella', 'Ceremonious One']))
    expect(families).toHaveLength(2)
  })
})

describe('extractUsedFontFamiliesFromDesignState', () => {
  it('собирает шрифты из styles персонажей, не только верхний fontFamily', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'i-text',
            fontFamily: 'Voguella',
            text: 'Что я в тебе люблю',
            styles: {
              0: {
                0: { fontFamily: 'Voguella' },
                12: { fontFamily: 'Ceremonious One' },
              },
            },
          }],
        },
      }],
    }
    const families = extractUsedFontFamiliesFromDesignState(designState)
    expect(families).toEqual(expect.arrayContaining(['Voguella', 'Ceremonious One']))
    expect(families).toHaveLength(2)
  })
})

describe('buildRequiredFontEntries', () => {
  it('находит шрифт библиотеки по compact key и возвращает каноническое имя', () => {
    const globalByFamily = new Map([
      ['ceremoniousone', {
        id: 5,
        url: '/api/design-fonts/public/5/content',
        format: 'otf',
        family: 'Ceremonious One',
        name_aliases: ['CeremoniousOne-Regular'],
      }],
    ])
    const entries = buildRequiredFontEntries({
      families: ['CeremoniousOne'],
      globalByFamily,
    })
    expect(entries[0]).toMatchObject({
      family: 'Ceremonious One',
      source: 'global',
      fontId: 5,
      name_aliases: ['CeremoniousOne-Regular'],
    })
  })

  it('находит Sign That S (kerning) по усечённому имени Sign That', () => {
    const globalByFamily = new Map([
      ['signthat', {
        id: 12,
        url: '/api/design-fonts/public/12/content',
        format: 'otf',
        family: 'Sign That S (kerning)',
      }],
    ])
    const entries = buildRequiredFontEntries({
      families: ['Sign That'],
      globalByFamily,
    })
    expect(entries[0]).toMatchObject({
      family: 'Sign That S (kerning)',
      source: 'global',
      fontId: 12,
    })
  })

  it('сопоставляет bundled-шрифт из ZIP по алиасу и пробрасывает weight/style', () => {
    const entries = buildRequiredFontEntries({
      families: ['ofont.ru_Comfortaa Bold'],
      globalByFamily: new Map(),
      bundledFonts: [{
        family: 'Comfortaa',
        source: 'bundled',
        filename: 'comfortaa-bold.ttf',
        url: '/api/uploads/comfortaa-bold.ttf',
        format: 'ttf',
        name_aliases: ['Comfortaa Bold', 'Comfortaa-Bold'],
        weight: '700',
        style: 'normal',
      }],
    })
    expect(entries[0]).toMatchObject({
      family: 'Comfortaa',
      source: 'bundled',
      url: '/api/uploads/comfortaa-bold.ttf',
      weight: '700',
      style: 'normal',
    })
  })

  it('отдаёт Manrope из библиотеки как global с url для сайта', () => {
    const entries = buildRequiredFontEntries({
      families: ['Manrope'],
      globalByFamily: new Map([
        ['manrope', {
          id: 21,
          url: '/api/design-fonts/public/21/content',
          format: 'ttf',
          family: 'Manrope',
        }],
      ]),
    })
    expect(entries[0]).toMatchObject({
      family: 'Manrope',
      source: 'global',
      fontId: 21,
      url: '/api/design-fonts/public/21/content',
      format: 'ttf',
    })
  })
})
