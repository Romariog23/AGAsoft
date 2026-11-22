// Motor del calendario: festivos de Colombia, días hábiles, NIT y reglas.
/* ---------- Festivos de Colombia (Ley 51 de 1983) ---------- */
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(y,mo-1,da);}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function toMonday(d){const w=d.getDay();return w===1?d:addDays(d,(8-w)%7);}
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const holCache={};
function holidays(y){
  if(holCache[y]) return holCache[y];
  const m=new Map(), add=(d,n)=>m.set(ymd(d),n), D=(mo,da)=>new Date(y,mo-1,da), E=easter(y);
  add(D(1,1),"Año Nuevo"); add(D(5,1),"Día del Trabajo"); add(D(7,20),"Independencia"); add(D(8,7),"Batalla de Boyacá"); add(D(12,8),"Inmaculada Concepción"); add(D(12,25),"Navidad");
  add(toMonday(D(1,6)),"Reyes Magos"); add(toMonday(D(3,19)),"San José"); add(toMonday(D(6,29)),"San Pedro y San Pablo"); add(toMonday(D(8,15)),"Asunción"); add(toMonday(D(10,12)),"Día de la Raza"); add(toMonday(D(11,1)),"Todos los Santos"); add(toMonday(D(11,11)),"Independencia de Cartagena");
  add(addDays(E,-3),"Jueves Santo"); add(addDays(E,-2),"Viernes Santo"); add(addDays(E,43),"Ascensión"); add(addDays(E,64),"Corpus Christi"); add(addDays(E,71),"Sagrado Corazón");
  return holCache[y]=m;
}
function isBusiness(d){const w=d.getDay();return w!==0&&w!==6&&!holidays(d.getFullYear()).has(ymd(d));}
function nthBusinessDay(y,mo,n){let d=new Date(y,mo-1,1),c=0;for(let i=0;i<400;i++){if(isBusiness(d)){c++;if(c===n)return d;}d=addDays(d,1);}return d;}

/* ---------- NIT, correo, WhatsApp ---------- */
const W=[3,7,13,17,19,23,29,37,41,43,47,53,59,67,71];
function dvOf(nit){const s=String(nit).split("").reverse();let t=0;for(let i=0;i<s.length;i++)t+=Number(s[i])*W[i];const r=t%11;return r>1?11-r:r;}
// "9001234567" → NIT 900123456 y DV 7, solo si el último dígito es justamente el DV de los 9 primeros.
function separarDv(nit){nit=String(nit||"");if(/^[89]\d{9}$/.test(nit)&&dvOf(nit.slice(0,9))===Number(nit[9]))return {nit:nit.slice(0,9),dv:Number(nit[9])};return null;}
function parseNit(raw){
  const txt=String(raw||"").trim();
  if(!txt) return {error:"Escribe el NIT."};
  const m=txt.match(/^([\d.\s]+?)(?:\s*-\s*(\d))?$/);
  if(!m) return {error:"El NIT solo lleva números, puntos y un guion antes del dígito de verificación."};
  let base=m[1].replace(/[.\s]/g,"");
  // Sin guion: un NIT de empresa de 9 dígitos (empieza por 8 o 9) escrito pegado a su dígito de verificación.
  if(m[2]===undefined){const sp=separarDv(base); if(sp) return sp;
    if(/^[89]\d{9}$/.test(base)) return {error:"Ese NIT tiene 10 dígitos. Si el último ("+base[9]+") es el dígito de verificación, no coincide: para "+fmtNit(base.slice(0,9))+" debería ser "+dvOf(base.slice(0,9))+". Escríbelo así: "+fmtNit(base.slice(0,9))+"-"+dvOf(base.slice(0,9))+"."};}
  if(base.length<6||base.length>15) return {error:"El NIT debe tener entre 6 y 15 dígitos antes del dígito de verificación."};
  const dv=dvOf(base);
  if(m[2]!==undefined && Number(m[2])!==dv) return {error:"El dígito de verificación no coincide: para "+fmtNit(base)+" debería ser "+dv+"."};
  return {nit:base,dv};
}
function fmtNit(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,".");}
function normWa(raw){let d=String(raw||"").replace(/\D/g,"");if(!d)return "";if(d.length===10&&d[0]==="3")d="57"+d;return d;}
function parseResp(name,email,wa){
  name=name.trim();email=email.trim().toLowerCase();const w=normWa(wa);
  if(!name&&!email&&!w) return {resp:null};
  if(!name) return {error:"Escribe el nombre del responsable."};
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {error:"Revisa el correo: debe verse como nombre@dominio.com."};
  if(wa.trim()&&(w.length<11||w.length>15)) return {error:"Revisa el WhatsApp: escribe el celular de 10 dígitos, o el número completo con indicativo."};
  if(!email&&!w) return {error:"Agrega al menos un correo o un WhatsApp para enviarle recordatorios."};
  return {resp:{nombre:name,correo:email,whatsapp:w}};
}
const fmtWa=w=>w?("+"+w.slice(0,w.length-10)+" "+w.slice(-10,-7)+" "+w.slice(-7,-4)+" "+w.slice(-4)):"";

/* ---------- Motor de reglas ---------- */
function slotIndex(nit,dia){
  if((dia.digitos||1)===2){const n=Number(nit.slice(-2));return Math.floor(((n===0?100:n)-1)/(dia.grupo||1));}
  const d=Number(nit.slice(-1));return d===0?9:d-1;
}
function tpl(s,y){return String(s).replace(/\{Y-1\}/g,y-1).replace(/\{Y\}/g,y);}
// Qué es cada periodicidad del ICA: la bimestral (o mensual) es la retención y autorretención; la anual es la declaración del impuesto.
const ICA_TIPO={bimestral:"retención y autorretención bimestral",mensual:"retención y autorretención mensual",anual:"declaración anual"};
const PERIODICIDAD={bimestral:"Bimestral",anual:"Anual",mensual:"Mensual",trimestral:"Trimestral",cuatrimestral:"Cuatrimestral",semestral:"Semestral"};
function periodDate(emp,y,ob,p){
  if(p.fecha) return new Date(p.fecha+"T00:00:00");
  if(p.fija){let d=new Date(y+(p.anio||0),p.mes-1,Math.min(p.fija,new Date(y+(p.anio||0),p.mes,0).getDate()));while(!isBusiness(d))d=addDays(d,1);return d;}
  const lastKey=emp.nit.slice(-(((p.dia||ob.dia||{}).digitos)||1));
  if(p.fechas) return p.fechas[lastKey]?new Date(p.fechas[lastKey]+"T00:00:00"):null;
  const dia=Object.assign({inicio:9,paso:1,digitos:1},ob.dia,p.dia);
  return nthBusinessDay(y+(p.anio||0),p.mes,dia.inicio+slotIndex(emp.nit,dia)*dia.paso);
}
// Obligaciones que aplican a la empresa: las de su régimen, las adicionales marcadas y el ICA de cada municipio.
const esRenta=ob=>ob.renta===true||/^renta_/.test(ob.id)||ob.id==="rst_anual";
function obligacionesDe(emp,rules){
  const ex=emp.extras||{}, marcadas=ex.oblig||[], out=[];
  for(const ob of rules.obligaciones||[]){
    const ivaOb=ob.iva||(ob.id==="iva_bim"?"bimestral":null);
    // Persona natural: declara IVA solo si se marcó responsable (con su periodicidad); si no, "no".
    if(ivaOb){ const pn=/_pn$/.test(emp.regimen||""); if(((ob.regimenes||[]).includes(emp.regimen)||(pn&&ex.iva&&ex.iva!=="no")) && (ex.iva||"bimestral")===ivaOb) out.push(ob); }
    else if(ob.opcional){ if(marcadas.includes(ob.id) && (!ob.regimenes || ob.regimenes.includes(emp.regimen))) out.push(ob); }
    else if((ob.regimenes||[]).includes(emp.regimen)) out.push(ob);
  }
  // Empresa sin movimiento: la renta de su régimen y las anuales adicionales que tenga marcadas (sin IVA, retención ni ICA).
  if(ex.sinMov) return out.filter(ob=>esRenta(ob)||ob.opcional);
  for(const m of ex.ica||[]){
    const mun=(rules.municipios||[]).find(x=>x.id===m.municipio); if(!mun) continue;
    const per=(mun.ica||{})[m.periodicidad]; if(!per) continue;
    out.push({id:"ica_"+mun.id+"_"+m.periodicidad,nombre:"ICA "+mun.nombre+" · "+(ICA_TIPO[m.periodicidad]||((mun.nombres||{})[m.periodicidad]||PERIODICIDAD[m.periodicidad]||m.periodicidad).replace(/\s*\(.*\)$/,"").toLowerCase()),
      formulario:mun.formulario||"ICA",entidad:"Municipio",periodos:per,dia:mun.dia});
  }
  return out;
}
function calendar(emp,y,rules){
  const out=[];
  for(const ob of obligacionesDe(emp,rules)){
    for(const p of ob.periodos||[]){
      if(p.regimenes && !p.regimenes.includes(emp.regimen)) continue;
      const date=periodDate(emp,y,ob,p);
      if(!date||date.getFullYear()!==y) continue;
      out.push({key:emp.id+"_"+ob.id+"_"+ymd(date),clave:ob.id+"_"+ymd(date),ob,emp,periodo:tpl(p.etiqueta,y),date});
    }
  }
  return out.sort((a,b)=>a.date-b.date);
}


export {addDays,ymd,holidays,isBusiness,nthBusinessDay,dvOf,parseNit,separarDv,fmtNit,normWa,parseResp,fmtWa,calendar,obligacionesDe,PERIODICIDAD,ICA_TIPO};
