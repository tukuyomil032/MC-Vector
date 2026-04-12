import type { ServerContextMenuState } from '../../store/uiStore';

interface AppContextMenuProps {
  contextMenu: ServerContextMenuState | null;
  onDuplicateServer: () => Promise<void>;
  onSaveServerTemplate: () => Promise<void>;
  onDeleteServer: () => Promise<void>;
  cloneLabel: string;
  saveTemplateLabel: string;
  deleteLabel: string;
}

export default function AppContextMenu({
  contextMenu,
  onDuplicateServer,
  onSaveServerTemplate,
  onDeleteServer,
  cloneLabel,
  saveTemplateLabel,
  deleteLabel,
}: AppContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div className="app-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
      <div
        onClick={(event) => {
          event.stopPropagation();
          void onDuplicateServer();
        }}
        className="app-context-menu__item"
      >
        📄 {cloneLabel}
      </div>

      <div
        onClick={(event) => {
          event.stopPropagation();
          void onSaveServerTemplate();
        }}
        className="app-context-menu__item"
      >
        🧩 {saveTemplateLabel}
      </div>

      <div
        onClick={(event) => {
          event.stopPropagation();
          void onDeleteServer();
        }}
        className="app-context-menu__danger-item"
      >
        🗑️ {deleteLabel}
      </div>
    </div>
  );
}
