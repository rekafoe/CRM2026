/** Сумма прописью: «(сто) белорусских рублей 00 копеек». */
export function amountInWordsBel(num: number): string {
  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  const onesF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

  const rounded = Math.round(num * 100) / 100
  let rub = Math.floor(rounded)
  let kop = Math.round((rounded - rub) * 100)
  if (kop >= 100) {
    kop = 0
    rub += 1
  }

  const three = (n: number, fem: boolean) => {
    if (n === 0) return ''
    const o = fem ? onesF : ones
    let r = ''
    if (n >= 100) r += hundreds[Math.floor(n / 100)] + ' '
    const rem = n % 100
    if (rem >= 20) r += tens[Math.floor(rem / 10)] + ' ' + o[rem % 10] + ' '
    else if (rem >= 10) r += teens[rem - 10] + ' '
    else if (rem > 0) r += o[rem] + ' '
    return r.trim()
  }

  let w = ''
  if (rub >= 1_000_000) {
    const m = Math.floor(rub / 1_000_000)
    w += three(m, false) + ' '
    const ld = m % 10
    const l2 = m % 100
    w += (l2 >= 11 && l2 <= 19) ? 'миллионов ' : (ld === 1 ? 'миллион ' : ld >= 2 && ld <= 4 ? 'миллиона ' : 'миллионов ')
  }
  const th = Math.floor((rub % 1_000_000) / 1000)
  if (th > 0) {
    w += three(th, true) + ' '
    const ld = th % 10
    const l2 = th % 100
    w += (l2 >= 11 && l2 <= 19) ? 'тысяч ' : (ld === 1 ? 'тысяча ' : ld >= 2 && ld <= 4 ? 'тысячи ' : 'тысяч ')
  }
  const u = rub % 1000
  w += (u > 0 || rub === 0) ? three(u, false) + ' ' : ''
  w = w.trim().replace(/\s+/g, ' ')

  let kopStr = ''
  if (kop > 0) {
    kopStr = String(kop)
    if (kop === 1) kopStr += ' копейка'
    else if (kop >= 2 && kop <= 4) kopStr += ' копейки'
    else kopStr += ' копеек'
  } else {
    kopStr = '00 копеек'
  }
  return w ? `(${w}) белорусских рублей ${kopStr}` : kopStr
}
