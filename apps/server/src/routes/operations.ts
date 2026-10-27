import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clientAutomationSchema, googleClientSchema, invoiceIdentitySchema, invoiceSchema, ownerTaskSchema, progressNoteSchema } from '@fvh/contracts';
import type { ClientAutomation, Invoice, InvoiceIdentity, OwnerTask, ProgressNote, TeamBriefing } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';
import { invoiceHtml, invoicePrintCss } from '../views/invoice-html.js';
import type { GoogleCalendarService } from '../services/google-calendar.js';
import type { OperationsService } from '../services/operations.js';
import type { WhatsAppService } from '../services/whatsapp.js';

export function registerOperationsRoutes(app:FastifyInstance, options:{repository:WorkspaceRepository;operations:OperationsService;whatsapp?:WhatsAppService|undefined;google?:GoogleCalendarService|undefined}) {
  const {repository:repo,operations:ops,whatsapp,google}=options;
  const parse=<T,>(schema:z.ZodType<T>,body:unknown)=>schema.parse(body);
  const id=(params:unknown)=>z.object({id:z.string().min(1).max(150)}).parse(params).id;
  app.addHook('onRequest',async(req,reply)=>{
    if(!req.url.startsWith('/api/operations')) return;
    reply.header('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({error:'Header Origin diperlukan.'});
  });
  app.get('/api/operations',async()=>{
    const [clients,notes,tasks,invoices,identity,briefings,messages,projects,payments]=await Promise.all([ops.store.list<ClientAutomation>('client'),ops.store.list<ProgressNote>('progress'),ops.store.list<OwnerTask>('task'),ops.store.list<Invoice>('invoice'),ops.store.get<InvoiceIdentity>('identity','business'),ops.store.list<TeamBriefing>('briefing'),ops.store.messages(),repo.listClientProjects(),repo.listPayments()]);
    return {clients,notes,tasks,invoices,identity,briefings:briefings.slice(0,50),messages,projects,payments,runtime:ops.status(),whatsapp:whatsapp?{...whatsapp.status(),qr:undefined}:null,google:google?.status() ?? null};
  });
  app.put('/api/operations/clients',async(req,reply)=>{
    const input=parse(clientAutomationSchema,req.body);
    if(!await repo.getClientProject(input.projectId)) return reply.code(404).send({error:'Proyek tidak ditemukan. Buat proyek di kartu Proyek & Pendapatan.'});
    const previous=await ops.store.get<ClientAutomation>('client',input.projectId);
    const changed=!previous?.enabled || previous.phone!==input.phone || previous.progress!==input.progress || previous.payments!==input.payments || previous.reminders!==input.reminders;
    const result=await ops.store.save('client',input.projectId,{...input,enabledAt:changed?new Date().toISOString():previous.enabledAt});
    await repo.appendAudit({type:'operations.client_configured',resourceId:input.projectId,status:'recorded',reason:`Otomasi WhatsApp ${input.enabled?'diaktifkan':'dinonaktifkan'} pemilik.`,policyVersion:null,payloadHash:null});
    return result;
  });
  app.post('/api/operations/progress',async(req,reply)=>{
    const input=parse(progressNoteSchema,req.body);if(!await repo.getClientProject(input.projectId)) return reply.code(404).send({error:'Proyek tidak ditemukan.'});
    const key=randomUUID();
    const result=await ops.job('progress-reporter','Mencatat progres proyek.',()=>ops.store.save('progress',key,{...input,id:key,createdAt:new Date().toISOString()}));
    return reply.code(201).send(result);
  });
  app.put('/api/operations/identity',async req=>ops.store.save('identity','business',parse(invoiceIdentitySchema,req.body)));
  app.post('/api/operations/invoices',async(req,reply)=>{
    const input=parse(invoiceSchema,req.body);const project=await repo.getClientProject(input.projectId);
    if(!project) return reply.code(404).send({error:'Proyek tidak ditemukan.'});
    const identity=await ops.store.get<InvoiceIdentity>('identity','business');if(!identity) return reply.code(409).send({error:'Lengkapi identitas penerbit invoice terlebih dahulu.'});
    if(project.currency!==input.currency) return reply.code(400).send({error:'Mata uang harus sesuai proyek.'});
    const key=randomUUID();const invoice:Invoice={...input,id:key,number:`INV-${input.issuedOn.slice(0,7).replace('-','')}-${key.slice(0,8).toUpperCase()}`,identity,createdAt:new Date().toISOString()};
    await ops.job('invoice-specialist','Menerbitkan invoice dari data proyek.',()=>ops.store.create('invoice',key,invoice));
    return reply.code(201).send(invoice);
  });
  app.get('/api/operations/invoices/:id/print',async(req,reply)=>{
    const invoice=await ops.store.get<Invoice>('invoice',id(req.params));if(!invoice) return reply.code(404).send({error:'Invoice tidak ditemukan.'});
    const project=await repo.getClientProject(invoice.projectId);if(!project) return reply.code(404).send({error:'Proyek tidak ditemukan.'});
    return reply.type('text/html; charset=utf-8').send(invoiceHtml(invoice,project,await repo.listPayments()));
  });
  app.get('/api/operations/invoice-print.css',async(_req,reply)=>reply.type('text/css').send(invoicePrintCss));
  const saveTask=async(body:unknown,key:string)=>{
    const input=parse(ownerTaskSchema,body);
    if(input.projectId && !await repo.getClientProject(input.projectId)) throw new Error('Proyek tidak ditemukan.');
    return ops.job('schedule-planner','Menyimpan jadwal tugas pemilik.',()=>ops.store.save('task',key,{...input,id:key,updatedAt:new Date().toISOString()}));
  };
  app.post('/api/operations/tasks',async(req,reply)=>reply.code(201).send(await saveTask(req.body,randomUUID())));
  app.put('/api/operations/tasks/:id',async(req,reply)=>{const key=id(req.params);if(!await ops.store.get('task',key)) return reply.code(404).send({error:'Tugas tidak ditemukan.'});return saveTask(req.body,key);});
  app.post('/api/operations/messages/:id/reconcile',async(req,reply)=>{
    const input=parse(z.object({status:z.enum(['sent','canceled'])}),req.body);
    if(!await ops.store.reconcile(id(req.params),input.status)) return reply.code(409).send({error:'Pesan sudah diproses atau tidak ditemukan.'});
    return {ok:true};
  });
  app.get('/api/operations/whatsapp',async()=>whatsapp?.status() ?? {state:'unavailable',reason:'Komponen WhatsApp tidak tersedia.',qr:null});
  app.post('/api/operations/briefings/:id/review',async(req,reply)=>{try{await ops.reviewBriefing(id(req.params));return {ok:true};}catch{return reply.code(409).send({error:'Lead belum tersedia atau sedang meninjau laporan lain. Coba lagi setelah proses selesai.'});}});
  app.post('/api/operations/whatsapp/connect',async(_req,reply)=>{if(!whatsapp) return reply.code(503).send({error:'WhatsApp tidak tersedia.'});await whatsapp.connect();return {ok:true};});
  app.post('/api/operations/whatsapp/disconnect',async()=>{await whatsapp?.disconnect();return {ok:true};});
  app.put('/api/operations/google/client',async(req,reply)=>{if(!google) return reply.code(503).send({error:'Google Calendar tidak tersedia.'});const input=parse(googleClientSchema,req.body);try{await google.configure(input);return {ok:true};}catch{return reply.code(409).send({error:'Konfigurasi belum tersimpan. Putuskan akun yang lama sebelum mengganti aplikasi OAuth.'});}});
  app.post('/api/operations/google/connect',async(_req,reply)=>{if(!google) return reply.code(503).send({error:'Google Calendar tidak tersedia.'});return {url:await google.start()};});
  app.post('/api/operations/google/disconnect',async()=>{await google?.disconnect();return {ok:true};});
  app.post('/api/operations/google/check',async(_req,reply)=>{if(!google) return reply.code(503).send({error:'Google Calendar tidak tersedia.'});try{await google.verify();return {ok:true};}catch{return reply.code(409).send({error:'Akses Google Calendar belum dapat diverifikasi. Periksa API dan persetujuan akun.'});}});
  app.get('/api/operations/google/callback',async(req,reply)=>{
    const params=z.object({code:z.string().min(1).max(4000),state:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(req.query);
    if(!google || !params.success) return reply.code(400).type('text/html').send('<p>Persetujuan Google dibatalkan atau tidak valid. Kembali ke kartu Lantai 2 dan coba lagi.</p>');
    try {await google.callback(params.data.code,params.data.state);return reply.type('text/html').send('<p>Google Calendar terhubung.</p><a href="/operations">Kembali ke Lantai 2</a>');}
    catch {return reply.code(400).type('text/html').send('<p>Koneksi Google belum berhasil. Ulangi melalui kartu Lantai 2.</p>');}
  });
}
