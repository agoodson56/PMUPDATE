// Daily entry page: live calculation preview before save.
(function () {
    function recalcRow(row) {
        const input = row.querySelector('input[name^="installed_"]');
        if (!input) return 0;
        const val = parseFloat(input.value) || 0;
        return val > 0 ? val : 0;
    }

    function recalcAll() {
        const rows = document.querySelectorAll('.data-table tbody tr');
        let total = 0;
        rows.forEach(r => { total += recalcRow(r); });
        const el = document.getElementById('total-installed-today');
        if (el) el.textContent = total.toFixed(2);
        return total;
    }

    window.calculatePreview = function () {
        const total = recalcAll();
        const rows = document.querySelectorAll('.data-table tbody tr');
        let count = 0;
        rows.forEach(r => { if (recalcRow(r) > 0) count++; });
        const hours = parseFloat(document.getElementById('total_hours').value) || 0;
        const preview = document.getElementById('calc-preview');
        if (!preview) return;
        preview.classList.remove('hidden');
        preview.innerHTML =
            '<strong>Calculated:</strong> ' + count + ' line item(s), ' +
            total.toFixed(2) + ' units installed today, ' +
            hours.toFixed(2) + ' field hours. ' +
            'Click <strong>Save Daily Entry</strong> to commit and clear the inputs.';
    };

    document.addEventListener('input', function (e) {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.name && t.name.indexOf('installed_') === 0) recalcAll();
    });
})();
