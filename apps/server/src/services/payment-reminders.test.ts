import {describe,it,expect} from 'vitest';
import type {Invoice} from '@fvh/domain';
import type {ClientProject,Payment} from '@fvh/persistence';
import {paymentReminder} from './payment-reminders.js';
const project:ClientProject={id:'p',title:'Proyek langsung',client:'Klien',source:'direct',externalProjectId:null,status:'active',deadline:null,value:1300000,currency:'IDR',createdAt:'2026-10-16T00:00:00Z'};
const invoice:Invoice={id:'invoice',number:'INV-202610-TEST',projectId:'p',issuedOn:'2026-10-16',dueOn:'2026-10-17',category:'Pengembangan',description:'',clientEmail:'',currency:'IDR',totalMinor:130000000,identity:{businessName:'Fixture',address:'',email:'',paymentInstructions:'',footer:'',signatory:''},createdAt:'2026-10-16T00:00:00Z'};
const dp:Payment={id:'dp',projectId:'p',amount:650000,currency:'IDR',status:'received',dueDate:null,receivedAt:'2026-10-16T01:00:00Z',note:'DP',createdAt:'2026-10-16T01:00:00Z'};
describe('payment reminders',()=>{
  it('uses remaining invoice balance, including DP, without double-counting expected installments',()=>{
    const expected:Payment={...dp,id:'expected',status:'expected',receivedAt:null,dueDate:'2026-10-17',note:'Pelunasan'};
    const message=paymentReminder(project,[dp,expected],[invoice],'2026-10-17');
    expect(message).toContain('650.000');expect(message).toContain(invoice.number);expect(message).not.toContain('•');
    expect(paymentReminder(project,[dp,{...dp,id:'final'}],[invoice],'2026-10-17')).toBeNull();
    expect(paymentReminder(project,[dp],[invoice],'2026-10-16')).toBeNull();
  });
  it('suppresses stale expected payments when recorded receipts already cover the project',()=>{
    expect(paymentReminder(project,[{...dp,amount:1300000},{...dp,id:'expected',status:'expected',receivedAt:null,dueDate:'2026-10-16'}],[],'2026-10-17')).toBeNull();
  });
});
