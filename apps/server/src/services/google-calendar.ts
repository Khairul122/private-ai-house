import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OwnerTask } from '@fvh/domain';
import { OperationsRepository } from '@fvh/persistence';
import type { IntegrationVault } from '../lib/integration-vault.js';

type Client = {clientId:string;clientSecret:string};
type Token = {accessToken:string;refreshToken:string;expiresAt:number};
type Event = {id:string;summary?:string;description?:string;status?:string;updated?:string;start?:{dateTime?:string;timeZone?:string};end?:{dateTime?:string};extendedProperties?:{private?:Record<string,string>}};
type CalendarMap = {googleUpdated:string;localUpdated:string};
export class GoogleCalendarService {
  readonly redirectUri='http://localhost:3001/api/operations/google/callback';
  private pending:{state:string;verifier:string;until:number}|null=null;
  private reason='Konfigurasi OAuth Google diperlukan.';
  private configured=false;
  private connected=false;
  private tokenStored=false;
  private refresh:Promise<Token>|null=null;
  private tokenCache:Token|null=null;
  private generation=0;
  private cancellation=new AbortController();
  constructor(private vault:IntegrationVault,private repository:OperationsRepository,private fetcher:typeof fetch=fetch) {}
  status() { return {configured:this.configured,connected:this.connected,tokenStored:this.tokenStored,reason:this.reason,redirectUri:this.redirectUri}; }
  async restore() { this.configured=Boolean(await this.vault.read('google-client')); this.tokenStored=Boolean(await this.vault.read('google-token'));if(this.tokenStored) {try{await this.verify();}catch{this.connected=false;this.reason='Token tersimpan, tetapi koneksi Google belum dapat diverifikasi. Periksa koneksi.';}} else this.reason=this.configured?'Siap untuk persetujuan akun Google.':'Konfigurasi OAuth Google diperlukan.'; }
  async verify() {
    const generation=this.generation;
    const response=await this.request('?maxResults=1&privateExtendedProperty=fvhTask%3D__connection_check__');
    if(!response.ok || generation!==this.generation) throw new Error('Google Calendar belum dapat diverifikasi.');
    this.connected=true;this.reason='Akses Google Calendar terverifikasi.';
  }
  async configure(client:Client) { if(this.connected || await this.vault.read('google-token')) throw new Error('Putuskan akun Google sebelum mengganti aplikasi OAuth.');this.pending=null;await this.vault.write('google-client',JSON.stringify(client)); this.configured=true; this.reason='Siap untuk persetujuan akun Google.'; }
  async start() {
    this.cancellation=new AbortController();
    const raw=await this.vault.read('google-client'); if(!raw) throw new Error('Simpan client ID dan client secret Google terlebih dahulu.');
    const client=JSON.parse(raw) as Client;
    const state=randomBytes(32).toString('hex'); const verifier=randomBytes(48).toString('base64url');
    this.pending={state,verifier,until:Date.now()+600_000};
    const params=new URLSearchParams({client_id:client.clientId,redirect_uri:this.redirectUri,response_type:'code',scope:'https://www.googleapis.com/auth/calendar.events.owned',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  async callback(code:string,state:string) {
    const generation=this.generation;
    const expected=this.pending; this.pending=null;
    if(!expected || Date.now()>expected.until || state.length!==expected.state.length || !timingSafeEqual(Buffer.from(state),Buffer.from(expected.state))) throw new Error('Sesi OAuth tidak valid atau kedaluwarsa.');
    const client=JSON.parse((await this.vault.read('google-client')) ?? '{}') as Client;
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:client.clientId,client_secret:client.clientSecret,redirect_uri:this.redirectUri,grant_type:'authorization_code',code_verifier:expected.verifier}),signal:AbortSignal.any([AbortSignal.timeout(30_000),this.cancellation.signal])});
    const data=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string};
    if(!response.ok || !data.access_token || !data.refresh_token || !data.scope?.split(' ').includes('https://www.googleapis.com/auth/calendar.events.owned')) throw new Error('Google belum memberikan akses kalender dan token offline. Ulangi persetujuan.');
    if(generation!==this.generation) throw new Error('Akun Google telah diputuskan.');
    this.tokenCache={accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+(data.expires_in ?? 3600)*1000};
    await this.vault.write('google-token',JSON.stringify(this.tokenCache));
    this.tokenStored=true;
    if(generation!==this.generation) throw new Error('Akun Google telah diputuskan.');
    await this.verify();
  }
  async disconnect() {
    this.pending=null;this.generation++;this.cancellation.abort();this.connected=false;
    let revoked=false;
    try {
      const raw=await this.vault.read('google-token');
      if(raw) {const token=JSON.parse(raw) as Token;const response=await this.fetcher('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:token.refreshToken}),signal:AbortSignal.timeout(15_000)});revoked=response.ok;}
    } catch { /* Local removal still stops this application; the UI explains revocation status. */ }
    this.tokenCache=null;await this.vault.write('google-token','');this.connected=false;this.tokenStored=false;
    this.reason=revoked?'Akses Google dicabut. Acara yang sudah dibuat tetap di kalender.':'Token lokal dihapus. Cabut akses aplikasi melalui pengaturan akun Google bila masih tercantum. Acara tetap di kalender.';
  }
  private async token():Promise<Token> {
    const generation=this.generation;
    if(!this.tokenCache) {const raw=await this.vault.read('google-token');if(!raw) throw new Error('Google Calendar belum terhubung.');this.tokenCache=JSON.parse(raw) as Token;}
    const token=this.tokenCache;
    if(token.expiresAt>Date.now()+60_000) return token;
    if(!this.refresh) this.refresh=(async()=>{
      const client=JSON.parse((await this.vault.read('google-client')) ?? '{}') as Client;
      const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client.clientId,client_secret:client.clientSecret,refresh_token:token.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.any([AbortSignal.timeout(30_000),this.cancellation.signal])});
      const data=await response.json() as {access_token?:string;expires_in?:number};
      if(!response.ok || !data.access_token) {if(generation===this.generation)this.connected=false;throw new Error('Akses Google berakhir. Hubungkan akun kembali.');}
      const next={...token,accessToken:data.access_token,expiresAt:Date.now()+(data.expires_in ?? 3600)*1000};
      if(generation!==this.generation) throw new Error('Akun Google telah diputuskan.');
      await this.vault.write('google-token',JSON.stringify(next));this.tokenCache=next;return next;
    })().finally(()=>{this.refresh=null;});
    return this.refresh;
  }
  private async request(path:string,init:RequestInit={}) {
    const generation=this.generation;
    const token=await this.token();
    if(generation!==this.generation) throw new Error('Akun Google telah diputuskan.');
    return this.fetcher(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`,{...init,headers:{Authorization:`Bearer ${token.accessToken}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.any([AbortSignal.timeout(30_000),this.cancellation.signal])});
  }
  async sync(tasks:OwnerTask[]) {
    const generation=this.generation;
    const grant=createHash('sha256').update((await this.token()).refreshToken).digest('hex').slice(0,24);
    let count=0;
    for(const task of tasks.filter(t=>t.syncGoogle)) {
      const id='fvh'+createHash('sha256').update(task.id).digest('hex');
      const response=await this.request(`/${id}`);
      const previous=response.ok ? await response.json() as Event : null;
      if(!response.ok && ![404,410].includes(response.status)) throw new Error(`Google Calendar gagal dibaca (HTTP ${response.status}).`);
      const mapId=`${grant}:${task.id}`;
      const map=await this.repository.get<CalendarMap>('calendar-map',mapId);
      if(map && ((!previous && [404,410].includes(response.status)) || previous?.status==='cancelled') && task.updatedAt===map.localUpdated) {
        await this.repository.updateTaskIfCurrent(task.id,task.updatedAt,{...task,syncGoogle:false,updatedAt:new Date().toISOString()});count++;continue;
      }
      if(previous && previous.extendedProperties?.private?.fvhTask!==task.id) throw new Error('Acara Google bukan milik aplikasi; perubahan dibatalkan.');
      if(previous && map && previous.updated!==map.googleUpdated && task.updatedAt===map.localUpdated) {
        if(!previous.start?.dateTime || !previous.end?.dateTime) throw new Error('Acara diubah menjadi sepanjang hari. Sesuaikan kembali jam di Google.');
        const updated={...task,title:(previous.summary ?? task.title).replace(/^✓ /,''),notes:previous.description ?? '',startAt:new Date(previous.start.dateTime).toISOString(),endAt:new Date(previous.end.dateTime).toISOString(),updatedAt:new Date().toISOString()};
        if(!await this.repository.updateTaskIfCurrent(task.id,task.updatedAt,updated)) continue;
        await this.repository.save('calendar-map',mapId,{googleUpdated:previous.updated ?? '',localUpdated:updated.updatedAt}); count++; continue;
      }
      if(map?.localUpdated===task.updatedAt && previous?.updated===map.googleUpdated) continue;
      const event={id,summary:`${task.done?'✓ ':''}${task.title}`,description:task.notes,start:{dateTime:task.startAt,timeZone:task.timezone},end:{dateTime:task.endAt,timeZone:task.timezone},extendedProperties:{private:{fvhTask:task.id}},status:'confirmed'};
      let write=await this.request(previous?`/${id}?sendUpdates=none`:'?sendUpdates=none',{method:previous?'PUT':'POST',body:JSON.stringify(event)});
      if(!previous && write.status===409) write=await this.request(`/${id}`);
      if(!write.ok) throw new Error(`Google Calendar gagal disimpan (HTTP ${write.status}).`);
      const saved=await write.json() as Event;
      if(saved.extendedProperties?.private?.fvhTask!==task.id) throw new Error('Acara Google tidak dapat diverifikasi.');
      await this.repository.save('calendar-map',mapId,{googleUpdated:saved.updated ?? '',localUpdated:task.updatedAt}); count++;
    }
    if(generation!==this.generation) throw new Error('Akun Google telah diputuskan.');
    this.connected=true;this.reason=`Sinkronisasi selesai: ${count} perubahan. Hanya tugas aplikasi yang dipilih.`;
    return count;
  }
  fail() { this.reason='Sinkronisasi gagal. Periksa akses akun, API Calendar, dan koneksi.'; }
}
