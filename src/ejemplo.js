// Datos de ejemplo para el modo demostración (nombres y números ficticios).
export function datosEjemplo(hoy) {
  const y = hoy.slice(0, 4);
  return {
    empresa: { nombre: 'Comercializadora Ejemplo S.A.S.', nit: '900123456', dv: 8, tipo_persona: 'juridica', regimen: 'ordinario', responsable_iva: true, responsabilidades: 'O-13, O-15, O-47', actividad: '4659', direccion: 'Calle 10 # 20-30', departamento: 'Atlántico', ciudad: 'Barranquilla', telefono: '605 300 0000', correo: 'facturacion@ejemplo.co', pie_factura: 'Esta factura se asimila en todos sus efectos a una letra de cambio (art. 774 del Código de Comercio).' },
    terceros: [
      { tipo_id: '31', numero: '860002964', dv: 4, nombre: 'Distribuidora Andina Ltda.', direccion: 'Carrera 7 # 71-21', departamento: 'Bogotá, D.C.', ciudad: 'Bogotá, D.C.', telefono: '601 555 1234', correo: 'pagos@andina.example', responsable_iva: true, retefuente_pct: 2.5, reteiva_pct: 15, reteica_milaje: 4.14, plazo_dias: 30 },
      { tipo_id: '31', numero: '800197268', dv: 4, nombre: 'Gran Contribuyente Demo S.A.', direccion: 'Avenida 30 # 45-10', departamento: 'Antioquia', ciudad: 'Medellín', telefono: '604 444 0000', correo: 'cxp@grancontribuyente.example', responsable_iva: true, retefuente_pct: 4, reteiva_pct: 15, reteica_milaje: 0, plazo_dias: 60 },
      { tipo_id: '13', numero: '1045678901', dv: null, nombre: 'María Pérez', direccion: 'Calle 84 # 50-12', departamento: 'Atlántico', ciudad: 'Barranquilla', telefono: '300 123 4567', correo: 'maria@correo.example', responsable_iva: false, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0, plazo_dias: 0 },
      { tipo_id: '31', numero: '830122566', dv: 1, nombre: 'Telecomunicaciones Demo S.A.S.', direccion: 'Calle 26 # 68-35', departamento: 'Bogotá, D.C.', ciudad: 'Bogotá, D.C.', telefono: '601 700 0000', correo: 'facturas@telecom.example', responsable_iva: true, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0, plazo_dias: 30,
        es_cliente: false, es_proveedor: true, ret_compra_fuente_pct: 4, ret_compra_iva_pct: 0, ret_compra_ica_milaje: 0 },
    ],
    productos: [
      { codigo: 'ASE-01', nombre: 'Asesoría contable mensual', unidad: 'MES', precio: 1200000, iva_pct: 19, activo: true },
      { codigo: 'DEC-RENTA', nombre: 'Elaboración declaración de renta', unidad: 'UND', precio: 850000, iva_pct: 19, activo: true },
      { codigo: 'PAP-001', nombre: 'Resma papel carta', unidad: 'UND', precio: 18500, iva_pct: 19, activo: true },
      { codigo: 'LIB-001', nombre: 'Libro de contabilidad (exento)', unidad: 'UND', precio: 65000, iva_pct: 0, activo: true },
    ],
    numeraciones: [
      { tipo: 'FV', prefijo: 'FE', resolucion: '18764000000000', fecha_resolucion: `${y}-01-15`, vigencia_desde: `${y}-01-15`, vigencia_hasta: `${Number(y) + 2}-01-15`, desde: 1, hasta: 5000, siguiente: 1, activa: true },
      { tipo: 'NC', prefijo: 'NC', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true },
      { tipo: 'ND', prefijo: 'ND', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true },
      { tipo: 'RC', prefijo: 'RC', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true },
    ],
  };
}
