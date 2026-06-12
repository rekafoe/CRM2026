import {
  decodeCorelUnicodeEscapes,
  decodeXmlText,
  normalizeSvgPaintColor,
  parseImportedSvgLayers,
  resolveTextAnchor,
  transformAngleDeg,
} from '../src/services/designTemplateSvgParse'

describe('parseImportedSvgLayers', () => {
  it('наследует photo_* с <g> если у rect нет id', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="photo_slot">
    <rect x="10" y="5" width="30" height="40"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects).toHaveLength(1)
    expect(r.photoRects[0].name).toBe('photo_slot')
    expect(r.photoRects[0].width).toBeGreaterThan(20)
    expect(r.warnings.every((w) => !w.includes('Не найдено'))).toBe(true)
  })

  it('rect с id photo_* приоритетнее имени группы', () => {
    const svg = `
<svg width="80mm" height="80mm" viewBox="0 0 80 80">
  <g id="photo_outer">
    <rect id="photo_inner" x="0" y="0" width="10" height="10"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects.some((p) => p.name === 'photo_inner')).toBe(true)
  })

  it('убирает photo_* из strippedSvg чтобы не было дубля с полями Fabric', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="photo_slot">
    <rect x="10" y="5" width="30" height="40"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.removalRanges.length).toBeGreaterThan(0)
    expect(r.strippedSvg.includes('photo_slot')).toBe(false)
    expect(/<svg[\s\S]*<\/svg>/.test(r.strippedSvg.trim())).toBe(true)
  })

  it('оставляет text_* в фоне, если внутри нет валидного <text>', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="text_title">
    <path d="M10 10 L20 20" fill="#ffffff"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.textItems).toHaveLength(0)
    expect(r.strippedSvg.includes('text_title')).toBe(true)
    expect(r.warnings.some((w) => w.includes('text_title') && w.includes('оставлен в фоне'))).toBe(true)
  })

  it('оставляет photo_* в фоне, если не найден валидный rect', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <g id="photo_slot">
    <rect x="10" y="5" width="0" height="40"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects).toHaveLength(0)
    expect(r.strippedSvg.includes('photo_slot')).toBe(true)
    expect(r.warnings.some((w) => w.includes('photo_slot') && w.includes('оставлен в фоне'))).toBe(true)
  })

  it('убирает text_* из strippedSvg, если интерактивный text успешно извлечён', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <text id="text_title" x="10" y="20" font-size="12">VOGUE</text>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.textItems).toHaveLength(1)
    expect(r.strippedSvg.includes('text_title')).toBe(false)
  })

  it('вычисляет prepressHints по связке trim/bleed/safe в мм', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <rect id="bleed" x="0" y="0" width="100" height="50"/>
  <rect id="trim" x="10" y="10" width="80" height="30"/>
  <rect id="safe" x="15" y="15" width="70" height="20"/>
  <g id="photo_x"><rect x="1" y="1" width="4" height="4"/></g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.prepressHints).not.toBeNull()
    expect(r.prepressHints!.bleedMm).toBe(10)
    expect(r.prepressHints!.safeZoneMm).toBe(5)
    expect(Object.keys(r.guideRectsMm).sort()).toEqual(['bleed', 'safe', 'trim'])
  })

  it('сохраняет debug-геометрию Corel SVG в svg/mm/scenePx', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <rect id="locked_bg" x="0" y="0" width="340.157" height="188.976"/>
  <rect id="photo_1" x="40" y="20" width="80" height="70"/>
  <text id="text_phone" x="180" y="120" font-size="18">+375291668368</text>
  <rect id="trim" x="0" y="0" width="340.157" height="188.976"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    const photo = r.photoRects[0]
    const text = r.textItems[0]

    expect(r.geometry.pageMm).toEqual({ width: 90, height: 50 })
    expect(r.geometry.scenePx.width).toBeCloseTo(340.157, 1)
    expect(photo.svg.x).toBe(40)
    expect(photo.x).toBeCloseTo(10.583, 2)
    expect(photo.scene.x).toBeCloseTo(40, 1)
    expect(text.scene.x).toBeCloseTo(180, 1)
  })

  it('читает координаты и выравнивание текста из tspan/style Corel SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <g id="text_phone">
    <text style="font-size:42px;text-anchor:end"><tspan x="300" y="150">+375291668368</tspan></text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 3 })
    const text = r.textItems[0]

    expect(text.text).toBe('+375291668368')
    expect(text.textAnchor).toBe('end')
    expect(text.svg.x).toBe(300)
    expect(text.svg.y).toBe(150)
    expect(text.scene.x).toBeCloseTo(900, 1)
    expect(text.scene.fontSize).toBeCloseTo(126, 1)
    expect(r.geometry.sceneScale).toBe(3)
  })

  it('учитывает transform scale в размере SVG текста', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 340.157 188.976">
  <g id="text_name" transform="matrix(2 0 0 2 20 10)">
    <text x="100" y="60" font-size="18">имя</text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    const text = r.textItems[0]

    expect(text.svg.x).toBe(220)
    expect(text.svg.y).toBe(130)
    expect(text.svg.fontSize).toBe(36)
    expect(text.scene.fontSize).toBeCloseTo(36, 1)
  })

  it('читает Corel font-size из CSS-класса SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 9000 5000">
  <style type="text/css"><![CDATA[
    .fil1 { fill: #111111 }
    .fnt0 { font-weight: normal; font-size: 635px; font-family: Arial; }
  ]]></style>
  <text id="text_phone" class="fil1 fnt0" x="2400" y="4300">+375291668368</text>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 3 })
    const text = r.textItems[0]

    expect(text.svg.fontSize).toBe(635)
    expect(text.fontSize).toBeCloseTo(6.35, 2)
    expect(text.scene.fontSize).toBeCloseTo(72, 0)
    expect(text.fontFamily).toBe('Arial')
    expect(text.fill).toBe('#111111')
  })

  it('читает белый цвет текста из fill атрибута и CSS-класса Corel', () => {
    const svgAttr = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_title" x="100" y="80" font-size="24" fill="#ffffff">VOGUE</text>
</svg>`
    expect(parseImportedSvgLayers(svgAttr).textItems[0]?.fill).toBe('#ffffff')

    const svgClass = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[.fil0 {fill:#FFFFFF}]]></style>
  <text id="text_title" class="fil0" x="100" y="80" font-size="24">VOGUE</text>
</svg>`
    expect(parseImportedSvgLayers(svgClass).textItems[0]?.fill).toBe('#FFFFFF')

    expect(normalizeSvgPaintColor('white')).toBe('#ffffff')
    expect(normalizeSvgPaintColor('rgb(255, 255, 255)')).toBe('#ffffff')
  })

  it('сохраняет z-order: photo → text → photo как в SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <rect id="photo_bg" x="0" y="0" width="100" height="50"/>
  <text id="text_title" x="10" y="20" font-size="12">Заголовок</text>
  <rect id="photo_stamp" x="80" y="35" width="15" height="10"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.interactiveLayers.map((l) => `${l.kind}:${l.data.name}`)).toEqual([
      'photo:photo_bg',
      'text:text_title',
      'photo:photo_stamp',
    ])
  })

  it('наследует font-family с родительской группы text_* (Corel/AI)', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt_happy { font-family: 'Happy Time Two'; font-size: 24px; }
  ]]></style>
  <g id="text_name" class="fnt_happy">
    <text x="100" y="200"><tspan>Имя</tspan></text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 3 })
    expect(r.textItems[0]?.fontFamily).toBe('Happy Time Two')
  })

  it('декодирует Corel _xNNNN_ в тексте и именах слоёв', () => {
    expect(decodeCorelUnicodeEscapes('Лизочка_x0020_-_x0020_это')).toBe('Лизочка - это')
    expect(decodeCorelUnicodeEscapes('Слой_x0020_1')).toBe('Слой 1')
    expect(decodeXmlText('foo_x002c_bar')).toBe('foo,bar')
  })

  it('объединяет несколько tspan в один текст с переносами', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_body" x="10" y="20" font-size="18">
    <tspan x="10" y="20">Строка первая</tspan>
    <tspan x="10" dy="1.2em">Строка вторая</tspan>
    <tspan x="10" dy="1.2em">Строка третья</tspan>
  </text>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.textItems).toHaveLength(1)
    expect(r.textItems[0].text).toBe('Строка первая\nСтрока вторая\nСтрока третья')
  })

  it('text-anchor:start не блокирует text-align:right (типичный Corel)', () => {
    expect(resolveTextAnchor(
      { 'text-anchor': 'start', 'text-align': 'right' },
    )).toBe('end')

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g id="text_address">
    <text text-anchor="start" style="text-align:right;font-size:24px">
      <tspan x="400" y="100">ул. Ленина, 1</tspan>
      <tspan x="400" y="130">г. Минск</tspan>
    </text>
  </g>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('end')
    expect(text?.text).toContain('\n')
    expect(text?.frameWidthScene).toBeGreaterThan(100)
  })

  it('читает жирный/курсив из CSS-класса Corel', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style>.fnt0 {font-weight:bold;font-style:italic;font-size:24px;font-family:'Arial'}</style>
  <text id="text_title" class="fnt0"><tspan x="100" y="80">Заголовок</tspan></text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.fontWeight).toBe('bold')
    expect(text?.fontStyle).toBe('italic')
  })

  it('читает выравнивание по центру из text-anchor и text-align', () => {
    const svgAnchor = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_title" x="450" y="100" text-anchor="middle" font-size="24">ISABELLA</text>
</svg>`
    expect(parseImportedSvgLayers(svgAnchor).textItems[0]?.textAnchor).toBe('middle')

    const svgAlign = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g id="text_title" style="text-align:center">
    <text x="450" y="100" font-size="24"><tspan>ISABELLA</tspan></text>
  </g>
</svg>`
    expect(parseImportedSvgLayers(svgAlign).textItems[0]?.textAnchor).toBe('middle')
  })

  it('сохраняет угол поворота вертикального текста (rotate / matrix)', () => {
    const svgRotate = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g id="text_date" transform="rotate(-90 450 250)">
    <text x="450" y="250" font-size="18">10.02.2004</text>
  </g>
</svg>`
    const r1 = parseImportedSvgLayers(svgRotate)
    expect(r1.textItems[0]?.text).toBe('10.02.2004')
    expect(r1.textItems[0]?.angle).toBeCloseTo(-90, 0)

    const svgMatrix = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <text id="text_date" transform="matrix(0 -1 1 0 450 250)" x="0" y="0" font-size="18">10.02.2004</text>
</svg>`
    const r2 = parseImportedSvgLayers(svgMatrix)
    expect(r2.textItems[0]?.angle).toBeCloseTo(-90, 0)
    expect(transformAngleDeg({ a: 0, b: -1, c: 1, d: 0, e: 0, f: 0 })).toBeCloseTo(-90, 0)
  })

  it('объединяет несколько <text> в группе text_* в один блок', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g id="text_about">
    <text x="10" y="20" font-size="18"><tspan>Линия 1</tspan></text>
    <text x="10" y="40" font-size="18"><tspan>Линия 2</tspan></text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.textItems).toHaveLength(1)
    expect(r.textItems[0].name).toBe('text_about')
    expect(r.textItems[0].text).toBe('Линия 1\nЛиния 2')
    expect(r.interactiveLayers.filter((l) => l.kind === 'text')).toHaveLength(1)
  })

  it('объединяет tspan на одной строке с разными шрифтами в один текст', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 48px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 48px; }
  ]]></style>
  <text id="text_love" text-anchor="middle">
    <tspan class="fnt0" x="450" y="120">Что я в тебе </tspan>
    <tspan class="fnt1" x="620" y="120">люблю</tspan>
  </text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.text).toBe('Что я в тебе люблю')
    expect(text?.text).not.toContain('\n')
    expect(text?.textAnchor).toBe('middle')
    expect(text?.textStyles?.length).toBeGreaterThanOrEqual(2)
    expect(text?.textStyles?.[0]?.fontFamily).toBe('Voguella')
    expect(text?.textStyles?.[1]?.fontFamily).toBe('Ceremonious One')
  })

  it('объединяет несколько <text> на одной линии в группе text_*', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 24px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 24px; }
  ]]></style>
  <g id="text_love" style="text-align:center">
    <text x="300" y="120" class="fnt0"><tspan>Что я в тебе </tspan></text>
    <text x="520" y="120" class="fnt1"><tspan>люблю</tspan></text>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.textItems).toHaveLength(1)
    expect(r.textItems[0]?.text).toBe('Что я в тебе люблю')
    expect(r.textItems[0]?.textAnchor).toBe('middle')
    expect(r.textItems[0]?.textStyles?.length).toBeGreaterThanOrEqual(2)
  })

  it('сохраняет центрирование многострочного textbox', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g id="text_body" style="text-align:center">
    <text font-size="24">
      <tspan x="450" y="100">Ты умеешь быть моей опорой даже</tspan>
      <tspan x="450" y="130">в моменты, когда я не верю в себя</tspan>
    </text>
  </g>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.textAnchor).toBe('middle')
    expect(text?.text).toContain('\n')
    expect(text?.frameWidthScene).toBeGreaterThan(100)
    expect(text?.scene.x).toBeGreaterThan(100)
  })

  it('склеивает Corel-разбитое слово: декоративная первая буква + остаток базовым шрифтом', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 48px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 36px; }
  ]]></style>
  <text id="text_love" text-anchor="middle">
    <tspan class="fnt0" x="300" y="120">Что я в тебе </tspan>
    <tspan class="fnt1" x="520" y="120">л</tspan>
    <tspan class="fnt0" x="540" y="120">юблю</tspan>
  </text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.text).toBe('Что я в тебе люблю')
    const loveStart = text!.text.indexOf('люблю')
    const cerSeg = text?.textStyles?.find((s) => s.fontFamily === 'Ceremonious One')
    expect(cerSeg?.start).toBe(loveStart)
    expect(cerSeg?.end).toBe(text!.text.length)
    expect(cerSeg?.fontSize).toBeUndefined()
  })

  it('отбрасывает средний дубликат целой строки Corel (tspan в одном text)', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 24px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 24px; }
  ]]></style>
  <text id="text_love" text-anchor="middle">
    <tspan class="fnt0" x="300" y="120">Что я в тебе</tspan>
    <tspan class="fnt0" x="300" y="120">Что я в тебе люблю</tspan>
    <tspan class="fnt1" x="520" y="120">люблю</tspan>
  </text>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.text).toBe('Что я в тебе люблю')
    expect(text?.text).not.toContain('люблюлюблю')
    expect(text?.textStyles?.length).toBeGreaterThanOrEqual(2)
    expect(text?.textStyles?.[0]?.fontFamily).toBe('Voguella')
    expect(text?.textStyles?.some((s) => s.fontFamily === 'Ceremonious One')).toBe(true)
  })

  it('отбрасывает дублирующую полную строку Corel при inline merge', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <style type="text/css"><![CDATA[
    .fnt0 { font-family: 'Voguella'; font-size: 24px; }
    .fnt1 { font-family: 'Ceremonious One'; font-size: 24px; }
  ]]></style>
  <g id="text_love">
    <text x="200" y="120" class="fnt0"><tspan>Что я в тебе люблю</tspan></text>
    <text x="200" y="120" class="fnt0"><tspan>Что я в тебе </tspan></text>
    <text x="420" y="120" class="fnt1"><tspan>люблю</tspan></text>
  </g>
</svg>`
    const text = parseImportedSvgLayers(svg).textItems[0]
    expect(text?.text).toBe('Что я в тебе люблю')
    expect(text?.textStyles?.length).toBeGreaterThanOrEqual(2)
    expect(text?.textStyles?.[0]?.fontFamily).toBe('Voguella')
    expect(text?.textStyles?.some((s) => s.fontFamily === 'Ceremonious One')).toBe(true)
  })

  it('сохраняет z-order когда text идёт раньше photo в SVG', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <text id="text_watermark" x="5" y="45" font-size="8">водяной знак</text>
  <rect id="photo_main" x="10" y="5" width="80" height="40"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.interactiveLayers.map((l) => l.data.name)).toEqual(['text_watermark', 'photo_main'])
  })

  it('учитывает preserveAspectRatio=xMaxYMid meet при пересчёте координат', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 200 100" preserveAspectRatio="xMaxYMid meet">
  <rect id="photo_slot" x="180" y="40" width="20" height="20"/>
</svg>`
    const r = parseImportedSvgLayers(svg, { sceneScale: 1 })
    expect(r.photoRects).toHaveLength(1)
    // При xMaxYMid meet контент "прижат" вправо, а по Y центрируется.
    expect(r.photoRects[0].x).toBeGreaterThan(80)
    expect(r.photoRects[0].y).toBeGreaterThan(40)
  })

  it('поддерживает skewX/skewY трансформации', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <g transform="skewX(20) skewY(5)">
    <rect id="photo_skew" x="100" y="120" width="300" height="150"/>
  </g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.photoRects).toHaveLength(1)
    expect(r.photoRects[0].width).toBeGreaterThan(25)
  })

  it('пишет расширенный parserSummary с процентами распознавания', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <rect id="photo_ok" x="10" y="10" width="100" height="60"/>
  <g id="text_bad"><path d="M0 0 L10 10"/></g>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.summary.interactiveLayerCount).toBeGreaterThanOrEqual(1)
    expect(r.summary.interactiveParsedPercent).toBeGreaterThan(0)
    expect(r.summary.fallbackBackgroundPercent).toBeGreaterThan(0)
  })

  it('формирует parserReport со статусами и reasonCode', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <rect id="photo_ok" x="10" y="10" width="100" height="60"/>
  <g id="text_bad"><path d="M0 0 L10 10"/></g>
  <rect id="guide_tmp" x="0" y="0" width="10" height="10"/>
</svg>`
    const r = parseImportedSvgLayers(svg)
    expect(r.parserReport.layers.length).toBeGreaterThanOrEqual(2)
    expect(r.parserReport.countsByStatus.parsed_interactive).toBeGreaterThanOrEqual(1)
    expect(r.parserReport.countsByReasonCode.PHOTO_PARSED).toBeGreaterThanOrEqual(1)
    expect(r.parserReport.timings.totalMs).toBeGreaterThan(0)
  })

  it('добавляет trace timeline только при trace=true', () => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm" viewBox="0 0 900 500">
  <rect id="photo_1" x="10" y="10" width="100" height="60"/>
</svg>`
    const withTrace = parseImportedSvgLayers(svg, { trace: true })
    const withoutTrace = parseImportedSvgLayers(svg)
    expect(withTrace.trace?.timeline.length).toBeGreaterThan(0)
    expect(withoutTrace.trace).toBeUndefined()
  })

  it('падает с кодом лимита при слишком глубокой вложенности групп', () => {
    const open = '<g>'.repeat(140)
    const close = '</g>'.repeat(140)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="50mm">${open}<rect id="photo_1" x="1" y="1" width="4" height="4"/>${close}</svg>`
    expect(() => parseImportedSvgLayers(svg)).toThrow('SVG_GROUP_DEPTH_LIMIT_EXCEEDED')
  })
})
