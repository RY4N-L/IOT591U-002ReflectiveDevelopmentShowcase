// -------------------------------------------------------------
// Base dataset
// -------------------------------------------------------------
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
let currentView = 'network'; // 'network' | 'gantt'

const COLUMN_WIDTH = 32; // px per unit duration
const ROW_HEIGHT = 50;   // px height of each gantt row

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('flip-view-btn').addEventListener('click', flipView);
    document.getElementById('add-row-btn').addEventListener('click', addRow);
    document.getElementById('calculate-btn').addEventListener('click', processCPA);
    document.getElementById('reset-btn').addEventListener('click', resetToDefault);

    document.getElementById('show-working-btn').addEventListener('click', openWorkingModal);
    document.getElementById('close-working-btn').addEventListener('click', closeWorkingModal);
    document.getElementById('working-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'working-overlay') closeWorkingModal();
    });

    processCPA();
});

// -------------------------------------------------------------
// VIEW FLIP (Activity Network <-> Gantt Chart)
// -------------------------------------------------------------
function flipView() {
    currentView = (currentView === 'network') ? 'gantt' : 'network';

    const viewNetwork = document.getElementById('view-network');
    const viewGantt = document.getElementById('view-gantt');
    const headingText = document.getElementById('panel-heading-text');
    const headingIcon = document.getElementById('panel-heading-icon');
    const flipLabel = document.getElementById('flip-btn-label');
    const flipBtn = document.getElementById('flip-view-btn');

    if (currentView === 'network') {
        viewNetwork.classList.remove('hidden'); viewNetwork.classList.add('flex');
        viewGantt.classList.add('hidden'); viewGantt.classList.remove('flex');
        headingText.innerText = 'Activity Network Diagram';
        headingIcon.className = 'fa-solid fa-diagram-project';
        flipLabel.innerText = 'View Gantt';
        flipBtn.classList.remove('flipped');
    } else {
        viewGantt.classList.remove('hidden'); viewGantt.classList.add('flex');
        viewNetwork.classList.add('hidden'); viewNetwork.classList.remove('flex');
        headingText.innerText = 'Interactive Grid-Gantt Chart (Cascade Diagram)';
        headingIcon.className = 'fa-solid fa-chart-gantt';
        flipLabel.innerText = 'View Network';
        flipBtn.classList.add('flipped');
    }

    renderNetworkDiagram();
    renderCustomGanttGrid();
}

// -------------------------------------------------------------
// CPA CALCULATION ENGINE
// -------------------------------------------------------------
function calculateCPA(rawData) {
    let activities = rawData.map(a => ({
        id: a.id.toUpperCase().trim(),
        name: (a.name || '').trim(),
        duration: Math.max(0, parseInt(a.duration) || 0),
        dependencies: a.dependencies.map(d => d.toUpperCase().trim()).filter(d => d.length > 0),
        es: 0, ef: 0, ls: 0, lf: 0, tf: 0, ff: 0,
        successors: []
    }));

    activities.forEach(act => {
        act.dependencies.forEach(depId => {
            let parent = activities.find(p => p.id === depId);
            if (parent) parent.successors.push(act.id);
        });
    });

    // Kahn's topological sort
    let sortedList = [];
    let inDegree = {};
    activities.forEach(a => inDegree[a.id] = a.dependencies.length);
    let queue = activities.filter(a => inDegree[a.id] === 0);
    while (queue.length > 0) {
        let curr = queue.shift();
        sortedList.push(curr);
        curr.successors.forEach(succId => {
            inDegree[succId]--;
            if (inDegree[succId] === 0) queue.push(activities.find(a => a.id === succId));
        });
    }
    if (sortedList.length !== activities.length) {
        alert("\u26A0\uFE0F Circular Dependency Loop Detected! Please adjust predecessors.");
        return null;
    }

    // Forward pass
    sortedList.forEach(act => {
        if (act.dependencies.length === 0) act.es = 0;
        else {
            let preds = activities.filter(p => act.dependencies.includes(p.id));
            act.es = Math.max(...preds.map(p => p.ef));
        }
        act.ef = act.es + act.duration;
    });

    let projectDuration = Math.max(...activities.map(a => a.ef), 0);

    // Backward pass
    [...sortedList].reverse().forEach(act => {
        if (act.successors.length === 0) act.lf = projectDuration;
        else {
            let succs = activities.filter(s => act.successors.includes(s.id));
            act.lf = Math.min(...succs.map(s => s.ls));
        }
        act.ls = act.lf - act.duration;
    });

    // Floats
    activities.forEach(act => {
        act.tf = act.ls - act.es;
        if (act.successors.length === 0) act.ff = projectDuration - act.ef;
        else {
            let succs = activities.filter(s => act.successors.includes(s.id));
            act.ff = Math.min(...succs.map(s => s.es)) - act.ef;
        }
        act.isCritical = (act.tf === 0);
    });

    activities._projectDuration = projectDuration;
    activities._topoOrder = sortedList.map(a => a.id);
    return activities;
}

// -------------------------------------------------------------
// TABLE
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
                <input type="text" value="${row.id}" onchange="updateCell(${index}, 'id', this.value)" class="w-10 bg-transparent font-bold text-center border border-transparent hover:border-slate-300 rounded p-1 uppercase">
            </td>
            <td class="p-2">
                <input type="text" value="${row.name}" onchange="updateCell(${index}, 'name', this.value)" class="w-full bg-transparent border border-transparent hover:border-slate-300 rounded p-1" placeholder="Unnamed task">
            </td>
            <td class="p-2 text-center">
                <input type="number" min="1" value="${row.duration}" onchange="updateCell(${index}, 'duration', this.value)" class="w-16 bg-transparent text-center border border-transparent hover:border-slate-300 rounded p-1">
            </td>
            <td class="p-2">
                <input type="text" value="${row.dependencies.join(', ')}" onchange="updateCell(${index}, 'dependencies', this.value)" class="w-full bg-transparent border border-transparent hover:border-slate-300 rounded p-1 uppercase" placeholder="None">
            </td>
            <td class="p-2 text-center">
                <button onclick="deleteRow(${index})" class="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
}

function updateCell(idx, field, value) {
    if (field === 'dependencies') {
        dataset[idx].dependencies = value.split(',').map(d => d.trim().toUpperCase()).filter(d => d.length > 0);
    } else if (field === 'duration') {
        dataset[idx].duration = Math.max(1, parseInt(value) || 1);
    } else if (field === 'id') {
        dataset[idx].id = value.toUpperCase().trim();
    } else {
        dataset[idx][field] = value;
    }
    processCPA();
}

function addRow() {
    let usedIds = dataset.map(d => d.id.toUpperCase());
    let nextLetter = "New";
    for (let code = 65; code <= 90; code++) {
        let letter = String.fromCharCode(code);
        if (!usedIds.includes(letter)) { nextLetter = letter; break; }
    }
    dataset.push({ id: nextLetter, name: "New Activity", duration: 3, dependencies: [] });
    processCPA();
}

function deleteRow(index) {
    let removedId = dataset[index].id;
    dataset.splice(index, 1);
    dataset.forEach(d => { d.dependencies = d.dependencies.filter(dep => dep !== removedId); });
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
    processCPA();
}

function processCPA() {
    let results = calculateCPA(dataset);
    if (!results) return;
    computedActivities = results;
    renderTable();
    renderNetworkDiagram();
    renderCustomGanttGrid();
    if (!document.getElementById('working-overlay').classList.contains('hidden')) {
        renderWorkingContent();
    }
}

// -------------------------------------------------------------
// VIS.JS NETWORK: 4-VALUE NODE (ES|Dur|EF on top, ID+Name mid, LS|TF|LF bottom)
// -------------------------------------------------------------
function generateSvgNode(act) {
    let borderClr = act.isCritical ? "#ef4444" : "#d97706";
    let bgClr = act.isCritical ? "#fef2f2" : "#fffbeb";
    let titleClr = act.isCritical ? "#991b1b" : "#92400e";
    let bw = act.isCritical ? "3.5" : "1.5";
    let name = act.name && act.name.length ? act.name : "(unnamed)";
    if (name.length > 22) name = name.slice(0, 21) + "\u2026";

    const W = 180, H = 156;
    const bx = 8, bw2 = W - 16;      // box x + width
    const top = 26;
    const r1 = top + 32;             // 58  (end of top row)
    const r2 = r1 + 46;              // 104 (end of middle)
    const bot = r2 + 32;             // 136 (end of bottom)
    const c1 = bx + bw2 / 3, c2 = bx + 2 * bw2 / 3;
    const cxL = bx + bw2 / 6, cxM = bx + bw2 / 2, cxR = bx + 5 * bw2 / 6;

    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <text x="${cxL}" y="17" font-family="Segoe UI, Arial" font-size="11" fill="#3b82f6" font-weight="700" text-anchor="middle">TF: ${act.tf}</text>
        <text x="${cxR}" y="17" font-family="Segoe UI, Arial" font-size="11" fill="#10b981" font-weight="700" text-anchor="middle">FF: ${act.ff}</text>

        <rect x="${bx}" y="${top}" width="${bw2}" height="${bot - top}" rx="6" fill="${bgClr}" stroke="${borderClr}" stroke-width="${bw}"/>

        <line x1="${bx}" y1="${r1}" x2="${bx + bw2}" y2="${r1}" stroke="${borderClr}" stroke-width="1.5"/>
        <line x1="${bx}" y1="${r2}" x2="${bx + bw2}" y2="${r2}" stroke="${borderClr}" stroke-width="1.5"/>
        <line x1="${c1}" y1="${top}" x2="${c1}" y2="${r1}" stroke="${borderClr}" stroke-width="1.5"/>
        <line x1="${c2}" y1="${top}" x2="${c2}" y2="${r1}" stroke="${borderClr}" stroke-width="1.5"/>
        <line x1="${c1}" y1="${r2}" x2="${c1}" y2="${bot}" stroke="${borderClr}" stroke-width="1.5"/>
        <line x1="${c2}" y1="${r2}" x2="${c2}" y2="${bot}" stroke="${borderClr}" stroke-width="1.5"/>

        <text x="${cxL}" y="${top + 22}" font-family="Segoe UI, Arial" font-size="15" fill="#334155" font-weight="700" text-anchor="middle">${act.es}</text>
        <text x="${cxM}" y="${top + 22}" font-family="Segoe UI, Arial" font-size="13" fill="#64748b" text-anchor="middle">${act.duration}</text>
        <text x="${cxR}" y="${top + 22}" font-family="Segoe UI, Arial" font-size="15" fill="#334155" font-weight="700" text-anchor="middle">${act.ef}</text>

        <text x="${cxM}" y="${r1 + 22}" font-family="Segoe UI, Arial" font-size="17" fill="${titleClr}" font-weight="800" text-anchor="middle">${act.id}</text>
        <text x="${cxM}" y="${r1 + 39}" font-family="Segoe UI, Arial" font-size="9" fill="#475569" text-anchor="middle">${name}</text>

        <text x="${cxL}" y="${r2 + 22}" font-family="Segoe UI, Arial" font-size="15" fill="#334155" font-weight="700" text-anchor="middle">${act.ls}</text>
        <text x="${cxM}" y="${r2 + 22}" font-family="Segoe UI, Arial" font-size="12" fill="#64748b" text-anchor="middle">${act.tf}</text>
        <text x="${cxR}" y="${r2 + 22}" font-family="Segoe UI, Arial" font-size="15" fill="#334155" font-weight="700" text-anchor="middle">${act.lf}</text>
    </svg>`;
}

function renderNetworkDiagram() {
    let container = document.getElementById('network-container');
    if (!container) return;

    let nodesArray = computedActivities.map(act => {
        let url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(generateSvgNode(act));
        return {
            id: act.id,
            shape: 'image',
            image: url,
            shapeProperties: { useImageSize: false, interpolation: false }
        };
    });

    let edgesArray = [];
    computedActivities.forEach(act => {
        act.dependencies.forEach(depId => {
            let isCritEdge = act.isCritical && (computedActivities.find(p => p.id === depId)?.isCritical);
            edgesArray.push({
                from: depId, to: act.id,
                arrows: { to: { enabled: true, scaleFactor: isCritEdge ? 1.4 : 1.1, type: 'arrow' } },
                color: { color: isCritEdge ? '#ef4444' : '#94a3b8', highlight: '#6366f1' },
                width: isCritEdge ? 3.5 : 2
            });
        });
    });

    let data = { nodes: new vis.DataSet(nodesArray), edges: new vis.DataSet(edgesArray) };
    let options = {
        physics: { enabled: false },
        nodes: { size: 45, shapeProperties: { interpolation: false } },
        layout: {
            hierarchical: {
                direction: 'LR', sortMethod: 'directed',
                nodeSpacing: 220, levelSpacing: 340,
                blockShifting: true, edgeMinimization: true, parentCentralization: true
            }
        },
        edges: { smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 } },
        interaction: { dragNodes: true, zoomView: true, dragView: true }
    };

    if (visNetworkInstance) visNetworkInstance.destroy();
    visNetworkInstance = new vis.Network(container, data, options);
    visNetworkInstance.once('afterDrawing', () => visNetworkInstance.fit({ animation: false }));
    visNetworkInstance.on('stabilized', () => visNetworkInstance.fit({ animation: false }));
}

// -------------------------------------------------------------
// GRID-BASED CASCADE GANTT (duration-only resize)
// -------------------------------------------------------------
function renderCustomGanttGrid() {
    const root = document.getElementById('gantt-grid-root');
    if (!root) return;
    root.innerHTML = '';

    const maxEf = Math.max(...computedActivities.map(a => a.ef), 0);
    const totalCols = Math.max(20, maxEf + 5);

    let criticalRows = [];
    let criticalActs = computedActivities.filter(a => a.isCritical).sort((a, b) => a.es - b.es);
    criticalActs.forEach(act => {
        let placed = false;
        for (let row of criticalRows) {
            let overlap = row.some(p => (act.es < p.ef && p.es < act.ef));
            if (!overlap) { row.push(act); placed = true; break; }
        }
        if (!placed) criticalRows.push([act]);
    });

    let renderRows = [];
    criticalRows.forEach((rowActs, idx) => {
        renderRows.push({ label: criticalRows.length > 1 ? `Critical Activities ${idx + 1}` : 'Critical Activities', isCriticalRow: true, acts: rowActs });
    });
    let nonCriticalActs = computedActivities.filter(a => !a.isCritical).sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
    nonCriticalActs.forEach(act => renderRows.push({ label: `Activity ${act.id}`, isCriticalRow: false, acts: [act] }));

    // Header ruler
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

    renderRows.forEach(rowDef => {
        let rowDiv = document.createElement('div');
        rowDiv.className = "gantt-grid-row flex border-b border-slate-200 bg-white hover:bg-slate-50/50 transition duration-75 items-center";
        rowDiv.style.height = `${ROW_HEIGHT}px`;

        let rowLabel = document.createElement('div');
        rowLabel.className = `w-40 min-w-[10rem] h-full flex items-center px-4 font-semibold text-xs text-slate-700 bg-slate-50/70 select-none ${rowDef.isCriticalRow ? 'text-rose-700 font-bold bg-rose-50/30' : ''}`;
        rowLabel.innerText = rowDef.label;
        rowDiv.appendChild(rowLabel);

        let rowCellsWrapper = document.createElement('div');
        rowCellsWrapper.className = "flex h-full relative flex-1";
        for (let c = 0; c <= totalCols; c++) {
            let bgCell = document.createElement('div');
            bgCell.className = "gantt-bg-cell";
            bgCell.style.width = `${COLUMN_WIDTH}px`;
            bgCell.style.minWidth = `${COLUMN_WIDTH}px`;
            rowCellsWrapper.appendChild(bgCell);
        }

        let overlay = document.createElement('div');
        overlay.className = "gantt-bar-overlay";
        rowDef.acts.forEach(act => {
            let bar = document.createElement('div');
            bar.className = `gantt-active-bar ${act.isCritical ? 'bg-critical-bar' : 'bg-standard-bar'}`;
            bar.style.left = `${act.es * COLUMN_WIDTH}px`;
            bar.style.width = `${act.duration * COLUMN_WIDTH}px`;
            bar.innerHTML = `<span>${act.id} (${act.duration})</span>`;

            let handle = document.createElement('div');
            handle.className = "gantt-resize-handle";
            handle.innerHTML = `<i class="fa-solid fa-grip-lines-vertical"></i>`;
            attachResizeHandler(handle, act);
            bar.appendChild(handle);
            overlay.appendChild(bar);

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

function attachResizeHandler(handle, act) {
    handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        let startX = e.clientX;
        let startDuration = act.duration;

        function onPointerMove(moveEvent) {
            let deltaDays = Math.round((moveEvent.clientX - startX) / COLUMN_WIDTH);
            let newDuration = Math.max(1, startDuration + deltaDays);
            let targetIdx = dataset.findIndex(d => d.id === act.id);
            if (targetIdx !== -1 && dataset[targetIdx].duration !== newDuration) {
                dataset[targetIdx].duration = newDuration;
                processCPA();
            }
        }
        function onPointerUp(upEvent) {
            try { handle.releasePointerCapture(upEvent.pointerId); } catch (err) {}
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);
        }
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    });
}

// -------------------------------------------------------------
// SHOW WORKING MODAL
// -------------------------------------------------------------
function openWorkingModal() {
    document.getElementById('working-overlay').classList.remove('hidden');
    renderWorkingContent();
}
function closeWorkingModal() {
    document.getElementById('working-overlay').classList.add('hidden');
}

function renderWorkingContent() {
    const el = document.getElementById('working-content');
    if (!el) return;
    const acts = computedActivities;
    if (!acts || acts.length === 0) { el.innerHTML = '<p>No activities to show.</p>'; return; }

    const projectDuration = acts._projectDuration ?? Math.max(...acts.map(a => a.ef), 0);
    const topoOrder = acts._topoOrder ?? acts.map(a => a.id);
    const byId = {};
    acts.forEach(a => byId[a.id] = a);
    let html = '';

    html += `<div class="p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <p class="font-bold text-slate-700 mb-1">How to read this</p>
        <p class="text-xs text-slate-500">Each activity uses the 4-value method. <b>Forward Pass</b> (left \u2192 right) finds Early Start/Finish, <b>Backward Pass</b> (right \u2192 left) finds Late Start/Finish, then we compute <b>Float</b>. Any activity with <b>Total Float = 0</b> is on the <span class="text-rose-600 font-bold">Critical Path</span>.</p>
        <p class="text-xs text-slate-500 mt-2">Processing order (topological): <b>${topoOrder.join(' \u2192 ')}</b>. Project Duration = <b>${projectDuration}</b>.</p>
    </div>`;

    html += `<div><h4 class="font-bold text-indigo-700 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2"><i class="fa-solid fa-arrow-right"></i> Forward Pass \u2014 Early Start (ES) & Early Finish (EF)</h4>
        <p class="text-xs text-slate-500 mb-3">Rule: <code>ES = max(EF of predecessors)</code> (0 if none). Then <code>EF = ES + Duration</code>.</p>`;
    topoOrder.forEach(id => {
        const a = byId[id]; if (!a) return;
        let esExpr = a.dependencies.length === 0
            ? `ES = 0 <span class="text-slate-400">(no predecessors \u2014 start activity)</span>`
            : `ES = max(${a.dependencies.map(d => `EF<sub>${d}</sub>=${byId[d] ? byId[d].ef : '?'}`).join(', ')}) = <b>${a.es}</b>`;
        html += `<div class="mb-2 pl-3 border-l-2 ${a.isCritical ? 'border-rose-400' : 'border-slate-200'}">
            <p class="font-semibold">${a.id} <span class="text-slate-400 font-normal">(dur ${a.duration})</span></p>
            <p class="text-xs">${esExpr}</p>
            <p class="text-xs">EF = ES + Dur = ${a.es} + ${a.duration} = <b>${a.ef}</b></p></div>`;
    });
    html += `</div>`;

    html += `<div><h4 class="font-bold text-indigo-700 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2"><i class="fa-solid fa-arrow-left"></i> Backward Pass \u2014 Late Finish (LF) & Late Start (LS)</h4>
        <p class="text-xs text-slate-500 mb-3">Rule: <code>LF = min(LS of successors)</code> (= Project Duration ${projectDuration} if none). Then <code>LS = LF \u2212 Duration</code>.</p>`;
    [...topoOrder].reverse().forEach(id => {
        const a = byId[id]; if (!a) return;
        let lfExpr = a.successors.length === 0
            ? `LF = ${projectDuration} <span class="text-slate-400">(no successors \u2014 end activity = Project Duration)</span>`
            : `LF = min(${a.successors.map(s => `LS<sub>${s}</sub>=${byId[s] ? byId[s].ls : '?'}`).join(', ')}) = <b>${a.lf}</b>`;
        html += `<div class="mb-2 pl-3 border-l-2 ${a.isCritical ? 'border-rose-400' : 'border-slate-200'}">
            <p class="font-semibold">${a.id} <span class="text-slate-400 font-normal">(dur ${a.duration})</span></p>
            <p class="text-xs">${lfExpr}</p>
            <p class="text-xs">LS = LF \u2212 Dur = ${a.lf} \u2212 ${a.duration} = <b>${a.ls}</b></p></div>`;
    });
    html += `</div>`;

    html += `<div><h4 class="font-bold text-indigo-700 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2"><i class="fa-solid fa-scale-balanced"></i> Float & Critical Path</h4>
        <p class="text-xs text-slate-500 mb-3">Rule: <code>Total Float = LS \u2212 ES</code>. <code>Free Float = min(ES of successors) \u2212 EF</code>. If <b>TF = 0</b> \u2192 <span class="text-rose-600 font-bold">Critical</span>.</p>`;
    topoOrder.forEach(id => {
        const a = byId[id]; if (!a) return;
        let ffExpr;
        if (a.successors.length === 0) {
            ffExpr = `FF = ProjDur \u2212 EF = ${projectDuration} \u2212 ${a.ef} = <b>${a.ff}</b>`;
        } else {
            let minSuccES = Math.min(...a.successors.map(s => byId[s] ? byId[s].es : Infinity));
            ffExpr = `FF = min(${a.successors.map(s => `ES<sub>${s}</sub>=${byId[s] ? byId[s].es : '?'}`).join(', ')}) \u2212 EF = ${minSuccES} \u2212 ${a.ef} = <b>${a.ff}</b>`;
        }
        html += `<div class="mb-2 pl-3 border-l-2 ${a.isCritical ? 'border-rose-400' : 'border-slate-200'}">
            <p class="font-semibold">${a.id} ${a.isCritical ? '<span class="text-rose-600 text-xs font-bold ml-1">\u25CF CRITICAL</span>' : '<span class="text-amber-600 text-xs font-bold ml-1">has slack</span>'}</p>
            <p class="text-xs">TF = LS \u2212 ES = ${a.ls} \u2212 ${a.es} = <b>${a.tf}</b></p>
            <p class="text-xs">${ffExpr}</p></div>`;
    });
    html += `</div>`;

    let critPath = topoOrder.filter(id => byId[id] && byId[id].isCritical);
    html += `<div><h4 class="font-bold text-indigo-700 border-b border-indigo-100 pb-1 mb-3 flex items-center gap-2"><i class="fa-solid fa-table-list"></i> Summary Table</h4>
        <div class="overflow-x-auto"><table class="w-full text-xs border-collapse"><thead><tr class="bg-slate-100 text-slate-600">
        <th class="p-2 border border-slate-200">ID</th><th class="p-2 border border-slate-200">Dur</th><th class="p-2 border border-slate-200">ES</th><th class="p-2 border border-slate-200">EF</th><th class="p-2 border border-slate-200">LS</th><th class="p-2 border border-slate-200">LF</th><th class="p-2 border border-slate-200">TF</th><th class="p-2 border border-slate-200">FF</th><th class="p-2 border border-slate-200">Critical?</th>
        </tr></thead><tbody>`;
    topoOrder.forEach(id => {
        const a = byId[id]; if (!a) return;
        html += `<tr class="${a.isCritical ? 'bg-rose-50' : ''} text-center">
            <td class="p-2 border border-slate-200 font-bold">${a.id}</td>
            <td class="p-2 border border-slate-200">${a.duration}</td>
            <td class="p-2 border border-slate-200">${a.es}</td>
            <td class="p-2 border border-slate-200">${a.ef}</td>
            <td class="p-2 border border-slate-200">${a.ls}</td>
            <td class="p-2 border border-slate-200">${a.lf}</td>
            <td class="p-2 border border-slate-200 font-bold ${a.tf === 0 ? 'text-rose-600' : ''}">${a.tf}</td>
            <td class="p-2 border border-slate-200">${a.ff}</td>
            <td class="p-2 border border-slate-200">${a.isCritical ? '<span class="text-rose-600 font-bold">Yes</span>' : 'No'}</td></tr>`;
    });
    html += `</tbody></table></div>
        <p class="mt-3 text-sm"><b>Critical Path:</b> <span class="text-rose-600 font-bold">${critPath.length ? critPath.join(' \u2192 ') : '\u2014'}</span> &nbsp; | &nbsp; <b>Total Duration:</b> ${projectDuration}</p></div>`;

    el.innerHTML = html;
}
