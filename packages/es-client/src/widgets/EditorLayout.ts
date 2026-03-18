/**
 * EditorLayout — Shared layout rules for property editors
 *
 * Defines the column structure, nesting indentation, and sizing rules
 * that both admin (vanilla JS) and architect (React) follow.
 *
 * Layout structure (4 columns per level):
 *   | indent | key/label | value | actions |
 *
 * Nesting rules:
 * - Each nested level increases the indent column width
 * - Column widths are consistent within the same nesting level
 * - Column widths are resizable — resize at one level syncs all rows at that level
 * - The editor for each nested level is determined by prop.editor
 *
 * Usage:
 *   const layout = getEditorLayout(level);
 *   // layout.indentWidth, layout.keyWidth, layout.actWidth
 *
 *   const nested = getNestingStyle(level);
 *   // nested.marginLeft, nested.borderLeft
 */

// ─── Constants ───────────────────────────────────────────────────

/** Base indent per nesting level (px) */
export const INDENT_PER_LEVEL = 16;

/** Default column widths (px) */
export const DEFAULT_COLUMNS = {
  indent: 30,
  key: 160,
  act: 80,
  // value column is flex (takes remaining space)
} as const;

/** Minimum column widths (px) */
export const MIN_COLUMNS = {
  indent: 0,
  key: 80,
  act: 40,
} as const;

// ─── Layout ──────────────────────────────────────────────────────

export interface EditorColumnLayout {
  /** Nesting level (0 = root) */
  level: number;
  /** Indent column width — grows with nesting */
  indentWidth: number;
  /** Key/label column width */
  keyWidth: number;
  /** Actions column width */
  actWidth: number;
}

/**
 * Get column layout for a nesting level.
 * Indent grows by INDENT_PER_LEVEL per level.
 * Key and act widths are consistent across levels (resizable).
 */
export function getEditorLayout(level: number, overrides?: Partial<EditorColumnLayout>): EditorColumnLayout {
  return {
    level,
    indentWidth: DEFAULT_COLUMNS.indent + (level * INDENT_PER_LEVEL),
    keyWidth: overrides?.keyWidth ?? DEFAULT_COLUMNS.key,
    actWidth: overrides?.actWidth ?? DEFAULT_COLUMNS.act,
  };
}

// ─── Nesting Style ───────────────────────────────────────────────

export interface NestingStyle {
  /** Left margin for nested container */
  marginLeft: number;
  /** Border-left for visual nesting indicator */
  borderLeft: string;
  /** Background shade (slightly darker per level) */
  backgroundAlpha: number;
}

/**
 * Get visual nesting style for a level.
 * Used by renderers to apply indentation and visual hierarchy.
 */
export function getNestingStyle(level: number): NestingStyle {
  return {
    marginLeft: level * INDENT_PER_LEVEL,
    borderLeft: level > 0 ? '2px solid rgba(128, 128, 128, 0.2)' : 'none',
    backgroundAlpha: Math.min(level * 0.02, 0.1),
  };
}

// ─── Column Resize State ─────────────────────────────────────────

/**
 * Shared column width state — tracks user-resized widths per level.
 * Both admin and architect maintain this state and sync within the same level.
 */
export class ColumnWidthState {
  private widths: Map<string, number> = new Map();

  /** Get column width for a level + column type */
  get(level: number, column: 'indent' | 'key' | 'act'): number {
    const key = `${level}:${column}`;
    return this.widths.get(key) ?? getEditorLayout(level)[
      column === 'indent' ? 'indentWidth' : column === 'key' ? 'keyWidth' : 'actWidth'
    ];
  }

  /** Set column width — applies to ALL rows at this level */
  set(level: number, column: 'indent' | 'key' | 'act', width: number): void {
    const min = MIN_COLUMNS[column];
    this.widths.set(`${level}:${column}`, Math.max(min, width));
  }

  /** Reset all to defaults */
  reset(): void {
    this.widths.clear();
  }

  /** Export state (for persistence) */
  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    this.widths.forEach((v, k) => { obj[k] = v; });
    return obj;
  }

  /** Import state */
  fromJSON(data: Record<string, number>): void {
    this.widths.clear();
    for (const [k, v] of Object.entries(data)) {
      this.widths.set(k, v);
    }
  }
}

/** Global singleton for column widths */
export const columnWidths = new ColumnWidthState();
