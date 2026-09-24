import { createEmptyFigDoc, encodeFigParts, assembleCanvasFig } from 'openfig-core';
import { zipSync, strToU8 } from 'fflate';
import { zstdCompressSync } from 'node:zlib';
export const guid = (id: number) => ({sessionID:1, localID:id});
export const file = {name:'demo.jam', sha256:'a'.repeat(64), formatVersion:106};
export const rawNode = (id:number,type:string,name:string,parent=0,extra:Record<string,unknown>={}) => ({guid:guid(id),type,name,parentIndex:{guid:guid(parent),position:String(id)},visible:true,...extra});
export function jamBytes(nodes: any[]) {
 const doc=createEmptyFigDoc();doc.message.nodeChanges=nodes;
 const parts=encodeFigParts(doc);
 const canvas=assembleCanvasFig({prelude:'fig-jam.',version:106,schemaCompressed:parts.schemaCompressed,messageCompressed:zstdCompressSync(parts.messageRaw),passThrough:[]});
 return zipSync({'canvas.fig':canvas,'meta.json':strToU8(JSON.stringify({file_name:'Demo'}))});
}
export const simpleNodes = () => [rawNode(0,'DOCUMENT','Document'),rawNode(1,'SECTION','Commerce IST'),rawNode(2,'SHAPE_WITH_TEXT','Shop',1,{nodeGenerationData:{overrides:[{textData:{characters:'Shop'}}]}}),rawNode(3,'SHAPE_WITH_TEXT','ERP',1,{textData:{characters:'ERP'}}),rawNode(4,'CONNECTOR','orders',1,{connectorStart:{endpointNodeID:guid(2)},connectorEnd:{endpointNodeID:guid(3)},connectorStartCap:'ROUND',connectorEndCap:'ARROW_LINES',nodeGenerationData:{overrides:[{textData:{characters:'Orders'}}]}})];
