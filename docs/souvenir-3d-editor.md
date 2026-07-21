# Сувенирный 3D-редактор

Клиент на сайте оформляет майку/кружку: **плоский Fabric-макет зоны печати** + **live 3D-превью**. В производство уходит только плоский `production_pdf` (как у полиграфии). 3D в печатный файл не входит.

## Стек

| Слой | Технология |
|------|------------|
| UI сайта / виджета | React + существующие common-компоненты |
| 2D макет | Fabric.js (`designState`) |
| 3D превью | React Three Fiber + drei + three |
| CRM | `design_editor_mode`, `printAreas`, draft API, `production_pdf` |

Код: `frontend/src/features/souvenir3d/`, роутинг — `ClientEditorRouter` (`mode=souvenir_3d`).

## Как CRM включает редактор

В шаблоне продукта (`config_data.simplified`):

```json
{
  "design_editor_mode": "souvenir_3d",
  "printAreas": [
    {
      "id": "front",
      "label": "Грудь",
      "widthMm": 300,
      "heightMm": 400,
      "meshName": "print_front",
      "modelUrl": "/models/tshirt.glb",
      "procedural": "tshirt"
    }
  ]
}
```

- Сайт читает `GET /products/:id/schema` → `template.simplified.design_editor_mode` и `printAreas` (в т.ч. compact).
- `ClientEditorRouter` при `souvenir_3d` монтирует `Souvenir3dEditor` (Fabric + R3F), иначе плоский редактор.
- **Пустой макет по умолчанию:** при сохранении шаблона продукта с `souvenir_3d` создаётся (если ещё нет) пустой `design_templates` размера первой `printArea` (`fabricJSON: {}`, `editorKind: souvenir_3d`) и привязывается к размеру. В сайдбаре — кнопка «Открыть пустой редактор».

## Как шаблон указывает kind

В `design_templates.spec`:

```json
{ "editorKind": "souvenir_3d", "width_mm": 300, "height_mm": 400 }
```

`flat` (по умолчанию) — полиграфия. Галерея сувенирного продукта должна отдавать только `editorKind=souvenir_3d`.

## Зоны печати и масштаб

- Источник истины — **мм** (`printAreas` / `designState.pageWidth×pageHeight`).
- Fabric UI: `MM_TO_PX` × `sceneScale`.
- 3D texture: тот же aspect, preview ~150 DPI.
- Production: **300 DPI** из `designState`, без 3D.
- GLB: mesh с именем `print_*` и UV aspect ≈ мм зоны. Без `modelUrl` — процедурная майка/кружка.

См. `frontend/src/features/souvenir3d/scale.ts`.

## Печать и оператор

| Артефакт | Содержимое |
|----------|------------|
| `production_pdf` | Плоский макет зоны (очередь как сейчас) |
| `placement_preview` | Опциональный PNG бланка «куда наносить» |

В Order Pool для `editorDraftMode=souvenir_3d` модалка показывает **схему размещения** (`SouvenirPlacementPreview`) + превью страниц + production PDF. Интерактивного Three.js в CRM нет.

Константы артефактов: `backend/src/services/souvenirPlacementArtifacts.ts`.

## GLB-ассеты

Каталог: `frontend/public/models/` (см. README там).

1. Spike: процедурные модели в коде или CC0 GLB + Blender (UV `print_*`).
2. Prod: калиброванный GLB под реальное изделие, `modelUrl` в `printAreas`.

## Preview в CRM

`/adminpanel/public-design-editor-preview/:templateId?mode=souvenir_3d`

## Граница сайт / CRM

Без изменений: сайт — UI редактора; CRM — шаблоны, drafts, files, finalize, production PDF. 3D живёт только на клиентском сайте/виджете.
