import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { resolveStripGoToPage } from '../../pages/admin/designEditor/spreadUtils';
import type { DesignDocumentNavigationState } from './useDesignDocumentNavigation';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type { PublicDesignTaskTab } from './PublicDesignTaskPanel';

type PendingTaskAction = {
  type: 'focus' | 'replacePhoto';
  fieldId?: string;
  fieldKind?: 'photo' | 'text';
  pageIndex: number;
};

interface UsePublicDesignGuidedActionsInput {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  currentPage: number;
  navigation: DesignDocumentNavigationState;
  preflight: PublicEditorPreflightSummary;
  editorNextAction: PublicEditorNextAction;
  setActiveTaskTab: (tab: PublicDesignTaskTab) => void;
  setError: (message: string | null) => void;
  onGoToPage: (pageIndex: number) => Promise<void>;
  onReadyForCart: () => void | Promise<void>;
}

export function usePublicDesignGuidedActions({
  canvasHandleRef,
  currentPage,
  navigation,
  preflight,
  editorNextAction,
  setActiveTaskTab,
  setError,
  onGoToPage,
  onReadyForCart,
}: UsePublicDesignGuidedActionsInput) {
  const [pendingTaskAction, setPendingTaskAction] = useState<PendingTaskAction | null>(null);

  const runTaskAction = useCallback((action: PendingTaskAction) => {
    const handle = canvasHandleRef.current;
    if (!handle) return false;
    if (action.type === 'replacePhoto' && action.fieldId) {
      return handle.replacePhotoField(action.fieldId);
    }
    if (action.fieldId) {
      return handle.focusDesignObject(action.fieldId, { editText: action.fieldKind === 'text' });
    }
    return false;
  }, [canvasHandleRef]);

  const requestTaskAction = useCallback(async (action: PendingTaskAction) => {
    setError(null);
    if (action.fieldKind === 'photo' || action.fieldKind === 'text') {
      setActiveTaskTab(action.fieldKind);
    }
    const needsPageSwitch = !navigation.stripItems.some((item) =>
      item.pages.includes(currentPage) && item.pages.includes(action.pageIndex));
    if (needsPageSwitch) {
      setPendingTaskAction(action);
      await onGoToPage(resolveStripGoToPage(navigation.stripItems, action.pageIndex));
      return;
    }
    window.setTimeout(() => {
      if (!runTaskAction(action)) setError('Не удалось найти поле на текущем макете.');
    }, 0);
  }, [currentPage, navigation.stripItems, onGoToPage, runTaskAction, setActiveTaskTab, setError]);

  useEffect(() => {
    if (!pendingTaskAction) return;
    const currentStrip = navigation.stripItems.find((item) => item.pages.includes(currentPage));
    if (!currentStrip?.pages.includes(pendingTaskAction.pageIndex)) return;
    const timer = window.setTimeout(() => {
      if (!runTaskAction(pendingTaskAction)) setError('Не удалось найти поле на текущем макете.');
      setPendingTaskAction(null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [currentPage, navigation.stripItems, pendingTaskAction, runTaskAction, setError]);

  const handleFieldFocus = useCallback((field: PublicEditorPreflightField, kind: 'photo' | 'text') => {
    void requestTaskAction({
      type: 'focus',
      fieldId: field.id,
      fieldKind: kind,
      pageIndex: field.pageIndex,
    });
  }, [requestTaskAction]);

  const handlePhotoReplace = useCallback((field: PublicEditorPreflightField) => {
    void requestTaskAction({
      type: 'replacePhoto',
      fieldId: field.id,
      fieldKind: 'photo',
      pageIndex: field.pageIndex,
    });
  }, [requestTaskAction]);

  const handleIssueFocus = useCallback((issue: PublicEditorPreflightIssue) => {
    const photoField = preflight.photoFields.find((field) => field.pageIndex === issue.pageIndex && issue.id === `photo-${field.id}`);
    if (photoField) {
      handleFieldFocus(photoField, 'photo');
      return;
    }
    const textField = preflight.textFields.find((field) => field.pageIndex === issue.pageIndex && field.status !== 'ready');
    if (textField) {
      handleFieldFocus(textField, 'text');
      return;
    }
    setActiveTaskTab('check');
    void onGoToPage(resolveStripGoToPage(navigation.stripItems, issue.pageIndex));
  }, [
    handleFieldFocus,
    navigation.stripItems,
    onGoToPage,
    preflight.photoFields,
    preflight.textFields,
    setActiveTaskTab,
  ]);

  const handleNextAction = useCallback(() => {
    if (editorNextAction.kind === 'replacePhoto') {
      handlePhotoReplace(editorNextAction.field);
      return;
    }
    if (editorNextAction.kind === 'editText') {
      handleFieldFocus(editorNextAction.field, 'text');
      return;
    }
    void onReadyForCart();
  }, [editorNextAction, handleFieldFocus, handlePhotoReplace, onReadyForCart]);

  return {
    handleFieldFocus,
    handlePhotoReplace,
    handleIssueFocus,
    handleNextAction,
  };
}
