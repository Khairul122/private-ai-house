import { currencyDigits, invoiceBalance, toMinor, type Invoice } from '@fvh/domain';
import type { ClientProject, Payment } from '@fvh/persistence';

export function paymentReminder(project:ClientProject,payments:Payment[],invoices:Invoice[],today:string):string|null {
  const own=payments.filter(p=>p.projectId===project.id);
  const invoice=invoices.filter(i=>i.projectId===project.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
  const money=(amount:number,currency:string)=>new Intl.NumberFormat('id-ID',{style:'currency',currency,minimumFractionDigits:0,maximumFractionDigits:currencyDigits(currency)}).format(amount);
  const prefix=`Halo ${project.client}, pengingat pembayaran untuk ${project.title}:\n`;
  const suffix='\nJika sudah membayar, mohon kirim bukti agar kami dapat memperbarui catatan. Terima kasih. — Tim proyek';
  if(invoice) {
    const balance=invoiceBalance(invoice,own);
    if(balance.remainingMinor===0) return null;
    if(invoice.dueOn<=today) return `${prefix}Invoice ${invoice.number} — sisa ${money(balance.remainingMinor / 10 ** currencyDigits(invoice.currency),invoice.currency)}, jatuh tempo ${invoice.dueOn}.${suffix}`;
  }
  const due=own.filter(p=>p.status==='expected' && p.dueDate && p.dueDate<=today).filter(p=>{
    if(project.value===null || p.currency!==project.currency) return true;
    return own.filter(r=>r.status==='received' && r.currency===p.currency).reduce((sum,r)=>sum+toMinor(r.amount,r.currency),0)<toMinor(project.value,p.currency);
  });
  return due.length?`${prefix}${due.map(p=>`• ${money(p.amount,p.currency)} — jatuh tempo ${p.dueDate}${p.note?` (${p.note})`:''}`).join('\n')}${suffix}`:null;
}
