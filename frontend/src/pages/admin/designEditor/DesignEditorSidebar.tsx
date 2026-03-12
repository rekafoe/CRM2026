import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { SIDEBAR_ITEMS } from './constants';
import type { SidebarSection } from './types';

interface DesignEditorSidebarProps {
  activeSection: SidebarSection | null;
  onSectionChange: (section: SidebarSection | null) => void;
}

export const DesignEditorSidebar: React.FC<DesignEditorSidebarProps> = ({
  activeSection,
  onSectionChange,
}) => (
  <aside className="design-editor-sidebar" aria-label="Меню разделов">
    {SIDEBAR_ITEMS.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`design-editor-sidebar-item ${activeSection === item.id ? 'is-active' : ''}`}
        onClick={() => onSectionChange(activeSection === item.id ? null : item.id)}
        title={item.label}
      >
        <AppIcon name={item.icon} size="sm" />
        <span className="design-editor-sidebar-label">{item.label}</span>
      </button>
    ))}
  </aside>
);
