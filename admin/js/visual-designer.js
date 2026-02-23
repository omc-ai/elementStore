// ====================== CONFIG & STATE ======================
const API_BASE = window.location.origin;
let cy = null;
let currentClasses = {};
let currentProps = {};
let selectedClassId = null;
let editingProp = null;

// ====================== TAILWIND ======================
tailwind.config = { content: ["*"] };

// ====================== LOAD SCHEMA ======================
async function loadSchema() {
  const res = await fetch(`${API_BASE}/class`);
  const data = await res.json();
  currentClasses = {};
  currentProps = {};

  data.forEach(item => {
    if (!item.id) return;
    if (item.id.includes('.')) {
      const cls = item.id.split('.')[0];
      if (!currentProps[cls]) currentProps[cls] = [];
      currentProps[cls].push(item);
    } else if (item.class_id === '@class' || !item.class_id) {
      currentClasses[item.id] = item;
    }
  });

  renderClassList();
  renderGraph();
}

function renderClassList() {
  const container = document.getElementById('class-list');
  container.innerHTML = Object.keys(currentClasses).map(id => `
    <div onclick="selectClass('${id}')"
         class="px-4 py-3 hover:bg-slate-800 rounded-2xl cursor-pointer mb-1 flex items-center gap-3 ${selectedClassId === id ? 'bg-slate-800' : ''}">
      <div class="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center text-xs font-mono">${id[0].toUpperCase()}</div>
      <div>
        <div class="font-medium">${currentClasses[id].name || id}</div>
        <div class="text-xs text-slate-400">${id}</div>
      </div>
    </div>
  `).join('');
}

function selectClass(id) {
  selectedClassId = id;
  renderClassList();
  openInspector(id);
}

// ====================== GRAPH ======================
function renderGraph() {
  if (cy) cy.destroy();

  const elements = [];

  Object.keys(currentClasses).forEach(id => {
    const c = currentClasses[id];
    elements.push({ data: { id, name: c.name || id, extends: c.extends_id || null } });
  });

  // inheritance
  Object.keys(currentClasses).forEach(id => {
    if (currentClasses[id].extends_id) {
      elements.push({ data: { source: id, target: currentClasses[id].extends_id, label: 'extends', type: 'inheritance' } });
    }
  });

  // relations
  Object.keys(currentProps).forEach(classId => {
    currentProps[classId].forEach(p => {
      if (p.data_type === 'relation' && p.relation_class_id) {
        elements.push({
          data: { source: classId, target: p.relation_class_id, label: p.key, type: 'relation' }
        });
      }
    });
  });

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements,
    style: [
      { selector: 'node', style: { 'background-color': '#10b981', 'label': 'data(name)', 'width': 'label', 'height': 'label', 'padding': '15px', 'font-size': '14px', 'color': '#fff' } },
      { selector: 'edge[type="inheritance"]', style: { 'line-color': '#64748b', 'line-style': 'dashed', 'target-arrow-shape': 'triangle' } },
      { selector: 'edge[type="relation"]', style: { 'line-color': '#22c55e', 'target-arrow-shape': 'triangle', 'label': 'data(label)', 'font-size': '11px' } }
    ],
    layout: { name: 'cose', animate: true }
  });

  cy.on('tap', 'node', evt => openInspector(evt.target.data('id')));
}

function autoLayout() {
  if (cy) cy.layout({ name: 'cose', animate: true }).run();
}

// ====================== INSPECTOR ======================
function openInspector(classId) {
  selectedClassId = classId;
  renderClassList();

  document.getElementById('inspector').classList.remove('hidden');
  document.getElementById('inspector-title').textContent = currentClasses[classId].name || classId;

  const props = currentProps[classId] || [];
  let html = `
    <div class="space-y-4">
      <div><label class="text-xs text-slate-400 block mb-1">Class ID</label><input value="${classId}" disabled class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>
      <div><label class="text-xs text-slate-400 block mb-1">Display Name</label><input id="edit-name" value="${currentClasses[classId].name || ''}" onblur="updateClassField('${classId}', 'name', this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-emerald-500"></div>
      <div><label class="text-xs text-slate-400 block mb-1">Extends</label>
        <select onchange="updateClassField('${classId}', 'extends_id', this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">
          <option value="">None</option>
          ${Object.keys(currentClasses).filter(c => c !== classId).map(c => `<option value="${c}" ${currentClasses[classId].extends_id === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="pt-4 border-t border-slate-700">
        <div class="flex justify-between items-center mb-3">
          <div class="font-medium">Properties</div>
          <button onclick="addNewProp('${classId}')" class="text-emerald-400 text-sm flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Prop</button>
        </div>
        <div class="space-y-2">
          ${props.map(p => `
            <div class="bg-slate-800 border border-slate-700 rounded-2xl p-3 flex justify-between items-center">
              <div>
                <div class="font-medium">${p.key}</div>
                <div class="text-xs text-slate-400">${p.data_type} ${p.is_array ? '[]' : ''}</div>
              </div>
              <button onclick="editProp('${classId}', '${p.key}')" class="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-xl">Edit</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('inspector-content').innerHTML = html;
}

function closeInspector() {
  document.getElementById('inspector').classList.add('hidden');
  selectedClassId = null;
  renderClassList();
}

async function updateClassField(classId, field, value) {
  await fetch(`${API_BASE}/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: classId, [field]: value })
  });
  loadSchema();
}

// ====================== NEW CLASS ======================
function newClass() {
  document.getElementById('new-class-modal').classList.remove('hidden');
  document.getElementById('new-class-id').focus();
}

function hideModal() {
  document.getElementById('new-class-modal').classList.add('hidden');
}

async function createClassConfirm() {
  const id = document.getElementById('new-class-id').value.trim();
  const name = document.getElementById('new-class-name').value.trim() || id;
  if (!id) return alert('Class ID required');

  await fetch(`${API_BASE}/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name })
  });
  hideModal();
  loadSchema();
}

// ====================== PROPERTY EDITOR ======================
function addNewProp(classId) {
  const key = prompt('New property key (e.g. status):');
  if (!key) return;
  editProp(classId, key);
}

function editProp(classId, key) {
  const props = currentProps[classId] || [];
  editingProp = props.find(p => p.key === key) || {
    id: `${classId}.${key}`,
    class_id: "@prop",
    key: key,
    data_type: "string"
  };
  selectedClassId = classId;

  document.getElementById('prop-modal-title').textContent = `Edit ${classId}.${key}`;
  renderPropForm();
  document.getElementById('prop-modal').classList.remove('hidden');
}

function renderPropForm() {
  const p = editingProp;
  const classOptions = Object.keys(currentClasses).map(c =>
    `<option value="${c}" ${p.relation_class_id === c || p.object_class_id === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  let html = `
    <div class="grid grid-cols-2 gap-6">
      <div><label class="block text-xs text-slate-400 mb-1">Key</label><input id="prop-key" value="${p.key}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Data Type</label>
        <select id="prop-type" onchange="updateConditionalFields()" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">
          <option value="string" ${p.data_type==='string'?'selected':''}>string</option>
          <option value="boolean" ${p.data_type==='boolean'?'selected':''}>boolean</option>
          <option value="integer" ${p.data_type==='integer'?'selected':''}>integer</option>
          <option value="float" ${p.data_type==='float'?'selected':''}>float</option>
          <option value="object" ${p.data_type==='object'?'selected':''}>object</option>
          <option value="relation" ${p.data_type==='relation'?'selected':''}>relation</option>
        </select>
      </div>
    </div>

    <div class="flex gap-6">
      <label class="flex items-center gap-2"><input type="checkbox" id="prop-required" ${p.required?'checked':''}> Required</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="prop-hidden" ${p.hidden?'checked':''}> Hidden in UI</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="prop-array" ${p.is_array?'checked':''}> Is Array</label>
    </div>

    <div id="conditional-fields"></div>

    <div><label class="block text-xs text-slate-400 mb-1">Default Value</label><input id="prop-default" value="${p.default_value || ''}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>

    <div><label class="block text-xs text-slate-400 mb-1">UI Editor</label>
      <select id="prop-editor" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">
        <option value="text" ${p.editor==='text'?'selected':''}>Text</option>
        <option value="textarea" ${p.editor==='textarea'?'selected':''}>Textarea</option>
        <option value="number" ${p.editor==='number'?'selected':''}>Number</option>
        <option value="date" ${p.editor==='date'?'selected':''}>Date</option>
        <option value="datetime" ${p.editor==='datetime'?'selected':''}>DateTime</option>
        <option value="select" ${p.editor==='select'?'selected':''}>Select / Enum</option>
      </select>
    </div>

    <div><label class="block text-xs text-slate-400 mb-1">Options (comma separated)</label><input id="prop-options" value="${Array.isArray(p.options)?p.options.join(','):''}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>

    <div class="grid grid-cols-2 gap-6">
      <div><label class="block text-xs text-slate-400 mb-1">Display Order</label><input type="number" id="prop-order" value="${p.display_order||0}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>
      <div><label class="block text-xs text-slate-400 mb-1">Group Name</label><input id="prop-group" value="${p.group_name||''}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>
    </div>

    <div><label class="block text-xs text-slate-400 mb-1">Validators (comma separated)</label><input id="prop-validators" value="${Array.isArray(p.validators)?p.validators.join(','):''}" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3"></div>
  `;

  document.getElementById('prop-form').innerHTML = html;
  updateConditionalFields();
}

function updateConditionalFields() {
  const type = document.getElementById('prop-type').value;
  const container = document.getElementById('conditional-fields');
  let html = '';

  if (type === 'relation') {
    html = `
      <div class="grid grid-cols-2 gap-6">
        <div><label class="block text-xs text-slate-400 mb-1">Relation Type</label>
          <select id="prop-rel-type" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">
            <option value="one-to-many">one-to-many</option>
            <option value="many-to-one">many-to-one</option>
            <option value="one-to-one">one-to-one</option>
          </select>
        </div>
        <div><label class="block text-xs text-slate-400 mb-1">Target Class</label>
          <select id="prop-rel-class" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">${Object.keys(currentClasses).map(c => `<option value="${c}">${c}</option>`).join('')}</select>
        </div>
      </div>`;
  } else if (type === 'object') {
    html = `<div><label class="block text-xs text-slate-400 mb-1">Nested Object Class</label><select id="prop-obj-class" class="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3">${Object.keys(currentClasses).map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>`;
  }
  container.innerHTML = html;
}

async function saveProp() {
  const payload = {
    id: `${selectedClassId}.${document.getElementById('prop-key').value}`,
    class_id: "@prop",
    key: document.getElementById('prop-key').value,
    data_type: document.getElementById('prop-type').value,
    required: document.getElementById('prop-required').checked,
    hidden: document.getElementById('prop-hidden').checked,
    is_array: document.getElementById('prop-array').checked,
    default_value: document.getElementById('prop-default').value || null,
    editor: document.getElementById('prop-editor').value,
    display_order: parseInt(document.getElementById('prop-order').value) || 0,
    group_name: document.getElementById('prop-group').value || null,
    validators: document.getElementById('prop-validators').value ? document.getElementById('prop-validators').value.split(',').map(v => v.trim()) : []
  };

  if (payload.data_type === 'relation') {
    payload.relation_type = document.getElementById('prop-rel-type').value;
    payload.relation_class_id = document.getElementById('prop-rel-class').value;
  } else if (payload.data_type === 'object') {
    payload.object_class_id = document.getElementById('prop-obj-class').value;
  }

  const opts = document.getElementById('prop-options').value.trim();
  if (opts) payload.options = opts.split(',').map(v => v.trim());

  await fetch(`${API_BASE}/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  showToast('Property saved ✓');
  closePropModal();
  loadSchema();
}

function deleteCurrentProp() {
  if (!confirm('Delete this property forever?')) return;
  fetch(`${API_BASE}/class/${editingProp.id}`, { method: 'DELETE' })
    .then(() => {
      showToast('Property deleted');
      closePropModal();
      loadSchema();
    });
}

function closePropModal() {
  document.getElementById('prop-modal').classList.add('hidden');
  editingProp = null;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ====================== BOOT ======================
window.onload = () => {
  loadSchema();
};
