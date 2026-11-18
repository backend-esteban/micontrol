(function(g){
const pad=n=>String(n).padStart(2,'0'),iso=(y,m,d)=>y+'-'+pad(m+1)+'-'+pad(d);
const parse=s=>{const a=s.split('-').map(Number);return{y:a[0],m:a[1]-1,d:a[2]}};
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const addDays=(s,n)=>{const p=parse(s),t=new Date(p.y,p.m,p.d+n);return iso(t.getFullYear(),t.getMonth(),t.getDate())};
const addMonths=(s,k)=>{const p=parse(s),t=p.m+k,y=p.y+Math.floor(t/12),m=((t%12)+12)%12;return iso(y,m,Math.min(p.d,dim(y,m)))};
const ymOf=s=>s.slice(0,7),fmtDate=s=>s?s.split('-').reverse().join('/'):'';
const monthRange=ym=>{const y=+ym.slice(0,4),m=+ym.slice(5)-1;return[iso(y,m,1),iso(y,m,dim(y,m))]};
const addYm=(ym,k)=>ymOf(addMonths(ym+'-01',k));
const MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ymLabel=ym=>MES[+ym.slice(5)-1]+' '+ym.slice(0,4);
const days=(a,b)=>{const u=s=>{const p=parse(s);return Date.UTC(p.y,p.m,p.d)};return b<a?0:Math.round((u(b)-u(a))/864e5)+1};
const sum=(a,f)=>a.reduce((x,e)=>x+(f(e)||0),0);
// Fechas de pago de un compromiso hasta "limit". Respeta inicio, término y cantidad de cuotas.
function schedule(c,limit){const out=[];if(!c.start)return out;
 if(c.freq==='unico'){if(c.start<=limit)out.push(c.start);return out}
 const cap=c.freq==='cuotas'?(c.installments||0):Infinity;
 for(let k=0;k<3000&&out.length<cap;k++){
  const d=c.freq==='semanal'?addDays(c.start,7*k):addMonths(c.start,k);
  if(d>limit)break;if(c.end&&c.freq!=='permanente'&&d>c.end)break;out.push(d)}
 return out}
const dueIn=(c,from,to)=>c.status==='activo'?schedule(c,to).filter(d=>d>=from):[];
const paidSet=(s,cid)=>new Set(s.payments.filter(p=>p.cid===cid&&p.occ).map(p=>p.occ));
const paidSum=(s,cid)=>sum(s.payments.filter(p=>p.cid===cid),p=>p.amount);
function balance(s,c){if(c.total===null||c.total===undefined||c.total==='')return null;
 const b0=c.balance0!==null&&c.balance0!==undefined?c.balance0:c.total;return Math.max(0,b0-paidSum(s,c.id))}
function cuotas(s,c){const b=balance(s,c);if(c.freq!=='cuotas'||b===null||!c.amount)return null;
 const left=Math.min(c.installments,Math.ceil(b/c.amount));return{left,paid:c.installments-left,of:c.installments}}
function pay(s,p){const c=s.commitments.find(x=>x.id===p.cid);
 if(!c)return{error:'Compromiso no encontrado'};if(!(p.amount>0))return{error:'Ingresa un monto mayor a 0'};
 if(!p.date)return{error:'Falta la fecha del pago'};
 if(p.occ&&s.payments.some(x=>x.cid===p.cid&&x.occ===p.occ))return{error:'Esa cuota ya fue pagada'};
 const b=balance(s,c);if(b!==null&&p.amount>b)return{error:'El pago supera el saldo pendiente'};
 s.payments.push({id:p.id||Date.now().toString(36)+Math.random().toString(36).slice(2,5),cid:p.cid,date:p.date,amount:p.amount,occ:p.occ||null});
 if(balance(s,c)===0)c.status='finalizado';return{ok:true}}
function rentDays(s,from,to,today){const r=s.rent||{};if(!r.weekly)return 0;
 const a=from>(r.start||'0000-01-01')?from:(r.start||'0000-01-01'),b=[to,today,r.end||'9999-12-31'].sort()[0];
 return Math.round(r.weekly/7*days(a,b))}
const entryNet=(s,e)=>e.gross-e.fuel-e.tolls-e.other-(e.rent||0)-(s.rent&&s.rent.weekly&&e.date>=(s.rent.start||'0')?Math.round(s.rent.weekly/7):0);
function stats(s,from,to,today){const l=s.entries.filter(e=>e.date>=from&&e.date<=to);
 const gross=sum(l,e=>e.gross),costs=sum(l,e=>e.fuel+e.tolls+e.other+(e.rent||0)),rent=rentDays(s,from,to,today),hours=sum(l,e=>e.hours),n=l.length;
 const net=gross-costs-rent;return{gross,costs,rent,net,hours,n,avgDaily:n?Math.round(gross/n):0,hourly:hours?Math.round(net/hours):0}}
const monthCommit=(s,ym)=>{const[a,b]=monthRange(ym),items=[];
 s.commitments.forEach(c=>dueIn(c,a,b).forEach(d=>items.push({c,date:d,amount:c.amount,paid:paidSet(s,c.id).has(d)})));
 return{items,total:sum(items,i=>i.amount),paid:sum(s.payments.filter(p=>p.date>=a&&p.date<=b),p=>p.amount)}};
function projection(s,ym,today){const[a,b]=monthRange(ym),p=(s.plan||{})[ym]||{},rentDef=rentDays(s,a,b,'9999-12-31');
 const income=p.income||0,fuel=p.fuel||0,rent=p.rent!==undefined?p.rent:rentDef,other=p.other||0,mc=monthCommit(s,ym);
 const expenses=fuel+rent+other,total=expenses+mc.total,avail=income-total;
 const real=stats(s,a,b,today||'9999-12-31');
 return{ym,income,fuel,rent,other,expenses,commitments:mc.total,items:mc.items,total,avail,savings:Math.max(0,avail),real,diffIncome:real.gross-income,diffExpenses:real.costs+real.rent-expenses}}
function upcoming(s,today,ahead){const out=[],from=addDays(today,-31);
 s.commitments.forEach(c=>{const ps=paidSet(s,c.id);dueIn(c,from,addDays(today,ahead)).forEach(d=>{if(!ps.has(d))out.push({c,date:d,overdue:d<today})})});
 return out.sort((x,y)=>x.date.localeCompare(y.date))}
function debtSeries(s,today,fromYm,n){const out=[];for(let k=0;k<n;k++){const ym=addYm(fromYm,k),end=monthRange(ym)[1];let t=0;
 s.commitments.forEach(c=>{if(c.status!=='activo')return;const b=balance(s,c);if(b===null)return;const ps=paidSet(s,c.id);
  const due=sum(schedule(c,end).filter(d=>d>today&&!ps.has(d)),()=>c.amount);t+=Math.max(0,b-due)});out.push(t)}return out}
function events(s,from,to){const ev=[];s.commitments.forEach(c=>{const ps=paidSet(s,c.id);
 dueIn(c,from,to).forEach(d=>ev.push({date:d,type:'pago',c,paid:ps.has(d)}));
 if(c.start>=from&&c.start<=to)ev.push({date:c.start,type:'inicio',c});
 if(c.end&&c.freq!=='permanente'&&c.end>=from&&c.end<=to)ev.push({date:c.end,type:'fin',c})});return ev}
const allNet=(s,today)=>stats(s,'0000-01-01',today,today).net;
g.Core={iso,parse,dim,addDays,addMonths,addYm,ymOf,fmtDate,monthRange,ymLabel,MES,days,sum,schedule,dueIn,paidSet,paidSum,balance,cuotas,pay,rentDays,entryNet,stats,monthCommit,projection,upcoming,debtSeries,events,allNet};
if(typeof module!=='undefined')module.exports=g.Core;
})(typeof window!=='undefined'?window:globalThis);
