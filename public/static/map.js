// Client-side BOM column-mapping UI.
// Reads window.__MAP_STATE__ (set by map.tsx) which contains:
//   { grid: { [sheetName]: rows[][] }, mapping: {...}, templates: [...] }
// Renders a sheet preview, populates column-mapping dropdowns, and shows
// a live import preview that updates as the user changes any selection.
(function () {
    var state = window.__MAP_STATE__;
    if (!state) return;

    var sheetSelect    = document.getElementById('sheet-select');
    var headerRowInput = document.getElementById('header-row');
    var previewWrap    = document.getElementById('sheet-preview');
    var itemsPreview   = document.getElementById('items-preview');
    var previewCount   = document.getElementById('preview-count');
    var templateSelect = document.getElementById('template-select');
    var applyBtn       = document.getElementById('apply-template');
    var saveCheckbox   = document.getElementById('save-template-checkbox');
    var templateName   = document.getElementById('template-name');

    var colSelects = {
        materialCol: document.getElementById('map-material'),
        qtyCol:      document.getElementById('map-qty'),
        priceCol:    document.getElementById('map-price'),
        unitCol:     document.getElementById('map-unit'),
        hoursCol:    document.getElementById('map-hours'),
    };
    // material + qty are required and don't get a "none" option.
    var REQUIRED = { materialCol: true, qtyCol: true };

    var SKIP_PATTERNS = [
        /^subtotal\b/i, /^total\b/i, /^grand total\b/i, /^bid price\b/i,
        /^pricing summary\b/i, /^material( & equipment)? subtotal\b/i,
        /^total line items\b/i, /^\d+\s*$/
    ];

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function toFloat(v) {
        if (v === null || v === undefined || v === '') return 0;
        var s = String(v).replace(/[^0-9.\-]/g, '');
        if (!s || s === '-' || s === '.') return 0;
        var n = parseFloat(s);
        return isFinite(n) ? n : 0;
    }
    function currentSheetRows() {
        return state.grid[sheetSelect.value] || [];
    }
    function currentHeaderIdx() {
        var n = parseInt(headerRowInput.value, 10);
        if (!isFinite(n) || n < 1) n = 1;
        return n - 1;
    }
    function currentMapping() {
        return {
            sheetName:   sheetSelect.value,
            headerRow:   currentHeaderIdx(),
            materialCol: parseInt(colSelects.materialCol.value || '-1', 10),
            qtyCol:      parseInt(colSelects.qtyCol.value || '-1', 10),
            priceCol:    parseInt(colSelects.priceCol.value || '-1', 10),
            unitCol:     parseInt(colSelects.unitCol.value || '-1', 10),
            hoursCol:    parseInt(colSelects.hoursCol.value || '-1', 10),
        };
    }

    function renderSheetPreview() {
        var rows = currentSheetRows();
        var headerIdx = currentHeaderIdx();
        var max = Math.min(rows.length, 15);
        var maxCols = 0;
        for (var i = 0; i < max; i++) {
            if ((rows[i] || []).length > maxCols) maxCols = (rows[i] || []).length;
        }
        var html = '<table class="data-table preview-grid"><tbody>';
        for (var i = 0; i < max; i++) {
            var row = rows[i] || [];
            html += '<tr data-row="' + i + '" class="grid-row' + (i === headerIdx ? ' header-row' : '') + '">';
            html += '<td class="row-label">' + (i + 1) + '</td>';
            for (var j = 0; j < maxCols; j++) {
                var v = row[j];
                html += '<td>' + escapeHtml(v == null ? '' : String(v)) + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        if (rows.length > max) {
            html += '<p class="muted" style="margin: 6px 0 0">'
                  + 'Showing 15 of ' + rows.length + ' rows.</p>';
        }
        previewWrap.innerHTML = html;
        var trs = previewWrap.querySelectorAll('tr.grid-row');
        for (var k = 0; k < trs.length; k++) {
            trs[k].addEventListener('click', function (e) {
                var idx = parseInt(e.currentTarget.getAttribute('data-row'), 10);
                headerRowInput.value = String(idx + 1);
                onHeaderChange();
            });
        }
    }

    function rebuildColDropdowns(restore) {
        var rows = currentSheetRows();
        var headerIdx = currentHeaderIdx();
        var headers = (rows[headerIdx] || []).map(function (c, i) {
            var t = c == null ? '' : String(c).trim();
            return t || '(col ' + (i + 1) + ')';
        });
        for (var field in colSelects) {
            if (!colSelects.hasOwnProperty(field)) continue;
            var sel = colSelects[field];
            var prior = restore && restore.hasOwnProperty(field) ? restore[field] : sel.value;
            sel.innerHTML = '';
            if (!REQUIRED[field]) {
                var none = document.createElement('option');
                none.value = '-1';
                none.textContent = '— none —';
                sel.appendChild(none);
            }
            headers.forEach(function (h, idx) {
                var o = document.createElement('option');
                o.value = String(idx);
                o.textContent = (idx + 1) + '. ' + h;
                sel.appendChild(o);
            });
            // Try to restore prior selection.
            if (prior != null && prior !== '' && prior !== undefined) {
                sel.value = String(prior);
                // If the prior value is now out of range, fall back to default.
                if (sel.value !== String(prior)) {
                    sel.value = REQUIRED[field]
                        ? (headers.length ? '0' : '')
                        : '-1';
                }
            }
        }
    }

    function applyMappingClient(m) {
        var rows = state.grid[m.sheetName] || [];
        if (m.materialCol < 0 || m.qtyCol < 0) return [];
        var items = [];
        for (var i = m.headerRow + 1; i < rows.length; i++) {
            var row = rows[i] || [];
            var matRaw = row[m.materialCol];
            if (matRaw == null) continue;
            var mat = String(matRaw).trim();
            if (!mat) continue;
            var skip = false;
            for (var k = 0; k < SKIP_PATTERNS.length; k++) {
                if (SKIP_PATTERNS[k].test(mat)) { skip = true; break; }
            }
            if (skip) continue;
            if (m.unitCol >= 0) {
                var u = row[m.unitCol];
                if (u == null || String(u).trim() === '') continue;
            }
            items.push({
                material: mat,
                qty:      toFloat(row[m.qtyCol]),
                price:    m.priceCol >= 0 ? toFloat(row[m.priceCol]) : 0,
                unit:     m.unitCol  >= 0 ? String(row[m.unitCol]  || '').trim() : '',
                hours:    m.hoursCol >= 0 ? toFloat(row[m.hoursCol]) : null,
            });
        }
        return items;
    }

    function renderItemsPreview() {
        var m = currentMapping();
        var items = applyMappingClient(m);
        if (items.length === 0) {
            itemsPreview.innerHTML = '<p class="muted">No line items will be imported. Check Material and Quantity column selections, the header row, and the sheet.</p>';
            previewCount.textContent = '  — 0 items';
            return;
        }
        var html = '<table class="data-table"><thead><tr><th>Material</th><th class="num">Qty</th>';
        if (m.unitCol  >= 0) html += '<th>Unit</th>';
        if (m.priceCol >= 0) html += '<th class="num">Unit $</th>';
        if (m.hoursCol >= 0) html += '<th class="num">Hrs/Unit</th>';
        html += '</tr></thead><tbody>';
        var max = Math.min(items.length, 8);
        for (var i = 0; i < max; i++) {
            var it = items[i];
            html += '<tr><td>' + escapeHtml(it.material) + '</td>';
            html += '<td class="num">' + it.qty.toFixed(2) + '</td>';
            if (m.unitCol  >= 0) html += '<td>' + escapeHtml(it.unit) + '</td>';
            if (m.priceCol >= 0) html += '<td class="num">$' + it.price.toFixed(2) + '</td>';
            if (m.hoursCol >= 0) html += '<td class="num">' + (it.hours == null ? '—' : it.hours.toFixed(3)) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        if (items.length > max) {
            html += '<p class="muted">…and ' + (items.length - max) + ' more.</p>';
        }
        itemsPreview.innerHTML = html;
        previewCount.textContent = '  — ' + items.length + ' items will be imported';
    }

    function onSheetChange() {
        // Auto-detect a sane header row on the new sheet.
        var rows = currentSheetRows();
        var detected = -1;
        for (var i = 0; i < Math.min(rows.length, 60); i++) {
            var cells = (rows[i] || []).map(function (c) {
                return String(c == null ? '' : c).toLowerCase().trim();
            });
            var hasQty  = cells.some(function (c) { return /^(qty|quantity|count)$/.test(c); });
            var hasItem = cells.some(function (c) { return /(item|description|material|product)/.test(c); });
            if (hasQty && hasItem) { detected = i; break; }
        }
        if (detected < 0) detected = 0;
        headerRowInput.value = String(detected + 1);
        renderSheetPreview();
        // Drop previous column choices; they don't make sense on a new sheet.
        rebuildColDropdowns({ materialCol: '', qtyCol: '', priceCol: '-1', unitCol: '-1', hoursCol: '-1' });
        renderItemsPreview();
    }
    function onHeaderChange() {
        renderSheetPreview();
        rebuildColDropdowns();
        renderItemsPreview();
    }
    function onColChange() { renderItemsPreview(); }

    function applySelectedTemplate() {
        var id = templateSelect.value;
        if (!id) return;
        var tpl = null;
        for (var i = 0; i < state.templates.length; i++) {
            if (String(state.templates[i].id) === id) { tpl = state.templates[i]; break; }
        }
        if (!tpl) return;

        // Find sheet matching the pattern.
        var sheetNames = Object.keys(state.grid);
        var pattern = (tpl.sheet_pattern || '').toLowerCase();
        var match = null;
        if (pattern) {
            for (var s = 0; s < sheetNames.length; s++) {
                if (sheetNames[s].toLowerCase() === pattern) { match = sheetNames[s]; break; }
            }
            if (!match) {
                for (var s2 = 0; s2 < sheetNames.length; s2++) {
                    if (sheetNames[s2].toLowerCase().indexOf(pattern) !== -1) { match = sheetNames[s2]; break; }
                }
            }
        }
        if (!match) match = sheetNames[0];
        sheetSelect.value = match;

        // Find the header row by matching the saved header texts in this file.
        var rows = state.grid[match] || [];
        var matH = (tpl.material_header || '').toLowerCase();
        var qtyH = (tpl.qty_header || '').toLowerCase();
        var headerIdx = -1;
        for (var h = 0; h < Math.min(rows.length, 60); h++) {
            var cells = (rows[h] || []).map(function (c) {
                return String(c == null ? '' : c).toLowerCase().trim();
            });
            if (cells.indexOf(matH) !== -1 && cells.indexOf(qtyH) !== -1) {
                headerIdx = h; break;
            }
        }
        if (headerIdx < 0) headerIdx = 0;
        headerRowInput.value = String(headerIdx + 1);
        renderSheetPreview();
        rebuildColDropdowns({ materialCol: '', qtyCol: '', priceCol: '-1', unitCol: '-1', hoursCol: '-1' });

        // Map columns by exact header text in this file.
        var headers = (rows[headerIdx] || []).map(function (c) {
            return String(c == null ? '' : c).trim().toLowerCase();
        });
        function setColByHeader(sel, header) {
            if (!header) { sel.value = '-1'; return; }
            var idx = headers.indexOf(String(header).trim().toLowerCase());
            sel.value = idx >= 0 ? String(idx) : '-1';
        }
        setColByHeader(colSelects.materialCol, tpl.material_header);
        setColByHeader(colSelects.qtyCol,      tpl.qty_header);
        setColByHeader(colSelects.priceCol,    tpl.price_header);
        setColByHeader(colSelects.unitCol,     tpl.unit_header);
        setColByHeader(colSelects.hoursCol,    tpl.hours_header);
        renderItemsPreview();
    }

    // ----- Initialize -----
    var m = state.mapping || {};
    sheetSelect.value = m.sheetName || Object.keys(state.grid)[0] || '';
    headerRowInput.value = String((m.headerRow || 0) + 1);
    renderSheetPreview();
    rebuildColDropdowns({
        materialCol: m.materialCol != null ? m.materialCol : -1,
        qtyCol:      m.qtyCol      != null ? m.qtyCol      : -1,
        priceCol:    m.priceCol    != null ? m.priceCol    : -1,
        unitCol:     m.unitCol     != null ? m.unitCol     : -1,
        hoursCol:    m.hoursCol    != null ? m.hoursCol    : -1,
    });
    // Required dropdowns can't be -1 in the UI; pick first column if auto-detect failed.
    if (colSelects.materialCol.value === '-1' || colSelects.materialCol.value === '') {
        colSelects.materialCol.value = '0';
    }
    if (colSelects.qtyCol.value === '-1' || colSelects.qtyCol.value === '') {
        colSelects.qtyCol.value = '0';
    }
    renderItemsPreview();

    // ----- Event bindings -----
    sheetSelect.addEventListener('change', onSheetChange);
    headerRowInput.addEventListener('input', onHeaderChange);
    for (var field in colSelects) {
        if (colSelects.hasOwnProperty(field)) {
            colSelects[field].addEventListener('change', onColChange);
        }
    }
    if (applyBtn) applyBtn.addEventListener('click', applySelectedTemplate);
    if (saveCheckbox && templateName) {
        saveCheckbox.addEventListener('change', function () {
            templateName.disabled = !saveCheckbox.checked;
            if (saveCheckbox.checked) {
                templateName.focus();
                templateName.required = true;
            } else {
                templateName.required = false;
            }
        });
    }
})();
