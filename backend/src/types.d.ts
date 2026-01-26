declare module 'multer';

// Декларации типов для библиотек без официальных типов
declare module 'docxtemplater' {
  interface DocxtemplaterOptions {
    paragraphLoop?: boolean;
    linebreaks?: boolean;
  }

  class Docxtemplater {
    constructor(zip: any, options?: DocxtemplaterOptions);
    render(data: any): void;
    getZip(): any;
  }

  export = Docxtemplater;
}

declare module 'pizzip' {
  class PizZip {
    constructor(content: string | Buffer, options?: any);
    generate(options: { type: string; compression?: string }): Buffer;
  }

  export = PizZip;
}

declare module 'exceljs' {
  interface Workbook {
    addWorksheet(name: string): Worksheet;
    xlsx: {
      writeBuffer(options?: { useStyles?: boolean; useSharedStrings?: boolean }): Promise<Buffer>;
      writeFile(path: string): Promise<void>;
    };
  }

  interface Worksheet {
    getRow(rowNumber: number): Row;
    getCell(address: string): Cell;
    mergeCells(range: string): void;
    columns: Array<{ width?: number }>;
    model?: {
      merges?: Array<string | { s: { r: number; c: number }; e: { r: number; c: number } }>;
    };
  }

  interface Row {
    height?: number;
    getCell(columnNumber: number): Cell;
    eachCell(callback: (cell: Cell, colNumber: number) => void): void;
    insertRows(rowNumber: number, rows: any[], options?: any): void;
  }

  interface Cell {
    value: any;
    style: Partial<CellStyle>;
  }

  interface CellStyle {
    border?: Partial<Border>;
    fill?: Partial<Fill>;
    font?: Partial<Font>;
    alignment?: Partial<Alignment>;
  }

  interface Border {
    top?: BorderStyle;
    left?: BorderStyle;
    bottom?: BorderStyle;
    right?: BorderStyle;
  }

  interface BorderStyle {
    style?: string;
    color?: { argb?: string };
  }

  interface Fill {
    type?: string;
    pattern?: string;
    fgColor?: { argb?: string };
  }

  interface Font {
    size?: number;
    bold?: boolean;
  }

  interface Alignment {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  }

  class WorkbookClass {
    constructor();
    addWorksheet(name: string): Worksheet;
    xlsx: {
      writeBuffer(options?: { useStyles?: boolean; useSharedStrings?: boolean }): Promise<Buffer>;
      writeFile(path: string): Promise<void>;
    };
  }

  const ExcelJS: {
    Workbook: new () => WorkbookClass;
  };

  export default ExcelJS;
}
