// Calendario tributario nacional 2026 (Decreto 2229 de 2023, calendario DIAN 2026).
// Cada periodo trae la fecha exacta por último dígito del NIT (sin el dígito de verificación),
// en el orden de la DIAN: 1, 2, 3, 4, 5, 6, 7, 8, 9, 0. Para personas naturales, exógena y Supersociedades
// se usan los dos últimos dígitos. Para 2027 hay que cargar las fechas del decreto de ese año.
const ORD = ["1","2","3","4","5","6","7","8","9","0"];
// d1(año, mes, [días para 1..9,0]) → { "1":"2026-11-11", ... }
const d1 = (y, m, dias) => Object.fromEntries(ORD.map((k, i) => [k, `${y}-${String(m).padStart(2,"0")}-${String(dias[i]).padStart(2,"0")}`]));
// d2(tamaño del grupo, [[año, mes, día], ...]) → fechas para "01".."99","00" por grupos de dos últimos dígitos.
const d2 = (g, fechas) => { const o = {}; for (let n = 1; n <= 100; n++) { const [y, m, d] = fechas[Math.floor((n - 1) / g)]; o[String(n % 100).padStart(2,"0")] = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; } return o; };
// Fechas de enero 2026 (periodos de diciembre 2025) y enero 2027 (periodos de diciembre 2026), iguales en retención, IVA y SIMPLE.
const ENE26 = [13,14,15,16,19,20,21,22,23,26], ENE27 = [13,14,15,18,19,20,21,22,25,26];
export const DEFAULT_RULES = {
  version: 2026,
  nota: "Fechas oficiales del calendario DIAN 2026 (Decreto 2229 de 2023) por último dígito del NIT. Verifica siempre contra la DIAN; para 2027 hay que cargar el nuevo calendario.",
  regimenes: [
    { id:"ordinario_pj", nombre:"Régimen ordinario · Persona jurídica", descripcion:"Sociedades declarantes de renta, responsables de IVA y agentes de retención." },
    { id:"gran_contribuyente", nombre:"Gran contribuyente", descripcion:"Calificado por resolución DIAN. Renta en tres cuotas." },
    { id:"simple", nombre:"Régimen Simple de Tributación (RST)", descripcion:"Anticipos bimestrales y declaración anual consolidada." },
    { id:"ordinario_pn", nombre:"Persona natural", descripcion:"Declarante de renta; calendario por los dos últimos dígitos." }
  ],
  obligaciones: [
    { id:"retencion", nombre:"Retención en la fuente", formulario:"350", regimenes:["ordinario_pj","gran_contribuyente"],
      periodos:[
        {etiqueta:"Diciembre {Y-1}", fechas:d1(2026,1,ENE26)},
        {etiqueta:"Enero {Y}", fechas:d1(2026,2,[10,11,12,13,16,17,18,19,20,23])},
        {etiqueta:"Febrero {Y}", fechas:d1(2026,3,[10,11,12,13,16,17,18,19,20,24])},
        {etiqueta:"Marzo {Y}", fechas:d1(2026,4,[13,14,15,16,20,21,22,23,24,27])},
        {etiqueta:"Abril {Y}", fechas:d1(2026,5,[12,13,14,15,19,20,21,22,25,26])},
        {etiqueta:"Mayo {Y}", fechas:d1(2026,6,[10,11,12,16,17,18,19,22,23,24])},
        {etiqueta:"Junio {Y}", fechas:d1(2026,7,[9,10,14,15,16,17,21,22,23,24])},
        {etiqueta:"Julio {Y}", fechas:d1(2026,8,[12,13,14,18,19,20,21,24,25,26])},
        {etiqueta:"Agosto {Y}", fechas:d1(2026,9,[9,10,11,14,15,16,17,18,21,22])},
        {etiqueta:"Septiembre {Y}", fechas:d1(2026,10,[9,13,14,15,16,19,20,21,22,23])},
        {etiqueta:"Octubre {Y}", fechas:d1(2026,11,[11,12,13,17,18,19,20,23,24,25])},
        {etiqueta:"Noviembre {Y}", fechas:d1(2026,12,[10,11,14,15,16,17,18,21,22,23])},
        {etiqueta:"Diciembre {Y-1}", fechas:d1(2027,1,ENE27)}
      ]},
    { id:"iva_bim", nombre:"IVA bimestral", formulario:"300", regimenes:["ordinario_pj","gran_contribuyente"], iva:"bimestral",
      periodos:[
        {etiqueta:"Nov–Dic {Y-1}", fechas:d1(2026,1,ENE26)},
        {etiqueta:"Ene–Feb {Y}", fechas:d1(2026,3,[10,11,12,13,16,17,18,19,20,24])},
        {etiqueta:"Mar–Abr {Y}", fechas:d1(2026,5,[12,13,14,15,19,20,21,22,25,26])},
        {etiqueta:"May–Jun {Y}", fechas:d1(2026,7,[9,10,14,15,16,17,21,22,23,24])},
        {etiqueta:"Jul–Ago {Y}", fechas:d1(2026,9,[9,10,11,14,15,16,17,18,21,22])},
        {etiqueta:"Sep–Oct {Y}", fechas:d1(2026,11,[11,12,13,17,18,19,20,23,24,25])},
        {etiqueta:"Nov–Dic {Y-1}", fechas:d1(2027,1,ENE27)}
      ]},
    // La empresa elige su periodicidad de IVA (bimestral o cuatrimestral) en "Obligaciones adicionales".
    { id:"iva_cuatri", nombre:"IVA cuatrimestral", formulario:"300", regimenes:["ordinario_pj","gran_contribuyente"], iva:"cuatrimestral",
      periodos:[
        {etiqueta:"Sep–Dic {Y-1}", fechas:d1(2026,1,ENE26)},
        {etiqueta:"Ene–Abr {Y}", fechas:d1(2026,5,[12,13,14,15,19,20,21,22,25,26])},
        {etiqueta:"May–Ago {Y}", fechas:d1(2026,9,[9,10,11,14,15,16,17,18,21,22])},
        {etiqueta:"Sep–Dic {Y-1}", fechas:d1(2027,1,ENE27)}
      ]},
    { id:"renta_pj", nombre:"Renta personas jurídicas", formulario:"110", regimenes:["ordinario_pj"],
      periodos:[
        {etiqueta:"Año gravable {Y-1} · declaración y 1ª cuota", fechas:d1(2026,5,[12,13,14,15,19,20,21,22,25,26])},
        {etiqueta:"Año gravable {Y-1} · 2ª cuota", fechas:d1(2026,7,[9,10,14,15,16,17,21,22,23,24])}
      ]},
    { id:"renta_gc", nombre:"Renta grandes contribuyentes", formulario:"110", regimenes:["gran_contribuyente"],
      periodos:[
        {etiqueta:"Año gravable {Y-1} · 1ª cuota", fechas:d1(2026,2,[10,11,12,13,16,17,18,19,20,23])},
        {etiqueta:"Año gravable {Y-1} · declaración y 2ª cuota", fechas:d1(2026,4,[13,14,15,16,20,21,22,23,24,27])},
        {etiqueta:"Año gravable {Y-1} · 3ª cuota", fechas:d1(2026,6,[10,11,12,16,17,18,19,22,23,24])}
      ]},
    { id:"rst_anticipo", nombre:"Anticipo bimestral SIMPLE", formulario:"2593", regimenes:["simple"],
      periodos:[
        {etiqueta:"Nov–Dic {Y-1}", fechas:d1(2026,1,ENE26)},
        {etiqueta:"Ene–Feb {Y}", fechas:d1(2026,5,[12,13,14,15,19,20,21,22,25,26])},
        {etiqueta:"Mar–Abr {Y}", fechas:d1(2026,6,[10,11,12,16,17,18,19,22,23,24])},
        {etiqueta:"May–Jun {Y}", fechas:d1(2026,7,[9,10,14,15,16,17,21,22,23,24])},
        {etiqueta:"Jul–Ago {Y}", fechas:d1(2026,9,[9,10,11,14,15,16,17,18,21,22])},
        {etiqueta:"Sep–Oct {Y}", fechas:d1(2026,11,[11,12,13,17,18,19,20,23,24,25])},
        {etiqueta:"Nov–Dic {Y-1}", fechas:d1(2027,1,ENE27)}
      ]},
    { id:"rst_anual", nombre:"Declaración anual SIMPLE", formulario:"260", regimenes:["simple"],
      periodos:[{etiqueta:"Año gravable {Y-1}", fechas:d1(2026,4,[20,20,21,21,22,22,23,23,24,24])}]},
    { id:"rst_iva", nombre:"IVA anual SIMPLE", formulario:"300", regimenes:["simple"],
      periodos:[{etiqueta:"Año gravable {Y-1}", fechas:d1(2026,2,[16,16,17,17,18,18,19,19,20,20])}]},
    { id:"renta_pn", nombre:"Renta personas naturales", formulario:"210", regimenes:["ordinario_pn"], dia:{ digitos:2 },
      periodos:[{etiqueta:"Año gravable {Y-1}", fechas:d2(2, [
        [2026,8,12],[2026,8,13],[2026,8,14],[2026,8,18],[2026,8,19],[2026,8,20],[2026,8,21],[2026,8,24],[2026,8,25],[2026,8,26],
        [2026,8,27],[2026,8,28],[2026,8,31],[2026,9,1],[2026,9,2],[2026,9,3],[2026,9,4],[2026,9,7],[2026,9,8],[2026,9,9],
        [2026,9,10],[2026,9,11],[2026,9,14],[2026,9,15],[2026,9,16],[2026,9,17],[2026,9,18],[2026,9,21],[2026,9,22],[2026,9,23],
        [2026,9,24],[2026,9,25],[2026,9,28],[2026,10,1],[2026,10,2],[2026,10,5],[2026,10,6],[2026,10,7],[2026,10,8],[2026,10,9],
        [2026,10,13],[2026,10,14],[2026,10,15],[2026,10,16],[2026,10,19],[2026,10,20],[2026,10,21],[2026,10,22],[2026,10,23],[2026,10,26]])}]},
    // ---- Obligaciones adicionales: se activan con un chulito en cada empresa (opcional: true) ----
    // Exógena AG 2025 (Res. 000227 de 2025; Res. 000012 de 2026 movió los grandes contribuyentes con NIT 1, 2 y 3).
    { id:"exogena", nombre:"Medios magnéticos (información exógena)", formulario:"1001 y otros", entidad:"DIAN", opcional:true, dia:{ digitos:2 },
      periodos:[
        {etiqueta:"Año gravable {Y-1}", regimenes:["gran_contribuyente"], dia:{ digitos:1 }, fechas:d1(2026,5,[14,15,19,5,6,7,8,11,12,13])},
        {etiqueta:"Año gravable {Y-1}", regimenes:["ordinario_pj","simple","ordinario_pn"], fechas:d2(5, [
          [2026,5,14],[2026,5,15],[2026,5,19],[2026,5,20],[2026,5,21],[2026,5,22],[2026,5,25],[2026,5,26],[2026,5,27],[2026,5,28],
          [2026,5,29],[2026,6,1],[2026,6,2],[2026,6,3],[2026,6,4],[2026,6,5],[2026,6,9],[2026,6,10],[2026,6,11],[2026,6,12]])}
      ]},
    // Supersociedades: estados financieros de fin de ejercicio (Informe 01), Circular de 2026, por dos últimos dígitos.
    { id:"supersociedades", nombre:"Estados financieros Supersociedades", formulario:"Informe 01", entidad:"Supersociedades", opcional:true, dia:{ digitos:2 },
      periodos:[{etiqueta:"Corte 31 dic {Y-1}", fechas:d2(5, [
        [2026,4,13],[2026,4,14],[2026,4,15],[2026,4,16],[2026,4,17],[2026,4,20],[2026,4,21],[2026,4,22],[2026,4,23],[2026,4,24],
        [2026,4,27],[2026,4,28],[2026,4,29],[2026,4,30],[2026,5,4],[2026,5,5],[2026,5,6],[2026,5,7],[2026,5,8],[2026,5,11]])}]},
    { id:"precios_transf", nombre:"Precios de transferencia", formulario:"120 y documentación", entidad:"DIAN", opcional:true,
      periodos:[{etiqueta:"Año gravable {Y-1}", fechas:d1(2026,9,[9,10,11,14,15,16,17,18,21,22])}]},
    { id:"camara", nombre:"Renovación matrícula mercantil", formulario:"Formulario RUES", entidad:"Cámara de Comercio", opcional:true,
      periodos:[{etiqueta:"Renovación {Y}",mes:3,fija:31}]}
  ],
  // ---- ICA por municipio: cada empresa agrega sus municipios y la periodicidad ----
  // Cada periodo usa una de estas formas: "fecha" (fecha exacta para todos), "fechas" (fecha exacta por último dígito
  // del NIT), "fija" (día fijo del mes, todos los años) o "dia" (día hábil según el dígito, como la DIAN).
  // Fechas 2026 tomadas de resúmenes del calendario de cada municipio (ver "fuente"). Verificar contra la norma oficial.
  municipios: [
    { id:"bogota", nombre:"Bogotá", formulario:"Declaración ICA", fuente:"Resolución SDH-000195 de 2025 y bogota.gov.co",
      nombres:{ bimestral:"Bimestral", anual:"Anual" },
      ica:{
        bimestral:[
          {etiqueta:"Bimestre 6 (nov–dic) 2025",fecha:"2026-02-13"},
          {etiqueta:"Bimestre 1 (ene–feb) 2026",fecha:"2026-04-10"},
          {etiqueta:"Bimestre 2 (mar–abr) 2026",fecha:"2026-06-12"},
          {etiqueta:"Bimestre 3 (may–jun) 2026",fecha:"2026-08-21"},
          {etiqueta:"Bimestre 4 (jul–ago) 2026",fecha:"2026-10-09"},
          {etiqueta:"Bimestre 5 (sep–oct) 2026",fecha:"2026-12-11"},
          {etiqueta:"Bimestre 6 (nov–dic) 2026",fecha:"2027-02-12"}],
        anual:[
          {etiqueta:"Año gravable 2025",fecha:"2026-02-27"},
          {etiqueta:"Año gravable 2026",fecha:"2027-02-26"}]
      }},
    { id:"medellin", nombre:"Medellín", formulario:"Declaración ICA", fuente:"Resolución 202550100057 de 2025",
      nombres:{ anual:"Anual" },
      ica:{
        anual:[
          {etiqueta:"Declaración año gravable 2025",digitos:1,fechas:{"0":"2026-04-17","9":"2026-04-20","8":"2026-04-21","7":"2026-04-22","6":"2026-04-23","5":"2026-04-24","4":"2026-04-27","3":"2026-04-28","2":"2026-04-29","1":"2026-04-30"}},
          {etiqueta:"Pago año gravable 2025",fecha:"2026-06-25"}]
      }},
    { id:"barranquilla", nombre:"Barranquilla", formulario:"Declaración ICA", fuente:"Bimestral: tabla de retenciones y autorretenciones régimen común 2026 enviada por Romario; anual: Resolución DSH 001 de 2024",
      nombres:{ bimestral:"Bimestral", anual:"Anual" },
      ica:{
        bimestral:[
          {etiqueta:"Bimestre 1 (ene–feb) 2026",digitos:1,fechas:{"0":"2026-03-13","1":"2026-03-27","2":"2026-03-26","3":"2026-03-25","4":"2026-03-24","5":"2026-03-20","6":"2026-03-19","7":"2026-03-18","8":"2026-03-17","9":"2026-03-16"}},
          {etiqueta:"Bimestre 2 (mar–abr) 2026",digitos:1,fechas:{"0":"2026-05-15","1":"2026-05-29","2":"2026-05-28","3":"2026-05-27","4":"2026-05-26","5":"2026-05-25","6":"2026-05-22","7":"2026-05-21","8":"2026-05-20","9":"2026-05-19"}},
          {etiqueta:"Bimestre 3 (may–jun) 2026",digitos:1,fechas:{"0":"2026-07-17","1":"2026-07-31","2":"2026-07-30","3":"2026-07-29","4":"2026-07-28","5":"2026-07-27","6":"2026-07-24","7":"2026-07-23","8":"2026-07-22","9":"2026-07-21"}},
          {etiqueta:"Bimestre 4 (jul–ago) 2026",digitos:1,fechas:{"0":"2026-09-17","1":"2026-09-30","2":"2026-09-29","3":"2026-09-28","4":"2026-09-25","5":"2026-09-24","6":"2026-09-23","7":"2026-09-22","8":"2026-09-21","9":"2026-09-18"}},
          {etiqueta:"Bimestre 5 (sep–oct) 2026",digitos:1,fechas:{"0":"2026-11-17","1":"2026-11-30","2":"2026-11-27","3":"2026-11-26","4":"2026-11-25","5":"2026-11-24","6":"2026-11-23","7":"2026-11-20","8":"2026-11-19","9":"2026-11-18"}},
          {etiqueta:"Bimestre 6 (nov–dic) 2026",digitos:1,fechas:{"0":"2027-01-19","1":"2027-01-29","2":"2027-01-28","3":"2027-01-27","4":"2027-01-26","5":"2027-01-25","6":"2027-01-22","7":"2027-01-21","8":"2027-01-20","9":"2027-01-20"}}],
        anual:[{etiqueta:"Año gravable 2025",digitos:1,fechas:{"0":"2026-02-11","9":"2026-02-12","8":"2026-02-13","7":"2026-02-19","6":"2026-02-20","5":"2026-02-23","4":"2026-02-24","3":"2026-02-25","2":"2026-02-26","1":"2026-02-27"}}]
      }},
    { id:"cartagena", nombre:"Cartagena", formulario:"Declaración ICA", fuente:"Decreto 2289 de 2025",
      nombres:{ anual:"Anual" },
      ica:{ anual:[{etiqueta:"Año gravable 2025 y anticipo 2026",fecha:"2026-05-29"}] }}
  ]
};
