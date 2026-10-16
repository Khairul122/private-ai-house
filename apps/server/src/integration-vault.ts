import { spawn } from 'node:child_process';
import { join } from 'node:path';

export type VaultKey = 'whatsapp' | 'google-client' | 'google-token';
export interface IntegrationVault { read(key: VaultKey): Promise<string | null>; write(key: VaultKey, value: string): Promise<void> }
export class DpapiIntegrationVault implements IntegrationVault {
  private pending = new Map<VaultKey,Promise<void>>();
  constructor(private directory: string, private script: string) {}
  read(key: VaultKey) { return this.run('Read',key); }
  write(key: VaultKey, value: string): Promise<void> {
    const next = (this.pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => { await this.run('Write',key,value); });
    this.pending.set(key,next);
    return next;
  }
  private run(action: 'Read'|'Write', key: VaultKey, input=''): Promise<string|null> {
    if (process.platform !== 'win32') return Promise.reject(new Error('Penyimpanan integrasi memerlukan Windows DPAPI.'));
    return new Promise((resolve,reject) => {
      const child = spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.script,'-Action',action,'-StorePath',join(this.directory,`integration-${key}.dpapi`)],{ windowsHide:true, stdio:['pipe','pipe','pipe'] });
      let output='';
      const timer=setTimeout(() => { child.kill(); reject(new Error('Penyimpanan integrasi melewati batas waktu.')); },60_000);
      child.stdout.setEncoding('utf8').on('data',(chunk:string) => { output+=chunk; if(output.length>20_000_000) child.kill(); });
      child.stderr.resume();
      child.stdin.on('error',()=>undefined);
      child.once('error',()=>{ clearTimeout(timer); reject(new Error('Penyimpanan integrasi gagal.')); });
      child.once('close',(code)=>{ clearTimeout(timer); if(code!==0) reject(new Error('Penyimpanan integrasi gagal.')); else resolve(output || null); });
      child.stdin.end(input,'utf8');
    });
  }
}
