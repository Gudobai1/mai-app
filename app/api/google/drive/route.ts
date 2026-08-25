import { NextRequest, NextResponse } from 'next/server'
import { authorizedGoogle, GOOGLE_COOKIE, sealTokens } from '../../../../lib/google'

const json=(body:unknown,status=200)=>NextResponse.json(body,{status})
const q=(value:unknown)=>encodeURIComponent(String(value??''))
const FOLDER='application/vnd.google-apps.folder'
const fields='id,name,mimeType,size,createdTime,modifiedTime,viewedByMeTime,webViewLink,webContentLink,thumbnailLink,iconLink,parents,starred,shared,trashed,driveId,description,owners(displayName,emailAddress),capabilities(canEdit,canRename,canMoveItemWithinDrive,canMoveItemOutOfDrive,canTrash,canDelete,canCopy,canDownload,canAddChildren)'

function item(file:any){
  return {
    id:file.id,name:file.name,nome:file.name,mimeType:file.mimeType,
    tipo:file.mimeType===FOLDER?'folder':file.mimeType,size:Number(file.size||0),tamanho:Number(file.size||0),
    createdTime:file.createdTime||'',modifiedTime:file.modifiedTime||'',modificado:file.modifiedTime||'',viewedByMeTime:file.viewedByMeTime||'',
    url:file.webViewLink||'',webViewLink:file.webViewLink||'',webContentLink:file.webContentLink||'',thumbnailLink:file.thumbnailLink||'',iconLink:file.iconLink||'',
    parents:file.parents||[],starred:file.starred===true,shared:file.shared===true,trashed:file.trashed===true,driveId:file.driveId||'',description:file.description||'',
    owners:file.owners||[],capabilities:file.capabilities||{},
  }
}

function escapeQuery(value:string){return value.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}

async function getMeta(g:Awaited<ReturnType<typeof authorizedGoogle>>,id:string){
  const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(id)}?supportsAllDrives=true&fields=${q(fields)}`)
  const data=await response.json()
  if(!response.ok)throw new Error(data.error?.message||'Não foi possível consultar o item')
  return data
}

async function listChildren(g:Awaited<ReturnType<typeof authorizedGoogle>>,parent:string,driveId=''){
  const params=new URLSearchParams({q:`'${escapeQuery(parent)}' in parents and trashed=false`,orderBy:'folder,name_natural',pageSize:'1000',fields:`nextPageToken,files(${fields})`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',spaces:'drive'})
  if(driveId){params.set('corpora','drive');params.set('driveId',driveId)}
  const result:any[]=[]
  let token=''
  do{
    if(token)params.set('pageToken',token);else params.delete('pageToken')
    const response=await g.fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`)
    const data=await response.json()
    if(!response.ok)throw new Error(data.error?.message||'Não foi possível listar a pasta')
    result.push(...(data.files||[]));token=String(data.nextPageToken||'')
  }while(token)
  return result
}

async function createFolder(g:Awaited<ReturnType<typeof authorizedGoogle>>,name:string,parent:string){
  const response=await g.fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=${q(fields)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name||'Nova pasta',mimeType:FOLDER,parents:[parent||'root']})})
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Não foi possível criar a pasta');return data
}

async function copyTree(g:Awaited<ReturnType<typeof authorizedGoogle>>,sourceId:string,destination:string,depth=0):Promise<any>{
  if(depth>30)throw new Error('A pasta é profunda demais para copiar')
  const source=await getMeta(g,sourceId)
  if(source.mimeType!==FOLDER){
    const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(sourceId)}/copy?supportsAllDrives=true&fields=${q(fields)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:source.name,parents:[destination||'root']})})
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||`Não foi possível copiar ${source.name}`);return data
  }
  const folder=await createFolder(g,source.name,destination||'root')
  const children=await listChildren(g,sourceId,source.driveId||'')
  for(const child of children)await copyTree(g,child.id,folder.id,depth+1)
  return folder
}

async function handler(request:NextRequest){
  try{
    const body=await request.json();const method=String(body?.method||'');const args=Array.isArray(body?.args)?body.args:[]
    const g=await authorizedGoogle(request)
    let payload:any

    if(method==='list'){
      const folderId=String(args[0]||'root');const view=String(args[1]||'meudrive');const driveId=String(args[2]||'')
      const params=new URLSearchParams({pageSize:'1000',fields:`nextPageToken,files(${fields})`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',spaces:'drive'})
      let query=`'${escapeQuery(folderId==='root'?(driveId||'root'):folderId)}' in parents and trashed=false`;let order='folder,name_natural'
      if(view==='shared'){query='sharedWithMe=true and trashed=false';order='sharedWithMeTime desc'}
      else if(view==='starred'){query='starred=true and trashed=false';order='folder,name_natural'}
      else if(view==='trash'){query='trashed=true';order='modifiedTime desc'}
      else if(view==='recent'){query='trashed=false';order='recency desc'}
      else if(view==='computers'){query="'me' in owners and trashed=false";order='modifiedTime desc'}
      params.set('q',query);params.set('orderBy',order)
      if(view==='drive'&&driveId){params.set('corpora','drive');params.set('driveId',driveId)}
      else params.set('corpora','user')
      const result:any[]=[];let token=''
      do{
        if(token)params.set('pageToken',token);else params.delete('pageToken')
        const response=await g.fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);const data=await response.json()
        if(!response.ok)throw new Error(data.error?.message||'Não foi possível acessar o Google Drive')
        result.push(...(data.files||[]));token=String(data.nextPageToken||'')
      }while(token)
      const path:any[]=[]
      if((view==='meudrive'||view==='drive')&&folderId!=='root'&&folderId!==driveId){
        let cursor=folderId
        for(let depth=0;cursor&&cursor!=='root'&&cursor!==driveId&&depth<30;depth+=1){
          const meta=await getMeta(g,cursor);path.unshift({id:meta.id,name:meta.name,nome:meta.name});cursor=meta.parents?.[0]||''
        }
      }
      payload={ok:true,view,items:result.map(item),path}
    } else if(method==='search'){
      const term=escapeQuery(String(args[0]||'').trim())
      if(!term)payload={ok:true,items:[]}
      else{
        const params=new URLSearchParams({q:`trashed=false and (name contains '${term}' or fullText contains '${term}')`,orderBy:'recency desc',pageSize:'200',fields:`files(${fields})`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',corpora:'user',spaces:'drive'})
        const response=await g.fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);const data=await response.json()
        if(!response.ok)throw new Error(data.error?.message||'Erro ao pesquisar no Drive');payload={ok:true,items:(data.files||[]).map(item)}
      }
    } else if(method==='sharedDrives'){
      const response=await g.fetch('https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name,createdTime,hidden)');const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro ao consultar drives compartilhados');payload={ok:true,drives:(data.drives||[]).filter((drive:any)=>drive.hidden!==true)}
    } else if(method==='storage'){
      const response=await g.fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota');const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro ao consultar armazenamento');payload={ok:true,used:Number(data.storageQuota?.usage||0),drive:Number(data.storageQuota?.usageInDrive||0),trash:Number(data.storageQuota?.usageInDriveTrash||0),limit:Number(data.storageQuota?.limit||0)}
    } else if(method==='mkdir'){
      payload={ok:true,item:item(await createFolder(g,String(args[0]||'Nova pasta'),String(args[1]||'root')))}
    } else if(method==='upload'){
      const dataUrl=String(args[0]||'');const name=String(args[1]||'arquivo');const mime=String(args[2]||'application/octet-stream');const parent=String(args[3]||'root')
      const base64=dataUrl.includes(',')?dataUrl.split(',')[1]:dataUrl;const boundary=`mai-drive-${crypto.randomUUID()}`
      const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[parent]})}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`
      const response=await g.fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${q(fields)}`,{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body:multipart});const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro no upload');payload={ok:true,item:item(data)}
    } else if(method==='rename'){
      const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(args[0])}?supportsAllDrives=true&fields=${q(fields)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:String(args[1]||'').trim()})});const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro ao renomear');payload={ok:true,item:item(data)}
    } else if(method==='star'){
      const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(args[0])}?supportsAllDrives=true&fields=${q(fields)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({starred:Boolean(args[1])})});const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro ao alterar favorito');payload={ok:true,item:item(data)}
    } else if(method==='move'){
      const id=String(args[0]||'');const destination=String(args[1]||'root');const meta=await getMeta(g,id);const remove=(meta.parents||[]).join(',')
      const params=new URLSearchParams({addParents:destination,supportsAllDrives:'true',fields})
      if(remove)params.set('removeParents',remove)
      const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(id)}?${params.toString()}`,{method:'PATCH'});const data=await response.json()
      if(!response.ok)throw new Error(data.error?.message||'Erro ao mover item');payload={ok:true,item:item(data)}
    } else if(method==='copy'){
      const sourceIds=(Array.isArray(args[0])?args[0]:[args[0]]).map(String).filter(Boolean);const destination=String(args[1]||'root');const copied=[]
      for(const id of sourceIds)copied.push(item(await copyTree(g,id,destination));payload={ok:true,items:copied}
    } else if(method==='trash'||method==='restore'){
      const ids=(Array.isArray(args[0])?args[0]:[args[0]]).map(String).filter(Boolean);for(const id of ids){const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(id)}?supportsAllDrives=true`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({trashed:method==='trash'})});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error?.message||'Erro ao atualizar lixeira')}}payload={ok:true}
    } else if(method==='delete'){
      const ids=(Array.isArray(args[0])?args[0]:[args[0]]).map(String).filter(Boolean);for(const id of ids){const response=await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(id)}?supportsAllDrives=true`,{method:'DELETE'});if(!response.ok&&response.status!==404){const data=await response.json().catch(()=>({}));throw new Error(data.error?.message||'Erro ao excluir definitivamente')}}payload={ok:true}
    } else if(method==='meta')payload={ok:true,item:item(await getMeta(g,String(args[0]||'')))}
    else throw new Error(`Método Drive não implementado: ${method}`)

    const response=json({payload});response.cookies.set(GOOGLE_COOKIE,sealTokens(g.tokens),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*365});return response
  }catch(error:any){return json({error:error?.message||'Erro Google Drive'},error?.message==='GOOGLE_NOT_CONNECTED'?401:500)}
}

export const POST=handler
