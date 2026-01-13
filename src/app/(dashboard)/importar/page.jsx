'use client';

import { useState, useMemo } from 'react';

export default function ImportarPage() {
    const [type, setType] = useState('expenses');
    const [file, setFile] = useState(null);
    const [parsedRows, setParsedRows] = useState([]);
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const parseCSV = (text) => {
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = { _rowNum: i };
            headers.forEach((h, idx) => {
                row[h] = values[idx]?.trim() || '';
            });
            rows.push(row);
        }

        return rows;
    };

    const validateRow = (row, type) => {
        const errors = [];

        // Date validation
        const dateField = row.date || row.fecha;
        if (!dateField) {
            errors.push('Falta fecha');
        } else {
            const d = new Date(dateField);
            if (isNaN(d.getTime())) {
                errors.push('Fecha inválida');
            }
        }

        // Amount validation
        const amountField = row.amount || row.importe;
        if (!amountField) {
            errors.push('Falta importe');
        } else {
            const amount = parseFloat(amountField);
            if (isNaN(amount) || amount <= 0) {
                errors.push('Importe inválido');
            }
        }

        // Category validation
        const categoryField = row.category || row.categoria;
        if (!categoryField) {
            errors.push('Falta categoría');
        }

        return errors;
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            const rows = parseCSV(text);

            // Add validation to each row
            const validatedRows = rows.map(row => ({
                ...row,
                _errors: validateRow(row, type),
                _isValid: validateRow(row, type).length === 0
            }));

            setParsedRows(validatedRows);
        };
        reader.readAsText(selectedFile);
    };

    // Calculate summary stats
    const summary = useMemo(() => {
        if (parsedRows.length === 0) return null;

        const validRows = parsedRows.filter(r => r._isValid);
        const invalidRows = parsedRows.filter(r => !r._isValid);
        const totalAmount = validRows.reduce((sum, r) => {
            const amount = parseFloat(r.amount || r.importe || 0);
            return sum + amount;
        }, 0);

        return {
            total: parsedRows.length,
            valid: validRows.length,
            invalid: invalidRows.length,
            totalAmount
        };
    }, [parsedRows]);

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    };

    const handleImport = async () => {
        const validRows = parsedRows.filter(r => r._isValid);

        if (validRows.length === 0) {
            showMessage('error', 'No hay filas válidas para importar');
            return;
        }

        setImporting(true);
        try {
            let success = 0;
            let errors = 0;

            for (const row of validRows) {
                const endpoint = type === 'expenses' ? '/api/expenses' : '/api/income';

                const data =
                    type === 'expenses'
                        ? {
                            date: row.date || row.fecha,
                            amount: parseFloat(row.amount || row.importe || '0'),
                            category: row.category || row.categoria || 'Sin categoría',
                            subcategory: row.subcategory || row.subcategoria,
                            payment_method: row.payment_method || row.metodo_pago || 'Tarjeta',
                            expense_type: row.expense_type || row.tipo || 'Variable',
                            notes: row.notes || row.notas,
                        }
                        : {
                            date: row.date || row.fecha,
                            amount: parseFloat(row.amount || row.importe || '0'),
                            source: row.source || row.fuente,
                            category: row.category || row.categoria || 'Sin categoría',
                            notes: row.notes || row.notas,
                        };

                // Create category if not exists
                await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: data.category, type: type === 'expenses' ? 'expense' : 'income' }),
                });

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });

                if (res.ok) success++;
                else errors++;
            }

            showMessage('success', `Importación completada: ${success} registros importados, ${errors} errores`);
            setFile(null);
            setParsedRows([]);
        } catch (error) {
            console.error('Error:', error);
            showMessage('error', 'Error al procesar el archivo');
        }
        setImporting(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const expectedColumns =
        type === 'expenses'
            ? ['date/fecha', 'amount/importe', 'category/categoria', 'subcategory', 'payment_method', 'expense_type', 'notes']
            : ['date/fecha', 'amount/importe', 'source/fuente', 'category/categoria', 'notes'];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Importar datos</h1>
                <p className="page-subtitle">Importa gastos o ingresos desde un archivo CSV</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            <div className="card mb-lg">
                <div className="card-body">
                    <div className="tabs" style={{ marginBottom: '1rem' }}>
                        <button
                            className={`tab ${type === 'expenses' ? 'active' : ''}`}
                            onClick={() => { setType('expenses'); setFile(null); setParsedRows([]); }}
                        >
                            Gastos
                        </button>
                        <button
                            className={`tab ${type === 'income' ? 'active' : ''}`}
                            onClick={() => { setType('income'); setFile(null); setParsedRows([]); }}
                        >
                            Ingresos
                        </button>
                    </div>

                    <div className="alert alert-info mb-md">
                        <strong>Formato esperado (CSV con cabeceras):</strong>
                        <br />
                        {expectedColumns.join(', ')}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Selecciona archivo CSV</label>
                        <input
                            type="file"
                            accept=".csv"
                            className="form-input"
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* Summary Stats */}
                    {summary && (
                        <div className="impact-preview" style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <div className="impact-preview-title">📊 Resumen de importación</div>
                            <div className="impact-preview-row">
                                <span>Total filas:</span>
                                <span className="font-semibold">{summary.total}</span>
                            </div>
                            <div className="impact-preview-row">
                                <span>Filas válidas:</span>
                                <span className="font-semibold text-success">{summary.valid}</span>
                            </div>
                            {summary.invalid > 0 && (
                                <div className="impact-preview-row">
                                    <span>Filas con errores:</span>
                                    <span className="font-semibold text-danger">{summary.invalid}</span>
                                </div>
                            )}
                            <div className="impact-preview-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                                <span>Total a importar:</span>
                                <span className="font-semibold">{formatCurrency(summary.totalAmount)}</span>
                            </div>
                        </div>
                    )}

                    {/* Preview Table with Validation */}
                    {parsedRows.length > 0 && (
                        <>
                            <h4 className="section-title">Vista previa ({parsedRows.length} filas)</h4>
                            <div className="table-container mb-md" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Estado</th>
                                            {Object.keys(parsedRows[0])
                                                .filter(k => !k.startsWith('_'))
                                                .map((key) => (
                                                    <th key={key}>{key}</th>
                                                ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.map((row, idx) => (
                                            <tr key={idx} className={row._isValid ? 'row-valid' : 'row-error'}>
                                                <td>
                                                    {row._isValid ? (
                                                        <span className="badge badge-success">✓</span>
                                                    ) : (
                                                        <div>
                                                            <span className="badge badge-danger">✗</span>
                                                            <div className="row-error-message">
                                                                {row._errors.join(', ')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                {Object.entries(row)
                                                    .filter(([k]) => !k.startsWith('_'))
                                                    .map(([key, val], i) => (
                                                        <td key={i}>{val}</td>
                                                    ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={!file || importing || (summary && summary.valid === 0)}
                    >
                        {importing
                            ? 'Importando...'
                            : summary
                                ? `Importar ${summary.valid} ${type === 'expenses' ? 'gastos' : 'ingresos'} (${formatCurrency(summary.totalAmount)})`
                                : `Importar ${type === 'expenses' ? 'gastos' : 'ingresos'}`
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
