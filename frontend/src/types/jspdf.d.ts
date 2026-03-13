declare module 'jspdf' {
  export interface jsPDFOptions {
    orientation?: 'p' | 'portrait' | 'l' | 'landscape';
    unit?: string;
    format?: string | number[];
    compress?: boolean;
    precision?: number;
    userUnit?: number;
    hotfixes?: string[];
    putOnlyUsedFonts?: boolean;
    floatPrecision?: number | 16;
  }
  export class jsPDF {
    constructor(options?: jsPDFOptions);
    addPage(format?: string | number[], orientation?: string, options?: unknown): this;
    addImage(imageData: string, format: string, x: number, y: number, w: number, h: number, alias?: string, compression?: string): this;
    setFontSize(size: number): this;
    text(text: string, x: number, y: number, options?: unknown): this;
    save(name?: string, options?: unknown): void;
    [key: string]: unknown;
  }
}
