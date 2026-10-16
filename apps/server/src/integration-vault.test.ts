import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DpapiIntegrationVault} from './integration-vault.js';
describe('encrypted integration vault',()=>{
  it('roundtrips through DPAPI, serializes writes and never stores fixture text in plaintext',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'fvh-vault-'));
    try {
      const vault=new DpapiIntegrationVault(directory,fileURLToPath(new URL('./integration-vault.ps1',import.meta.url)));
      if(process.platform!=='win32'){await expect(vault.write('google-token','fixture')).rejects.toThrow('Windows DPAPI');return;}
      expect(await vault.read('google-token')).toBeNull();
      await Promise.all([vault.write('google-token','fixture-first'),vault.write('google-token','fixture-final')]);
      expect(await vault.read('google-token')).toBe('fixture-final');
      expect(await readFile(join(directory,'integration-google-token.dpapi'),'utf8')).not.toContain('fixture');
      await vault.write('google-token','');expect(await vault.read('google-token')).toBeNull();
    } finally {const inside=relative(tmpdir(),directory);if(inside.startsWith('fvh-vault-') && !inside.includes('..'))await rm(directory,{recursive:true,force:true});}
  });
});
