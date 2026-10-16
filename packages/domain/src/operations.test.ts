import {describe,it,expect} from 'vitest';
import {invoiceBalance,toMinor} from './operations.js';
describe('invoice arithmetic',()=>{
  it('counts only received payments in the invoice currency and preserves partial/overpayments',()=>{
    const payments=[{amount:0.1,currency:'USD',status:'received'},{amount:0.2,currency:'USD',status:'received'},{amount:300,currency:'IDR',status:'received'},{amount:20,currency:'USD',status:'expected'}];
    expect(invoiceBalance({currency:'USD',totalMinor:50},payments)).toEqual({paidMinor:30,remainingMinor:20,overpaidMinor:0});
    expect(invoiceBalance({currency:'USD',totalMinor:20},payments)).toEqual({paidMinor:30,remainingMinor:0,overpaidMinor:10});
    expect(toMinor(120,'JPY')).toBe(120);
    expect(toMinor(650000,'IDR')).toBe(65000000);
    expect(toMinor(1.005,'USD')).toBe(101);
  });
  it('rejects invalid or unsafe amounts',()=>{
    for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]) expect(()=>toMinor(value,'USD')).toThrow();
  });
});
