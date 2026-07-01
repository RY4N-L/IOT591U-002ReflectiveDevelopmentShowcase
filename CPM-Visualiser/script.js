// Base dataset config
let dataset = [
    { id: "A", name: "Requirements", duration: 4, dependencies: [] },
    { id: "B", name: "Database Design", duration: 4, dependencies: ["A"] },
    { id: "C", name: "UI Mockups", duration: 5, dependencies: ["A"] },
    { id: "D", name: "Core API Build", duration: 3, dependencies: ["B"] },
    { id: "E", name: "Frontend Integrations", duration: 3, dependencies: ["C"] },
    { id: "F", name: "System Testing", duration: 3, dependencies: ["D", "E"] }
];

let computedActivities = [];
let visNetworkInstance = null;
let currentLayoutMode = null; // 'table-first' or 'gantt-first'

// Configuration for Gantt Columns
const COLUMN_WIDTH = 32; // pixels per unit duration (zoomed out for full view)

window.addEventListener('DOMContentLoaded', () => {
    // Layout Toggle Events
    document.getElementById('toggle-table-first').addEventListener('click', () => switchLayout('table-first'));
    document.getElementById('toggle-gantt-first').addEventListener('click', () => switchLayout('gantt-first'));

    // Onboarding Screen Choice Events
    document.getElementById('choose-table-first').addEventListener('click', () => {
        hideOnboarding();
        switchLayout('table-first');
    });
    document.getElementById('choose-gantt-first').addEventListener('click', () => {
        hideOnboarding();
        switchLayout('gantt-first');
    });
});

function hideOnboarding() {
    document.getElementById('onboarding-overlay').classList.add('hidden');
}

// Swapping layout panels dynamically
function switchLayout(mode) {
    if (currentLayoutMode === mode) return;
    currentLayoutMode = mode;

    // Toggle button style visual feedback
    const btnTable = document.getElementById('toggle-table-first');
    const btnGantt = document.getElementById('toggle-gantt-first');

    if (mode === 'table-first') {
        btnTable.className = "px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 text-white bg-indigo-500 shadow";
        btnGantt.className = "px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 text-indigo-200 hover:text-white";
    } else {
        btnGantt.className = "px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 text-white bg-indigo-500 shadow";
        btnTable.className = "px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 text-indigo-200 hover:text-white";
    }

    const leftContainer = document.getElementById('left-container');
    const rightBottomContainer = document.getElementById('right-bottom-container');

    const tablePanel = document.getElementById('table-panel');
    const ganttPanel = document.getElementById('gantt-panel');

    // Remove children temporarily
    leftContainer.innerHTML = '';
    rightBottomContainer.innerHTML = '';

    if (mode === 'table-first') {
        leftContainer.appendChild(tablePanel);
        rightBottomContainer.appendChild(ganttPanel);
    } else {
        leftContainer.appendChild(ganttPanel);
        rightBottomContainer.appendChild(tablePanel);
    }

    // Update the AoN network heading to reflect the active approach
    const aonHeading = document.getElementById('aon-heading-text');
    if (aonHeading) {
        aonHeading.innerText = (mode === 'table-first')
            ? 'Activity Network based on Table'
            : 'Activity Network based on Gantt Chart';
    }

    // Set up table actions since elements moved
    setupTableButtonListeners();

    // Trigger full calculation and visual rebuild
    processCPA();
}

function setupTableButtonListeners() {
    // Re-attach event listeners to table action buttons since DOM nodes were moved
    document.getElementById('add-row-btn').addEventListener('click', addRow);
    document.getElementById('calculate-btn').addEventListener('click', processCPA);
    document.getElementById('reset-btn').addEventListener('click', resetToDefault);
}

// -------------------------------------------------------------
// CORE MATHEMATICAL ENGINE: CRITICAL PATH CALCULATOR (CPM)
// -------------------------------------------------------------
function calculateCPA(rawActivities) {
    let activities = rawActivities.map(a => ({
        id: a.id.toUpperCase().trim(),
        name: a.name.trim(),
        duration: Math.max(0, parseInt(a.duration) || 0),
        dependencies: a.dependencies.map(d => d.toUpperCase().trim()).filter(d => d.length > 0),
        es: 0, ef: 0, ls: 0, lf: 0, tf: 0, ff: 0,
        successors: []
    }));

    // Setup Successor relationships
    activities.forEach(act => {
        act.dependencies.forEach(depId => {
            let parent = activities.find(p => p.id === depId);
            if (parent) parent.successors.push(act.id);
        });
    });

    // Kahn's Topological Sort Algorithm
    let sortedList = [];
    let inDegree = {};
    activities.forEach(a => inDegree[a.id] = a.dependencies.length);

    let queue = activities.filter(a => inDegree[a.id] === 0);
    while (queue.length > 0) {
        let curr = queue.shift();
        sortedList.push(curr);
        curr.successors.forEach(succId => {
            inDegree[succId]--;
            if (inDegree[succId] === 0) {
                let succObj = activities.find(a => a.id === succId);
                queue.push(succObj);
            }
        });
    }

    if (sortedList.length !== activities.length) {
        alert("⚠️ Circular Dependency Loop Detected! Please adjust predecessors.");
        return null;
    }

    // Forward Pass: ES, EF
    sortedList.forEach(act => {
        if (act.dependencies.length === 0) {
            act.es = 0;
        } else {
            let predObjects = activities.filter(p => act.dependencies.includes(p.id));
            act.es = Math.max(...predObjects.map(p => p.ef));
        }
        act.ef = act.es + act.duration;
    });

    let projectDuration = Math.max(...activities.map(a => a.ef), 0);

    // Backward Pass: LF, LS
    let reverseSortedList = [...sortedList].reverse();
    reverseSortedList.forEach(act => {
        if (act.successors.length === 0) {
            act.lf = projectDuration;
        } else {
            let succObjects = activities.filter(s => act.successors.includes(s.id));
            act.lf = Math.min(...succObjects.map(s => s.ls));
        }
        act.ls = act.lf - act.duration;
    });

    // Calculate Floats
    activities.forEach(act => {
        act.tf = act.ls - act.es;
        
        if (act.successors.length === 0) {
            act.ff = projectDuration - act.ef;
        } else {
            let succObjects = activities.filter(s => act.successors.includes(s.id));
            let minSuccES = Math.min(...succObjects.map(s => s.es));
            act.ff = minSuccES - act.ef;
        }
        
        act.isCritical = (act.tf === 0);
    });

    return activities;
}

// -------------------------------------------------------------
// USER DATA LOG ACTION HANDLERS
// -------------------------------------------------------------
function renderTable() {
    let tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    dataset.forEach((row, index) => {
        let tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-sm";
        tr.innerHTML = `
            <td class="p-2">
                <input type="text" value="${row.id}" onchange="updateCell(${index}, 'id', this.value)" class="w-12 bg-transparent font-bold text-center border border-transparent hover:border-slate-300 rounded p-1 uppercase">
            </td>
            <td class="p-2">
                <input type="text" value="${row.name}" onchange="updateCell(${index}, 'name', this.value)" class="w-full bg-transparent border border-transparent hover:border-slate-300 rounded p-1">
            </td>
            <td class="p-2">
                <input type="number" min="1" value="${row.duration}" onchange="updateCell(${index}, 'duration', this.value)" class="w-16 bg-transparent text-center border border-transparent hover:border-slate-300 rounded p-1">
            </td>
            <td class="p-2">
                <input type="text" value="${row.dependencies.join(', ')}" onchange="updateCell(${index}, 'dependencies', this.value)" class="w-full bg-transparent border border-transparent hover:border-slate-300 rounded p-1 uppercase" placeholder="None">
            </td>
            <td class="p-2 text-center">
                <button onclick="deleteRow(${index})" class="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateCell(idx, field, value) {
    if (field === 'dependencies') {
        dataset[idx].dependencies = value.split(',').map(d => d.trim().toUpperCase()).filter(d => d.length > 0);
    } else if (field === 'duration') {
        dataset[idx].duration = Math.max(1, parseInt(value) || 1);
    } else {
        dataset[idx][field] = value;
    }
    processCPA();
}

function addRow() {
    let lastIdCode = dataset.length > 0 ? dataset[dataset.length - 1].id.charCodeAt(0) : 64;
    let nextLetter = String.fromCharCode(lastIdCode + 1);
    if (!/^[A-Z]$/.test(nextLetter)) nextLetter = "New";

    dataset.push({
        id: nextLetter,
        name: "New Task",
        duration: 3,
        dependencies: []
    });
    renderTable();
    processCPA();
}

function deleteRow(index) {
    dataset.splice(index, 1);
    renderTable();
    processCPA();
}

function resetToDefault() {
    dataset = [
        { id: "A", name: "Requirements", duration: 4, dependencies: [] },
        { id: "B", name: "Database Design", duration: 4, dependencies: ["A"] },
        { id: "C", name: "UI Mockups", duration: 5, dependencies: ["A"] },
        { id: "D", name: "Core API Build", duration: 3, dependencies: ["B"] },
        { id: "E", name: "Frontend Integrations", duration: 3, dependencies: ["C"] },
        { id: "F", name: "System Testing", duration: 3, dependencies: ["D", "E"] }
    ];
    renderTable();
    processCPA();
}

function processCPA() {
    let results = calculateCPA(dataset);
    if (!results) return; 
    computedActivities = results;
    
    renderTable();
    renderNetworkDiagram();
    renderCustomGanttGrid();
}

// -------------------------------------------------------------
// VIS.JS NETWORK: 4-VALUE NODE RENDERING
// -------------------------------------------------------------
function generateSvgNode(act) {
    let borderClr = act.isCritical ? "#ef4444" : "#d97706";
    let bgClr = act.isCritical ? "#fef2f2" : "#fffbeb";
    let textTitleClr = act.isCritical ? "#991b1b" : "#92400e";
    let borderWeight = act.isCritical ? "3.5" : "1.5";

    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="130">
        <text x="40" y="16" font-family="Segoe UI, Arial" font-size="11" fill="#3b82f6" font-weight="700" text-anchor="middle">TF: ${act.tf}</text>
        <text x="120" y="16" font-family="Segoe UI, Arial" font-size="11" fill="#10b981" font-weight="700" text-anchor="middle">FF: ${act.ff}</text>
        
        <rect x="5" y="24" width="150" height="100" rx="6" fill="${bgClr}" stroke="${borderClr}" stroke-width="${borderWeight}"/>
        
        <line x1="5" y1="57" x2="155" y2="57" stroke="${borderClr}" stroke-width="1.5" />
        <line x1="5" y1="91" x2="155" y2="91" stroke="${borderClr}" stroke-width="1.5" />
        
        <line x1="80" y1="24" x2="80" y2="57" stroke="${borderClr}" stroke-width="1.5" />
        <line x1="80" y1="91" x2="80" y2="124" stroke="${borderClr}" stroke-width="1.5" />
        
        <text x="42" y="46" font-family="Segoe UI, Arial" font-size="14" fill="#334155" font-weight="bold" text-anchor="middle">${act.es}</text>
        <text x="118" y="46" font-family="Segoe UI, Arial" font-size="14" fill="#334155" font-weight="bold" text-anchor="middle">${act.ef}</text>
        
        <text x="80" y="79" font-family="Segoe UI, Arial" font-size="14" fill="${textTitleClr}" font-weight="bold" text-anchor="middle">${act.id} (D:${act.duration})</text>
        
        <text x="42" y="112" font-family="Segoe UI, Arial" font-size="14" fill="#334155" font-weight="bold" text-anchor="middle">${act.ls}</text>
        <text x="118" y="112" font-family="Segoe UI, Arial" font-size="14" fill="#334155" font-weight="bold" text-anchor="middle">${act.lf}</text>
    </svg>
    `;
}

function renderNetworkDiagram() {
    let container = document.getElementById('network-container');
    if (!container) return;

    let nodesArray = computedActivities.map(act => {
        let svgString = generateSvgNode(act);
        let url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
        return {
            id: act.id,
            shape: 'image',
            image: url,
            size: 50  // Smaller node footprint so the whole network fits comfortably
        };
    });

    let edgesArray = [];
    computedActivities.forEach(act => {
        act.dependencies.forEach(depId => {
            let isCritEdge = act.isCritical && (computedActivities.find(p => p.id === depId)?.isCritical);
            edgesArray.push({
                from: depId,
                to: act.id,
                arrows: {
                    to: { enabled: true, scaleFactor: isCritEdge ? 1.4 : 1.1, type: 'arrow' }
                },
                color: { color: isCritEdge ? '#ef4444' : '#94a3b8', highlight: '#6366f1' },
                width: isCritEdge ? 3.5 : 2
            });
        });
    });

    let data = { nodes: new vis.DataSet(nodesArray), edges: new vis.DataSet(edgesArray) };
    let options = {
        physics: {
            enabled: false // Disabling physics completely prevents node overlaps and clustering!
        },
        layout: {
            hierarchical: {
                direction: 'LR',
                sortMethod: 'directed',
                nodeSpacing: 260,   // Larger spacing between parallel tasks (less clustering)
                levelSpacing: 360,  // Deeper spacing between sequential levels (clear arrows)
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        },
        edges: {
            smooth: {
                type: 'cubicBezier',
                forceDirection: 'horizontal',
                roundness: 0.4
            }
        },
        interaction: { dragNodes: true, zoomView: true, dragView: true }
    };

    if (visNetworkInstance) visNetworkInstance.destroy();
    visNetworkInstance = new vis.Network(container, data, options);

    // Auto-fit the diagram into view so it is neither cut-off nor over-zoomed
    visNetworkInstance.once('afterDrawing', () => {
        visNetworkInstance.fit({ animation: false });
    });
    // Re-fit on container resize (e.g. switching layouts)
    visNetworkInstance.on('stabilized', () => {
        visNetworkInstance.fit({ animation: false });
    });
}

// -------------------------------------------------------------
// NEW FEATURE: FURTHER-MATHS GRID-BASED CASCADE GANTT
// -------------------------------------------------------------
function renderCustomGanttGrid() {
    const root = document.getElementById('gantt-grid-root');
    if (!root) return;
    root.innerHTML = '';

    const maxEf = Math.max(...computedActivities.map(a => a.ef), 0);
    // Draw columns up to max(20, max_ef + 5) to give empty expansion buffer cells on right
    const totalCols = Math.max(20, maxEf + 5);

    // 1. Grouping and packing critical path activities so they align sequentially on "Critical Path" row(s)
    let criticalRows = [];
    let criticalActs = computedActivities.filter(a => a.isCritical).sort((a, b) => a.es - b.es);
    
    criticalActs.forEach(act => {
        let placed = false;
        for (let row of criticalRows) {
            let overlap = row.some(placedAct => {
                return (act.es < placedAct.ef && placedAct.es < act.ef);
            });
            if (!overlap) {
                row.push(act);
                placed = true;
                break;
            }
        }
        if (!placed) {
            criticalRows.push([act]);
        }
    });

    // List of rows to draw
    let renderRows = [];

    // Add critical rows
    criticalRows.forEach((rowActs, idx) => {
        renderRows.push({
            label: criticalRows.length > 1 ? `Critical Path ${idx + 1}` : 'Critical Activities',
            isCriticalRow: true,
            acts: rowActs
        });
    });

    // Add individual non-critical rows
    let nonCriticalActs = computedActivities.filter(a => !a.isCritical).sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
    nonCriticalActs.forEach(act => {
        renderRows.push({
            label: `Activity ${act.id}`,
            isCriticalRow: false,
            acts: [act]
        });
    });

    // 2. Build DOM layout
    // Header Row: Days indicator
    let headerRow = document.createElement('div');
    headerRow.className = "flex h-10 border-b border-slate-300 bg-slate-50 items-center shrink-0 text-sm";
    
    let labelHeader = document.createElement('div');
    labelHeader.className = "w-40 min-w-[10rem] h-full flex items-center px-4 font-bold border-r-2 border-slate-400 bg-slate-100 text-slate-600";
    labelHeader.innerText = "Timeline";
    headerRow.appendChild(labelHeader);

    let gridColsWrapper = document.createElement('div');
    gridColsWrapper.className = "flex relative h-full flex-1";

    for (let c = 0; c <= totalCols; c++) {
        let cell = document.createElement('div');
        cell.className = "gantt-header-cell";
        cell.style.width = `${COLUMN_WIDTH}px`;
        cell.style.minWidth = `${COLUMN_WIDTH}px`;
        cell.innerHTML = `<span class="gantt-header-num">${c}</span>`;
        gridColsWrapper.appendChild(cell);
    }
    headerRow.appendChild(gridColsWrapper);
    root.appendChild(headerRow);

    // Render Data Rows
    renderRows.forEach(rowDef => {
        let rowDiv = document.createElement('div');
        rowDiv.className = "gantt-grid-row flex h-[50px] border-b border-slate-200 bg-white hover:bg-slate-50/50 transition duration-75 items-center";

        let rowLabel = document.createElement('div');
        rowLabel.className = `gantt-row-label w-40 min-w-[10rem] h-full flex items-center px-4 font-semibold text-xs text-slate-700 bg-slate-50/70 select-none ${rowDef.isCriticalRow ? 'text-rose-700 font-bold bg-rose-50/30' : ''}`;
        rowLabel.innerText = rowDef.label;
        rowDiv.appendChild(rowLabel);

        let rowCellsWrapper = document.createElement('div');
        rowCellsWrapper.className = "grid-row-cells flex h-full relative flex-1";

        // Draw background grid lines
        for (let c = 0; c <= totalCols; c++) {
            let bgCell = document.createElement('div');
            bgCell.className = "gantt-bg-cell";
            bgCell.style.width = `${COLUMN_WIDTH}px`;
            bgCell.style.minWidth = `${COLUMN_WIDTH}px`;
            rowCellsWrapper.appendChild(bgCell);
        }

        // Overlay active and float blocks
        let overlay = document.createElement('div');
        overlay.className = "gantt-bar-overlay";

        rowDef.acts.forEach(act => {
            // A. Draw active duration block
            let bar = document.createElement('div');
            bar.className = `gantt-active-bar ${act.isCritical ? 'bg-critical-bar' : 'bg-standard-bar'}`;
            bar.style.left = `${act.es * COLUMN_WIDTH}px`;
            bar.style.width = `${act.duration * COLUMN_WIDTH}px`;
            bar.innerHTML = `<span>${act.id} (${act.duration})</span>`;

            // B. Add Drag handle on right edge
            let handle = document.createElement('div');
            handle.className = "gantt-resize-handle";
            handle.innerHTML = `<i class="fa-solid fa-grip-lines-vertical"></i>`;
            
            // Mouse / Touch resizing actions using PointerEvents
            handle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                handle.setPointerCapture(e.pointerId);

                let startX = e.clientX;
                let startDuration = act.duration;

                function onPointerMove(moveEvent) {
                    let deltaX = moveEvent.clientX - startX;
                    let deltaDays = Math.round(deltaX / COLUMN_WIDTH);
                    let newDuration = Math.max(1, startDuration + deltaDays);

                    // Update local dataset and live refresh
                    let targetIdx = dataset.findIndex(d => d.id === act.id);
                    if (targetIdx !== -1 && dataset[targetIdx].duration !== newDuration) {
                        dataset[targetIdx].duration = newDuration;
                        processCPA();
                    }
                }

                function onPointerUp(upEvent) {
                    handle.releasePointerCapture(upEvent.pointerId);
                    handle.removeEventListener('pointermove', onPointerMove);
                    handle.removeEventListener('pointerup', onPointerUp);
                    handle.removeEventListener('pointercancel', onPointerUp);
                }

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', onPointerUp);
                handle.addEventListener('pointercancel', onPointerUp);
            });

            bar.appendChild(handle);
            overlay.appendChild(bar);

            // C. Draw total float block (if non-critical with float > 0)
            if (!act.isCritical && act.tf > 0) {
                let floatBar = document.createElement('div');
                floatBar.className = "gantt-float-bar";
                floatBar.style.left = `${act.ef * COLUMN_WIDTH}px`;
                floatBar.style.width = `${act.tf * COLUMN_WIDTH}px`;
                floatBar.innerHTML = `<span>Float: ${act.tf}</span>`;
                overlay.appendChild(floatBar);
            }
        });

        rowCellsWrapper.appendChild(overlay);
        rowDiv.appendChild(rowCellsWrapper);
        root.appendChild(rowDiv);
    });
}