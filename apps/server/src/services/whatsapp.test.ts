import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import type {IntegrationVault,VaultKey} from '../lib/integration-vault.js';
const fixture=vi.hoisted(()=>({handlers:new Map<string,(event:unknown)=>Promise<void>>(),options:null as unknown,send:vi.fn(async()=>({key:{id:'fixture-message'}})),end:vi.fn(),logout:vi.fn(async()=>undefined)}));
vi.mock('@whiskeysockets/baileys',()=>({
  default:vi.fn((options:unknown)=>{fixture.options=options;return {ev:{on:(event:string,handler:(value:unknown)=>Promise<void>)=>fixture.handlers.set(event,handler)},sendMessage:fixture.send,end:fixture.end,logout:fixture.logout};}),
  BufferJSON:{replacer:(_key:string,value:unknown)=>value,reviver:(_key:string,value:unknown)=>value},
  DisconnectReason:{loggedOut:401,restartRequired:515},initAuthCreds:()=>({registered:false}),proto:{Message:{AppStateSyncKeyData:{fromObject:(value:unknown)=>value}}},
}));
import {WhatsAppService} from './whatsapp.js';
class MemoryVault implements IntegrationVault {values=new Map<VaultKey,string>();async read(key:VaultKey){return this.values.get(key)||null;}async write(key:VaultKey,value:string){this.values.set(key,value);}}
describe('WhatsApp session lifecycle',()=>{
  let service:WhatsAppService;
  beforeEach(()=>{fixture.handlers.clear();fixture.send.mockClear();fixture.end.mockClear();fixture.logout.mockClear();});
  afterEach(()=>service?.close());
  it('shows QR only while pairing, disables history sync and sends only on actual connection',async()=>{
    const vault=new MemoryVault();service=new WhatsAppService(vault);
    await expect(service.send('628123456789','Pesan uji')).rejects.toThrow();
    await service.connect();
    expect(fixture.options).toMatchObject({syncFullHistory:false,markOnlineOnConnect:false});
    await fixture.handlers.get('connection.update')!({qr:'fixture-pairing-code'});
    expect(service.status()).toMatchObject({state:'qr',qr:expect.stringContaining('data:image/png;base64,')});
    await fixture.handlers.get('connection.update')!({connection:'open'});
    expect(service.status()).toMatchObject({state:'connected',qr:null});
    expect(await service.send('628123456789','Pesan uji')).toBe('fixture-message');
    expect(fixture.send).toHaveBeenCalledWith('628123456789@s.whatsapp.net',{text:'Pesan uji'});
    await fixture.handlers.get('creds.update')!({registered:true});
    expect(JSON.parse((await vault.read('whatsapp'))!)).toMatchObject({creds:{registered:true}});
    await service.disconnect();expect(await vault.read('whatsapp')).toBeNull();
    await fixture.handlers.get('creds.update')!({registered:true});expect(await vault.read('whatsapp')).toBeNull();
  });
  it('clears session on logout and never reports itself connected from stored credentials alone',async()=>{
    const vault=new MemoryVault();await vault.write('whatsapp',JSON.stringify({creds:{registered:true},keys:{}}));
    service=new WhatsAppService(vault);await service.restore();expect(service.status().state).toBe('connecting');
    await fixture.handlers.get('connection.update')!({connection:'close',lastDisconnect:{error:{output:{statusCode:401}}}});
    expect(service.status().state).toBe('disconnected');expect(await vault.read('whatsapp')).toBeNull();
  });
});
