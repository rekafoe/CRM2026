# Pricing/Product Admin Refactor

## 1. Current State

- **Frontend pages**
  - `frontend/src/components/admin/ServicesManagement.tsx`
  - `frontend/src/pages/admin/ProductEditPage.tsx`
  - `frontend/src/features/productTemplate/ProductTemplatePage.tsx`

- **Frontend services**
  - `frontend/src/services/productService.ts`
  - `frontend/src/services/pricingService.ts`

- **Backend**
  - `backend/src/modules/pricing/controllers/pricingController.ts`
  - `backend/src/modules/products/routes/products.ts`
  - legacy migrations in `backend/src/migrations`

- **Issues**
  - Duplicate UI patterns (forms, tables, modals) across admin pages.
  - Mixed concerns within files (UI + data fetch + normalization).
  - Inconsistent DTOs between frontend services and backend controllers.
  - Difficult to extend pricing logic (volume tiers, materials, services) due to scattered code.

## 2. Goals

- Introduce single-responsibility modules for data fetching and transformation.
- Share UI components between product and pricing admin pages.
- Align backend controllers with service layer and shared DTO definitions.
- Keep migrations and seeders consistent with the new schema.

## 3. Target Architecture

```
Admin Pages (ServicesManagement / ProductTemplate / ProductEdit)
    ↕ (props/state only)
UI Components (shared tables, modals, cards)
    ↕
Hooks / Service Clients (useProductServices, usePricingServices)
    ↕
API layer (productService.ts, pricingService.ts)
    ↕
Backend Controllers → Backend Service modules → DB
```

## 4. Iterations

### Iteration 1: Data Layer & DTOs

- Create shared TypeScript types for services, volume tiers, templates (`frontend/src/types/pricing.ts`).
- Refactor `productService.ts` and `pricingService.ts` to use unified DTOs and export small, focused functions.
- Add React hooks (`useProductServices`, `usePricingSheet`) to encapsulate data loading, loading states, error handling.
- Mirror DTOs on backend (TypeScript interfaces or classes) and ensure controllers return consistent shapes.

### Iteration 2: Shared UI Components

- Extract reusable UI components: service table, material card grid, modal forms (place under `frontend/src/components/admin/common`).
- Replace implementation inside `ServicesManagement` to use shared components + new hooks.

### Iteration 3: Product Pages Alignment

- Refactor `ProductTemplatePage` to rely on the shared components/hooks.
- Update `ProductEditPage` to reuse the same form components for metadata and service assignment.

### Iteration 4: Backend Services & Migrations

- Introduce service layer modules (`/backend/src/modules/pricing/services/*.ts`, `/products/services/*.ts`).
- Move controller logic into services, keep controllers thin.
- Audit/clean migrations: add missing ones; remove legacy ones that no longer exist; document seed data.

#### 4.1 Backend Folder Restructure Plan

- **Pricing module**
  - Target tree:
    ```
    backend/src/modules/pricing/
      controllers/
      services/
      repositories/
      dtos/
      mappers/
      validators/
      routes.ts
      index.ts
    ```
  - Goals:
    - Migrate legacy controllers (`backend/src/controllers/priceManagementController.ts`, `pricingController.ts`, etc.) into `modules/pricing/controllers`.
    - Extract SQL/knex calls from controllers into repositories (`pricingRepository.ts`, `serviceVolumeTierRepository.ts`).
    - Define explicit DTOs shared between services and controllers (align with frontend `types/pricing.ts`).
    - Centralize schema validation (zod/yup) under `validators/`.

- **Products module**
  - Target tree mirrors pricing:
    ```
    backend/src/modules/products/
      controllers/
      services/
      repositories/
      dtos/
      mappers/
      validators/
      routes.ts
      index.ts
    ```
  - Goals:
    - Move `backend/src/controllers/productController.ts` & related routes into module.
    - Create repositories for product templates, product-service links, operations norms.
    - Align service outputs with frontend product DTOs (`types/products.ts`).

- **Cross-cutting concerns**
  - Establish `backend/src/modules/shared/` helpers for:
    - database connection wrappers / query builders.
    - error handling utilities (convert DB errors to typed domain errors).
    - DTO mappers between DB rows and service objects.
  - Update `backend/src/routes/*.ts` to import module-level `routes.ts` (each module exports configured router).
  - Document migration ownership in each module (e.g. pricing module owns `20250120000000_create_pricing_tables.ts`).

- **Execution order**
  1. Create repository + dto skeletons, add unit tests for new repositories (if feasible).
  2. Refactor pricing controllers to use repositories/services; update routes to new module exports.
  3. Repeat for products module.
  4. Remove deprecated controllers/routes in root folders once module wiring confirmed.
  5. Update documentation and ensure migrations/seeds reflect new structure.

> NOTE: treat each move as logical refactor (git mv) to preserve history; after each major module conversion run integration smoke tests (pricing endpoints, product template endpoints).

## 5. Dependencies & Risks

- Backend must be running with up-to-date migrations for frontend refactor to function (watch for missing migration modules).
- Need to keep Telegram/stock monitoring features compatible (ensure they still receive the necessary data).
- With new hooks/components, consider storybook or unit tests to avoid regression.

## 6. Next Steps

1. Implement Iteration 1 (shared DTOs, service clients, hooks).
2. Open PR with refactored services and updated imports (no UI overhaul yet).
3. After merge, proceed with UI component extraction (Iteration 2).
4. Schedule backend service refactor once frontend stabilizes.

