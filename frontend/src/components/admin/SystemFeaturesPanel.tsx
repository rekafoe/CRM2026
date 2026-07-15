import React, { useState } from 'react';
import './SystemFeaturesPanel.css';

interface Feature {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'calculator' | 'communication' | 'production' | 'integration' | 'analytics' | 'design' | 'storage';
  status: 'planned' | 'in-development' | 'beta' | 'released';
  plan: string;
}

const SystemFeaturesPanel: React.FC = () => {
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [showModal, setShowModal] = useState(false);

  const features: Feature[] = [
    // Основное ядро системы
    {
      id: 'core-base',
      title: 'Основное ядро системы',
      description: 'Базовая лицензия для юр.лиц. Учет заказов, клиентская база, первичная бухгалтерия и хранилище документов',
      category: 'core',
      status: 'released',
      plan: 'Основные модули: управление заказами, клиентская база, базовый учет. Интеграция с хранением документов.'
    },
    
    // Калькуляторы
    {
      id: 'calculator-product',
      title: 'Продуктовый калькулятор',
      description: 'Бесступенчатый расчет стоимости на основе шаблонов. Исключение несовместимых операций и материалов',
      category: 'calculator',
      status: 'in-development',
      plan: 'Реализовать калькулятор с шаблонами, проверкой совместимости материалов и операций. Система правил для валидации.'
    },
    {
      id: 'calculator-operational',
      title: 'Операционный калькулятор',
      description: 'Расчет нестандартных изделий с произвольными параметрами. Автоматическая раскладка на допустимых форматах',
      category: 'calculator',
      status: 'planned',
      plan: 'Модуль расчета для кастомных заказов. Алгоритм автоматической раскладки. Поддержка нестандартных форматов.'
    },
    {
      id: 'calculator-technologist',
      title: 'Калькулятор-технолог',
      description: 'Расчет и выбор лучшего производственного сценария. Автоматический подбор оборудования и постановка задач',
      category: 'calculator',
      status: 'planned',
      plan: 'Система расчета оптимальных производственных сценариев. Интеграция с оборудованием. Автоматическая постановка задач.'
    },
    
    // Коммуникации
    {
      id: 'mail-client',
      title: 'Почтовый клиент с общим корпоративным адресом',
      description: 'Автоматическая регистрация клиента из письма, назначение менеджера, фиксация переписки',
      category: 'communication',
      status: 'planned',
      plan: 'Интеграция email сервиса. Автоматическое парсинг писем. Система назначения менеджеров. Привязка переписки к заказам.'
    },
    {
      id: 'mail-bot',
      title: 'Мэйл-бот',
      description: 'Автоматическая отправка уведомлений от имени менеджера. Десятки настроенных сценариев',
      category: 'communication',
      status: 'planned',
      plan: 'Система сценариев для автоматических уведомлений. Шаблоны писем. Гибкие триггеры для отправки.'
    },
    {
      id: 'inbox-funnel',
      title: 'Единый inbox (воронка чатов)',
      description: 'TG Bot + Viber PA + Instagram Business + формы сайта в одном inbox CRM. Детали: /adminpanel/inbox-plan',
      category: 'communication',
      status: 'planned',
      plan: 'Сначала security hotfix (bcrypt, IDOR, API-ключи, webhook secrets). Затем схема conversations/messages/attachments/events, Telegram ingest, UI «Чаты», формы сайта. Далее Viber PA и Instagram adapter. Блокер: личные аккаунты — нужен Путь A (бизнес-каналы) или B (omnichannel-SaaS). Полный план: docs/inbox-funnel-and-security-plan.md и страница /adminpanel/inbox-plan. MVP ~6–8 нед (TG+формы+UI).'
    },
    {
      id: 'chat',
      title: 'Чат для сотрудников и клиентов',
      description: 'Клиенты отправляют сообщения из личного кабинета. Сотрудники отвечают и переписываются между собой',
      category: 'communication',
      status: 'planned',
      plan: 'Часть воронки чатов (см. inbox-funnel). Встроенный чат в ЛК + внутренний чат сотрудников поверх единого inbox.'
    },
    {
      id: 'online-chat',
      title: 'Онлайн-чат, форма обратной связи и заказ звонка на сайте',
      description: 'Посетитель сайта получает поддержку. Свободный менеджер обрабатывает сообщения не покидая CRM',
      category: 'communication',
      status: 'planned',
      plan: 'MVP: формы сайта → POST /api/inbox/website-inquiry. Live-chat виджет + WebSocket — отдельная фаза после inbox. См. /adminpanel/inbox-plan.'
    },
    {
      id: 'telegram-bot',
      title: 'Телеграм-бот',
      description: 'Автоответчик о стадии заказа, помощь с расчетом и оплатой, утверждение макета, формирование акта-сверки',
      category: 'communication',
      status: 'in-development',
      plan: 'База webhook уже есть. Следующий шаг воронки: ingest сообщений/файлов в inbox вместо hint на Mini App; TELEGRAM_WEBHOOK_SECRET обязателен в prod. См. /adminpanel/inbox-plan.'
    },
    {
      id: 'sms-bot',
      title: 'СМС-бот',
      description: 'Автоматическая отправка СМС на мобильный телефон клиента при необходимости',
      category: 'communication',
      status: 'planned',
      plan: 'Интеграция с SMS-провайдерами. Сценарии отправки. Управление черными списками. Очередь сообщений.'
    },
    {
      id: 'voice-bot',
      title: 'Voice-бот (автодозвонатор)',
      description: 'Голосовой бот-коллектор для напоминаний о просроченных платежах и досудебных уведомлений',
      category: 'communication',
      status: 'planned',
      plan: 'Интеграция с телефонией. Голосовой синтез. Сценарии звонков. Система распознавания ответов.'
    },
    
    // Производство
    {
      id: 'queue-design',
      title: 'Очередь дизайна',
      description: 'Контроль работы с фиксацией времени. Автоматическая постановка задач для дизайнеров, удаленщиков и фрилансеров',
      category: 'production',
      status: 'planned',
      plan: 'Система очередей задач. Тайм-трекинг. Назначение исполнителей. Статусы выполнения. Уведомления.'
    },
    {
      id: 'queue-production',
      title: 'Очередь производства',
      description: 'Пооперационный список задач с корректировкой и отметкой готовности. Формирование тех.карт и сменных заданий',
      category: 'production',
      status: 'planned',
      plan: 'Пооперационное планирование. Технологические карты. Сменные задания. Отчетность по операциям. Контроль качества.'
    },
    {
      id: 'queue-shipping',
      title: 'Очередь отгрузок',
      description: 'Генерация закрывающих документов при отгрузке. Запрос и хранение доверенностей получателей',
      category: 'production',
      status: 'planned',
      plan: 'Автоматизация отгрузок. Генерация документов. Управление доверенностями. Интеграция с логистикой.'
    },
    {
      id: 'queue-subcontracting',
      title: 'Очередь подрядных работ',
      description: 'Контроль взаиморасчетов и срок выполнения заказов, отправленных подрядчикам',
      category: 'production',
      status: 'planned',
      plan: 'Управление подрядчиками. Контроль дедлайнов. Система взаиморасчетов. Отчетность по субподряду.'
    },
    {
      id: 'queue-prepress',
      title: 'Препресс-очередь',
      description: 'Рабочий стол препресс-инженера. Доступ операторам ЦПМ и CTP. Спуск полос и объединение заказов',
      category: 'production',
      status: 'planned',
      plan: 'Специализированный интерфейс для препресс. Инструменты спуска полос. Объединение заказов. Отслеживание версий.'
    },
    {
      id: 'auto-imposition',
      title: 'Автоматическая генерация спусков',
      description: 'Разгрузка от рутины. Оставляет специалистам только заказы, требующие индивидуального подхода',
      category: 'production',
      status: 'planned',
      plan: 'Алгоритм автоматического спуска полос. Интеграция с препресс-софтом. Поддержка различных форматов.'
    },
    {
      id: 'combined-imposition',
      title: 'Генерация спусков для сборных тиражей',
      description: 'Автоматическое объединение заказов с одинаковыми материалами в сборные спуски',
      category: 'production',
      status: 'planned',
      plan: 'Алгоритм группировки заказов. Расчет оптимальных спусков. Минимизация отходов. Автоматизация производственного планирования.'
    },
    {
      id: 'production-accounting',
      title: 'Модуль оперативного производственного учета',
      description: 'Принимая задачи на телефон, сотрудники самостоятельно отмечают выполнение и расход материалов в реальном времени',
      category: 'production',
      status: 'planned',
      plan: 'Мобильный интерфейс для производственных задач. Учет материалов. Тайм-трекинг. Мгновенная синхронизация.'
    },
    {
      id: 'production-dashboard',
      title: 'Дашборд производства',
      description: 'Визуализация загрузки производственных участков. График отставания (Slip Chart)',
      category: 'production',
      status: 'planned',
      plan: 'Визуализация производственных мощностей. Real-time мониторинг. Аналитика загрузки. График отставания.'
    },
    {
      id: 'production-calendar',
      title: 'Производственный календарь',
      description: 'Разбивка процесса на этапы, корректировка сроков, планирование операций и назначение исполнителей',
      category: 'production',
      status: 'planned',
      plan: 'Календарное планирование. Декомпозиция проектов. Управление ресурсами. Система уведомлений.'
    },
    {
      id: 'gantt-chart',
      title: 'Диаграмма Ганта',
      description: 'Упрощение декомпозиции проектов, демонстрация вовлеченности рабочих центров',
      category: 'production',
      status: 'planned',
      plan: 'Визуализация проектов в формате Ганта. Интерактивное планирование. Зависимости между задачами.'
    },
    {
      id: 'kanban',
      title: 'Канбан',
      description: 'Меняйте последовательность задач перетягиванием карточек. Список скорректируется, сотрудники получат уведомления',
      category: 'production',
      status: 'planned',
      plan: 'Канбан-доски для управления задачами. Drag-and-drop интерфейс. Автоматические уведомления. История изменений.'
    },
    
    // Интеграции
    {
      id: 'integration-delivery',
      title: 'Интеграция с сервисами доставок',
      description: 'Автоматический расчет цены и сроков. Отображение пунктов выдачи на карте. Формирование ТТН и трек-кодов',
      category: 'integration',
      status: 'planned',
      plan: 'API интеграция с курьерскими службами. Расчет стоимости доставки. Геокарты. Генерация ТТН. Трекинг посылок.'
    },
    {
      id: 'integration-payments',
      title: 'Интеграция с платежными агрегаторами',
      description: 'Приём онлайн-платежей на сайте, в личном кабинете или по ссылке',
      category: 'integration',
      status: 'planned',
      plan: 'Поддержка множества платежных систем. Безопасные транзакции. Инвойсы. Возвраты. Отчетность.'
    },
    {
      id: 'integration-qr',
      title: 'Прием платежей по QR-коду',
      description: 'Клиенты оплачивают сфотографировав QR-код на сайте или по ссылке',
      category: 'integration',
      status: 'planned',
      plan: 'Генерация QR-кодов. Поддержка различных стандартов. Интеграция с банками. Мобильные платежи.'
    },
    {
      id: 'integration-1c',
      title: 'Интеграция с 1С-бухгалтерией',
      description: 'Экспорт/импорт поступлений, счетов и документов. Двусторонняя связь в реальном времени',
      category: 'integration',
      status: 'planned',
      plan: 'Синхронизация с 1С. Двусторонний обмен данными. Автоматизация документооборота. Конвертация форматов.'
    },
    {
      id: 'integration-bank',
      title: 'Интеграция с банком',
      description: 'Автоматическая регистрация поступлений на расчетный счет. Оповещение и привязка к заказу',
      category: 'integration',
      status: 'planned',
      plan: 'Интеграция с банковскими API. Автоматическое сопоставление платежей. Уведомления. Реконсиляция.'
    },
    {
      id: 'integration-kkt',
      title: 'Интеграция с кассовым аппаратом',
      description: 'Работа без ручного ввода. Принтеры чеков и один ККТ в облаке',
      category: 'integration',
      status: 'planned',
      plan: 'Облачная касса. Интеграция с фискальными регистраторами. Автоматическая печать чеков. Соответствие ФЗ-54.'
    },
    {
      id: 'integration-atc',
      title: 'Интеграция с облачной АТС',
      description: 'Автоматический перевод на менеджера, открытие карточки клиента по звонку, набор из CRM, запись переговоров',
      category: 'integration',
      status: 'planned',
      plan: 'CTI интеграция. Определение звонящего. Автоматическое открытие карточек. Запись разговоров. Статистика звонков.'
    },
    {
      id: 'integration-mobile',
      title: 'Интеграция с мобильными телефонами',
      description: 'Приложение для Android. Открытие карточки клиента по звонку, набор из CRM, запись',
      category: 'integration',
      status: 'planned',
      plan: 'Мобильное приложение для Android. CTI функционал. Синхронизация с CRM. Голосовые заметки.'
    },
    {
      id: 'api-production',
      title: 'API для интеграции со сторонней производственной системой',
      description: 'Подключение любимого софта к единой экосистеме',
      category: 'integration',
      status: 'planned',
      plan: 'RESTful API. Webhooks. Документация. Примеры интеграций. Тестовое окружение.'
    },
    {
      id: 'api-crm',
      title: 'API для интеграции со сторонней CRM или сайтом',
      description: 'Организация приема заказов со сторонних ресурсов. Полная автоматизация',
      category: 'integration',
      status: 'planned',
      plan: 'Публичное API. Аутентификация. Webhook-уведомления. SDK. Документация с примерами.'
    },
    
    // Аналитика
    {
      id: 'dashboard-manager',
      title: 'Контрольная панель руководителя',
      description: 'Управление бизнесом из любой точки. Ключевые показатели в едином интерактивном отчете',
      category: 'analytics',
      status: 'planned',
      plan: 'Дашборд с KPI. Интерактивные графики. Фильтры и группировки. Экспорт отчетов. Real-time обновления.'
    },
    {
      id: 'dashboard-marketing',
      title: 'Дашборд маркетолога',
      description: 'ABC/XYZ анализ, LTV, количество заказов и периодичность, средний чек, конверсия',
      category: 'analytics',
      status: 'planned',
      plan: 'ABC/XYZ сегментация. Расчет LTV. Анализ периодичности заказов (RFM). Конверсионная воронка. Когортный анализ.'
    },
    {
      id: 'module-payments',
      title: 'Модуль "Платежи"',
      description: 'Рабочий стол бухгалтера или кассира-операциониста. Освобождает менеджера от контроля счетов',
      category: 'analytics',
      status: 'planned',
      plan: 'Управление платежами. Состояние счетов. Прием наличных. Интеграция с банками. Автосопоставление.'
    },
    {
      id: 'module-documents',
      title: 'Модуль "Документы"',
      description: 'Автоформирование актов-сверок. Кастомизация коммерческих предложений и платежных документов',
      category: 'analytics',
      status: 'planned',
      plan: 'Генератор документов. Шаблоны актов и накладных. Кастомизация брендинга. Электронная подпись.'
    },
    {
      id: 'report-constructor',
      title: 'Конструктор отчетов с экспортом в Excel',
      description: 'Формирование структуры отчетов набором тегов. Актуальная информация в привычном формате',
      category: 'analytics',
      status: 'planned',
      plan: 'Конструктор отчетов. Drag-and-drop интерфейс. Расширенная фильтрация. Экспорт в Excel/PDF. Автоматизация.'
    },
    {
      id: 'motivation-schemes',
      title: 'Конструктор мотивационных схем для отдела продаж',
      description: 'Гибкая система оплат по KPI для всего отдела или особых сотрудников',
      category: 'analytics',
      status: 'planned',
      plan: 'Настройка KPI. Различные схемы оплаты. Автоматический расчет бонусов. Отчетность по мотивации.'
    },
    {
      id: 'work-accounting',
      title: 'Автоматический учет работ производственного персонала',
      description: 'Фиксация времени, затраченного на выполнение задач с комментариями при превышении норматива',
      category: 'analytics',
      status: 'planned',
      plan: 'Тайм-трекинг. Нормативы времени. Алерты при превышении. Отчеты по выработке. Интеграция с начислением ЗП.'
    },
    {
      id: 'salary-calculation',
      title: 'Автоматический расчет ЗП, зарплатные ведомости',
      description: 'Начисление ЗП на основании окладов, премий, рабочих часов, KPI и выработки',
      category: 'analytics',
      status: 'planned',
      plan: 'Расчет ЗП. Учет отработанного времени. Система премий. Учет KPI. Формирование ведомостей.'
    },
    
    // Дизайн и макетирование
    {
      id: 'design-constructor',
      title: 'Онлайн-конструктор макетов',
      description: 'Разработка макетов по шаблону, внесение изменений в архивные файлы или макеты дизайнера',
      category: 'design',
      status: 'planned',
      plan: 'Веб-редактор макетов. Библиотека шаблонов. Интеграция с файловым хранилищем. Совместная работа.'
    },
    {
      id: 'template-library',
      title: 'Библиотека шаблонов',
      description: 'Тысячи готовых дизайн-шаблонов для самостоятельной доработки клиентом в онлайн-конструкторе',
      category: 'design',
      status: 'planned',
      plan: 'Каталог шаблонов. Категоризация. Поиск и фильтрация. Предпросмотр. Интеграция с конструктором.'
    },
    {
      id: 'preflight',
      title: 'Префлайт',
      description: 'Автоматическая проверка и корректировка макета: полосы, цветовое пространство, шрифты, разрешение, вылеты',
      category: 'design',
      status: 'planned',
      plan: 'Автоматическая валидация макетов. Проверка вылетов. Контроль качества. Предупреждения. Автокоррекция.'
    },
    {
      id: 'dam-system',
      title: 'DAM-система',
      description: 'Автоматически формирующийся архив макетов с исходниками. Контроль версий, поиск по клиенту, продукту',
      category: 'design',
      status: 'planned',
      plan: 'Цифровой архив активов. Система версионирования. Метаданные. Поиск. Права доступа. Watermarking.'
    },
    {
      id: 'approval-page',
      title: 'Интерактивная страница согласования',
      description: 'Возможность "полистать" не отпечатанный журнал, проверить очередность полос, поменять местами',
      category: 'design',
      status: 'planned',
      plan: 'Интерактивный просмотр макетов. 3D превью журналов. Перестановка полос. Комментарии. Официальное утверждение.'
    },
    {
      id: 'e-catalog',
      title: 'Е-каталог (расширение для страницы согласования)',
      description: 'Электронная версия отпечатанных каталогов для публикации в соцсетях, по ссылке или на сайте',
      category: 'design',
      status: 'planned',
      plan: 'Конвертация печатных каталогов в электронные. Публикация. Ссылки для шаринга. Интеграция с соцсетями.'
    },
    
    // Дополнительные модули
    {
      id: 'storage',
      title: 'Облачное хранилище документов',
      description: 'Данные хранятся в зашифрованном виде в трех распределенных дата-центрах с репликацией',
      category: 'storage',
      status: 'planned',
      plan: 'Облачное хранилище. Шифрование. Репликация в 3 дата-центрах. Резервное копирование. Контроль версий.'
    },
    {
      id: 'personal-cabinet',
      title: 'Личный кабинет (Веб-приложение с web-to-print)',
      description: 'Самостоятельное оформление и отслеживание заказа клиентом, платежи, гарантийки, акты',
      category: 'core',
      status: 'planned',
      plan: 'Веб-приложение личного кабинета. Web-to-print функционал. История заказов. Платежи. Документы.'
    },
    {
      id: 'corporate-portal',
      title: 'Корпоративный портал заказа',
      description: 'Добавление клиентом юр.лиц, филиалов и сотрудников с разграничением полномочий. Персональные цены',
      category: 'core',
      status: 'planned',
      plan: 'Многопользовательский доступ. Иерархия организаций. Роли и права. Персональные цены. Управление филиалами.'
    },
    {
      id: 'showcase-widget',
      title: 'Виджет витрины (с web-to-print)',
      description: 'Встраивается в любой сайт, превращая его в интернет-магазин полиграфии',
      category: 'integration',
      status: 'planned',
      plan: 'Встраиваемый виджет для сайтов. API для кастомизации. Web-to-print. Интеграция с любой платформой.'
    },
    {
      id: 'landing',
      title: 'Лендинг по индивидуальному проекту',
      description: 'Создание посадочных страниц с максимальной конверсией для превращения лида в клиента',
      category: 'design',
      status: 'planned',
      plan: 'UX/UI дизайн. Адаптивная верстка. A/B тестирование. Интеграция с CRM. Аналитика конверсий.'
    },
    {
      id: 'commercial-site',
      title: 'Продающий сайт по индивидуальному проекту',
      description: 'Виртуальный офис, работающий 24/7. Убедительное донесение преимуществ работы с вами',
      category: 'design',
      status: 'planned',
      plan: 'Полноценный сайт-визитка. CMS. Блог. Интеграция с CRM. SEO оптимизация. Аналитика.'
    },
    {
      id: 'material-catalog',
      title: 'Справочник материалов',
      description: 'Массовое заполнение. Подсказки с изображениями. Автоматический подбор толщины по типу и плотности',
      category: 'core',
      status: 'in-development',
      plan: 'Расширенный справочник материалов. Визуальные подсказки. Умный подбор параметров. Импорт/экспорт данных.'
    },
    {
      id: 'equipment-catalog',
      title: 'Справочник оборудования',
      description: 'Расширяет возможности калькулятора, обеспечивая расчет на основе возможностей оборудования',
      category: 'core',
      status: 'planned',
      plan: 'Каталог оборудования. Характеристики. Интеграция с калькулятором. Расчет производительности.'
    },
    {
      id: 'cost-module',
      title: 'Модуль "Себестоимость"',
      description: 'Включение статей себестоимости в цену материалов и операций или добавление к ней',
      category: 'analytics',
      status: 'planned',
      plan: 'Учет себестоимости. Статьи затрат. Маржинальность. Валютная корректировка. Отчеты по прибыльности.'
    },
    {
      id: 'multi-currency',
      title: 'Модуль "Мультивалютность"',
      description: 'Отпускная цена и себестоимость в валюте автоматически пересчитываются в рубли по курсу',
      category: 'analytics',
      status: 'planned',
      plan: 'Поддержка нескольких валют. Автоматический курс. Конвертация цен. Мультивалютная отчетность.'
    },
    {
      id: 'inventory-management',
      title: 'Модуль "Управление запасами"',
      description: 'Формирование потребности в материалах, учет расхода и уведомление о достижении минимальных остатков',
      category: 'production',
      status: 'in-development',
      plan: 'Планирование потребностей. Списание по нормам. Минимальные остатки. Автозаказ. Отчетность.'
    },
    {
      id: 'queue-delivery',
      title: 'Очередь доставок',
      description: 'Формирование ТТН для собственных водителей. Информация о сторонних экспедиторах и транспорте',
      category: 'production',
      status: 'planned',
      plan: 'Управление доставками. Генерация ТТН. Маршрутизация. Трекинг. Учет транспорта.'
    },
    {
      id: 'partner-module',
      title: 'Партнерский модуль',
      description: 'Автоматизация работы с посредниками. Превращение их сайтов в торговые площадки',
      category: 'integration',
      status: 'planned',
      plan: 'Система партнеров. Комиссии. Встраивание виджетов. Личные кабинеты партнеров. Отчетность.'
    },
    {
      id: 'web2print-partners',
      title: 'Web-to-print для партнеров',
      description: 'Партнеры добавляют ваш виджет витрины на свои ресурсы',
      category: 'integration',
      status: 'planned',
      plan: 'Расширение партнерского модуля. Установка виджета на сторонние сайты. Брендинг партнеров.'
    },
    {
      id: 'supply',
      title: 'Снабжение',
      description: 'Автоматизация закупок по сформированным потребностям. Отслеживание задолженности по поставщикам',
      category: 'production',
      status: 'planned',
      plan: 'Планирование закупок. Управление поставщиками. Контроль дебиторки. Автоматизация заказов.'
    },
    {
      id: 'warehouse-full',
      title: 'Склад',
      description: 'Комплексное управление ТМЦ. Пооперационное и валовое списание. Распределенное хранение',
      category: 'production',
      status: 'in-development',
      plan: 'Полнофункциональный склад. Множественные склады. Инвентаризация. Списание. Перемещения.'
    },
    {
      id: 'messenger',
      title: 'Корпоративный мессенджер (мобильное приложение)',
      description: 'Служебная переписка остается служебной. Исключение утечек. Разграничение рабочего и личного',
      category: 'communication',
      status: 'planned',
      plan: 'Мобильное приложение. Корпоративный мессенджер. Безопасность. Разграничение каналов. Архивирование.'
    }
  ];

  const handleFeatureClick = (feature: Feature) => {
    setSelectedFeature(feature);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedFeature(null);
  };

  const categoryNames = {
    core: 'Основной функционал',
    calculator: 'Калькуляторы',
    communication: 'Коммуникации',
    production: 'Производство',
    integration: 'Интеграции',
    analytics: 'Аналитика',
    design: 'Дизайн и макетирование',
    storage: 'Хранилище'
  };

  const statusColors = {
    released: '#10b981',
    'in-development': '#3b82f6',
    beta: '#f59e0b',
    planned: '#6b7280'
  };

  const statusLabels = {
    released: 'Запущено',
    'in-development': 'В разработке',
    beta: 'Бета-версия',
    planned: 'Запланировано'
  };

  const groupedFeatures = features.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, Feature[]>);

  return (
    <div className="system-features-panel">
      <div className="features-header">
        <h2>🚀 Модули системы</h2>
        <p>План развития функционала CRM</p>
      </div>

      <div className="features-categories">
        {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
          <div key={category} className="feature-category">
            <h3 className="category-title">{categoryNames[category as keyof typeof categoryNames]}</h3>
            <div className="features-grid">
              {categoryFeatures.map((feature) => (
                <div
                  key={feature.id}
                  className="feature-card"
                  onClick={() => handleFeatureClick(feature)}
                >
                  <div className="feature-header">
                    <h4>{feature.title}</h4>
                    <span
                      className="feature-status"
                      style={{ backgroundColor: statusColors[feature.status] }}
                    >
                      {statusLabels[feature.status]}
                    </span>
                  </div>
                  <p className="feature-description">{feature.description}</p>
                  <button className="feature-action-btn">План реализации →</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && selectedFeature && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedFeature.title}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-description">
                <h3>Описание</h3>
                <p>{selectedFeature.description}</p>
              </div>
              <div className="modal-plan">
                <h3>План реализации</h3>
                <p>{selectedFeature.plan}</p>
              </div>
              <div className="modal-info">
                <div className="info-item">
                  <span className="info-label">Статус:</span>
                  <span className="info-value">{statusLabels[selectedFeature.status]}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Категория:</span>
                  <span className="info-value">{categoryNames[selectedFeature.category]}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemFeaturesPanel;

