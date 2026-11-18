// Nombre del tercero como lo pide la DIAN: persona natural con dos nombres y dos apellidos; persona jurídica con razón social.
const limpia = v => String(v ?? '').trim().replace(/\s+/g, ' ');
const PARTES = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido'];

// Natural o jurídica: lo que diga la columna; si no dice, por las casillas llenas o por el tipo de documento (NIT = jurídica).
function personaDe(tipo, f, tipoId) {
  const t = String(tipo ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.startsWith('j')) return 'juridica';
  if (t.startsWith('n')) return 'natural';
  if (limpia(f.primer_nombre) || limpia(f.primer_apellido)) return 'natural';
  return tipoId === '31' ? 'juridica' : 'natural';
}

// Recibe { tipo_persona, razon_social, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido } y el tipo de documento.
// Devuelve los campos listos para guardar, con `nombre` (el que se muestra en listas y documentos), o { error }.
function nombreTercero(f, tipoId) {
  const tipo_persona = personaDe(f.tipo_persona, f, tipoId);
  const p = Object.fromEntries(PARTES.map(k => [k, limpia(f[k])]));
  const razon_social = limpia(f.razon_social);
  if (tipo_persona === 'juridica') {
    if (!razon_social) return { error: 'falta la razón social' };
    return { tipo_persona, razon_social, primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '', nombre: razon_social };
  }
  if (p.primer_nombre && p.primer_apellido) return { tipo_persona, razon_social: '', ...p, nombre: PARTES.map(k => p[k]).filter(Boolean).join(' ') };
  // Plantillas viejas o datos de la DIAN con el nombre completo en una sola casilla.
  if (razon_social && !p.primer_nombre && !p.primer_apellido) return { tipo_persona, razon_social: '', ...p, nombre: razon_social };
  return { error: 'persona natural: escribe al menos el primer nombre y el primer apellido' };
}

export { nombreTercero, personaDe, PARTES };
