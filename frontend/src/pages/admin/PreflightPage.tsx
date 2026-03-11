import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../../components/ui/AppIcon';
import '../../styles/admin-page-layout.css';

export const PreflightPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="admin-page-layout preflight-page">
      <div className="admin-page-header">
        <button onClick={() => navigate('/adminpanel')} className="back-btn">
          ← Назад
        </button>
        <h1>
          <AppIcon name="layers" size="sm" /> Префлайт
        </h1>
      </div>
      <div className="admin-page-content">
        <div className="preflight-card">
          <div className="preflight-status preflight-status--planned">
            Статус: Запланировано
          </div>
          <p className="preflight-category">Категория: Дизайн и макетирование</p>
          <h2>Описание</h2>
          <p>
            Автоматическая проверка и корректировка макета: полосы, цветовое пространство, шрифты, разрешение, вылеты.
          </p>
          <h2>План реализации</h2>
          <div className="preflight-plan">
            <h3>Форматы: PDF, JPG, PNG, TIFF</h3>
            <table className="preflight-plan-table">
              <thead>
                <tr><th>Формат</th><th>MIME</th><th>Обработчик</th></tr>
              </thead>
              <tbody>
                <tr><td>PDF</td><td>application/pdf</td><td>pdf-lib</td></tr>
                <tr><td>JPG</td><td>image/jpeg</td><td>sharp</td></tr>
                <tr><td>PNG</td><td>image/png</td><td>sharp</td></tr>
                <tr><td>TIFF</td><td>image/tiff</td><td>sharp</td></tr>
              </tbody>
            </table>

            <h3>Что проверять</h3>
            <p><strong>PDF (pdf-lib):</strong> валидность, кол-во страниц, размеры, BleedBox.</p>
            <p><strong>Изображения (JPG, PNG, TIFF) — sharp:</strong> размеры (px), DPI (≥300), цветовое пространство (sRGB/RGB ок, CMYK — предупреждение), размер файла, валидность.</p>

            <h3>Изменения</h3>
            <ol>
              <li><strong>Backend: PreflightService</strong> — backend/src/services/preflightService.ts. По MIME: PDF → pdf-lib, image/jpeg|png|tiff → sharp. Ответ: type, valid, issues, info.</li>
              <li><strong>Backend: эндпоинт</strong> — GET /api/orders/:orderId/files/:fileId/preflight в orders.ts. Авторизация как у download.</li>
              <li><strong>Backend:</strong> добавить pdf-lib в package.json.</li>
              <li><strong>Frontend: API</strong> — getPreflightReport(orderId, fileId), тип PreflightReport.</li>
              <li><strong>Frontend: FilesModal</strong> — кнопка «Проверить» для PDF, JPG, PNG, TIFF.</li>
              <li><strong>Frontend: PreflightReportModal</strong> — универсальный отчёт (PDF: страницы, BleedBox; изображения: размеры, DPI, цвет; issues, статусы).</li>
            </ol>

            <h3>Поток</h3>
            <p>FilesModal → API (GET preflight) → Backend → PreflightService (PDF→pdfLib, изображения→sharp) → JSON → PreflightReportModal.</p>

            <h3>Ограничения</h3>
            <p>Изображения: DPI может отсутствовать в metadata.density — показывать «DPI не указан» как предупреждение.</p>
          </div>

          <h2>Сервис работы с макетами (Design Editor)</h2>
          <p>
            Полноценный сервис по образцу PicPac: загрузка дизайнов (CDR/AI/InDesign), выбор шаблона, веб-редактор со страницами, линиями безопасности, вылетами.
          </p>
          <div className="preflight-plan">
            <h3>Поток пользователя</h3>
            <ol>
              <li><strong>Выбор дизайна</strong> — сетка шаблонов с категориями (Выпускной, Свадьба, Дети, Love story и т.д.).</li>
              <li><strong>Редактор</strong> — канвас с разворотами, левая панель (Фото, Текст, Шаблоны, Фон, Коллажи, Стикеры), линейки, линии безопасности, линия загиба, корешок.</li>
              <li><strong>Менеджер разворотов</strong> — навигация по страницам/разворотам (Обложка, Страницы 1–2, 3–4…).</li>
              <li><strong>Сохранение и заказ</strong> — экспорт в PDF, привязка к заказу в CRM.</li>
            </ol>

            <h3>Форматы и сохранение шрифтов</h3>
            <p><strong>PDF — плохой вариант:</strong> при парсинге PDF текст превращается в контуры (outlines), шрифты и форматирование теряются. Редактировать текст нельзя.</p>
            <p><strong>Рекомендуемый путь — IDML (InDesign Markup Language):</strong></p>
            <ul>
              <li>InDesign: File → Export → InDesign Markup (IDML). XML-формат, шрифты, стили, разметка сохраняются.</li>
              <li><strong>@imgly/idml-importer</strong> + <strong>CE.SDK</strong> — парсит IDML в сцену редактора с сохранением: font family, bold/italic, позиции, слои, изображения, заливки, обводки. Поддержка TypefaceResolver для маппинга шрифтов (Google Fonts или свои).</li>
              <li>Ссылка: <a href="https://img.ly/docs/cesdk/node/open-the-editor/import-design/from-indesign-ba3988/" target="_blank" rel="noreferrer">IMG.LY InDesign Import</a></li>
            </ul>
            <p><strong>AI (Illustrator):</strong> .ai файлы — по сути PDF. Парсинг теряет редактируемый текст. Лучше экспорт в SVG или использование InDesign для многостраничных макетов.</p>
            <p><strong>CDR (CorelDRAW):</strong> проприетарный бинарный формат, нет надёжных open-source парсеров. corelDraw2HTMLCanvas — только базовые фигуры.</p>
            <p><strong>Итог:</strong> для InDesign — IDML + @imgly/idml-importer. CE.SDK — платный, но готовый редактор (Design Editor UI). Альтернатива — свой редактор на Fabric.js + парсинг IDML вручную (сложнее).</p>

            <h3>Архитектура</h3>
            <table className="preflight-plan-table">
              <thead>
                <tr><th>Компонент</th><th>Назначение</th></tr>
              </thead>
              <tbody>
                <tr><td>design_templates</td><td>Каталог шаблонов: id, name, category, preview_url, spec (размеры, страницы)</td></tr>
                <tr><td>design_projects</td><td>Проекты пользователей: template_id, pages_json, status</td></tr>
                <tr><td>Template Converter</td><td>IDML → CE.SDK scene (шрифты сохраняются) или PDF/SVG → JSON (шрифты теряются)</td></tr>
                <tr><td>Web Editor</td><td>CE.SDK (платно) или Fabric.js / Konva.js — канвас, drag-and-drop, слои</td></tr>
                <tr><td>Export Service</td><td>JSON → PDF (pdf-lib, Puppeteer) для печати</td></tr>
              </tbody>
            </table>

            <h3>Ключевые экраны</h3>
            <ol>
              <li><strong>Выбрать дизайн</strong> — теги категорий + сетка превью шаблонов.</li>
              <li><strong>Редактор</strong> — хедер (товар, сохранить, предпросмотр, заказать), тулбар (добавить фото/текст/коллаж), левая панель (ассеты), канвас (разворот + направляющие), низ (менеджер разворотов, зум, ошибки).</li>
            </ol>

            <h3>Интеграция с CRM</h3>
            <p>Готовый макет → экспорт PDF → загрузка в order_files → префлайт → утверждение → в производство.</p>

            <h3>Этапы реализации</h3>
            <ol>
              <li>Каталог шаблонов (БД, админка, API).</li>
              <li>Дизайнеры экспортируют InDesign в IDML (шрифты, форматирование сохраняются).</li>
              <li>Конвертация: @imgly/idml-importer + CE.SDK или свой парсер IDML → JSON.</li>
              <li>Редактор: CE.SDK (готовый UI) или Fabric.js + загрузка сцены.</li>
              <li>Экспорт в PDF для печати, привязка к заказу.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
