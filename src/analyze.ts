import {MappingSchema,contentKeys} from './model.ts';
import type{SourceDocument,SourceNode,Model,Evidence,Origin,Mapping}from'./model.ts';
import {validateModel}from'./validate.ts';
const evidence=(n:SourceNode):Evidence[]=>[{sourceId:n.id,quote:n.text||n.name,region:null}];
const label=(n:SourceNode)=>n.text.trim()||n.name.trim();
const classifyView=(s:string):Model['areas'][number]['view']=>/\btransition\b/i.test(s)?'transition':/\b(soll|ziel|target)\b/i.test(s)?'soll':/\b(ist|as.is|current)\b/i.test(s)?'ist':'unspecified';
export function analyze(source:SourceDocument,mapping?:unknown):Model{
 const m:Model={schemaVersion:1,source,areas:[{id:'area-unassigned',title:'Nicht zugeordnet',view:'unspecified'}],systems:[],relations:[],sequences:[],requirements:[],workshop:[],decisions:[],issues:source.diagnostics.map(message=>({code:'import',message,sourceIds:[]}))};
 const nodes=new Map(source.nodes.map(n=>[n.id,n]));
 for(const n of source.nodes.filter(n=>n.visible&&n.type==='SECTION')){const headings=[...n.sectionPath,n.id].map(k=>nodes.get(k)?.name??'');m.areas.push({id:`area-${n.id}`,title:headings.join(' / '),view:classifyView(headings.join(' '))});}
 const area=(n:SourceNode)=>`area-${n.sectionPath.at(-1)??'unassigned'}`;
 const common=(n:SourceNode,prefix:string)=>({id:`${prefix}-${n.id}`,areaId:area(n),evidence:evidence(n),origin:'rule' as const});
 const edges=source.nodes.filter(n=>n.visible&&n.connector);
 const connected=new Set(edges.flatMap(n=>[n.connector?.startId,n.connector?.endId]).filter((s):s is string=>!!s));
 const longNotes=new Set<string>();
 for(const n of source.nodes.filter(n=>n.visible)){
  const content=label(n);if(!content||['DOCUMENT','CANVAS','SECTION','CONNECTOR','GROUP','FRAME'].includes(n.type)||n.imageHashes.length)continue;
  const heading=n.sectionPath.map(k=>nodes.get(k)?.name??'').join(' / ');
  const isQuestion=/\?|^(?:Vorschlag|Proposal|Option)\s*:/i.test(content);
  const explicitDecision=/^(?:Entscheidung|Decision|Beschlossen|Decided)\s*:\s*.+/im.test(content)&&!isQuestion;
  const isRequirement=/\b(Anforderungen|Requirements)\b/i.test(heading)||/^(?:Anforderung|Requirement)\s*:/i.test(content);
  if(explicitDecision){
   const part=(names:string)=>content.match(new RegExp(`^(?:${names})\\s*:\\s*(.+)$`,'im'))?.[1]?.trim()??null;
   const decision=part('Entscheidung|Decision|Beschlossen|Decided')!;
   m.decisions.push({...common(n,'adr'),title:decision.slice(0,120),context:part('Kontext|Context'),decision,rationale:part('Begründung|Rationale|Grund'),consequences:part('Folgen|Konsequenzen|Consequences'),sourceStatus:part('Status')});
  }else if(isRequirement&&!isQuestion)m.requirements.push({...common(n,'req'),text:content,status:null,owner:null,priority:null});
  else if(connected.has(n.id)&&['SHAPE_WITH_TEXT','TEXT','ROUNDED_RECTANGLE','RECTANGLE','ELLIPSE','STICKY'].includes(n.type)&&content.length<=180&&!isQuestion&&!n.table)m.systems.push({...common(n,'sys'),origin:'native',name:content,kind:'element',status:null});
  else{m.workshop.push({...common(n,'note'),text:content,status:null,owner:null,priority:null});if(connected.has(n.id))longNotes.add(n.id);}
 }
 const sys=new Map(m.systems.flatMap(s=>s.evidence.map(e=>[e.sourceId,s.id] as const)));
 for(const n of edges){const c=n.connector!;let from=sys.get(c.startId??''),to=sys.get(c.endId??'');
  if(!from||!to){m.issues.push({code:'unresolved-connector',message:'Connector endet nicht an zwei identifizierten Diagrammelementen; keine fachliche Beziehung abgeleitet.',sourceIds:[n.id]});continue;}
  if(c.startArrow&&!c.endArrow)[from,to]=[to,from];
  m.relations.push({...common(n,'rel'),origin:'native',from,to,label:n.text.trim(),direction:c.startArrow&&c.endArrow?'both':c.startArrow||c.endArrow?'forward':'none'});
 }
 for(const a of m.areas.filter(a=>/\b(sequenz|sequence|ablauf|interaktion|interaction)\b/i.test(a.title))){
  const rels=m.relations.filter(r=>r.areaId===a.id);if(!rels.length)continue;
  const steps=rels.map(r=>{const hit=/^(\d+)[.):]\s+([\s\S]+)$/.exec(r.label);return hit&&r.direction==='forward'?{order:Number(hit[1]),from:r.from,to:r.to,message:hit[2]!,evidence:r.evidence}:null;});
  const ordered=steps.filter((s):s is NonNullable<typeof s>=>s!==null).sort((a,b)=>a.order-b.order);
  if(ordered.length===rels.length&&ordered.every((s,i)=>s.order===i+1))m.sequences.push({id:`seq-${a.id}`,areaId:a.id,title:a.title,origin:'rule',evidence:rels.flatMap(r=>r.evidence),steps:ordered});
  else m.issues.push({code:'unknown-sequence-order',message:`Keine eindeutige nummerierte Reihenfolge in ${a.title}; kein Sequenzdiagramm erzeugt.`,sourceIds:rels.flatMap(r=>r.evidence.map(e=>e.sourceId))});
 }
 for(const asset of source.assets.filter(a=>a.nodeIds.some(id=>nodes.get(id)?.visible)))m.issues.push({code:'image-uninterpreted',message:'Eingebettetes Bild erhalten. Inhalt benötigt visuelle Auswertung oder eine lokale Zuordnung.',sourceIds:[asset.id]});
 if(m.systems.length)m.issues.push({code:'element-role',message:'Native Kästen als Diagrammelemente übernommen. Ihre fachliche Rolle als System oder Prozess ist noch nicht bestätigt.',sourceIds:[]});
 if(m.workshop.length)m.issues.push({code:'unclassified-content',message:'Workshop-Inhalte bewahren den Originaltext; fachliche Klassifikation bei Bedarf ergänzen.',sourceIds:[]});
 const checked=validateModel(m);return mapping?applyMapping(checked,mapping,'manual'):checked;
}
export function applyMapping(model:Model,input:unknown,origin:Origin='manual'):Model{
 const patch=MappingSchema.parse(input);const m=structuredClone(model);
 const upsert=<T extends{id:string}>(old:T[],add:T[])=>{const map=new Map(old.map(x=>[x.id,x]));for(const x of add)map.set(x.id,x);return [...map.values()];};
 m.areas=upsert(m.areas,patch.areas);
 const sourceIds=new Set(m.source.nodes.filter(n=>n.visible).map(n=>n.id));
 for(const x of patch.assignments){if(!sourceIds.has(x.sourceId))throw new Error(`Unknown or hidden assignment source: ${x.sourceId}`);if(!m.areas.some(a=>a.id===x.areaId))throw new Error(`Unknown area reference: ${x.areaId}`);for(const key of contentKeys)for(const entry of m[key])if(entry.evidence.some(e=>e.sourceId===x.sourceId))entry.areaId=x.areaId;}
 const excluded=new Set(patch.excludeIds);
 for(const k of excluded)if(!contentKeys.some(key=>m[key].some(e=>e.id===k)))throw new Error(`Unknown excluded content ID: ${k}`);
 for(const key of contentKeys){
  const additions=patch[key].map(x=>({...x,origin}));
  if(origin==='ai'&&additions.some(x=>m[key].some(y=>y.id===x.id)))throw new Error('AI additions may not replace existing content IDs');
  // Each array retains its own schema; the merged document is validated below.
  (m[key] as any)=upsert((m[key] as {id:string}[]).filter(x=>!excluded.has(x.id)),additions);
 }
 return validateModel(m);
}
