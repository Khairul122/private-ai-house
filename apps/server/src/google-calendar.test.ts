import {afterEach,describe,it,expect,vi} from 'vitest';
import {WorkspaceRepository,OperationsRepository} from '@fvh/persistence';
import type {OwnerTask} from '@fvh/domain';
import type {IntegrationVault,VaultKey} from './integration-vault.js';
import {GoogleCalendarService} from './google-calendar.js';
class MemoryVault implements IntegrationVault {values=new Map<VaultKey,string>();async read(key:VaultKey){return this.values.get(key)||null;}async write(key:VaultKey,value:string){this.values.set(key,value);}}
describe('Google Calendar',()=>{
  let repo:WorkspaceRepository;
  afterEach(async()=>{await repo?.close();});
  it('uses state and PKCE, keeps tokens server-side and verifies actual Calendar access',async()=>{
    repo=await WorkspaceRepository.open();const vault=new MemoryVault();
    const fetcher=vi.fn<typeof fetch>(async input=>String(input).includes('/token')?new Response(JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/calendar.events.owned'})):new Response('{}'));
    const google=new GoogleCalendarService(vault,new OperationsRepository(repo.sql),fetcher);
    await google.configure({clientId:'fixture.apps.googleusercontent.com',clientSecret:'fixture-secret'});
    const url=new URL(await google.start());expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('access_type')).toBe('offline');
    await expect(google.callback('fixture','bad')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
    const second=new URL(await google.start());await google.callback('fixture',second.searchParams.get('state')!);
    expect(google.status().connected).toBe(true);expect(JSON.stringify(google.status())).not.toContain('fixture-access');
    await expect(google.callback('fixture',second.searchParams.get('state')!)).rejects.toThrow();
    await google.disconnect();expect(google.status().connected).toBe(false);expect(await vault.read('google-token')).toBeNull();
  });
  it('upserts deterministic app events without invites, then imports Google edits',async()=>{
    repo=await WorkspaceRepository.open();const store=new OperationsRepository(repo.sql);const vault=new MemoryVault();
    await vault.write('google-token',JSON.stringify({accessToken:'fixture',refreshToken:'fixture',expiresAt:Date.now()+3600_000}));
    let event:Record<string,unknown>|null=null;
    const fetcher=vi.fn<typeof fetch>(async(input,init)=>{
      if(init?.method==='POST'||init?.method==='PUT'){event={...JSON.parse(String(init.body)),updated:'2026-10-16T03:00:00Z'};return new Response(JSON.stringify(event));}
      if(String(input).includes('connection_check'))return new Response('{}');
      return event?new Response(JSON.stringify(event)):new Response('{}',{status:404});
    });
    const google=new GoogleCalendarService(vault,store,fetcher);
    const task:OwnerTask={id:'owner-task',title:'Kerja langsung',projectId:null,startAt:'2026-10-17T03:00:00Z',endAt:'2026-10-17T04:00:00Z',timezone:'Asia/Jakarta',notes:'Persiapan',done:false,syncGoogle:true,updatedAt:'2026-10-16T02:00:00Z'};
    await store.save('task',task.id,task);expect(await google.sync([task])).toBe(1);
    expect(fetcher.mock.calls.find(([,i])=>i?.method==='POST')?.[0]).toContain('sendUpdates=none');
    expect(event).not.toHaveProperty('attendees');expect(await google.sync([task])).toBe(0);
    event={...event,summary:'Diubah di Google',updated:'2026-10-16T04:00:00Z'};
    await google.sync([task]);expect((await store.get<OwnerTask>('task',task.id))?.title).toBe('Diubah di Google');
    expect(fetcher.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
  });
  it('does not claim connection from a saved token when Calendar rejects it',async()=>{
    repo=await WorkspaceRepository.open();const vault=new MemoryVault();await vault.write('google-token',JSON.stringify({accessToken:'fixture',refreshToken:'fixture',expiresAt:Date.now()+3600_000}));
    const google=new GoogleCalendarService(vault,new OperationsRepository(repo.sql),async()=>new Response('{}',{status:403}));await google.restore();expect(google.status().connected).toBe(false);
  });
});
