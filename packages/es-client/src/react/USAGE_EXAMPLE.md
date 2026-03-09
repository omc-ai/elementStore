# @es-client/react — Element Binding Usage

These hooks connect React widgets to ElementStore elements.
They are store-agnostic: pass your `ElementStore` instance in, or wrap with a React context in your app.

---

## 1. Basic subscription — `useAtomObj`

Subscribe to any element by ID. Re-renders on any property change.

```tsx
import { useAtomObj } from '@es-client/react';
import { store } from './myStore';          // your app's ElementStore singleton

function ElementLabel({ id }: { id: string }) {
  const el = useAtomObj(store, id);
  if (!el) return null;
  return <span>{el.data.name}</span>;
}
```

---

## 2. Single-property subscription — `useAtomObjProperty`

Only re-renders when `propKey` (or `'*'`) fires. More efficient than `useAtomObj` when
you only need one field.

```tsx
import { useAtomObjProperty } from '@es-client/react';

function ZoomDisplay({ canvasId }: { canvasId: string }) {
  const zoom = useAtomObjProperty(store, canvasId, 'zoom') as number ?? 1;
  return <div>Zoom: {Math.round(zoom * 100)}%</div>;
}
```

---

## 3. Declarative widget binding — `useWidgetBinding`

The main pattern for widgets with multiple properties. Define a mapping table once,
then get reactive values and typed setters.

### Step 1 — Define the mapping table (outside the component)

```ts
import type { WidgetMappings } from '@es-client/react';

const CANVAS_MAPPINGS: WidgetMappings = {
  // localName       element key    dir      default   transforms
  zoom:      { key: 'zoom',       dir: 'sync', default: 1 },
  showGrid:  { key: 'show_grid',  dir: 'sync', default: true },
  gridSize:  { key: 'grid_size',  dir: 'sync', default: 20 },

  // Computed: degrees ↔ radians
  rotationDeg: {
    key:       'rotation',
    dir:       'sync',
    default:   0,
    toWidget:  (rad) => Math.round((rad * 180) / Math.PI),
    toElement: (deg) => (deg * Math.PI) / 180,
  },

  // Read-only display value
  objectCount: { key: 'object_count', dir: 'read', default: 0 },

  // Write-only command (no reactive value returned)
  resetCamera: { key: 'reset_camera_flag', dir: 'write' },
};
```

### Step 2 — Use in the widget component

```tsx
import { useWidgetBinding } from '@es-client/react';

function CanvasToolbar({ canvasId }: { canvasId: string }) {
  const { values, set, setMany } = useWidgetBinding(store, canvasId, CANVAS_MAPPINGS);

  const { zoom, showGrid, gridSize, rotationDeg, objectCount } = values;

  return (
    <div>
      <label>
        Zoom:
        <input
          type="range" min={0.1} max={5} step={0.1}
          value={zoom}
          onChange={(e) => set('zoom', parseFloat(e.target.value))}
        />
        {Math.round(zoom * 100)}%
      </label>

      <label>
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(e) => set('showGrid', e.target.checked)}
        />
        Show Grid
      </label>

      <label>
        Grid Size:
        <input
          type="number" min={5} max={100}
          value={gridSize}
          onChange={(e) => set('gridSize', parseInt(e.target.value))}
        />
      </label>

      <label>
        Rotation:
        <input
          type="number"
          value={rotationDeg}
          onChange={(e) => set('rotationDeg', parseInt(e.target.value))}
        />
        °
      </label>

      <span>Objects: {objectCount}</span>

      {/* Batch update — single element.update() call */}
      <button onClick={() => setMany({ zoom: 1, rotationDeg: 0 })}>
        Reset View
      </button>
    </div>
  );
}
```

---

## 4. Store initialization gate — `useStoreInitialized`

Prevent rendering before the store has loaded its data.

```tsx
import { useStoreInitialized } from '@es-client/react';

function App() {
  const ready = useStoreInitialized(store);
  if (!ready) return <div>Loading...</div>;
  return <Canvas />;
}
```

---

## 5. Query with subscription — `useStoreFind`

Subscribe to a filtered slice of the store. Re-renders on any store change.

```tsx
import { useStoreFind } from '@es-client/react';

function LayerList() {
  const layers = useStoreFind(store, { class_id: 'canvas-layer' });
  return (
    <ul>
      {layers.map(layer => (
        <li key={layer._id}>{layer.data.name}</li>
      ))}
    </ul>
  );
}
```

---

## Extending base classes (no shims needed)

When you need app-specific behavior, extend `AtomObj` — don't shim it:

```ts
import { AtomObj } from '@es-client/core/AtomObj.ts';
import { registerClass } from '@es-client/modules/classRegistry.ts';

export class CanvasElement extends AtomObj {
  static CLASS_ID = 'canvas';

  get zoom(): number { return this.data.zoom ?? 1; }
  set zoom(v: number) { this.update({ zoom: v }); }

  get objectIds(): string[] { return this.data.object_ids ?? []; }
}

registerClass(CanvasElement);
```

Then use it transparently:

```tsx
function CanvasView({ id }: { id: string }) {
  const canvas = useAtomObj(store, id) as CanvasElement | null;
  if (!canvas) return null;
  return <div>Zoom: {canvas.zoom}</div>;
}
```
