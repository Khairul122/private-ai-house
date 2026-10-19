import {afterEach,describe,it,expect,vi} from 'vitest';
import {WorkspaceRepository} from '@fvh/persistence';
import type {ClientAutomation,ProgressNote} from '@fvh/domain';
import {OperationsService} from './operations.js';
describe('operations delivery',()=>{
  let repo:WorkspaceRepository;
  let ops:OperationsService;
  afterEach(async()=>{await ops?.close();await repo?.close();});
  async function setup(fail=false) {
    repo=await WorkspaceRepository.open();
    const project=await repo.createClientProject({title:'Aplikasi klien',client:'Klien terdaftar',source:'direct',externalProjectId:null,status:'active',deadline:null,value:100,currency:'USD'});
    if(!project) throw Error('Fixture');
    const send=vi.fn(async()=>{if(fail)throw Error('network');return 'message-id';});
    ops=new OperationsService({repository:repo,messenger:{status:()=>({state:'connected'}),send},now:()=>new Date('2026-10-17T03:00:00Z')});
    const config:ClientAutomation={projectId:project.id,phone:'628123456789',enabled:true,progress:true,payments:true,reminders:true,enabledAt:'2026-10-17T00:00:00Z'};
    await ops.store.save('client',project.id,config);
    return {project,send,config};
  }
  it('sends real progress and recorded receipts once, without replaying old events',async()=>{
    const {project,send}=await setup();
    for(const [id,createdAt] of [['old','2026-10-16T02:00:00Z'],['new','2026-10-17T02:00:00Z']]) await ops.store.save<ProgressNote>('progress',id!,{id:id!,projectId:project.id,text:'Endpoint pembayaran selesai; pengujian akses berikutnya.',createdAt:createdAt!});
    await repo.createPayment({projectId:project.id,amount:25,currency:'USD',status:'received',dueDate:null,receivedAt:'2026-10-17T01:00:00Z',note:'DP'});
    await ops.tick();await ops.tick();
    expect(send).toHaveBeenCalledTimes(2);
    expect((await ops.store.messages()).every(m=>m.status==='sent')).toBe(true);
    expect((await ops.store.messages()).map(m=>m.eventKey)).not.toContain('progress:old');
    const next=new OperationsService({repository:repo,messenger:{status:()=>({state:'connected'}),send}});
    await next.tick();await next.close();expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not invent progress or payment confirmations and respects disabled clients',async()=>{
    const {project,send,config}=await setup();
    await repo.createPayment({projectId:project.id,amount:75,currency:'USD',status:'expected',dueDate:'2026-11-01',receivedAt:null,note:'Pelunasan'});
    await ops.tick();expect(send).not.toHaveBeenCalled();
    await ops.store.save('client',project.id,{...config,enabled:false});
    await ops.store.save('progress','n',{id:'n',projectId:project.id,text:'Perubahan nyata',createdAt:'2026-10-17T01:00:00Z'});
    await ops.tick();expect(send).not.toHaveBeenCalled();
  });
  it('holds uncertain sends for reconciliation and cancels work after permissions change',async()=>{
    const {project,send,config}=await setup(true);
    await ops.store.save('progress','n',{id:'n',projectId:project.id,text:'Perubahan nyata',createdAt:'2026-10-17T01:00:00Z'});
    await ops.tick();await ops.tick();expect(send).toHaveBeenCalledTimes(1);
    expect((await ops.store.messages())[0]?.status).toBe('uncertain');
    await ops.store.enqueue({projectId:project.id,eventKey:'manual-event',kind:'progress',phone:config.phone,text:'Tidak boleh dikirim setelah izin dicabut.'});
    await ops.store.save('client',project.id,{...config,enabled:false});await ops.tick();
    expect(send).toHaveBeenCalledTimes(1);expect((await ops.store.messages()).find(m=>m.eventKey==='manual-event')?.status).toBe('canceled');
  });
  it('claims atomically, recovers interrupted sends and keeps dedupe after cancellation',async()=>{
    const {project,config}=await setup();
    const input={projectId:project.id,eventKey:'unique',kind:'progress' as const,phone:config.phone,text:'Pesan nyata'};
    expect(await ops.store.enqueue(input)).toBe(true);expect(await ops.store.enqueue(input)).toBe(false);
    const message=(await ops.store.messages())[0]!;
    expect(await ops.store.claim(message.id)).toBe(true);expect(await ops.store.claim(message.id)).toBe(false);
    await ops.store.recover();expect((await ops.store.messages())[0]?.status).toBe('uncertain');
    expect(await ops.store.reconcile(message.id,'canceled')).toBe(true);
    expect(await ops.store.enqueue(input)).toBe(false);
  });
  it('reminds at most once per Jakarta day and sends no receipt for expected payments',async()=>{
    const {project,send}=await setup();
    await repo.createPayment({projectId:project.id,amount:75,currency:'USD',status:'expected',dueDate:'2026-10-16',receivedAt:null,note:'Pelunasan'});
    await ops.tick();await ops.tick();expect(send).toHaveBeenCalledTimes(1);
    expect((await ops.store.messages())[0]).toMatchObject({kind:'reminder',status:'sent'});
    expect(send.mock.calls[0]).toBeDefined();
  });
});
