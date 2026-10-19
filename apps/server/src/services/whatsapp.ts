import makeWASocket, { BufferJSON, DisconnectReason, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap, type WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import type { IntegrationVault } from '../lib/integration-vault.js';

export class WhatsAppService {
  private socket: WASocket | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private desired = false;
  private connecting = false;
  private qr: string | null = null;
  private qrUntil = 0;
  private state: 'disconnected'|'connecting'|'qr'|'connected'|'error' = 'disconnected';
  private reason = 'Hubungkan WhatsApp melalui QR.';
  private generation=0;
  constructor(private vault: IntegrationVault) {}
  status() { return { state:this.state, reason:this.reason, qr:Date.now()<this.qrUntil ? this.qr : null, provider:'Baileys (WhatsApp Web, tidak resmi)' }; }
  async restore() {
    if (await this.vault.read('whatsapp')) await this.connect();
  }
  async connect() {
    if (this.connecting || this.socket) return;
    this.desired=true; this.connecting=true; this.state='connecting'; this.reason='Menghubungkan perangkat WhatsApp.';
    const generation=++this.generation;
    try {
      const saved=await this.vault.read('whatsapp');
      const data = saved ? JSON.parse(saved,BufferJSON.reviver) as { creds:AuthenticationCreds; keys:Record<string,unknown> } : { creds:initAuthCreds(),keys:{} as Record<string,unknown> };
      const persist=()=>generation===this.generation && this.desired?this.vault.write('whatsapp',JSON.stringify(data,BufferJSON.replacer)):Promise.resolve();
      const auth:AuthenticationState={ creds:data.creds, keys:{
        get:async<T extends keyof SignalDataTypeMap>(type:T,ids:string[])=>{
          const result:Record<string,SignalDataTypeMap[T]>={};
          for (const id of ids) {
            let value=data.keys[`${type}:${id}`];
            if(type==='app-state-sync-key' && value) value=proto.Message.AppStateSyncKeyData.fromObject(value as Record<string,unknown>);
            if(value) result[id]=value as SignalDataTypeMap[T];
          }
          return result;
        },
        set:async(update)=>{ for(const [type,entries] of Object.entries(update)) for(const [id,value] of Object.entries(entries ?? {})) { if(value) data.keys[`${type}:${id}`]=value; else delete data.keys[`${type}:${id}`]; } await persist(); },
      }};
      if(generation!==this.generation || !this.desired) return;
      const socket=makeWASocket({ auth,logger:pino({level:'silent'}), syncFullHistory:false, shouldSyncHistoryMessage:()=>false, markOnlineOnConnect:false, getMessage:async()=>undefined, connectTimeoutMs:30_000 });
      this.socket=socket;
      socket.ev.on('creds.update',async(update)=>{ Object.assign(data.creds,update);try { await persist(); } catch { this.state='error'; this.reason='Sesi gagal disimpan terenkripsi; pengiriman dihentikan.'; this.closeSocket(); } });
      socket.ev.on('connection.update',async(update)=>{
        if(this.socket!==socket) return;
        if(update.qr) { const qr=await QRCode.toDataURL(update.qr,{width:300,margin:2});if(this.socket!==socket) return;this.qr=qr; this.qrUntil=Date.now()+55_000; this.state='qr'; this.reason='Pindai melalui WhatsApp → Perangkat tertaut.'; }
        if(update.connection==='open') { this.qr=null; this.state='connected'; this.reason='Perangkat WhatsApp terhubung.'; }
        if(update.connection==='close') {
          this.socket=null; this.qr=null; this.state='disconnected';
          const code=(update.lastDisconnect?.error as {output?:{statusCode?:number}}|undefined)?.output?.statusCode;
          const loggedOut=code===DisconnectReason.loggedOut;
          this.reason=loggedOut?'Sesi berakhir. Hubungkan dan pindai QR kembali.':'Koneksi terputus; menunggu sambungan kembali.';
          if(loggedOut) { this.desired=false; await this.vault.write('whatsapp','').catch(()=>undefined); }
          if(this.desired) this.reconnect=setTimeout(()=>{ void this.connect(); },code===DisconnectReason.restartRequired?1500:15_000);
        }
      });
    } catch { this.state='error'; this.reason='Koneksi WhatsApp gagal. Coba hubungkan kembali.'; this.closeSocket(); }
    finally { this.connecting=false; }
  }
  async send(phone:string,text:string) {
    if(this.state!=='connected' || !this.socket) throw new Error('WhatsApp tidak terhubung.');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const result=await Promise.race([this.socket.sendMessage(`${phone}@s.whatsapp.net`,{text}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Hasil pengiriman tidak diketahui.')),30_000);})]);
      if(!result?.key.id) throw new Error('Hasil pengiriman tidak diketahui.');
      return result.key.id;
    } finally {if(timer) clearTimeout(timer);}
  }
  private closeSocket() { const current=this.socket; this.socket=null; current?.end(undefined); }
  async disconnect() { this.generation++;this.desired=false; if(this.reconnect) clearTimeout(this.reconnect); const current=this.socket; this.socket=null; await current?.logout().catch(()=>undefined); await this.vault.write('whatsapp',''); this.state='disconnected'; this.reason='WhatsApp diputuskan oleh pemilik.'; this.qr=null; }
  close() { this.generation++;this.desired=false; if(this.reconnect) clearTimeout(this.reconnect); this.closeSocket(); }
}
