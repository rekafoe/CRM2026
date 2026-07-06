import React, { useRef, useState } from 'react';
import { Modal } from '../../../components/common';
import { AppIcon } from '../../../components/ui/AppIcon';
import { reimportDesignTemplateFile, type DesignTemplate } from '../../../api';
import { parseDesignTemplateImportError } from './designTemplateCatalogUtils';
import '../../../components/admin/ProductManagement.css';

type Props = {
  template: DesignTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
};

export const DesignTemplateReimportModal: React.FC<Props> = ({ template, isOpen, onClose, onDone }) => {
  const svgInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const reset = () => {
    setSvgFile(null);
    setSourceFile(null);
    setError(null);
    setImportErrors([]);
    setWarnings([]);
    if (svgInputRef.current) svgInputRef.current.value = '';
    if (sourceInputRef.current) sourceInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!template) return;
    if (!svgFile && !sourceFile) {
      setError('Выберите SVG/ZIP или исходник');
      return;
    }
    setImporting(true);
    setError(null);
    setImportErrors([]);
    setWarnings([]);
    try {
      const res = await reimportDesignTemplateFile(template.id, { file: svgFile, sourceFile });
      setWarnings(res.data.warnings ?? []);
      if ((res.data.warnings ?? []).length === 0) {
        reset();
        onDone();
        onClose();
      } else {
        onDone();
      }
    } catch (err: unknown) {
      const parsed = parseDesignTemplateImportError(err, 'Ошибка импорта');
      setWarnings(parsed.warnings);
      setImportErrors(parsed.errors);
      setError(parsed.message);
    } finally {
      setImporting(false);
    }
  };

  if (!template) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Обновить из SVG — #${template.id}`}
      className="product-management design-templates-modal"
    >
      <div className="design-template-form">
        <div className="design-template-import-intro">
          <strong>Шаблон «{template.name}»</strong>
          <span>
            Загрузка заменит макет в редакторе (designState). ID шаблона, категория, автор и привязки к продукту
            не меняются.
          </span>
        </div>

        <div className="form-row">
          <label>SVG или ZIP со страницами</label>
          <div className="preview-upload">
            <input
              ref={svgInputRef}
              type="file"
              accept=".svg,.zip"
              className="visually-hidden-file-input"
              onChange={(e) => setSvgFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="lg-btn" onClick={() => svgInputRef.current?.click()}>
              <AppIcon name="download" size="xs" /> Выбрать SVG/ZIP
            </button>
            <p className="form-hint">{svgFile ? svgFile.name : 'Конвенция слоёв photo_*, text_*, trim/bleed/safe'}</p>
          </div>
        </div>

        <div className="form-row">
          <label>Исходник (опционально)</label>
          <div className="preview-upload">
            <input
              ref={sourceInputRef}
              type="file"
              accept=".ai,.cdr,.indd,.indt,.pdf,.svg"
              className="visually-hidden-file-input"
              onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="lg-btn" onClick={() => sourceInputRef.current?.click()}>
              Выбрать исходник
            </button>
            <p className="form-hint">{sourceFile ? sourceFile.name : 'Только исходник без SVG оставит шаблон draft'}</p>
          </div>
        </div>

        {error && <p className="design-categories-modal-error">{error}</p>}
        {importErrors.length > 0 && (
          <div className="design-template-import-errors">
            <strong>Ошибка импорта:</strong>
            <ul>{importErrors.map((entry) => <li key={entry}>{entry}</li>)}</ul>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="design-template-import-warnings">
            <strong>Предупреждения:</strong>
            <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="lg-btn" onClick={handleClose} disabled={importing}>
            Отмена
          </button>
          <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleSubmit()} disabled={importing}>
            {importing ? 'Импорт…' : 'Обновить макет'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
