declare module 'multer';

declare module 'pdf-lib' {
  export interface PDFDocumentLoadOptions {
    ignoreEncryption?: boolean;
  }
  export interface RGB {
    r: number;
    g: number;
    b: number;
  }
  export const StandardFonts: {
    Helvetica: string;
  };
  export function rgb(r: number, g: number, b: number): RGB;
  export interface PDFFont {
    name: string;
  }
  export class PDFDocument {
    static load(data: ArrayBuffer | Uint8Array, options?: PDFDocumentLoadOptions): Promise<PDFDocument>;
    static create(): Promise<PDFDocument>;
    getPageCount(): number;
    getPages(): PDFPage[];
    getPage(index: number): PDFPage;
    getPageIndices(): number[];
    addPage(size?: [number, number] | PDFPage): PDFPage;
    copyPages(source: PDFDocument, indices: number[]): Promise<PDFPage[]>;
    embedFont(font: string): Promise<PDFFont>;
    save(): Promise<Uint8Array>;
  }
  export class PDFPage {
    getSize(): { width: number; height: number };
    getBleedBox?(): { x: number; y: number; width: number; height: number };
    drawText(text: string, options?: { x?: number; y?: number; size?: number; font?: PDFFont; color?: RGB }): void;
  }
}

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
  interface PizZipFile {
    dir: boolean;
    asText(): string;
    asBinary(): string;
    asNodeBuffer(): Buffer;
  }

  class PizZip {
    constructor(content: string | Buffer, options?: any);
    generate(options: { type: string; compression?: string }): Buffer;
    files: { [key: string]: PizZipFile };
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
    eachRow(callback: (row: Row, rowNumber: number) => void): void;
    insertRows(rowNumber: number, rows: any[], options?: any): void;
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
    address: string;
    numFmt?: string;
    border?: Partial<Border>;
    fill?: Partial<Fill>;
    font?: Partial<Font>;
    alignment?: Partial<Alignment>;
  }

  interface CellStyle {
    border?: Partial<Border>;
    fill?: Partial<Fill>;
    font?: Partial<Font>;
    alignment?: Partial<Alignment>;
    numFmt?: string;
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
    worksheets: Worksheet[];
    xlsx: {
      readFile(path: string): Promise<WorkbookClass>;
      writeBuffer(options?: { useStyles?: boolean; useSharedStrings?: boolean }): Promise<Buffer>;
      writeFile(path: string): Promise<void>;
    };
  }

  const ExcelJS: {
    Workbook: new () => WorkbookClass;
  };

  export default ExcelJS;
}
