// Reglas de los documentos adjuntos de empresa (facturas y justificantes).
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Margen para los campos del formulario que acompañan al fichero.
export const FORM_OVERHEAD_BYTES = 64 * 1024;
export const ATTACHMENT_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

// Espacio total para documentos de cada usuario, sumando todas sus empresas.
export function attachmentQuotaBytes() {
    const mb = Number(process.env.ATTACHMENT_QUOTA_MB);
    return (Number.isFinite(mb) && mb > 0 ? mb : 200) * 1024 * 1024;
}

export function formatMb(bytes) {
    return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}

export function matchesMime(data, mime) {
    if (mime === 'application/pdf') return data.subarray(0, 5).toString() === '%PDF-';
    if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
    if (mime === 'image/webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
    return false;
}

// Nombre que se guarda: sin rutas ni caracteres de control, con tildes y símbolos intactos.
export function cleanFilename(name) {
    const clean = String(name || '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim().slice(0, 180);
    return clean || 'documento';
}

// Versión solo ASCII para navegadores antiguos: «Factura – octubre €.pdf» → «Factura _ octubre _.pdf».
export function asciiFilename(name) {
    return cleanFilename(name)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\u0020-\u007e]/g, '_')
        .replace(/["\\;%]/g, '_');
}

// Cabecera de descarga válida con cualquier nombre (RFC 6266 y RFC 5987).
export function contentDisposition(name) {
    const encoded = encodeURIComponent(cleanFilename(name)).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${asciiFilename(name)}"; filename*=UTF-8''${encoded}`;
}
