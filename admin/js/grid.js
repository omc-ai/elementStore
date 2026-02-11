// =====================================================================
// GRID - Shared AG-Grid column builder
// =====================================================================

/**
 * Build AG-Grid column definitions from class metadata
 * @param {object} classMeta - Class metadata with props
 * @param {string} classId - Class ID (e.g., '@class', 'customer')
 * @param {Function} actionsCellRenderer - Custom cell renderer for Actions column
 * @returns {Array} AG-Grid column definitions
 */
function buildGridColumns(classMeta, classId, actionsCellRenderer) {
    const propsArray = classMeta ? elementStore.getSortedProps(classMeta) : [];

    const columnDefs = [
        { field: 'id', headerName: 'ID', width: 150, pinned: 'left' }
    ];

    propsArray.forEach(prop => {
        // Skip 'props' array - we'll add a count column instead
        if (prop.key === 'props') return;

        const colDef = {
            field: prop.key,
            headerName: elementStore.getPropLabel(prop),
            width: 150,
            cellRenderer: (p) => elementStore.propToCell(prop, p.value, p.data.id)
        };

        if (prop.data_type === 'boolean') {
            colDef.width = 80;
        } else if (prop.is_array) {
            colDef.width = 70;
        }

        columnDefs.push(colDef);
    });

    // Add props count column if class has props array
    if (propsArray.find(p => p.key === 'props')) {
        columnDefs.push({
            field: 'props',
            headerName: 'Props',
            cellRenderer: (p) => {
                const props = p.data.props || {};
                return Array.isArray(props) ? props.length : Object.keys(props).length;
            },
            width: 70
        });
    }

    // Add Actions column
    if (actionsCellRenderer) {
        columnDefs.push({
            headerName: 'Actions',
            width: 180,
            pinned: 'right',
            sortable: false,
            filter: false,
            cellRenderer: actionsCellRenderer
        });
    }

    return columnDefs;
}
