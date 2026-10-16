import { invoiceBalance, toMinor, type ClientAutomation, type Invoice, type OwnerTask, type ProgressNote, type TeamBriefing } from '@fvh/domain';
import { OperationsRepository, type WorkspaceRepository } from '@fvh/persistence';
import { paymentReminder } from './payment-reminders.js';

export type JobSignal = { busy:boolean; lastRunAt:string|null; error:string|null; reason:string };
type Messenger = { status():{state:string}; send(phone:string,text:string):Promise<string> };
type Calendar = {status():{connected:boolean}; sync(tasks:OwnerTask[]):Promise<number>; fail():void};
export class OperationsService {
  readonly store:OperationsRepository;
  private timer:ReturnType<typeof setInterval>|null=null;
  private running=false;
  private stopping=false;
  private active:Promise<void>|null=null;
  private reviewTask:Promise<void>|null=null;
  private jobs:Record<string,JobSignal>={};
  constructor(private options:{repository:WorkspaceRepository;messenger?:Messenger;calendar?:Calendar;review?:(facts:string[])=>Promise<string>;now?:()=>Date}) { this.store=new OperationsRepository(options.repository.sql); }
  status() { return {running:this.running,jobs:this.jobs}; }
  private now() {return this.options.now?.() ?? new Date();}
  async job<T>(id:string,reason:string,run:()=>Promise<T>):Promise<T> {
    this.jobs[id]={busy:true,lastRunAt:this.jobs[id]?.lastRunAt ?? null,error:null,reason};
    try {const result=await run();this.jobs[id]={busy:false,lastRunAt:this.now().toISOString(),error:null,reason:'Siap; menunggu pekerjaan berikutnya.'};return result;}
    catch(error) {this.jobs[id]={busy:false,lastRunAt:this.now().toISOString(),error:'Pekerjaan gagal. Periksa pengaturan integrasi dan coba lagi.',reason:'Pekerjaan terakhir gagal.'};throw error;}
  }
  async start() {
    await this.store.recover();
    for(const report of await this.store.list<TeamBriefing>('briefing')) if(report.state==='waiting') await this.store.save('briefing',report.id,{...report,state:'unavailable'});
    this.stopping=false;void this.tick();this.timer=setInterval(()=>{void this.tick();},60_000);
  }
  async reviewBriefing(id:string) {
    if(this.reviewTask) throw new Error('Lead sedang meninjau laporan lain.');
    if(!this.options.review) throw new Error('Hermes belum tersedia.');
    this.reviewTask=(async()=>{
      const briefing=await this.store.get<TeamBriefing>('briefing',id);if(!briefing) throw new Error('Laporan tidak ditemukan.');
      await this.job(briefing.floor===1?'floor-one-manager':'delivery-manager','Berkolaborasi dengan Lead Agent.',async()=>{
        const review=await this.job('lead-operations','Hermes meninjau laporan manajer.',()=>this.options.review!(briefing.facts));
        await this.store.save('briefing',id,{...briefing,leadReview:review,state:'reviewed'});
      });
    })().finally(()=>{this.reviewTask=null;});
    return this.reviewTask;
  }
  async close() {this.stopping=true;if(this.timer) clearInterval(this.timer);await this.active;await this.reviewTask;}
  tick():Promise<void> {
    if(this.active || this.stopping) return this.active ?? Promise.resolve();
    this.active=this.run().finally(()=>{this.active=null;});return this.active;
  }
  private async run() {
    this.running=true;
    try {
      await this.job('operations-cycle','Memeriksa pekerjaan operasional.',()=>this.collect());
      if(this.options.messenger?.status().state==='connected') await this.deliver();
    } catch { /* Each job records a safe failure state; no provider payload is logged. */ }
    finally {this.running=false;}
  }
  private async collect() {
    const repo=this.options.repository;
    const [projects,payments,clients,notes,tasks,invoices]=await Promise.all([repo.listClientProjects(),repo.listPayments(),this.store.list<ClientAutomation>('client'),this.store.list<ProgressNote>('progress'),this.store.list<OwnerTask>('task'),this.store.list<Invoice>('invoice')]);
    const now=this.now();
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const money=(amount:number,currency:string)=>new Intl.NumberFormat('id-ID',{style:'currency',currency}).format(amount);
    for(const config of clients.filter(c=>c.enabled)) {
      const project=projects.find(p=>p.id===config.projectId);if(!project || project.status==='closed') continue;
      if(config.progress) await this.job('progress-reporter','Menyiapkan laporan dari catatan progres tersimpan.',async()=>{
        const latest=notes.filter(n=>n.projectId===project.id && n.createdAt>=config.enabledAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
        if(latest) await this.store.enqueue({eventKey:`progress:${latest.id}`,projectId:project.id,kind:'progress',phone:config.phone,text:`Halo ${project.client}, berikut pembaruan ${project.title}:\n\n${latest.text}\n\nJika ada pertanyaan, silakan balas pesan ini. — Tim proyek`});
      });
      if(config.payments) await this.job('payment-officer','Memeriksa pembayaran yang tercatat diterima.',async()=>{
        for(const payment of payments.filter(p=>p.projectId===project.id && p.status==='received' && p.receivedAt && p.receivedAt>=config.enabledAt)) {
          const sum=payments.filter(p=>p.projectId===project.id && p.currency===payment.currency && p.status==='received').reduce((s,p)=>s+toMinor(p.amount,p.currency),0);
          const full=project.value!==null && payment.currency===project.currency && sum>=toMinor(project.value,project.currency);
          await this.store.enqueue({eventKey:`payment:${payment.id}`,projectId:project.id,kind:'payment',phone:config.phone,text:`Halo ${project.client}, pembayaran ${money(payment.amount,payment.currency)} untuk ${project.title} telah dicatat diterima pada ${new Date(payment.receivedAt!).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}.${full?' Total pembayaran tercatat telah mencukupi nilai proyek.':' Terima kasih atas pembayaran Anda.'}\nReferensi catatan: ${payment.id}. — Tim proyek`});
        }
      });
      if(config.reminders) await this.job('collections-officer','Memeriksa tagihan yang telah jatuh tempo.',async()=>{
        const text=paymentReminder(project,payments,invoices,today);
        if(text) await this.store.enqueue({eventKey:`reminder:${project.id}:${today}`,projectId:project.id,kind:'reminder',phone:config.phone,text});
      });
    }
    if(this.options.calendar?.status().connected) await this.job('calendar-operator','Menyinkronkan tugas terpilih dengan Google Calendar.',()=>this.options.calendar!.sync(tasks)).catch(()=>this.options.calendar?.fail());
    const outstanding=payments.filter(p=>p.status==='expected' && p.dueDate && p.dueDate<=today).length;
    const proposals=await repo.listProjects();
    const facts1=[`Peluang tersimpan: ${proposals.length}.`,`Bid terkirim tercatat: ${(await repo.listBidOutcomes()).length}.`,`Kebijakan: ${(await repo.getPolicy()).state}.`];
    const facts2=[`Proyek aktif: ${projects.filter(p=>p.status==='active').length}.`,`Klien dengan otomasi aktif: ${clients.filter(c=>c.enabled).length}.`,`Pembayaran jatuh tempo yang masih diharapkan: ${outstanding}.`,`Tugas pemilik belum selesai: ${tasks.filter(t=>!t.done).length}.`,`Invoice tersimpan: ${invoices.length}.`,`Catatan progres tersimpan: ${notes.length}.`];
    if(!this.reviewTask) this.reviewTask=(async()=>{
      for(const floor of [1,2] as const) {
        const facts=floor===1?facts1:facts2;
        // One report per floor/hour, even if counts change on every scanner run.
        const hourlyId=`${floor}:${now.toISOString().slice(0,13)}`;
        const briefing:TeamBriefing={id:hourlyId,createdAt:now.toISOString(),floor,manager:floor===1?'Manajer Akuisisi':'Manajer Operasional',facts,leadReview:null,state:'waiting'};
        if(!await this.store.create('briefing',hourlyId,briefing)) continue;
        await this.job(floor===1?'floor-one-manager':'delivery-manager','Mengirim laporan faktual kepada Lead Agent.',async()=>{
          if(this.options.review) {
            try { briefing.leadReview=await this.job('lead-operations','Hermes meninjau laporan manajer.',()=>this.options.review!(facts));briefing.state='reviewed'; }
            catch {briefing.state='unavailable';}
          } else briefing.state='unavailable';
          await this.store.save('briefing',hourlyId,briefing);
        });
      }
    })().catch(()=>undefined).finally(()=>{this.reviewTask=null;});
  }
  private async deliver() {
    await this.job('whatsapp-operator','Mengirim pesan dari antrean yang telah diizinkan.',async()=>{
      for(const message of await this.store.pending()) {
        const [client,payments,project,invoices]=await Promise.all([this.store.get<ClientAutomation>('client',message.projectId),this.options.repository.listPayments(),this.options.repository.getClientProject(message.projectId),this.store.list<Invoice>('invoice')]);
        if(!await this.store.claim(message.id)) continue;
        const enabled=client?.enabled && client.phone===message.phone && client[message.kind==='payment'?'payments':message.kind==='reminder'?'reminders':'progress'];
        const paymentId=message.eventKey.startsWith('payment:')?message.eventKey.slice(8):null;
        const valid=message.kind==='payment'?payments.some(p=>p.id===paymentId && p.status==='received'):message.kind==='reminder'?project && paymentReminder(project,payments,invoices,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(this.now()))===message.text:true;
        if(!enabled || !valid || !project || project.status==='closed' || this.now().getTime()-Date.parse(message.createdAt)>48*3600_000) {await this.store.finish(message.id,'canceled','Izin/data berubah atau pesan lebih dari 48 jam.');continue;}
        try {
          const id=await this.options.messenger!.send(message.phone,message.text);
          await this.store.finish(message.id,'sent',null,id);
        } catch { await this.store.finish(message.id,'uncertain','Hasil pengiriman tidak diketahui. Periksa WhatsApp; tidak dicoba ulang otomatis.');break; }
      }
    });
  }
  async invoiceSummary(invoice:Invoice) { return invoiceBalance(invoice,(await this.options.repository.listPayments()).filter(p=>p.projectId===invoice.projectId)); }
}
