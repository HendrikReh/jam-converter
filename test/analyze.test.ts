import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeNodes} from '../src/importer.ts';import {analyze,applyMapping} from '../src/analyze.ts';import {validateModel} from '../src/validate.ts';import{rawNode,guid,file,simpleNodes}from'./fixtures.ts';
const source=()=>normalizeNodes(simpleNodes(),file,[]);
const ev=(sourceId:string,quote:string)=>[{sourceId,quote,region:null}];
test('keeps native edges and creates no chronology from geometry',()=>{
 const m=analyze(source());assert.equal(m.systems.length,2);assert.equal(m.relations.length,1);assert.equal(m.relations[0].direction,'forward');assert.equal(m.sequences.length,0);assert.equal(m.areas.find(a=>a.id==='area-1:1').view,'ist');
});
test('same names in distinct areas stay separate and cross-area edges survive',()=>{
 const ns=simpleNodes();ns.push(rawNode(5,'SECTION','ERP SOLL'));ns[3]=rawNode(3,'SHAPE_WITH_TEXT','Shop',5,{textData:{characters:'Shop'}});
 const m=analyze(normalizeNodes(ns,file,[]));assert.equal(m.systems.length,2);assert.notEqual(m.systems[0].areaId,m.systems[1].areaId);assert.equal(m.relations.length,1);
});
test('requirements and explicit decisions are sourced; questions remain workshop notes',()=>{
 const ns=[rawNode(1,'SECTION','Anforderungen'),rawNode(2,'STICKY','',1,{textData:{characters:'Login muss SSO unterstützen.'}}),rawNode(3,'SECTION','Entscheidungen'),rawNode(4,'STICKY','',3,{textData:{characters:'Entscheidung: OIDC verwenden.\nBegründung: bestehender Identity Provider.'}}),rawNode(5,'STICKY','',3,{textData:{characters:'Sollen wir SAML verwenden?'}})];
 const m=analyze(normalizeNodes(ns,file,[]));assert.equal(m.requirements.length,1);assert.equal(m.decisions.length,1);assert.match(m.decisions[0].rationale,/Identity Provider/);assert.equal(m.workshop.length,1);assert.equal(m.decisions[0].sourceStatus,null);
});
test('numbered messages in explicit sequence sections are ordered, not position-sorted',()=>{
 const ns=simpleNodes();ns[1]=rawNode(1,'SECTION','Sequenz Login');ns[4]={...ns[4],nodeGenerationData:{overrides:[{textData:{characters:'2. Token'}}]}};ns.push(rawNode(5,'CONNECTOR','',1,{connectorStart:{endpointNodeID:guid(3)},connectorEnd:{endpointNodeID:guid(2)},connectorEndCap:'ARROW_LINES',textData:{characters:'1. Login'}}));
 const m=analyze(normalizeNodes(ns,file,[]));assert.equal(m.sequences.length,1);assert.deepEqual(m.sequences[0].steps.map(s=>s.order),[1,2]);
 ns[5].textData.characters='2. Login';assert.equal(analyze(normalizeNodes(ns,file,[])).sequences.length,0);
});
test('mapping permits sourced additions but rejects invented citations and bad references',()=>{
 const m=analyze(source());const mapping={requirements:[{id:'req-1',areaId:m.areas[0].id,text:'Shop',status:null,owner:null,priority:null,evidence:ev('1:2','Shop')}]};
 const updated=applyMapping(m,mapping,'manual');assert.equal(updated.requirements.length,1);
 assert.throws(()=>applyMapping(m,{requirements:[{...mapping.requirements[0],evidence:ev('1:2','invented')}]},'manual'),/quote|Zitat/i);
 const bad=structuredClone(updated);bad.relations[0].to='missing';assert.throws(()=>validateModel(bad),/reference|System|target/i);
 const hidden=structuredClone(updated);hidden.source.nodes.find(n=>n.id==='1:2').visible=false;assert.throws(()=>validateModel(hidden),/hidden|sichtbar/i);
});
test('sequence mapping requires explicit order evidence and unique consecutive steps',()=>{
 const m=analyze(source());const addition={id:'seq',title:'Order',areaId:m.areas[0].id,evidence:ev('1:4','Orders'),steps:[{order:1,from:m.systems[0].id,to:m.systems[1].id,message:'Orders',evidence:ev('1:4','Orders')}]};
 assert.throws(()=>applyMapping(m,{sequences:[addition]},'manual'),/order|Reihenfolge/i);
});
test('whitespace-only native connector labels fall back to their source name',()=>{
 const ns=simpleNodes();ns[4]={...ns[4],nodeGenerationData:{overrides:[{textData:{characters:'\n '}}]}};
 const m=analyze(normalizeNodes(ns,file,[]));assert.equal(m.relations.length,1);assert.equal(m.relations[0].evidence[0].quote,'orders');
});
test('empty sticky placeholder names do not become workshop content',()=>{
 const m=analyze(normalizeNodes([rawNode(2,'STICKY','Sticky',0,{textData:{characters:' '}})],file,[]));assert.equal(m.workshop.length,0);
});
