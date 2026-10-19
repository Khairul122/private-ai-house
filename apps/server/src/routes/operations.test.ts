import {afterEach,describe,it,expect} from 'vitest';
import type {FastifyInstance} from 'fastify';
import {createApp} from './app.js';
import {WorkspaceRepository} from '@fvh/persistence';
describe('operations API',()=>{
  let app:FastifyInstance;
  let repo:WorkspaceRepository;
  afterEach(async()=>{await app?.close();await repo?.close();});
  const headers={origin:'http://127.0.0.1:5174'};
  async function setup(){repo=await WorkspaceRepository.open();app=await createApp({repository:repo});const project=await repo.createClientProject({title:'Proyek <script>alert(1)</script>',client:'Klien & rekan',source:'direct',externalProjectId:null,status:'active',deadline:null,value:1300000,currency:'IDR'});if(!project)throw Error('fixture');return project;}
  it('requires localhost origins and validates data before persisting',async()=>{
    await setup();
    expect((await app.inject({method:'PUT',url:'/api/operations/clients',payload:{}})).statusCode).toBe(403);
    expect((await app.inject({method:'PUT',url:'/api/operations/clients',headers:{origin:'https://evil.example'},payload:{}})).statusCode).toBe(403);
    const invalid=await app.inject({method:'POST',url:'/api/operations/tasks',headers,payload:{title:'test'}});
    expect(invalid.statusCode).toBe(400);expect(invalid.json().issues.length).toBeGreaterThan(0);
    expect((await app.inject('/api/operations')).headers['cache-control']).toBe('no-store');
  });
  it('issues unique invoices with snapshotted identity, escaped HTML and only actual payments',async()=>{
    const project=await setup();
    await app.inject({method:'PUT',url:'/api/operations/identity',headers,payload:{businessName:'Usaha sendiri',address:'Alamat',email:'',paymentInstructions:'Bank milik penerbit',footer:'Terima kasih',signatory:'Pemilik'}});
    const payload={projectId:project.id,issuedOn:'2026-10-16',dueOn:'2026-10-30',category:'Pengembangan aplikasi',description:'Implementasi & pengujian',clientEmail:'',currency:'IDR',totalMinor:130000000};
    const result=await app.inject({method:'POST',url:'/api/operations/invoices',headers,payload});expect(result.statusCode).toBe(201);
    const invoice=result.json();
    await repo.createPayment({projectId:project.id,amount:650000,currency:'IDR',status:'received',dueDate:null,receivedAt:'2026-10-16T10:00:00Z',note:'DP'});
    await app.inject({method:'PUT',url:'/api/operations/identity',headers,payload:{businessName:'Nama berubah',address:'',email:'',paymentInstructions:'',footer:'',signatory:''}});
    const html=await app.inject(`/api/operations/invoices/${invoice.id}/print`);
    expect(html.statusCode).toBe(200);expect(html.body).toContain('Usaha sendiri');expect(html.body).not.toContain('Nama berubah');expect(html.body).toContain('&lt;script&gt;');expect(html.body).not.toContain('<script>');expect(html.body).toContain('650.000');expect(html.body).toContain('SISA PEMBAYARAN');
    const next=await app.inject({method:'POST',url:'/api/operations/invoices',headers,payload});expect(next.json().number).not.toBe(invoice.number);
  });
  it('stores owner tasks and progress with stable IDs without enabling clients implicitly',async()=>{
    const project=await setup();
    const task=await app.inject({method:'POST',url:'/api/operations/tasks',headers,payload:{title:'Meeting langsung',projectId:project.id,startAt:'2026-10-17T03:00:00Z',endAt:'2026-10-17T04:00:00Z',timezone:'Asia/Jakarta',notes:'Persiapan',done:false,syncGoogle:true}});
    expect(task.statusCode).toBe(201);
    expect((await app.inject({method:'POST',url:'/api/operations/progress',headers,payload:{projectId:project.id,text:'Modul selesai diuji.'}})).statusCode).toBe(201);
    const snapshot=(await app.inject('/api/operations')).json();expect(snapshot.tasks).toHaveLength(1);expect(snapshot.notes).toHaveLength(1);expect(snapshot.clients).toEqual([]);expect(snapshot.messages).toEqual([]);
  });
});
