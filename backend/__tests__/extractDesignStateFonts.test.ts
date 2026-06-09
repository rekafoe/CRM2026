import {
  applyLibraryFontFallbacksToDesignState,
  buildRequiredFontEntries,
  normalizeDesignStateFontFamilies,
} from '../src/utils/extractDesignStateFonts'

describe('applyLibraryFontFallbacksToDesignState', () => {
  it('подставляет шрифт из библиотеки по id слоя text_voguella', () => {
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
    expect(obj.fontFamily).toBe('Voguella')
  })

  it('не трогает слой с явным font-family из SVG', () => {
    const designState = {
      pages: [{
        fabricJSON: {
          objects: [{
            type: 'textbox',
            id: 'text_voguella',
            fontFamily: 'Aubrey Pro',
            text: 'Имя',
          }],
        },
      }],
    }
    const next = applyLibraryFontFallbacksToDesignState(designState, [{
      family_name: 'Voguella',
    }]) as typeof designState
    const obj = (next.pages[0].fabricJSON as { objects: Array<{ fontFamily: string }> }).objects[0]
    expect(obj.fontFamily).toBe('Aubrey Pro')
  })
})

describe('normalizeDesignStateFontFamilies', () => {
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
})
