'use client';

import { useState } from 'react';

export default function ImportarPage() {
    const [type, setType] = useState('expenses');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState([]);
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const parseCSV = (text) => {
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx]?.trim() || '';
            });
            rows.push(row);
        }

        return rows;
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            const rows = parseCSV(text);
            setPreview(rows.slice(0, 5));
        };
        reader.readAsText(selectedFile);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    };

    const handleImport = async () => {
        if (!file) {
            showMessage('error', 'Selecciona un archivo CSV');
            return;
        }

        setImporting(true);
        try {
            const text = await file.text();
            const rows = parseCSV(text);

            if (rows.length === 0) {
                showMessage('error', 'El archivo está vacío o tiene formato incorrecto');
                setImporting(false);
                return;
            }

            // Importar cada fila
            let success = 0;
            let errors = 0;

            for (const row of rows) {
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

                // Crear categoría si no existe
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
            setPreview([]);
        } catch (error) {
            console.error('Error:', error);
            showMessage('error', 'Error al procesar el archivo');
        }
        setImporting(false);
    };

    const expectedColumns =
        type === 'expenses'
            ? ['date/fecha', 'amount/importe', 'category/categoria', 'subcategory', 'payment_method', 'expense_type', 'notes']
            : ['date/fecha', 'amount/importe', 'source/fuente', 'category/categoria', 'notes'];

    return (
        <div>
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
                            onClick={() => { setType('expenses'); setFile(null); setPreview([]); }}
                        >
                            Gastos
                        </button>
                        <button
                            className={`tab ${type === 'income' ? 'active' : ''}`}
                            onClick={() => { setType('income'); setFile(null); setPreview([]); }}
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

                    {preview.length > 0 && (
                        <>
                            <h4 className="mb-sm">Vista previa (primeras 5 filas):</h4>
                            <div className="table-container mb-md">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            {Object.keys(preview[0]).map((key) => (
                                                <th key={key}>{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.map((row, idx) => (
                                            <tr key={idx}>
                                                {Object.values(row).map((val, i) => (
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
                        disabled={!file || importing}
                    >
                        {importing ? 'Importando...' : `Importar ${type === 'expenses' ? 'gastos' : 'ingresos'}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
