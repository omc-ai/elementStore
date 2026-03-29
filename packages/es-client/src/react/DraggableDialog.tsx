/**
 * DraggableDialog
 *
 * A versatile dialog component supporting:
 * - Draggable header
 * - Resizable (optional)
 * - Modal and non-modal modes
 * - Docked panel mode (left, right, top, bottom)
 * - Autosize for top/bottom docked panels
 * - Collapsible panels
 * - localStorage position persistence
 * - Z-index management for proper layering
 *
 * This is a pure UI shell — no elementStore or app-specific dependencies.
 * App-specific bindings (BoundDialog, DialogRenderer) live in the consuming app.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { X, GripHorizontal, Maximize2, Minimize2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { useDockOffsets, useDockLayoutReporter } from './DockLayoutContext.tsx';

// ============================================
// Z-INDEX HIERARCHY
// ============================================

/**
 * Z-Index Hierarchy:
 * - 100: Canvas elements (fixed, never changes on focus)
 * - 200: Unfocused dialogs (floating, non-modal)
 * - 300: Unfocused docked panels (overlay canvas, above resting dialogs)
 * - 400: Focused dialog or panel (last clicked)
 * - 410: Select inputs / context menus (parent z-index + 10)
 * - 549: Modal barrier (semi-transparent overlay)
 * - 550: Modal dialogs (on top of barrier)
 */
export const Z_INDEX = {
  CANVAS: 100,
  DIALOG: 200,
  PANEL: 300,
  FOCUSED: 400,
  DROPDOWN: 410,
  MODAL_BARRIER: 549,
  MODAL: 550,
} as const;

// ============================================
// TYPES
// ============================================

export type DockPosition = 'none' | 'left' | 'right' | 'top' | 'bottom';

export interface DraggableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  titleIcon?: ReactNode;
  /** Icon component to show in header */
  icon?: React.ComponentType<{ className?: string }> | null;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  /** Initial position (uncontrolled mode) */
  initialPosition?: { x: number; y: number };
  /** Controlled position - when provided, dialog is in controlled mode */
  position?: { x: number; y: number };
  /** Callback when position changes (for controlled mode) */
  onPositionChange?: (position: { x: number; y: number }) => void;
  resizable?: boolean;
  /** Initial size (uncontrolled mode) */
  initialSize?: { width: number; height: number };
  /** Controlled size - when provided, dialog is in controlled mode */
  size?: { width: number; height: number };
  /** Callback when size changes (for controlled mode) */
  onSizeChange?: (size: { width: number; height: number }) => void;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  modal?: boolean;
  /** z-index for the dialog */
  zIndex?: number;
  onFocus?: () => void;
  /** Unique ID for localStorage persistence */
  dialogId?: string;
  /** If true, saves position and size to localStorage on drag/resize end */
  persistPosition?: boolean;
  /** Called on mousedown — use for app-level selection tracking */
  onMouseDown?: () => void;

  // --- Dock props ---
  /** Dock position: none=floating, left/right/top/bottom=docked overlay */
  docked?: DockPosition;
  /** When docked top/bottom, height adjusts to content */
  autosize?: boolean;
  /** Whether panel can be collapsed */
  collapsible?: boolean;
  /** Whether dialog shows a close button (default: true) */
  closable?: boolean;
  /** Called when user clicks undock button */
  onDockChange?: (docked: DockPosition) => void;
  /** Width when docked left/right (independent of floating width) */
  dockWidth?: number;
  /** Height when docked top/bottom (independent of floating height) */
  dockHeight?: number;
  /** Called when docked width changes (resize in docked mode) */
  onDockWidthChange?: (w: number) => void;
  /** Called when docked height changes (resize in docked mode) */
  onDockHeightChange?: (h: number) => void;
  /** Last dock position — used when re-docking from floating mode */
  lastDocked?: DockPosition;
  /** Default dock position — used as fallback when lastDocked is not set */
  defaultDock?: DockPosition;
}

interface SavedDialogState {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

// ============================================
// STORAGE HELPERS
// ============================================

const DIALOG_POSITION_PREFIX = 'cwm-dialog-pos-';

const loadDialogState = (dialogId: string): SavedDialogState | null => {
  try {
    const saved = localStorage.getItem(`${DIALOG_POSITION_PREFIX}${dialogId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load dialog state:', e);
  }
  return null;
};

const sanitizePosition = (position: { x: number; y: number }): { x: number; y: number } => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return {
    x: Math.max(0, Math.min(position.x, viewportWidth - 50)),
    y: Math.max(0, Math.min(position.y, viewportHeight - 50)),
  };
};

const saveDialogState = (dialogId: string, state: SavedDialogState): void => {
  try {
    const sanitizedState = { ...state };
    if (sanitizedState.position) {
      sanitizedState.position = sanitizePosition(sanitizedState.position);
    }
    localStorage.setItem(`${DIALOG_POSITION_PREFIX}${dialogId}`, JSON.stringify(sanitizedState));
  } catch (e) {
    console.warn('Failed to save dialog state:', e);
  }
};

// ============================================
// DOCKED PANEL COMPONENT
// ============================================

interface DockedPanelProps {
  docked: 'left' | 'right' | 'top' | 'bottom';
  autosize: boolean;
  collapsible: boolean;
  closable: boolean;
  title: ReactNode;
  titleIcon?: ReactNode;
  icon?: React.ComponentType<{ className?: string }> | null;
  children: ReactNode;
  footer?: ReactNode;
  width: number;
  height: number;
  zIndex: number;
  onClose: () => void;
  onFocus?: () => void;
  onDockChange?: (docked: DockPosition) => void;
  onDockWidthChange?: (w: number) => void;
  onMouseDown?: () => void;
}

function DockedPanel({
  docked,
  autosize,
  collapsible,
  closable,
  title,
  titleIcon,
  icon: IconComponent,
  children,
  footer,
  width,
  height,
  zIndex,
  onClose,
  onFocus,
  onDockChange,
  onDockWidthChange,
  onMouseDown,
}: DockedPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isHorizontal = docked === 'left' || docked === 'right';
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Read dock offsets for side panels; report own height for top/bottom
  const dockOffsets = useDockOffsets();
  const { setTopHeight, setBottomHeight } = useDockLayoutReporter();

  // Report rendered height for top/bottom docked panels
  useEffect(() => {
    if (!isHorizontal && panelRef.current) {
      const reportHeight = () => {
        const h = collapsed ? 32 : (panelRef.current?.offsetHeight ?? 0);
        if (docked === 'top') setTopHeight(h);
        else setBottomHeight(h);
      };
      reportHeight();

      // Use ResizeObserver to track autosize height changes
      const observer = new ResizeObserver(reportHeight);
      observer.observe(panelRef.current);
      return () => {
        observer.disconnect();
        // Reset when unmounted
        if (docked === 'top') setTopHeight(0);
        else setBottomHeight(0);
      };
    }
  }, [docked, isHorizontal, collapsed, setTopHeight, setBottomHeight]);

  const handleClick = () => {
    onFocus?.();
    onMouseDown?.();
  };

  const handleUndock = () => {
    onDockChange?.('none');
  };

  // Resize handle for docked left/right panels (drag edge to resize width)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (!isHorizontal || !onDockWidthChange) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startWidth: width };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = docked === 'left'
        ? ev.clientX - resizeRef.current.startX
        : resizeRef.current.startX - ev.clientX;
      const newWidth = Math.max(180, Math.min(600, resizeRef.current.startWidth + delta));
      onDockWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isHorizontal, width, docked, onDockWidthChange]);

  const CollapseIcon = collapsed
    ? (docked === 'left' ? ChevronRight : docked === 'right' ? ChevronLeft : docked === 'top' ? ChevronDown : ChevronUp)
    : (docked === 'left' ? ChevronLeft : docked === 'right' ? ChevronRight : docked === 'top' ? ChevronUp : ChevronDown);

  // Build fixed position style
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex,
    display: 'flex',
    flexDirection: 'column',
  };

  if (isHorizontal) {
    // Side panels: respect top/bottom dock heights
    panelStyle.top = dockOffsets.top;
    panelStyle.bottom = dockOffsets.bottom;
    panelStyle.width = collapsed ? 32 : width;
    if (docked === 'left') panelStyle.left = 0;
    else panelStyle.right = 0;
  } else {
    panelStyle.left = 0;
    panelStyle.right = 0; // full width
    if (autosize) {
      // Height adjusts to content — no fixed height
    } else {
      panelStyle.height = collapsed ? 32 : height;
    }
    if (docked === 'top') panelStyle.top = 0;
    else panelStyle.bottom = 0;
  }

  // Collapsed state — show minimal strip
  if (collapsed) {
    return (
      <div
        ref={panelRef}
        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg"
        style={{
          ...panelStyle,
          ...(isHorizontal
            ? { borderRight: docked === 'left' ? '1px solid' : undefined, borderLeft: docked === 'right' ? '1px solid' : undefined }
            : { borderBottom: docked === 'top' ? '1px solid' : undefined, borderTop: docked === 'bottom' ? '1px solid' : undefined }
          ),
        }}
        onMouseDown={handleClick}
      >
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center w-full h-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={`Expand ${typeof title === 'string' ? title : 'panel'}`}
        >
          <CollapseIcon size={16} className="text-gray-500" />
        </button>
      </div>
    );
  }

  // Border side based on dock position
  const borderClass = docked === 'left' ? 'border-r' :
    docked === 'right' ? 'border-l' :
    docked === 'top' ? 'border-b' :
    'border-t';

  // Resize edge for horizontal docked panels
  const resizeEdge = isHorizontal && onDockWidthChange ? (
    <div
      className="absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/50 z-10"
      style={docked === 'left' ? { right: 0 } : { left: 0 }}
      onMouseDown={handleResizeStart}
    />
  ) : null;

  return (
    <div
      ref={panelRef}
      className={`bg-white dark:bg-gray-800 ${borderClass} border-gray-200 dark:border-gray-700 shadow-lg flex flex-col relative`}
      style={panelStyle}
      onMouseDown={handleClick}
    >
      {resizeEdge}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {IconComponent && <IconComponent className="w-4 h-4 text-gray-500 flex-shrink-0" />}
          {titleIcon}
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {collapsible && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Collapse"
            >
              <CollapseIcon size={14} className="text-gray-400" />
            </button>
          )}
          {onDockChange && (
            <button
              onClick={handleUndock}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Undock to floating window"
            >
              <Maximize2 size={14} className="text-gray-400" />
            </button>
          )}
          {closable && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`${autosize ? '' : 'flex-1'} overflow-auto`}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DraggableDialog({
  isOpen,
  onClose,
  title,
  titleIcon,
  icon: IconComponent,
  children,
  footer,
  width = 'max-w-md',
  initialPosition,
  position: controlledPosition,
  onPositionChange,
  resizable = false,
  initialSize,
  size: controlledSize,
  onSizeChange,
  minSize: minSizeProp,
  maxSize = { width: 1200, height: 900 },
  minWidth,
  minHeight,
  modal = true,
  zIndex: zIndexProp,
  onFocus,
  dialogId,
  persistPosition = false,
  onMouseDown,
  docked = 'none',
  autosize = false,
  collapsible = false,
  closable = true,
  onDockChange,
  dockWidth,
  dockHeight,
  onDockWidthChange,
  onDockHeightChange,
  lastDocked: lastDockedProp,
  defaultDock,
}: DraggableDialogProps) {

  // ============================================
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY (React rules of hooks)
  // ============================================

  const isDocked = docked !== 'none';

  // Determine if controlled mode
  const isControlled = controlledPosition !== undefined || controlledSize !== undefined;

  // Merge minSize with individual minWidth/minHeight
  const minSize = {
    width: minWidth ?? minSizeProp?.width ?? 300,
    height: minHeight ?? minSizeProp?.height ?? 200,
  };

  const zIndex = zIndexProp ?? (isDocked ? Z_INDEX.PANEL : modal ? Z_INDEX.MODAL : Z_INDEX.DIALOG);
  const [internalPosition, setInternalPosition] = useState<{ x: number; y: number } | null>(null);
  const [internalSize, setInternalSize] = useState<{ width: number; height: number } | null>(null);

  // Effective position/size for React renders (when NOT dragging/resizing)
  const position = controlledPosition ?? internalPosition;
  const size = controlledSize ?? internalSize;

  // Unified setters that work for both modes — used only for committed updates
  const setPosition = useCallback((pos: { x: number; y: number } | null) => {
    if (pos && onPositionChange) {
      onPositionChange(pos);
    }
    if (!isControlled) {
      setInternalPosition(pos);
    }
  }, [isControlled, onPositionChange]);

  const setSize = useCallback((sz: { width: number; height: number } | null) => {
    if (sz && onSizeChange) {
      onSizeChange(sz);
    }
    if (!isControlled) {
      setInternalSize(sz);
    }
  }, [isControlled, onSizeChange]);
  const [isInitialized, setIsInitialized] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; initialWidth: number; initialHeight: number; initialPosX: number; initialPosY: number; direction: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const loadedFromStorageRef = useRef(false);
  // Live position/size during drag/resize — stored in refs to avoid React re-renders
  const livePositionRef = useRef<{ x: number; y: number } | null>(null);
  const liveSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Reset position and size when dialog opens (only for uncontrolled floating mode)
  useEffect(() => {
    if (isDocked) return; // Skip for docked panels
    if (isOpen && !wasOpenRef.current) {
      // In controlled mode, position/size come from props - skip initialization
      if (isControlled) {
        setIsInitialized(true);
        wasOpenRef.current = isOpen;
        return;
      }

      loadedFromStorageRef.current = false;

      if (persistPosition && dialogId) {
        const savedState = loadDialogState(dialogId);
        if (savedState && savedState.position) {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          const restoredPosition = { ...savedState.position };
          const dialogWidth = savedState.size?.width || 400;
          const dialogHeight = savedState.size?.height || 300;

          if (restoredPosition.x < 0) restoredPosition.x = 0;
          if (restoredPosition.x > viewportWidth - 50) {
            restoredPosition.x = Math.max(0, viewportWidth - dialogWidth - 50);
          }
          if (restoredPosition.y < 0) restoredPosition.y = 0;
          if (restoredPosition.y > viewportHeight - 50) {
            restoredPosition.y = Math.max(0, viewportHeight - dialogHeight - 50);
          }

          setInternalPosition(restoredPosition);
          setInternalSize(savedState.size || initialSize || null);
          setIsInitialized(true);
          loadedFromStorageRef.current = true;
          wasOpenRef.current = isOpen;
          return;
        }
      }

      setIsInitialized(false);
      setInternalPosition(null);
      setInternalSize(initialSize || null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, persistPosition, dialogId, isControlled, isDocked]);

  // Initialize position after first render (only for uncontrolled floating mode)
  useEffect(() => {
    if (isDocked) return; // Skip for docked panels
    // Skip for controlled mode - position comes from props
    if (isControlled) return;

    if (isOpen && !isInitialized && !loadedFromStorageRef.current && dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newPosition: { x: number; y: number };
      if (initialPosition) {
        newPosition = { ...initialPosition };
      } else {
        newPosition = {
          x: (viewportWidth - rect.width) / 2,
          y: (viewportHeight - rect.height) / 2,
        };
      }

      newPosition.x = Math.max(0, Math.min(newPosition.x, viewportWidth - 50));
      newPosition.y = Math.max(0, Math.min(newPosition.y, viewportHeight - 50));

      setInternalPosition(newPosition);
      setIsInitialized(true);
    }
  }, [isOpen, isInitialized, initialPosition, isControlled, isDocked]);

  // ============================================
  // DRAG HANDLING — Direct DOM, zero React re-renders during operation
  // ============================================

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = dialogRef.current;
    if (!el) return;

    // Read current position from DOM (covers both controlled and uncontrolled)
    const rect = el.getBoundingClientRect();
    const parentRect = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const currentX = rect.left - parentRect.left;
    const currentY = rect.top - parentRect.top;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY,
    };
    livePositionRef.current = { x: currentX, y: currentY };

    // Apply directly — no React state
    document.body.style.userSelect = 'none';
    el.style.cursor = 'grabbing';
    el.classList.add('select-none');

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;

      const deltaX = ev.clientX - dragRef.current.startX;
      const deltaY = ev.clientY - dragRef.current.startY;

      let newX = dragRef.current.initialX + deltaX;
      let newY = dragRef.current.initialY + deltaY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      newX = Math.max(0, Math.min(newX, vw - 50));
      newY = Math.max(0, Math.min(newY, vh - 50));

      // Direct DOM — no React
      livePositionRef.current = { x: newX, y: newY };
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      el.style.cursor = '';
      el.classList.remove('select-none');

      // Commit final position to store (single update)
      const finalPos = livePositionRef.current;
      livePositionRef.current = null;
      dragRef.current = null;

      if (finalPos) {
        setPosition(finalPos);
        if (persistPosition && dialogId) {
          saveDialogState(dialogId, { position: finalPos, size: size || undefined });
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  }, [setPosition, persistPosition, dialogId, size]);

  // ============================================
  // RESIZE HANDLING — Direct DOM, zero React re-renders during operation
  // ============================================

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    const el = dialogRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const parentRect = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: rect.width,
      initialHeight: rect.height,
      initialPosX: rect.left - parentRect.left,
      initialPosY: rect.top - parentRect.top,
      direction,
    };
    livePositionRef.current = { x: rect.left - parentRect.left, y: rect.top - parentRect.top };
    liveSizeRef.current = { width: rect.width, height: rect.height };

    document.body.style.userSelect = 'none';
    el.classList.add('select-none');

    const handleResizeMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;

      const deltaX = ev.clientX - resizeRef.current.startX;
      const deltaY = ev.clientY - resizeRef.current.startY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const effectiveMaxWidth = Math.min(maxSize.width, vw - 50);
      const effectiveMaxHeight = Math.min(maxSize.height, vh - 50);
      const dir = resizeRef.current.direction;

      let newWidth = resizeRef.current.initialWidth;
      let newHeight = resizeRef.current.initialHeight;
      let newPosX = resizeRef.current.initialPosX;
      let newPosY = resizeRef.current.initialPosY;

      if (dir.includes('e')) {
        newWidth = Math.max(minSize.width, Math.min(effectiveMaxWidth, resizeRef.current.initialWidth + deltaX));
      }
      if (dir.includes('w')) {
        const pw = resizeRef.current.initialWidth - deltaX;
        newWidth = Math.max(minSize.width, Math.min(effectiveMaxWidth, pw));
        newPosX = resizeRef.current.initialPosX + (resizeRef.current.initialWidth - newWidth);
      }
      if (dir.includes('s')) {
        newHeight = Math.max(minSize.height, Math.min(effectiveMaxHeight, resizeRef.current.initialHeight + deltaY));
      }
      if (dir.includes('n')) {
        const ph = resizeRef.current.initialHeight - deltaY;
        newHeight = Math.max(minSize.height, Math.min(effectiveMaxHeight, ph));
        newPosY = resizeRef.current.initialPosY + (resizeRef.current.initialHeight - newHeight);
      }

      // Direct DOM — no React
      livePositionRef.current = { x: newPosX, y: newPosY };
      liveSizeRef.current = { width: newWidth, height: newHeight };
      el.style.width = `${newWidth}px`;
      el.style.height = `${newHeight}px`;
      if (dir.includes('w') || dir.includes('n')) {
        el.style.left = `${newPosX}px`;
        el.style.top = `${newPosY}px`;
      }
    };

    const handleResizeEnd = () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.userSelect = '';
      el.classList.remove('select-none');

      // Commit final values to store (single update)
      const finalPos = livePositionRef.current;
      const finalSize = liveSizeRef.current;
      livePositionRef.current = null;
      liveSizeRef.current = null;
      resizeRef.current = null;

      if (finalPos) setPosition(finalPos);
      if (finalSize) setSize(finalSize);
      if (persistPosition && dialogId) {
        saveDialogState(dialogId, {
          position: finalPos || undefined,
          size: finalSize || undefined,
        });
      }
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    e.preventDefault();
    e.stopPropagation();
  }, [minSize, maxSize, setPosition, setSize, persistPosition, dialogId]);

  // ============================================
  // DOCKED MODE — delegate to DockedPanel (after all hooks)
  // ============================================

  if (isDocked && isOpen) {
    return (
      <DockedPanel
        docked={docked as 'left' | 'right' | 'top' | 'bottom'}
        autosize={autosize}
        collapsible={collapsible}
        closable={closable}
        title={title}
        titleIcon={titleIcon}
        icon={IconComponent}
        footer={footer}
        width={dockWidth ?? 280}
        height={dockHeight ?? 48}
        zIndex={zIndex}
        onClose={onClose}
        onFocus={onFocus}
        onDockChange={onDockChange}
        onDockWidthChange={onDockWidthChange}
        onMouseDown={onMouseDown}
      >
        {children}
      </DockedPanel>
    );
  }

  // ============================================
  // RENDER (floating mode)
  // ============================================

  if (!isOpen) return null;

  const handleDialogClick = () => {
    onFocus?.();
    onMouseDown?.();
  };

  const getDialogStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      position: 'absolute',
    };

    if (!isInitialized || !position) {
      style.left = '50%';
      style.top = '50%';
      style.transform = 'translate(-50%, -50%)';
    } else {
      style.left = `${position.x}px`;
      style.top = `${position.y}px`;
    }

    if (size) {
      style.width = `${size.width}px`;
      style.height = `${size.height}px`;
      style.maxWidth = 'none';
    } else {
      // Apply max-width based on width class as fallback
      const widthMap: Record<string, string> = {
        'max-w-sm': '24rem',
        'max-w-md': '28rem',
        'max-w-lg': '32rem',
        'max-w-xl': '36rem',
        'max-w-2xl': '42rem',
        'max-w-3xl': '48rem',
        'max-w-4xl': '56rem',
        'max-w-5xl': '64rem',
      };
      if (width && widthMap[width]) {
        style.maxWidth = widthMap[width];
      }
    }

    return style;
  };

  const dialogStyle = getDialogStyle();

  const renderResizeHandles = () => {
    if (!resizable) return null;

    return (
      <>
        {/* Edge handles */}
        <div
          className="absolute top-0 left-4 right-4 h-1 cursor-n-resize hover:bg-blue-500/30"
          onMouseDown={(e) => handleResizeStart(e, 'n')}
        />
        <div
          className="absolute bottom-0 left-4 right-4 h-1 cursor-s-resize hover:bg-blue-500/30"
          onMouseDown={(e) => handleResizeStart(e, 's')}
        />
        <div
          className="absolute left-0 top-4 bottom-4 w-1 cursor-w-resize hover:bg-blue-500/30"
          onMouseDown={(e) => handleResizeStart(e, 'w')}
        />
        <div
          className="absolute right-0 top-4 bottom-4 w-1 cursor-e-resize hover:bg-blue-500/30"
          onMouseDown={(e) => handleResizeStart(e, 'e')}
        />

        {/* Corner handles */}
        <div
          className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize"
          onMouseDown={(e) => handleResizeStart(e, 'nw')}
        />
        <div
          className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize"
          onMouseDown={(e) => handleResizeStart(e, 'ne')}
        />
        <div
          className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize"
          onMouseDown={(e) => handleResizeStart(e, 'sw')}
        />
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
          onMouseDown={(e) => handleResizeStart(e, 'se')}
        >
          <svg
            className="absolute bottom-1 right-1 w-3 h-3 text-gray-400 group-hover:text-blue-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
            <circle cx="19" cy="19" r="2" />
          </svg>
        </div>
      </>
    );
  };

  // Header buttons for floating mode
  const headerButtons = (
    <div className="flex items-center gap-1">
      {onDockChange && (() => {
        const dockTarget = (lastDockedProp && lastDockedProp !== 'none')
          ? lastDockedProp
          : (defaultDock && defaultDock !== 'none')
            ? defaultDock
            : 'left';
        return (
          <button
            onClick={() => onDockChange(dockTarget)}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={`Dock panel (${dockTarget})`}
          >
            <Minimize2 size={16} className="text-gray-400" />
          </button>
        );
      })()}
      {closable && (
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X size={20} className="text-gray-500" />
        </button>
      )}
    </div>
  );

  const dialogContent = (
    <div
      ref={dialogRef}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl ${size ? '' : `${width}`} ${resizable ? 'flex flex-col relative' : ''}`}
      style={dialogStyle}
      onMouseDown={handleDialogClick}
    >
      {/* Header - Draggable */}
      <div
        className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 cursor-grab select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-3">
          <GripHorizontal size={16} className="text-gray-400" />
          {IconComponent && <IconComponent className="w-5 h-5 text-gray-500" />}
          {titleIcon}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        </div>
        {headerButtons}
      </div>

      {/* Content */}
      <div className={`p-4 ${resizable ? 'flex-1 overflow-auto' : ''}`}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {footer}
        </div>
      )}

      {/* Resize handles */}
      {renderResizeHandles()}
    </div>
  );

  // Non-modal: render dialog without backdrop
  if (!modal) {
    return (
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
        <div className="pointer-events-auto">
          {dialogContent}
        </div>
      </div>
    );
  }

  // Modal: render barrier + dialog at separate z-levels
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: Z_INDEX.MODAL_BARRIER }}
      />
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
        <div className="pointer-events-auto">
          {dialogContent}
        </div>
      </div>
    </>
  );
}

export default DraggableDialog;
