import type { DraftingEvidence } from '@fvh/application';

export class PublicPortfolioResolver {
  private cache=new Map<string,{public:boolean;until:number}>();
  constructor(private fetcher:typeof fetch=fetch) {}
  async select(evidence:DraftingEvidence[]) {
    const result:Array<{label:string;url:string}>=[];
    for(const item of evidence) {
      const match=/^https:\/\/github\.com\/([\w-]+)\/([\w.-]+)(?:\/|$)/i.exec(item.source);
      if(!match) continue;
      const repository=`${match[1]}/${match[2]}`;const url=`https://github.com/${repository}`;
      if(result.some(r=>r.url===url)) continue;
      let known=this.cache.get(repository);
      if(!known || known.until<Date.now()) {
        try {
          // No token: only anonymously accessible repositories can become client-facing links.
          const response=await this.fetcher(`https://api.github.com/repos/${repository}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Freelancer-Virtual-House'},signal:AbortSignal.timeout(5000)});
          const metadata=response.ok?await response.json() as {private?:boolean;visibility?:string}:null;
          known={public:response.ok && metadata?.private===false && metadata.visibility==='public',until:Date.now()+(response.ok?86400_000:300_000)};
        } catch {known={public:false,until:Date.now()+300_000};}
        if(this.cache.size>=500) this.cache.delete(this.cache.keys().next().value ?? '');
        this.cache.set(repository,known);
      }
      if(known.public) result.push({label:repository,url});
      if(result.length===2) break;
    }
    return result;
  }
}
