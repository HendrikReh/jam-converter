import {createHash}from'node:crypto';
import{validateModel}from'./validate.ts';
import type{Model,Evidence}from'./model.ts';
export const token=(s:string)=>'n_'+createHash('sha256').update(s).digest('hex').slice(0,16);
const md=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_[\]{}()#+.!|~-]/g,'\\$&');
const line=(s:string)=>md(s).replace(/[\r\n\u2028\u2029]+/g,' ');
const cell=(s:string|null)=>s?md(s).replace(/[\r\n\u2028\u2029]+/g,'<br>'):'nicht dokumentiert';
const mm=(s:string)=>s.replace(/[&"#|:;<>\[\]{}()\\`%]/g,c=>`#${c.charCodeAt(0)};`).replace(/[\r\n\u2028\u2029]+/g,'<br/>');
const refs=(es:Evidence[],prefix='')=>[...new Set(es.map(e=>`[${line(e.sourceId)}](${prefix}sources.md#${token(e.sourceId)})`))].join(', ');
const attribution=(s:{origin:string})=>s.origin==='ai'?'KI-Vorschlag':s.origin==='manual'?'Lokale Zuordnung':s.origin==='native'?'Native Extraktion':'Regelbasierte Zuordnung';
export function renderFiles(input:Model):Map<string,string>{
 const m=validateModel(input),files=new Map<string,string>();const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
 files.set('model.json',json(m));files.set('sources.json',json(m.source));
 const systemMap=new Map(m.systems.map(s=>[s.id,s]));
 const overview=[`# ${line(m.source.file.title??m.source.file.name)}`,`Quelle: ${line(m.source.file.name)} · SHA-256: ${m.source.file.sha256}`,`Diese Ausgabe rekonstruiert Boardinhalte. Fachliche Rollen und KI-Vorschläge benötigen Prüfung. ADRs sind Entwürfe.`,`[Anforderungen](requirements.md) · [Workshop-Ergebnisse](workshop-results.md) · [Prüfbericht](review.md) · [Quellen](sources.md) · [Modell](model.json)`,`| Inhalt | Anzahl |\n| --- | ---: |\n| Diagrammelemente | ${m.systems.length} |\n| Beziehungen | ${m.relations.length} |\n| Sequenzen | ${m.sequences.length} |\n| Anforderungen | ${m.requirements.length} |\n| Workshop-Einträge | ${m.workshop.length} |\n| ADR-Entwürfe | ${m.decisions.length} |`];
 for(const area of m.areas){
  const own=m.systems.filter(s=>s.areaId===area.id),ownIds=new Set(own.map(s=>s.id));
  const rels=m.relations.filter(r=>r.areaId===area.id||ownIds.has(r.from)||ownIds.has(r.to));
  const ids=new Set([...ownIds,...rels.flatMap(r=>[r.from,r.to])]);if(!ids.size)continue;
  const lines=['flowchart LR'];
  for(const id of [...ids].sort()){const s=systemMap.get(id)!;const suffix=s.areaId!==area.id?' · extern':'';const proposal=s.origin==='ai'?' · KI-Vorschlag':'';lines.push(`  ${token(s.id)}["${mm(s.name+suffix+proposal)}"]`);}
  for(const r of rels){const edge=r.direction==='both'?'<-->':r.direction==='none'?'---':'-->';lines.push(`  ${token(r.from)} ${edge}${r.label?`|"${mm(r.label)}"|`:''} ${token(r.to)}`);}
  const diagram=lines.join('\n')+'\n',path=`diagrams/${token(area.id)}-${area.view}.mmd`;files.set(path,diagram);
  overview.push(`## ${line(area.title)} (${area.view})`,`[Mermaid-Datei](${path})`,`\`\`\`mermaid\n${diagram}\`\`\``,`Quellen: ${refs(rels.flatMap(r=>r.evidence).concat(own.flatMap(s=>s.evidence)))}`);
 }
 for(const seq of m.sequences){const ids=[...new Set(seq.steps.flatMap(s=>[s.from,s.to]))];const lines=['sequenceDiagram'];for(const id of ids)lines.push(`  participant ${token(id)} as ${mm(systemMap.get(id)!.name)}`);for(const s of seq.steps)lines.push(`  ${token(s.from)}->>${token(s.to)}: ${s.order}. ${mm(s.message)}`);const diagram=lines.join('\n')+'\n',path=`sequences/${token(seq.id)}.mmd`;files.set(path,diagram);overview.push(`## ${line(seq.title)} — Sequenz`,`${attribution(seq)} · [Mermaid-Datei](${path})`,`\`\`\`mermaid\n${diagram}\`\`\``,`Quellen: ${refs(seq.evidence)}`);}
 const requirements=['# Anforderungen'];
 for(const a of m.areas){const notes=m.requirements.filter(n=>n.areaId===a.id);if(!notes.length)continue;requirements.push(`## ${line(a.title)}`,'| ID | Anforderung | Status | Verantwortlich | Priorität | Herkunft | Quellen |\n| --- | --- | --- | --- | --- | --- | --- |',...notes.map(n=>`| ${line(n.id)} | ${cell(n.text)} | ${cell(n.status)} | ${cell(n.owner)} | ${cell(n.priority)} | ${attribution(n)} | ${refs(n.evidence)} |`));}
 if(!m.requirements.length)requirements.push('Keine eindeutig klassifizierten Anforderungen. Unzugeordnete Texte stehen in den Workshop-Ergebnissen.');files.set('requirements.md',requirements.join('\n\n')+'\n');
 const workshop=['# Workshop-Ergebnisse'];
 for(const a of m.areas){const notes=m.workshop.filter(n=>n.areaId===a.id);if(!notes.length)continue;workshop.push(`## ${line(a.title)}`);for(const n of notes){const source=m.source.nodes.find(s=>n.evidence.length===1&&s.id===n.evidence[0]?.sourceId);workshop.push(`### ${line(n.id)}`,`${attribution(n)} · Quellen: ${refs(n.evidence)}`);if(source?.table?.length){const [header,...rows]=source.table;workshop.push(['| '+header!.map(c=>cell(c)).join(' | ')+' |','| '+header!.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.map(c=>cell(c)).join(' | ')+' |')].join('\n'));}else workshop.push(md(n.text));}}
 if(!m.workshop.length)workshop.push('Keine Workshop-Einträge erkannt.');files.set('workshop-results.md',workshop.join('\n\n')+'\n');
 for(const d of m.decisions){const path=`adrs/adr-${token(d.id)}.md`;files.set(path,[`# ${line(d.title)}`,'Status: **Entwurf zur Prüfung**',`Herkunft: ${attribution(d)}`,`Status laut Quelle: ${cell(d.sourceStatus)}`,'## Kontext',cell(d.context),'## Entscheidung',cell(d.decision),'## Begründung',cell(d.rationale),'## Dokumentierte Folgen',cell(d.consequences),'## Quellen',refs(d.evidence,'../')].join('\n\n')+'\n');overview.push(`- [ADR-Entwurf: ${line(d.title)}](${path})`);}
 if(!m.sequences.length)overview.push('Keine Sequenz mit eindeutig belegter Reihenfolge erkannt.');if(!m.decisions.length)overview.push('Keine explizite Architekturentscheidung erkannt; keine ADR-Datei erzeugt.');files.set('README.md',overview.join('\n\n')+'\n');
 const sources=['# Quellen',`Datei: ${line(m.source.file.name)} · SHA-256: ${m.source.file.sha256}`];
 for(const n of m.source.nodes){sources.push(`<a id="${token(n.id)}"></a>`,`## ${line(n.id)} · ${line(n.type)}`,`Name: ${line(n.name)} · Sichtbar: ${n.visible?'ja':'nein'}`,md(n.text||'(kein Text)'));}
 for(const a of m.source.assets){sources.push(`<a id="${token(a.id)}"></a>`,`## ${line(a.id)}`,`[Bilddatei](${a.path}) · SHA-256: ${a.sha256}`);if(a.mimeType.startsWith('image/'))sources.push(`![Eingebettetes Bild](${a.path})`);}
 files.set('sources.md',sources.join('\n\n')+'\n');
 files.set('review.md',['# Prüfbericht',`Native Elemente: ${m.source.nodes.length}; sichtbar: ${m.source.nodes.filter(n=>n.visible).length}; eingebettete Dateien: ${m.source.assets.length}.`,`${m.systems.length} Diagrammelemente, ${m.relations.length} Beziehungen, ${m.sequences.length} Sequenzen und ${m.decisions.length} ADR-Entwürfe.`,...m.issues.map(i=>`- **${line(i.code)}:** ${line(i.message)} ${i.sourceIds.length?refs(i.sourceIds.map(sourceId=>({sourceId,quote:null,region:null}))):''}`),'KI-Auswertungen bleiben Vorschläge. Quellenprüfungen bestätigen Referenzen und wörtliche Textbelege, nicht die fachliche Richtigkeit einer Interpretation.'].join('\n\n')+'\n');
 return files;
}
