'use client';

import { useState, useMemo } from 'react';
import { parseCSV, normalizeImportDate, normalizeImportAmount } from '@/lib/csvImport';
import { formatEuro } from '@/lib/moneyFormat';
import { jsonRequest, requestJson } from '@/lib/utils';
import { Field, Money, VisuallyHidden, useFeedback } from '@/components/ui';

const TYPES = {
    expenses: { label: 'Gastos', plural: 'gastos', endpoint: '/api/expenses', columns: ['date/fecha', 'amount/importe', 'category/categoria', 'subcategory', 'payment_method', 'expense_type', 'notes'] },
    income: { label: 'Ingresos', plural: 'ingresos', endpoint: '/api/income', columns: ['date/fecha', 'amount/importe', 'source/fuente', 'category/categoria', 'notes'] },
};

const validateRow = (row) => {
    const errors = [];
    if (row._columnError) errors.push('Número de columnas incorrecto');
    const dateField = row.date || row.fecha;
    if (!dateField) errors.push('Falta la fecha');
    else if (!normalizeImportDate(dateField)) errors.push('Fecha no válida (usa AAAA-MM-DD o DD/MM/AAAA)');
    const amountField = row.amount || row.importe;
    if (!amountField) errors.push('Falta el importe');
    else if (normalizeImportAmount(amountField) === null) errors.push('Importe no válido');
    const categoryField = row.category || row.categoria;
    if (!categoryField || categoryField.length > 100) errors.push('Categoría no válida');
    return errors;
};

const rowPayload = (type, row) => {
    const common = {
        date: normalizeImportDate(row.date || row.fecha),
        amount: normalizeImportAmount(row.amount || row.importe),
        category: row.category || row.categoria,
        notes: row.notes || row.notas,
    };
    return type === 'expenses'
        ? { ...common, subcategory: row.subcategory || row.subcategoria, payment_method: row.payment_method || row.metodo_pago || 'Tarjeta', expense_type: row.expense_type || row.tipo || 'Variable' }
        : { ...common, source: row.source || row.fuente };
};

export default function ImportarPage() {
    const { toast } = useFeedback();
    const [type, setType] = useState('expenses');
    const [file, setFile] = useState(null);
    const [parsedRows, setParsedRows] = useState([]);
    const [importing, setImporting] = useState(false);
    const [fileError, setFileError] = useState('');

    const changeType = (next) => {
        setType(next);
        setFile(null);
        setParsedRows([]);
        setFileError('');
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        setFileError('');
        if (!selectedFile) return;
        if (selectedFile.size > 5 * 1024 * 1024) {
            setFileError('El archivo no puede superar 5 MB');
            e.target.value = '';
            return;
        }

        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const rows = parseCSV(event.target?.result);
                if (!rows.length) throw new Error('El archivo no contiene registros');
                setParsedRows(rows.map(row => {
                    const errors = validateRow(row);
                    return { ...row, _errors: errors, _isValid: errors.length === 0 };
                }));
            } catch (error) {
                setParsedRows([]);
                setFileError(error.message || 'No se ha podido leer el archivo');
            }
        };
        reader.onerror = () => setFileError('No se ha podido leer el archivo');
        reader.readAsText(selectedFile);
    };

    const summary = useMemo(() => {
        if (parsedRows.length === 0) return null;
        const validRows = parsedRows.filter(r => r._isValid);
        return {
            total: parsedRows.length,
            valid: validRows.length,
            invalid: parsedRows.length - validRows.length,
            totalAmount: validRows.reduce((sum, r) => sum + (normalizeImportAmount(r.amount || r.importe) || 0), 0),
        };
    }, [parsedRows]);

    const columns = parsedRows.length ? Object.keys(parsedRows[0]).filter(k => !k.startsWith('_')) : [];

    const handleImport = async () => {
        const validRows = parsedRows.filter(r => r._isValid);
        if (validRows.length === 0) {
            toast({ type: 'error', text: 'No hay filas válidas para importar' });
            return;
        }

        setImporting(true);
        let success = 0;
        const failedRows = [];
        for (const row of validRows) {
            try {
                await requestJson(TYPES[type].endpoint, jsonRequest('POST', rowPayload(type, row)));
                success++;
            } catch (error) {
                // Sin respuesta del servidor no se sabe si se guardó: se marca para revisarla antes de reimportar.
                const unknown = !error.status;
                failedRows.push({
                    ...row,
                    _errors: [unknown ? 'No se ha podido confirmar el guardado; revisa el registro antes de reimportar esta fila' : error.message],
                    _isValid: !unknown,
                    _saveError: true,
                });
            }
        }

        const failed = failedRows.length;
        toast({
            type: failed ? 'error' : 'success',
            text: failed
                ? `Importados ${success} de ${validRows.length} ${TYPES[type].plural}; ${failed} con errores (marcados en la tabla).`
                : `Importados ${success} ${TYPES[type].plural}.`,
        });
        const remaining = [...parsedRows.filter(row => !row._isValid), ...failedRows];
        setParsedRows(remaining);
        if (!remaining.length) setFile(null);
        setImporting(false);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Importar datos</h1>
                <p className="page-subtitle">Importa gastos o ingresos desde un archivo CSV</p>
            </div>

            <div className="card mb-lg">
                <div className="card-body">
                    <div className="tabs mb-md" role="group" aria-label="Qué quieres importar">
                        {Object.entries(TYPES).map(([key, item]) => (
                            <button key={key} type="button" className={`tab ${type === key ? 'active' : ''}`.trim()} aria-pressed={type === key} onClick={() => changeType(key)}>
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="alert alert-info mb-md">
                        <p className="font-semibold">Formato esperado (CSV con cabeceras)</p>
                        <p className="import-columns">{TYPES[type].columns.join(', ')}</p>
                    </div>

                    <Field label="Archivo CSV" htmlFor="importar-archivo" hint="Hasta 5 MB." error={fileError}>
                        <input
                            key={type}
                            id="importar-archivo"
                            type="file"
                            accept=".csv,text/csv"
                            className="form-input"
                            onChange={handleFileChange}
                            aria-invalid={Boolean(fileError)}
                            aria-describedby={fileError ? 'importar-archivo-error' : 'importar-archivo-ayuda'}
                        />
                    </Field>

                    {summary && (
                        <section className="impact-preview mb-lg" aria-labelledby="importar-resumen-titulo">
                            <h2 id="importar-resumen-titulo" className="impact-preview-title">Resumen de la importación</h2>
                            <div className="impact-preview-row">
                                <span>Filas</span>
                                <span className="font-semibold">{summary.total}</span>
                            </div>
                            <div className="impact-preview-row">
                                <span>Válidas</span>
                                <span className="font-semibold text-success">{summary.valid}</span>
                            </div>
                            {summary.invalid > 0 && (
                                <div className="impact-preview-row">
                                    <span>Con errores</span>
                                    <span className="font-semibold text-danger">{summary.invalid}</span>
                                </div>
                            )}
                            <div className="impact-preview-row impact-preview-total">
                                <span>Total a importar</span>
                                <Money value={summary.totalAmount} className="font-semibold" />
                            </div>
                        </section>
                    )}

                    {parsedRows.length > 0 && (
                        <>
                            <h2 className="section-title">Vista previa ({parsedRows.length} {parsedRows.length === 1 ? 'fila' : 'filas'})</h2>
                            <div className="table-container table-scroll mb-md">
                                <table className="table table-stack">
                                    <caption><VisuallyHidden>Filas del archivo y su estado</VisuallyHidden></caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Estado</th>
                                            {columns.map((key) => <th scope="col" key={key}>{key}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.map((row, idx) => {
                                            const ok = row._isValid && !row._saveError;
                                            return (
                                                <tr key={idx} className={ok ? 'row-valid' : 'row-error'}>
                                                    <td data-label="Estado">
                                                        <div>
                                                            <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? 'Válida' : 'Con errores'}</span>
                                                            {!ok && <div className="row-error-message">{row._errors.join('. ')}</div>}
                                                        </div>
                                                    </td>
                                                    {columns.map((key) => <td key={key} data-label={key}>{row[key]}</td>)}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleImport}
                            disabled={!file || importing || !summary || summary.valid === 0}
                        >
                            {importing
                                ? 'Importando…'
                                : summary
                                    ? `Importar ${summary.valid} ${TYPES[type].plural} (${formatEuro(summary.totalAmount)})`
                                    : `Importar ${TYPES[type].plural}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
