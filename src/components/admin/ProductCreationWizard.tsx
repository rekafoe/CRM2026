import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ProductCategory,
  PostProcessingOperation,
  getProductDetails,
  getProductMaterials,
  getProductConfigs,
  ProductWithDetails,
  getProductParameterPresets,
  ProductParameterPreset,
} from '../../services/products'
import { useProductDirectoryStore } from '../../stores/productDirectoryStore'
import type { Material } from '../../types/shared'
import { Modal, Button, Alert, LoadingState } from '../common'
import { useProductCreationWizardState, ParameterDraft, FormState } from './hooks/useProductCreationWizardState'
import {
  Step1BasicInfo,
  Step2Operations,
  Step3Materials,
  Step4Template,
  Step5Review,
} from './ProductCreationWizard/steps'
import { applyTemplateDefaults, getMissingRequiredParameters } from './ProductCreationWizard/utils/productTypeFields'

type CalculatorType = 'product' | 'operation'

interface ProductCreationWizardProps {
  visible: boolean
  onClose: () => void
  categories: ProductCategory[]
  onCreated: (productId: number) => void
  mode?: 'create' | 'duplicate'
  initialProductId?: number | null
}

// Типы и интерфейсы вынесены в useProductCreationWizardState

export const ProductCreationWizard: React.FC<ProductCreationWizardProps> = ({
  visible,
  onClose,
  categories,
  onCreated,
  mode = 'create',
  initialProductId = null,
}) => {
  const initialCategoryId = useMemo(
    () => (categories?.length ? categories[0].id : null),
    [categories]
  )

  // Используем хук для управления состоянием
  const {
    state,
    setStep,
    nextStep: nextStepAction,
    prevStep: prevStepAction,
    setSubmitting,
    setPrefillLoading,
    setPrefillError,
    setParameterPresets,
    setParameterPresetsLoading,
    setErrorMessage,
    setForm,
    updateFormField,
    addParameter: addParameterAction,
    updateParameter,
    removeParameter,
    toggleMaterial,
    addOperation,
    removeOperation,
    resetForm,
    resetAll,
  } = useProductCreationWizardState(initialCategoryId)

  const operations = useProductDirectoryStore((state) => state.operations)
  const materials = useProductDirectoryStore((state) => state.materials)
  const operationsLoading = useProductDirectoryStore((state) => state.loading.operations)
  const materialsLoading = useProductDirectoryStore((state) => state.loading.materials)
  const fetchOperations = useProductDirectoryStore((state) => state.fetchOperations)
  const fetchMaterials = useProductDirectoryStore((state) => state.fetchMaterials)
  const createProductWithSetupInStore = useProductDirectoryStore((state) => state.createProductWithSetup)
  const resolveMaterialId = useCallback((material: Material) => {
    const legacy = material as Material & { material_id?: number }
    return legacy.id ?? legacy.material_id ?? 0
  }, [])

  const resolveMaterialName = useCallback((material: Material) => {
    const legacy = material as Material & { material_name?: string }
    return legacy.name || legacy.material_name || `Материал #${resolveMaterialId(material) || ''}`
  }, [resolveMaterialId])

  const resolveMaterialUnit = useCallback((material: Material) => {
    const legacy = material as Material & { unit?: string }
    return legacy.unit ?? ''
  }, [])

  const prefillProductIdRef = useRef<number | null>(null)

  const missingParameterPresets = useMemo(
    () =>
      state.parameterPresets.filter(
        (preset) => !state.form.parameters.some((param) => param.name === preset.preset_key)
      ),
    [state.parameterPresets, state.form.parameters]
  )

  // Автоматически применяем обязательные параметры при загрузке пресетов
  useEffect(() => {
    if (!visible || !state.parameterPresets.length || state.form.parameters.length > 0) return

    const requiredPresets = getMissingRequiredParameters(
      state.parameterPresets,
      state.form.parameters
    )

    // Автоматически добавляем только обязательные параметры, если их нет
    if (requiredPresets.length > 0 && state.form.parameters.length === 0) {
      requiredPresets.forEach((preset: ProductParameterPreset) => {
        if (!state.form.parameters.some((param) => param.name === preset.preset_key)) {
          addParameterAction({
            name: preset.preset_key,
            label: preset.label || preset.preset_key,
            type:
              preset.field_type === 'checkbox'
                ? 'checkbox'
                : preset.field_type === 'number'
                  ? 'number'
                  : preset.field_type === 'text'
                    ? 'text'
                    : 'select',
            options: Array.isArray(preset.options) ? preset.options.join(', ') : '',
            default_value: preset.default_value ?? '',
            is_required: preset.is_required ?? false,
          })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.parameterPresets, visible, state.form.parameters.length])

  useEffect(() => {
    if (!visible) return

    setStep(1)
    setErrorMessage(null)
    setPrefillError(null)
    setForm({
      category_id: state.form.category_id ?? initialCategoryId,
    })

    void fetchOperations()
    void fetchMaterials()
  }, [visible, initialCategoryId, fetchOperations, fetchMaterials, setStep, setErrorMessage, setPrefillError, setForm, state.form.category_id])

  useEffect(() => {
    if (!visible) return
    const presetKey = state.form.operation_preset || state.form.product_type || ''
    if (!presetKey) {
      setParameterPresets([])
      return
    }

    let isCancelled = false
    setParameterPresetsLoading(true)

    void getProductParameterPresets({ productType: presetKey })
      .then((presets) => {
        if (!isCancelled) {
          setParameterPresets(presets)
        }
      })
      .catch((error) => {
        console.error('Не удалось загрузить пресеты параметров', error)
        if (!isCancelled) {
          setParameterPresets([])
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setParameterPresetsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [visible, state.form.operation_preset, state.form.product_type, setParameterPresets, setParameterPresetsLoading])

  useEffect(() => {
    if (!visible) return
    if (!initialProductId) {
      prefillProductIdRef.current = null
      return
    }
    if (prefillProductIdRef.current === initialProductId) return

    prefillProductIdRef.current = initialProductId

    const prefill = async () => {
      try {
        setPrefillLoading(true)
        setPrefillError(null)
        const [details, linkedMaterials, configs] = await Promise.all([
          getProductDetails(initialProductId),
          getProductMaterials(initialProductId),
          getProductConfigs(initialProductId),
        ])

        if (!details) {
          throw new Error('Не удалось загрузить данные продукта')
        }

        const templateConfig = (Array.isArray(configs)
          ? configs.find((cfg: any) => cfg.name === 'template')
          : null) as any
        const configData = templateConfig?.config_data || {}
        const constraints = templateConfig?.constraints || {}
        const trimSize = configData?.trim_size || {}
        const printSheetPreset = configData?.print_sheet?.preset
        const printSheetSize = configData?.print_sheet || {}
        const printRun = configData?.print_run || {}
        const constraintSheet = constraints?.print_sheet
        const overrides = constraints?.overrides || {}

        const linkedMaterialIds = Array.isArray(linkedMaterials)
          ? linkedMaterials
              .map((material: any) => material?.material_id || material?.id)
              .filter((id: any) => Number.isFinite(Number(id)))
              .map((id: any) => Number(id))
          : []

        const overrideMaterialIds = Array.isArray(overrides?.include_ids)
          ? overrides.include_ids.filter((id: any) => Number.isFinite(Number(id))).map((id: any) => Number(id))
          : []

        const uniqueMaterialIds = Array.from(new Set([...linkedMaterialIds, ...overrideMaterialIds]))

        const selectedOperations = Array.isArray((details as ProductWithDetails).post_processing_services)
          ? (details as ProductWithDetails).post_processing_services
              .map((svc: any) => ({
                operation_id:
                  svc.operation_id ?? svc.service_id ?? svc.serviceId ?? svc.id ?? svc.link_id ?? null,
                is_required: svc.is_required ?? svc.isRequired ?? true,
                is_default: svc.is_default ?? svc.isDefault ?? true,
                price_multiplier: svc.price_multiplier ?? svc.priceMultiplier ?? 1,
              }))
              .filter((op) => Number.isFinite(op.operation_id)) as FormState['selectedOperations']
          : []

        const parametersDraft: ParameterDraft[] = Array.isArray((details as ProductWithDetails).parameters)
          ? (details as ProductWithDetails).parameters.map((param: any) => ({
              name: param.name || '',
              type: param.type || 'select',
              label: param.label || param.name || '',
              options: Array.isArray(param.options) ? param.options.join(', ') : param.options || '',
              min_value: param.min_value ?? undefined,
              max_value: param.max_value ?? undefined,
              step: param.step ?? undefined,
              default_value: param.default_value ?? '',
              is_required: param.is_required ?? false,
            }))
          : []

        setForm({
          category_id: details.category_id ?? initialCategoryId,
          name: mode === 'duplicate' ? `${details.name} (копия)` : details.name,
          description: details.description ?? '',
          icon: details.icon ?? '',
          calculator_type: (details as any).calculator_type ?? 'product',
          product_type: (details as any).product_type ?? PRODUCT_TYPE_OPTIONS[0].value,
          operation_preset:
            (details as any).product_type && OPERATION_PRESET_OPTIONS.some((opt) => opt.value === (details as any).product_type)
              ? (details as any).product_type
              : OPERATION_PRESET_OPTIONS[0].value,
          selectedOperations,
          selectedMaterials: uniqueMaterialIds,
          parameters: parametersDraft,
          template: {
            trim_width: trimSize?.width !== undefined && trimSize.width !== null ? String(trimSize.width) : '',
            trim_height: trimSize?.height !== undefined && trimSize.height !== null ? String(trimSize.height) : '',
            print_sheet_preset:
              typeof constraintSheet === 'string'
                ? constraintSheet
                : typeof printSheetPreset === 'string'
                  ? printSheetPreset
                  : '',
            print_sheet_width:
              typeof constraintSheet === 'object' && constraintSheet && constraintSheet.width !== undefined
                ? String(constraintSheet.width)
                : printSheetSize?.width !== undefined && printSheetSize.width !== null
                  ? String(printSheetSize.width)
                  : '',
            print_sheet_height:
              typeof constraintSheet === 'object' && constraintSheet && constraintSheet.height !== undefined
                ? String(constraintSheet.height)
                : printSheetSize?.height !== undefined && printSheetSize.height !== null
                  ? String(printSheetSize.height)
                  : '',
            print_run_enabled: !!printRun?.enabled,
            print_run_min: printRun?.min !== undefined && printRun.min !== null ? String(printRun.min) : '',
            print_run_max: printRun?.max !== undefined && printRun.max !== null ? String(printRun.max) : '',
          },
        })
        setStep(1)
      } catch (error: any) {
        console.error('Не удалось подготовить данные продукта', error)
        const message = error?.message ?? 'Не удалось загрузить данные продукта'
        setPrefillError(message)
        setErrorMessage(message)
      } finally {
        setPrefillLoading(false)
      }
    }

    void prefill()
  }, [visible, initialProductId, initialCategoryId, mode])

  // Константы для использования в логике
  const PRODUCT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'sheet_single', label: 'Листовое изделие' },
    { value: 'multi_page', label: 'Многостраничное' },
    { value: 'universal', label: 'Универсальное' },
  ];

  const OPERATION_CALCULATOR_TYPES: Array<{ value: string; label: string }> = [
    { value: 'sheet_item', label: 'Листовое изделие (операции)' },
    { value: 'multi_page_item', label: 'Многостраничное изделие (операции)' },
  ];

  const OPERATION_PRESET_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'business_cards', label: 'Визитки' },
    { value: 'flyers', label: 'Листовки' },
    { value: 'booklets', label: 'Буклеты' },
    { value: 'posters', label: 'Плакаты' },
  ];

  // Автоматическое применение значений по умолчанию при изменении типа продукта
  useEffect(() => {
    if (state.form.calculator_type === 'operation') {
      updateFormField('product_type', OPERATION_CALCULATOR_TYPES[0].value)
    } else if (!PRODUCT_TYPE_OPTIONS.some((opt) => opt.value === state.form.product_type)) {
      updateFormField('product_type', PRODUCT_TYPE_OPTIONS[0].value)
    }
  }, [state.form.calculator_type, state.form.product_type, updateFormField])

  // Применение значений по умолчанию для шаблона при изменении типа продукта
  useEffect(() => {
    if (!visible || !state.form.product_type) return

    const updatedTemplate = applyTemplateDefaults(
      state.form.template as unknown as Record<string, unknown>,
      state.form.product_type as 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item',
      state.form.calculator_type
    )

    // Применяем только если есть изменения
    const currentTemplate = state.form.template as unknown as Record<string, unknown>
    const hasChanges = Object.keys(updatedTemplate).some(
      (key) => updatedTemplate[key] !== currentTemplate[key]
    )

    if (hasChanges) {
      setForm({
        template: updatedTemplate as unknown as FormState['template'],
      })
    }
  }, [state.form.product_type, state.form.calculator_type, visible, setForm, state.form.template])

  const isOperationSelected = (operationId: number) =>
    state.form.selectedOperations.some((op) => op.operation_id === operationId)

  const toggleOperation = (operation: PostProcessingOperation) => {
    const exists = state.form.selectedOperations.find(
      (op) => op.operation_id === operation.id
    )
    if (exists) {
      const index = state.form.selectedOperations.findIndex(
        (op) => op.operation_id === operation.id
      )
      removeOperation(index)
    } else {
      addOperation({
        operation_id: operation.id,
        is_required: true,
        is_default: true,
        price_multiplier: 1,
      })
    }
  }

  const updateSelectedOperation = (
    operationId: number,
    patch: Partial<{ is_required: boolean; is_default: boolean; price_multiplier: number }>
  ) => {
    setForm({
      selectedOperations: state.form.selectedOperations.map((op) =>
        op.operation_id === operationId ? { ...op, ...patch } : op
      ),
    })
  }

  const addParameter = () => {
    addParameterAction({
      name: '',
      type: 'select',
      label: '',
      options: '',
      min_value: undefined,
      max_value: undefined,
      step: undefined,
      default_value: '',
      is_required: false,
    })
  }

  const nextStep = () => {
    if (state.step === 1 && !state.form.name.trim()) {
      setErrorMessage('Введите название продукта')
      return
    }
    if (state.step === 2 && !state.form.selectedOperations.length && !state.form.operation_preset) {
      setErrorMessage('Выберите хотя бы одну операцию или пресет')
      return
    }
    setErrorMessage(null)
    nextStepAction()
  }

  const prevStep = () => {
    setErrorMessage(null)
    prevStepAction()
  }

  const handleAddPresetParameter = useCallback(
    (preset: ProductParameterPreset) => {
      if (!preset?.preset_key) return

      const exists = state.form.parameters.some((param) => param.name === preset.preset_key)
      if (exists) return

      addParameterAction({
        name: preset.preset_key,
        label: preset.label || preset.preset_key,
        type:
          preset.field_type === 'checkbox'
            ? 'checkbox'
            : preset.field_type === 'number'
              ? 'number'
              : preset.field_type === 'text'
                ? 'text'
                : 'select',
        options: Array.isArray(preset.options) ? preset.options.join(', ') : '',
        default_value: preset.default_value ?? '',
        is_required: preset.is_required ?? false,
      })
    },
    [state.form.parameters, addParameterAction]
  )

  const resetStateAndClose = () => {
    resetAll()
    prefillProductIdRef.current = null
    onClose()
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setErrorMessage(null)

      const payload = {
        product: {
          category_id: state.form.category_id ?? undefined,
          name: state.form.name.trim(),
          description: state.form.description.trim() || undefined,
          icon: state.form.icon.trim() || undefined,
          calculator_type: state.form.calculator_type,
          product_type: state.form.product_type as 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item',
        },
        operations: state.form.selectedOperations.map((operation, index) => ({
          operation_id: operation.operation_id,
          sequence: index + 1,
          is_required: operation.is_required,
          is_default: operation.is_default,
          price_multiplier: operation.price_multiplier,
        })),
        autoOperationType: state.form.operation_preset,
        materials: state.form.selectedMaterials.map((id) => ({ material_id: id })),
        parameters: state.form.parameters.map((param, index) => ({
          name: param.name,
          type: param.type,
          label: param.label || param.name,
          options: param.options
            ? param.type === 'select'
              ? param.options.split(',').map((value) => value.trim()).filter(Boolean)
              : undefined
            : undefined,
          min_value: param.min_value,
          max_value: param.max_value,
          step: param.step,
          default_value: param.default_value,
          is_required: param.is_required,
          sort_order: index,
        })),
        template: {
          // Поддержка нескольких размеров для многостраничных продуктов
          trim_size: state.form.template.trim_sizes && state.form.template.trim_sizes.length > 0
            ? state.form.template.trim_sizes.map(size => ({
                width: size.width ? Number(size.width) || size.width : undefined,
                height: size.height ? Number(size.height) || size.height : undefined,
                label: size.label,
              })).filter(size => size.width && size.height)
            : state.form.template.trim_width || state.form.template.trim_height
              ? {
                  width: state.form.template.trim_width ? Number(state.form.template.trim_width) || state.form.template.trim_width : undefined,
                  height: state.form.template.trim_height ? Number(state.form.template.trim_height) || state.form.template.trim_height : undefined,
                }
              : undefined,
          print_sheet: state.form.template.print_sheet_preset
            ? { preset: state.form.template.print_sheet_preset }
            : state.form.template.print_sheet_width || state.form.template.print_sheet_height
              ? {
                  width: state.form.template.print_sheet_width ? Number(state.form.template.print_sheet_width) || state.form.template.print_sheet_width : undefined,
                  height: state.form.template.print_sheet_height ? Number(state.form.template.print_sheet_height) || state.form.template.print_sheet_height : undefined,
                }
              : undefined,
          print_run: {
            enabled: state.form.template.print_run_enabled,
            min: state.form.template.print_run_min ? Number(state.form.template.print_run_min) || 0 : undefined,
            max: state.form.template.print_run_max ? Number(state.form.template.print_run_max) || undefined : undefined,
          },
          finishing: [],
          packaging: [],
          price_rules: [],
          material_include_ids: state.form.selectedMaterials,
        },
      }

      const createdId = await createProductWithSetupInStore(payload)
      if (createdId) {
        onCreated(createdId)
      resetStateAndClose()
      } else {
        const latestError = useProductDirectoryStore.getState().errors.createProductSetup
        setErrorMessage(latestError || 'Ошибка создания продукта')
      }
    } catch (error: any) {
      console.error('Failed to create product setup', error)
      const message = error?.response?.data?.error || error?.message || 'Ошибка создания продукта'
      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={visible}
      onClose={resetStateAndClose}
      title={mode === 'duplicate' ? 'Дублирование продукта' : 'Создание продукта'}
      size="xl"
      className="wizard-modal"
    >
      <div className="flex flex-col gap-6">
        <div className="wizard-steps flex flex-wrap items-center justify-between gap-3">
            <div className={`step ${state.step >= 1 ? 'active' : ''}`}>1. Основное</div>
            <div className={`step ${state.step >= 2 ? 'active' : ''}`}>2. Операции</div>
            <div className={`step ${state.step >= 3 ? 'active' : ''}`}>3. Материалы</div>
            <div className={`step ${state.step >= 4 ? 'active' : ''}`}>4. Шаблон</div>
            <div className={`step ${state.step >= 5 ? 'active' : ''}`}>5. Проверка</div>
        </div>

          {state.errorMessage && (
          <Alert type="error" onClose={() => setErrorMessage(null)}>
            {state.errorMessage}
          </Alert>
          )}

        <div className="wizard-content flex flex-col gap-6">
          {state.prefillLoading ? (
            <div className="flex justify-center py-10">
              <LoadingState message="Загружаем данные продукта..." />
            </div>
          ) : state.prefillError ? (
            <Alert type="error" onClose={() => setPrefillError(null)}>
              {state.prefillError}
            </Alert>
          ) : (
          <>
          {state.step === 1 && (
            <Step1BasicInfo
              form={state.form}
              categories={categories}
              updateFormField={updateFormField}
            />
          )}

          {state.step === 2 && (
            <Step2Operations
              form={state.form}
              operations={operations}
              operationsLoading={operationsLoading}
              isOperationSelected={isOperationSelected}
              toggleOperation={toggleOperation}
              updateSelectedOperation={updateSelectedOperation}
            />
          )}

          {state.step === 3 && (
            <Step3Materials
              form={state.form}
              materials={materials}
              materialsLoading={materialsLoading}
              resolveMaterialId={resolveMaterialId}
              resolveMaterialName={resolveMaterialName}
              resolveMaterialUnit={resolveMaterialUnit}
              toggleMaterial={toggleMaterial}
            />
          )}

          {state.step === 4 && (
            <Step4Template
              form={state.form}
              parameterPresetsLoading={state.parameterPresetsLoading}
              missingParameterPresets={missingParameterPresets}
              onAddPresetParameter={handleAddPresetParameter}
              onAddParameter={addParameter}
              onUpdateParameter={updateParameter}
              onRemoveParameter={removeParameter}
              onUpdateTemplate={(template: Partial<FormState['template']>) =>
                setForm({
                  template: { ...state.form.template, ...template },
                })
              }
              onAddOperation={addOperation}
              operations={operations.map(op => ({ id: op.id, name: op.name }))}
            />
          )}

          {state.step === 5 && (
            <Step5Review form={state.form} categories={categories} />
          )}
          </>
          )}
        </div>

        <div className="wizard-footer flex flex-wrap justify-between items-center gap-3">
          <Button variant="secondary" onClick={resetStateAndClose}>
            Отмена
          </Button>
          <div className="flex items-center gap-3">
          {state.step > 1 && (
              <Button variant="secondary" onClick={prevStep}>
              ← Назад
              </Button>
          )}
            {state.step < 5 ? (
              <Button variant="primary" onClick={nextStep}>
              Далее →
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={state.submitting}
                className="flex items-center gap-2"
              >
                {state.submitting
                  ? mode === 'duplicate'
                    ? 'Дублирование...'
                    : 'Создание...'
                  : mode === 'duplicate'
                    ? 'Создать копию'
                    : 'Создать продукт'}
              </Button>
          )}
        </div>
      </div>
    </div>
    </Modal>
  )
}

export default ProductCreationWizard

