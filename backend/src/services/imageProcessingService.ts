import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export interface PhotoSize {
  name: string;
  width: number;
  height: number;
  ratio: number;
}

export interface ProcessingOptions {
  cropMode: 'crop' | 'fit'; // crop - обрезать, fit - вписать с белыми полями
  quality: number; // 1-100
  format: 'jpeg' | 'png';
}

export interface ProcessedPhoto {
  originalPath: string;
  processedPath: string;
  size: PhotoSize;
  options: ProcessingOptions;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
    fileSize: number;
  };
}

export class ImageProcessingService {
  // Стандартные размеры фотографий
  static readonly PHOTO_SIZES: PhotoSize[] = [
    { name: '9x13', width: 900, height: 1300, ratio: 0.692 },
    { name: '10x15', width: 1000, height: 1500, ratio: 0.667 },
    { name: '13x18', width: 1300, height: 1800, ratio: 0.722 },
    { name: '15x21', width: 1500, height: 2100, ratio: 0.714 },
    { name: '18x24', width: 1800, height: 2400, ratio: 0.75 },
    { name: '20x30', width: 2000, height: 3000, ratio: 0.667 },
    { name: '21x29.7', width: 2100, height: 2970, ratio: 0.707 }
  ];

  /**
   * Обработка фотографии под выбранный размер
   */
  static async processPhoto(
    inputPath: string, 
    size: PhotoSize, 
    options: ProcessingOptions
  ): Promise<ProcessedPhoto> {
    try {
      console.log(`🖼️ Processing photo: ${inputPath} to size ${size.name}`);
      
      // Получаем метаданные оригинального изображения
      const originalMetadata = await sharp(inputPath).metadata();
      const originalWidth = originalMetadata.width || 0;
      const originalHeight = originalMetadata.height || 0;
      
      console.log(`📏 Original size: ${originalWidth}x${originalHeight}`);

      let sharpInstance = sharp(inputPath);

      if (options.cropMode === 'crop') {
        // Режим кропа - обрезаем изображение под нужный размер
        sharpInstance = sharpInstance.resize(size.width, size.height, {
          fit: 'cover',
          position: 'center'
        });
      } else {
        // Режим вписывания - вписываем с белыми полями
        sharpInstance = sharpInstance.resize(size.width, size.height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        });
      }

      // Применяем качество и формат
      if (options.format === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: options.quality });
      } else {
        sharpInstance = sharpInstance.png({ quality: options.quality });
      }

      // Генерируем путь для обработанного файла
      const timestamp = Date.now();
      const filename = `processed_${size.name}_${timestamp}.${options.format}`;
      const outputPath = path.join(__dirname, '../uploads/processed', filename);
      
      // Создаем папку если не существует
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Обрабатываем и сохраняем изображение
      await sharpInstance.toFile(outputPath);

      // Получаем метаданные обработанного изображения
      const processedMetadata = await sharp(outputPath).metadata();
      const fileStats = fs.statSync(outputPath);

      const result: ProcessedPhoto = {
        originalPath: inputPath,
        processedPath: outputPath,
        size,
        options,
        metadata: {
          originalWidth,
          originalHeight,
          processedWidth: processedMetadata.width || 0,
          processedHeight: processedMetadata.height || 0,
          fileSize: fileStats.size
        }
      };

      console.log(`✅ Photo processed successfully: ${outputPath}`);
      console.log(`📊 Processed size: ${result.metadata.processedWidth}x${result.metadata.processedHeight}`);
      console.log(`📁 File size: ${(result.metadata.fileSize / 1024).toFixed(2)}KB`);

      return result;
    } catch (error) {
      console.error('❌ Error processing photo:', error);
      throw error;
    }
  }

  /**
   * Умный кроп с ИИ (базовая версия - центрирование)
   * TODO: Интеграция с реальным ИИ для распознавания важных элементов
   */
  static async smartCrop(
    inputPath: string, 
    size: PhotoSize, 
    options: ProcessingOptions
  ): Promise<ProcessedPhoto> {
    try {
      console.log(`🤖 Smart crop processing: ${inputPath}`);
      
      // Пока что используем центрирование
      // В будущем здесь будет ИИ анализ изображения
      const metadata = await sharp(inputPath).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;
      
      // Определяем, какую сторону обрезать
      const targetRatio = size.width / size.height;
      const originalRatio = originalWidth / originalHeight;
      
      let cropOptions: any = {
        fit: 'cover',
        position: 'center'
      };

      // Если изображение портретное, а нужен альбомный - обрезаем по высоте
      if (originalRatio < targetRatio) {
        cropOptions.position = 'top'; // Сохраняем верхнюю часть
      } else if (originalRatio > targetRatio) {
        cropOptions.position = 'center'; // Центрируем
      }

      const processedOptions = { ...options, cropMode: 'crop' as const };
      
      // Временно переопределяем позицию кропа
      const sharpInstance = sharp(inputPath)
        .resize(size.width, size.height, cropOptions);

      if (processedOptions.format === 'jpeg') {
        sharpInstance.jpeg({ quality: processedOptions.quality });
      } else {
        sharpInstance.png({ quality: processedOptions.quality });
      }

      const timestamp = Date.now();
      const filename = `smart_crop_${size.name}_${timestamp}.${processedOptions.format}`;
      const outputPath = path.join(__dirname, '../uploads/processed', filename);
      
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await sharpInstance.toFile(outputPath);

      const processedMetadata = await sharp(outputPath).metadata();
      const fileStats = fs.statSync(outputPath);

      return {
        originalPath: inputPath,
        processedPath: outputPath,
        size,
        options: processedOptions,
        metadata: {
          originalWidth,
          originalHeight,
          processedWidth: processedMetadata.width || 0,
          processedHeight: processedMetadata.height || 0,
          fileSize: fileStats.size
        }
      };
    } catch (error) {
      console.error('❌ Error in smart crop:', error);
      throw error;
    }
  }

  /**
   * Получение списка доступных размеров
   */
  static getAvailableSizes(): PhotoSize[] {
    return this.PHOTO_SIZES;
  }

  /**
   * Получение размера по имени
   */
  static getSizeByName(name: string): PhotoSize | undefined {
    return this.PHOTO_SIZES.find(size => size.name === name);
  }

  /**
   * Создание превью изображения
   */
  static async createPreview(inputPath: string, maxSize: number = 800): Promise<string> {
    try {
      const timestamp = Date.now();
      const filename = `preview_${timestamp}.jpg`;
      const outputPath = path.join(__dirname, '../uploads/previews', filename);
      
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await sharp(inputPath)
        .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error('❌ Error creating preview:', error);
      throw error;
    }
  }
}
