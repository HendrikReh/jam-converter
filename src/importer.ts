import {readFile,stat} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync,zstdDecompressSync} from 'node:zlib';
import {unzipSync} from 'fflate';
import {parseFigBinary} from 'openfig-core';
import {SourceSchema} from './model.ts';
import type {SourceDocument,SourceFile,SourceNode,Asset,ImportedBoard} from './model.ts';

// Figma's embedded schema evolves. Keep loosely typed native fields at this boundary only.
type Raw=Record<string,any>;
const id=(g:Raw|undefined):string|undefined=>g && Number.isInteger(g.sessionID)&&Number.isInteger(g.localID)?`${g.sessionID}:${g.localID}`:undefined;
const text=(v:unknown):string=>typeof v==='string'?v:'';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const arrow=(v:unknown)=>typeof v==='string'&&(/ARROW/.test(v)||v==='TRIANGLE_FILLED');
const supported=new Set(['DOCUMENT','CANVAS','SECTION','GROUP','FRAME','TEXT','STICKY','SHAPE_WITH_TEXT','CONNECTOR','TABLE','TABLE_CELL','ROUNDED_RECTANGLE','RECTANGLE','ELLIPSE']);
function nativeText(n:Raw):string {
 if(typeof n.textData?.characters==='string')return n.textData.characters;
 return (n.nodeGenerationData?.overrides??[]).map((v:Raw)=>text(v.textData?.characters)).filter(Boolean).join('\n');
}
function table(n:Raw):string[][]|undefined {
 if(n.type!=='TABLE')return;
 const ordered=(p:Raw)=>[...(p?.entries??[])].sort((a:Raw,b:Raw)=>text(a.position)<text(b.position)?-1:1).map((e:Raw)=>id(e.id));
 const rows=ordered(n.tableRowPositions),cols=ordered(n.tableColumnPositions);
 if(!rows.length||!cols.length)return;
 if(rows.length*cols.length>100000)throw new Error('Table size limit exceeded');
 const cells=new Map<string,string>();
 for(const v of n.nodeGenerationData?.overrides??[]){const gs=v.guidPath?.guids??[];if(v.textData&&gs.length>=3)cells.set(`${id(gs[1])}/${id(gs[2])}`,text(v.textData.characters));}
 return rows.map(r=>cols.map(c=>cells.get(`${r}/${c}`)??''));
}
function images(n:Raw):string[]{
 const paints=[...(n.fillPaints??[]),...(n.nodeGenerationData?.overrides??[]).flatMap((v:Raw)=>v.fillPaints??[])];
 return [...new Set<string>(paints.filter((p:Raw)=>p.type==='IMAGE'&&p.visible!==false&&p.image?.hash).map((p:Raw)=>Buffer.from(Object.values(p.image.hash) as number[]).toString('hex')))];
}
export function normalizeNodes(raw:Raw[],file:SourceFile,assets:Asset[]):SourceDocument {
 if(!Array.isArray(raw)||raw.length>100000)throw new Error('Invalid node data or node limit exceeded');
 const diagnostics:string[]=[];const byId=new Map<string,Raw>();
 for(const n of raw){const k=id(n.guid);if(!k){diagnostics.push('Node without native ID omitted');continue;}byId.set(k,n);}
 const nodes:SourceNode[]=[];
 for(const [key,n] of byId){
  const path:Raw[]=[];let current:Raw|undefined=n;const seen=new Set<string>();
  while(current){const k=id(current.guid)!;if(seen.has(k)){diagnostics.push(`Hierarchy cycle at ${key}`);break;}seen.add(k);path.push(current);current=byId.get(id(current.parentIndex?.guid)??'');if(path.length>200)throw new Error('Hierarchy depth limit exceeded');}
  const matrix=path.reduceRight((a,c)=>{const b=c.transform??{m00:1,m01:0,m02:0,m10:0,m11:1,m12:0};return {m00:a.m00*b.m00+a.m01*b.m10,m01:a.m00*b.m01+a.m01*b.m11,m02:a.m00*b.m02+a.m01*b.m12+a.m02,m10:a.m10*b.m00+a.m11*b.m10,m11:a.m10*b.m01+a.m11*b.m11,m12:a.m10*b.m02+a.m11*b.m12+a.m12};},{m00:1,m01:0,m02:0,m10:0,m11:1,m12:0});
  const grid=table(n);const node:SourceNode={id:key,type:text(n.type),name:text(n.name),text:grid?grid.map(r=>r.join(' | ')).join('\n'):nativeText(n),parentId:id(n.parentIndex?.guid),sectionPath:path.slice(1).reverse().filter(p=>p.type==='SECTION').map(p=>id(p.guid)!),visible:path.every(p=>p.visible!==false&&p.opacity!==0&&p.phase!=='REMOVED')&&!diagnostics.includes(`Hierarchy cycle at ${key}`),position:{x:matrix.m02,y:matrix.m12},imageHashes:images(n),...(grid?{table:grid}:{}),...(n.type==='CONNECTOR'?{connector:{startId:id(n.connectorStart?.endpointNodeID),endId:id(n.connectorEnd?.endpointNodeID),startArrow:arrow(n.connectorStartCap),endArrow:arrow(n.connectorEndCap)}}:{})};
  nodes.push(node);
 }
 nodes.sort((a,b)=>a.id.localeCompare(b.id,'en'));
 for(const a of assets)a.nodeIds=nodes.filter(n=>n.imageHashes.includes(a.hash)).map(n=>n.id);
 const unknown=[...new Set(nodes.filter(n=>n.visible&&!supported.has(n.type)).map(n=>n.type))];
 if(unknown.length)diagnostics.push(`Unsupported element types: ${unknown.join(', ')}. Available text retained; visual semantics not decoded.`);
 return SourceSchema.parse({schemaVersion:1,file,nodes,assets,diagnostics});
}
export async function readJam(path:string,options:{maxBytes?:number,maxExpandedBytes?:number}={}):Promise<ImportedBoard>{
 const max=options.maxBytes??64*1024*1024,expanded=options.maxExpandedBytes??256*1024*1024;
 if((await stat(path)).size>max)throw new Error('Input size limit exceeded');
 const bytes=await readFile(path);if(bytes.length>max)throw new Error('Input size limit exceeded');
 let total=0,count=0;
 const entries=unzipSync(bytes,{filter:e=>{
  if(++count>10000)throw new Error('Archive entry limit exceeded');
  if(e.name.startsWith('/')||e.name.includes('\\')||e.name.split('/').includes('..')||/^[A-Za-z]:/.test(e.name))throw new Error('Unsafe archive path');
  total+=e.originalSize;if(total>expanded)throw new Error('Archive size limit exceeded');return true;
 }});
 const canvas=entries['canvas.fig'];if(!canvas||canvas.length<16)throw new Error('Missing or truncated canvas.fig header');
 if(Buffer.from(canvas.subarray(0,8)).toString()!=='fig-jam.')throw new Error('Unsupported format: expected FigJam');
 const view=new DataView(canvas.buffer,canvas.byteOffset,canvas.byteLength);let offset=12,index=0,decodedTotal=0;
 while(offset<canvas.length){if(offset+4>canvas.length)throw new Error('Truncated canvas chunk header');const len=view.getUint32(offset,true);offset+=4;if(len===0||offset+len>canvas.length)throw new Error('Truncated canvas chunk');const chunk=canvas.subarray(offset,offset+len);offset+=len;if(index<2){const output=index===1&&chunk[0]===0x28&&chunk[1]===0xb5&&chunk[2]===0x2f&&chunk[3]===0xfd?zstdDecompressSync(chunk,{maxOutputLength:expanded}):inflateRawSync(chunk,{maxOutputLength:expanded});decodedTotal+=output.length;if(decodedTotal>expanded)throw new Error('Canvas decompression size limit exceeded');}index++;}
 if(index<2)throw new Error('Missing canvas data chunks');
 const doc=parseFigBinary(canvas);const assets:Asset[]=[];const assetBytes=new Map<string,Uint8Array>();
 for(const [name,data]of Object.entries(entries)){if(!/^images\/[a-f0-9]{40}$/.test(name))continue;const hash=name.slice(7);const sig=Buffer.from(data.subarray(0,12));let mimeType='application/octet-stream',ext='bin';if(sig.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mimeType='image/png';ext='png';}else if(sig[0]===255&&sig[1]===216){mimeType='image/jpeg';ext='jpg';}else if(sig.toString('ascii',0,3)==='GIF'){mimeType='image/gif';ext='gif';}else if(sig.toString('ascii',8,12)==='WEBP'){mimeType='image/webp';ext='webp';}const asset={id:`image:${hash}`,hash,sha256:sha(data),mimeType,path:`assets/${hash}.${ext}`,nodeIds:[]};assets.push(asset);assetBytes.set(asset.path,data);}
 assets.sort((a,b)=>a.hash.localeCompare(b.hash));let meta:Raw={};const warnings:string[]=[];
 if(entries['meta.json'])try{meta=JSON.parse(Buffer.from(entries['meta.json']).toString());}catch{warnings.push('Invalid meta.json: metadata omitted');}
 const source=normalizeNodes(doc.nodes,{name:basename(path),sha256:sha(bytes),formatVersion:doc.header.version,...(typeof meta.file_name==='string'?{title:meta.file_name}:{}),...(typeof meta.exported_at==='string'?{exportedAt:meta.exported_at}:{})},assets);
 source.diagnostics.push(...warnings);return {source,assets:assetBytes};
}
