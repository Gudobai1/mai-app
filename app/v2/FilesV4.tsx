'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { MaiState } from '../../lib/v2/state'
import { MaiIcon } from './MaiIcons'

type Row=Record<string,any>
type Commit=(change:(current:MaiState)=>MaiState)=>void
type DriveView='meudrive'|'computers'|'shared'|'recent'|'starred'|'trash'|'drive'
type Clipboard={mode:'copy'|'cut';items:Row[]}|null

type Props={state:MaiState;commit:Commit;createRequest?:string}
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[]
const FOLDER='application/vnd.google-apps.folder'
const viewLabels:Record<DriveView,string>={meudrive:'Meu Drive',computers:'Computadores',shared:'Compartilhados comigo',recent:'Recentes',starred:'Com estrela',trash:'Lixeira',drive:'Drive compartilhado'}

async function driveCall(method:string,args:unknown[]=[]){
  const response=await fetch('/api/google/drive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,args})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'Não foi possível acessar o Google Drive')
  return data.payload
}

function isFolder(item:Row){return item.tipo==='folder'||item.mimeType===FOLDER}
function fileIcon(item:Row){
  if(isFolder(item))return'folder'
  const mime=String(item.mimeType||item.tipo||'')
  if(mime.includes('image'))return'image'
  if(mime.includes('pdf'))return'picture_as_pdf'
  if(mime.includes('spreadsheet')||mime.includes('excel'))return'table_view'
  if(mime.includes('presentation')||mime.includes('powerpoint'))return'slideshow'
  if(mime.includes('document')||mime.includes('word')||mime.includes('text'))return'description'
  if(mime.includes('video'))return'movie'
  if(mime.includes('audio'))return'audio_file'
  if(mime.includes('zip')||mime.includes('compressed'))return'folder_zip'
  return'files'
}
function bytes(value:unknown){
  const size=Number(value||0);if(!size)return'—';const units=['B','KB','MB','GB','TB'];let n=size,i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return`${n>=10||i===0?n.toFixed(0):n.toFixed(1)} ${units[i]}`
}
function dateLabel(value:unknown){const raw=String(value||'');if(!raw)return'—';const d=new Date(raw);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}

export function FilesV4({state,commit,createRequest}:Props){
  const savedView=String(state.configs.filesLocation||'meudrive') as DriveView
  const initialView=(['meudrive','computers','shared','recent','starred','trash','drive'] as string[]).includes(savedView)?savedView:'meudrive'
  const [view,setView]=useState<DriveView>(initialView)
  const [driveId,setDriveId]=useState(String(state.configs.filesDriveId||''))
  const [folderId,setFolderId]=useState('root')
  const [path,setPath]=useState<Row[]>([])
  const [items,setItems]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [clipboard,setClipboard]=useState<Clipboard>(null)
  const [sharedDrives,setSharedDrives]=useState<Row[]>([])
  const [storage,setStorage]=useState<Row>({})
  const [sort,setSort]=useState<'name'|'modified'|'size'>('name')
  const [context,setContext]=useState<{x:number;y:number;item:Row}|null>(null)
  const [newFolder,setNewFolder]=useState(false)
  const [folderName,setFolderName]=useState('Nova pasta')
  const [moveDialog,setMoveDialog]=useState<{ids:string[];folder:string;driveId:string;view:'meudrive'|'drive'}|null>(null)
  const [pickerFolders,setPickerFolders]=useState<Row[]>([])
  const [pickerPath,setPickerPath]=useState<Row[]>([])
  const inputRef=useRef<HTMLInputElement>(null)
  const dragIds=useRef<string[]>([])
  const layout=state.configs.filesLayout==='grid'?'grid':'list'
  const moduleFilters=state.configs.moduleFilters&&typeof state.configs.moduleFilters==='object'?state.configs.moduleFilters as Record<string,Row>:{}
  const fileKind=String(moduleFilters.files?.kind||'all')
  const canWrite=view==='meudrive'||view==='drive'
  const currentParent=view==='drive'?(folderId==='root'?driveId:folderId):folderId

  const visibleItems=useMemo(()=>items.filter(item=>fileKind==='all'||(fileKind==='folder'?isFolder(item):!isFolder(item))).sort((a,b)=>{
    if(isFolder(a)!==isFolder(b))return isFolder(a)?-1:1
    if(sort==='modified')return String(b.modifiedTime||b.modificado||'').localeCompare(String(a.modifiedTime||a.modificado||''))||String(a.name||'').localeCompare(String(b.name||''),'pt-BR')
    if(sort==='size')return Number(b.size||b.tamanho||0)-Number(a.size||a.tamanho||0)||String(a.name||'').localeCompare(String(b.name||''),'pt-BR')
    return String(a.name||a.nome||'').localeCompare(String(b.name||b.nome||''),'pt-BR',{numeric:true,sensitivity:'base'})
  }),[items,sort,fileKind])
  const selectedItems=useMemo(()=>visibleItems.filter(item=>selected.has(String(item.id))),[visibleItems,selected])
  const one=selectedItems.length===1?selectedItems[0]:null

  async function load(){
    setLoading(true);setError('')
    try{
      const response=await driveCall('list',[folderId,view,driveId]);setItems(rows(response?.items));setPath(rows(response?.path));setSelected(new Set())
    }catch(error:any){setError(error?.message||'Não foi possível acessar os arquivos.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void Promise.all([
    driveCall('sharedDrives').then(r=>setSharedDrives(rows(r?.drives))).catch(()=>setSharedDrives([])),
    driveCall('storage').then(r=>setStorage(r||{})).catch(()=>setStorage({})),
  ])},[])
  useEffect(()=>{if(!query.trim())void load()},[view,driveId,folderId])
  useEffect(()=>{
    const term=query.trim();if(!term){void load();return}
    const timer=window.setTimeout(()=>{setLoading(true);setError('');driveCall('search',[term]).then(r=>{setItems(rows(r?.items));setPath([]);setSelected(new Set())}).catch((e:any)=>setError(e?.message||'Erro na pesquisa')).finally(()=>setLoading(false))},260)
    return()=>window.clearTimeout(timer)
  },[query])
  useEffect(()=>{if(createRequest?.startsWith('files:'))inputRef.current?.click()},[createRequest])
  useEffect(()=>{const close=()=>setContext(null);window.addEventListener('click',close);return()=>window.removeEventListener('click',close)},[])

  function changeLocation(next:DriveView,nextDriveId=''){
    setView(next);setDriveId(nextDriveId);setFolderId('root');setPath([]);setQuery('');setContext(null);setSelected(new Set())
    commit(current=>({...current,configs:{...current.configs,filesLocation:next,filesDriveId:nextDriveId}}))
  }
  function openFolder(item:Row){
    const itemDrive=String(item.driveId||'')
    if(itemDrive){setView('drive');setDriveId(itemDrive)}else if(view!=='drive')setView('meudrive')
    setFolderId(String(item.id));setQuery('');setSelected(new Set())
  }
  function openItem(item:Row){if(isFolder(item)){openFolder(item);return}const url=String(item.webViewLink||item.url||item.webContentLink||'');if(url)window.open(url,'_blank','noopener,noreferrer')}
  function clickItem(event:MouseEvent<HTMLElement>,item:Row){
    const id=String(item.id);setContext(null)
    if(event.ctrlKey||event.metaKey){setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})}
    else setSelected(new Set([id]))
  }
  function clearSelection(){setSelected(new Set());setContext(null)}
  function updateLayout(next:'list'|'grid'){commit(current=>({...current,configs:{...current.configs,filesLayout:next}}))}

  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(error:any){setError(error?.message||'Não foi possível concluir a ação.')}finally{setBusy(false)}}
  async function uploadFiles(files:FileList|File[]|null,target=currentParent||'root'){
    if(!files||!files.length)return
    await run(async()=>{for(const file of Array.from(files)){const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=reject;reader.readAsDataURL(file)});await driveCall('upload',[data,file.name,file.type||'application/octet-stream',target])}await load()})
    if(inputRef.current)inputRef.current.value=''
  }
  async function makeFolder(){
    const name=folderName.trim();if(!name)return
    await run(async()=>{await driveCall('mkdir',[name,canWrite?currentParent||'root':'root']);setNewFolder(false);setFolderName('Nova pasta');if(canWrite)await load()})
  }
  async function rename(item=one){if(!item)return;const name=window.prompt('Novo nome:',String(item.name||item.nome||''));if(!name?.trim())return;await run(async()=>{await driveCall('rename',[item.id,name.trim()]);await load()})}
  async function star(itemsToUse=selectedItems){if(!itemsToUse.length)return;const next=!itemsToUse.every(item=>item.starred===true);await run(async()=>{for(const item of itemsToUse)await driveCall('star',[item.id,next]);await load()})}
  function copy(mode:'copy'|'cut',itemsToUse=selectedItems){if(!itemsToUse.length)return;setClipboard({mode,items:itemsToUse});setContext(null)}
  async function paste(){if(!clipboard?.items.length)return;const destination=canWrite?currentParent||'root':'root';await run(async()=>{if(clipboard.mode==='copy')await driveCall('copy',[clipboard.items.map(item=>item.id),destination]);else{for(const item of clipboard.items)await driveCall('move',[item.id,destination]);setClipboard(null)}await load()})}
  async function trash(itemsToUse=selectedItems){if(!itemsToUse.length)return;await run(async()=>{await driveCall('trash',[itemsToUse.map(item=>item.id)]);await load()})}
  async function restore(itemsToUse=selectedItems){if(!itemsToUse.length)return;await run(async()=>{await driveCall('restore',[itemsToUse.map(item=>item.id)]);await load()})}
  async function deleteForever(itemsToUse=selectedItems){if(!itemsToUse.length||!window.confirm(`Excluir definitivamente ${itemsToUse.length===1?'este item':`${itemsToUse.length} itens`}? Esta ação não pode ser desfeita.`))return;await run(async()=>{await driveCall('delete',[itemsToUse.map(item=>item.id)]);await load()})}

  async function loadPicker(folder:string,pickerDriveId:string,pickerView:'meudrive'|'drive'){
    const response=await driveCall('list',[folder,pickerView,pickerDriveId]);setPickerFolders(rows(response?.items).filter(isFolder));setPickerPath(rows(response?.path))
  }
  function openMove(itemsToUse=selectedItems){if(!itemsToUse.length)return;const next={ids:itemsToUse.map(item=>String(item.id)),folder:'root',driveId:'',view:'meudrive' as const};setMoveDialog(next);void loadPicker('root','','meudrive')}
  function pickerLocation(folder:string,pickerDriveId:string,pickerView:'meudrive'|'drive'){
    setMoveDialog(current=>current?{...current,folder,driveId:pickerDriveId,view:pickerView}:current);void loadPicker(folder,pickerDriveId,pickerView)
  }
  async function confirmMove(){if(!moveDialog)return;const destination=moveDialog.view==='drive'&&moveDialog.folder==='root'?moveDialog.driveId:moveDialog.folder;await run(async()=>{for(const id of moveDialog.ids)await driveCall('move',[id,destination||'root']);setMoveDialog(null);await load()})}
  async function moveDropped(ids:string[],destination:string){if(!ids.length)return;await run(async()=>{for(const id of ids)if(id!==destination)await driveCall('move',[id,destination]);await load()})}

  function startDrag(item:Row){const ids=selected.has(String(item.id))?[...selected]:[String(item.id)];dragIds.current=ids;if(!selected.has(String(item.id)))setSelected(new Set(ids))}
  function dropOnFolder(event:any,item:Row){
    event.preventDefault();event.stopPropagation();if(!isFolder(item))return
    if(event.dataTransfer?.files?.length){void uploadFiles(event.dataTransfer.files,String(item.id));return}
    void moveDropped(dragIds.current,String(item.id))
  }
  function dropRoot(event:any,target:string){event.preventDefault();if(event.dataTransfer?.files?.length){void uploadFiles(event.dataTransfer.files,target);return}void moveDropped(dragIds.current,target)}

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;const editing=target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName||'')
      if(editing)return
      const mod=event.ctrlKey||event.metaKey
      if(mod&&event.key.toLowerCase()==='a'){event.preventDefault();setSelected(new Set(visibleItems.map(item=>String(item.id))))}
      if(mod&&event.key.toLowerCase()==='c'&&selectedItems.length){event.preventDefault();copy('copy')}
      if(mod&&event.key.toLowerCase()==='x'&&selectedItems.length){event.preventDefault();copy('cut')}
      if(mod&&event.key.toLowerCase()==='v'&&clipboard){event.preventDefault();void paste()}
      if(event.key==='Delete'&&selectedItems.length){event.preventDefault();view==='trash'?void deleteForever():void trash()}
      if(event.key==='F2'&&one){event.preventDefault();void rename()}
      if(event.key==='Enter'&&one){event.preventDefault();openItem(one)}
      if(event.key==='Escape')clearSelection()
    }
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
  },[visibleItems,selectedItems,clipboard,view,one,currentParent])

  const title=query.trim()?`Pesquisa: ${query.trim()}`:view==='drive'?(sharedDrives.find(d=>String(d.id)===driveId)?.name||'Drive compartilhado'):viewLabels[view]
  const storagePct=storage.limit?Math.min(100,Math.round(Number(storage.used||0)/Number(storage.limit)*100)):0

  return <div className="mai-drive-v4" onClick={()=>setContext(null)} onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault()}} onDrop={event=>{if(event.dataTransfer.files?.length){event.preventDefault();void uploadFiles(event.dataTransfer.files,canWrite?currentParent||'root':'root')}}}>
    <aside className="mai-drive-v4-sidebar">
      <button className="mai-drive-new" onClick={()=>setNewFolder(true)}><span className="material-symbols-rounded">add</span><span>Novo</span></button>
      <nav>
        <button data-active={view==='meudrive'} onClick={()=>changeLocation('meudrive')} onDragOver={e=>e.preventDefault()} onDrop={e=>dropRoot(e,'root')}><MaiIcon name="files" size={17}/><span>Meu Drive</span></button>
        <button data-active={view==='computers'} onClick={()=>changeLocation('computers')}><span className="material-symbols-rounded">computer</span><span>Computadores</span></button>
        <button data-active={view==='shared'} onClick={()=>changeLocation('shared')}><span className="material-symbols-rounded">group</span><span>Compartilhados comigo</span></button>
        <button data-active={view==='recent'} onClick={()=>changeLocation('recent')}><span className="material-symbols-rounded">schedule</span><span>Recentes</span></button>
        <button data-active={view==='starred'} onClick={()=>changeLocation('starred')}><span className="material-symbols-rounded">star</span><span>Com estrela</span></button>
        <button data-active={view==='trash'} onClick={()=>changeLocation('trash')}><span className="material-symbols-rounded">delete</span><span>Lixeira</span></button>
      </nav>
      {sharedDrives.length?<section><strong>Drives compartilhados</strong>{sharedDrives.map(drive=><button key={String(drive.id)} data-active={view==='drive'&&driveId===String(drive.id)} onClick={()=>changeLocation('drive',String(drive.id))} onDragOver={e=>e.preventDefault()} onDrop={e=>dropRoot(e,String(drive.id))}><span className="material-symbols-rounded">corporate_fare</span><span>{String(drive.name||'Drive')}</span></button>)}</section>:null}
      <div className="mai-drive-storage"><span><b>Armazenamento</b><small>{bytes(storage.used)}{storage.limit?` de ${bytes(storage.limit)}`:''}</small></span><i><b style={{width:`${storagePct}%`}}/></i></div>
    </aside>

    <main className="mai-drive-v4-main">
      <header className="mai-drive-v4-head">
        <div className="mai-drive-title"><h1>{title}</h1>{view==='computers'?<p>A API do Google Drive não oferece a coleção “Computadores” como uma pasta navegável; esta visão reúne os itens da conta ordenados por atividade.</p>:null}</div>
        <div className="mai-drive-search"><span className="material-symbols-rounded">search</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar no Drive"/></div>
      </header>

      {!query.trim()&&(view==='meudrive'||view==='drive')?<div className="mai-drive-breadcrumbs">
        <button onClick={()=>{setFolderId('root');setPath([])}}>{view==='drive'?(sharedDrives.find(d=>String(d.id)===driveId)?.name||'Drive'):'Meu Drive'}</button>
        {path.map((part,index)=><span key={String(part.id)}><b>›</b><button onClick={()=>{setFolderId(String(part.id));setPath(path.slice(0,index+1))}}>{String(part.name||part.nome)}</button></span>)}
      </div>:null}

      <div className="mai-drive-toolbar">
        <div>{selectedItems.length?<><strong>{selectedItems.length} selecionado{selectedItems.length>1?'s':''}</strong>{one?<button onClick={()=>openItem(one)} title="Abrir/editar"><span className="material-symbols-rounded">open_in_new</span></button>:null}{one?<button onClick={()=>void rename()} title="Renomear"><span className="material-symbols-rounded">edit</span></button>:null}<button onClick={()=>copy('cut')} title="Recortar"><span className="material-symbols-rounded">content_cut</span></button><button onClick={()=>copy('copy')} title="Copiar"><span className="material-symbols-rounded">content_copy</span></button><button onClick={()=>openMove()} title="Mover"><span className="material-symbols-rounded">drive_file_move</span></button><button onClick={()=>void star()} title="Adicionar/remover estrela"><span className="material-symbols-rounded">star</span></button>{view==='trash'?<><button onClick={()=>void restore()} title="Restaurar"><span className="material-symbols-rounded">restore_from_trash</span></button><button onClick={()=>void deleteForever()} title="Excluir definitivamente"><span className="material-symbols-rounded">delete_forever</span></button></>:<button onClick={()=>void trash()} title="Mover para lixeira"><span className="material-symbols-rounded">delete</span></button>}<button onClick={clearSelection} title="Limpar seleção"><span className="material-symbols-rounded">close</span></button></>:<><button onClick={()=>inputRef.current?.click()}><span className="material-symbols-rounded">upload</span><span>Enviar arquivo</span></button><button onClick={()=>setNewFolder(true)}><span className="material-symbols-rounded">create_new_folder</span><span>Nova pasta</span></button></>}</div>
        <div>{clipboard?<button className="mai-drive-paste" onClick={()=>void paste()}><span className="material-symbols-rounded">content_paste</span><span>Colar {clipboard.items.length}</span></button>:null}<select aria-label="Ordenar" value={sort} onChange={event=>setSort(event.target.value as any)}><option value="name">Nome</option><option value="modified">Modificado</option><option value="size">Tamanho</option></select><span className="mai-drive-layout"><button data-active={layout==='list'} onClick={()=>updateLayout('list')} title="Lista"><span className="material-symbols-rounded">view_list</span></button><button data-active={layout==='grid'} onClick={()=>updateLayout('grid')} title="Grade"><span className="material-symbols-rounded">grid_view</span></button></span></div>
      </div>

      <input ref={inputRef} type="file" multiple hidden onChange={event=>void uploadFiles(event.target.files,canWrite?currentParent||'root':'root')}/>
      {error?<div className="mai-drive-error"><span className="material-symbols-rounded">error</span><span>{error}</span><button onClick={()=>setError('')}>×</button></div>:null}
      {busy?<div className="mai-drive-busy">Atualizando o Google Drive…</div>:null}

      <section className={`mai-drive-content mai-drive-${layout}`} onClick={event=>{if(event.currentTarget===event.target)clearSelection()}}>
        {layout==='list'?<header><span>Nome</span><span>Proprietário</span><span>Última modificação</span><span>Tamanho</span><span/></header>:null}
        {loading?<div className="mai-drive-empty">Carregando arquivos…</div>:visibleItems.map(item=><article key={String(item.id)} draggable={view!=='trash'} data-selected={selected.has(String(item.id))} data-cut={clipboard?.mode==='cut'&&clipboard.items.some(clip=>String(clip.id)===String(item.id))} onDragStart={()=>startDrag(item)} onDragOver={event=>{if(isFolder(item))event.preventDefault()}} onDrop={event=>dropOnFolder(event,item)} onClick={event=>{event.stopPropagation();clickItem(event,item)}} onDoubleClick={()=>openItem(item)} onContextMenu={event=>{event.preventDefault();event.stopPropagation();if(!selected.has(String(item.id)))setSelected(new Set([String(item.id)]));setContext({x:event.clientX,y:event.clientY,item})}}>
          <span className="mai-drive-file-name"><i><span className="material-symbols-rounded">{fileIcon(item)}</span></i><span><strong>{String(item.name||item.nome||'Arquivo')}</strong>{layout==='grid'?<small>{isFolder(item)?'Pasta':dateLabel(item.modifiedTime||item.modificado)}</small>:null}</span>{item.starred?<span className="material-symbols-rounded mai-drive-star">star</span>:null}{item.shared?<span className="material-symbols-rounded mai-drive-shared">group</span>:null}</span>
          {layout==='list'?<><span>{String(item.owners?.[0]?.displayName||item.owners?.[0]?.emailAddress||(item.shared?'Compartilhado':'Eu'))}</span><span>{dateLabel(item.modifiedTime||item.modificado)}</span><span>{isFolder(item)?'—':bytes(item.size||item.tamanho)}</span><button aria-label="Mais ações" onClick={event=>{event.stopPropagation();setContext({x:event.clientX,y:event.clientY,item})}}><span className="material-symbols-rounded">more_vert</span></button></>:null}
        </article>)}
        {!loading&&!visibleItems.length?<div className="mai-drive-empty"><span className="material-symbols-rounded">folder_open</span><strong>{query.trim()?'Nenhum resultado':'Nenhum arquivo aqui'}</strong><small>{query.trim()?'Tente outro termo de pesquisa.':'Arraste arquivos para cá ou use “Enviar arquivo”.'}</small></div>:null}
      </section>
    </main>

    {context?<div className="mai-drive-context" style={{left:Math.min(context.x,window.innerWidth-230),top:Math.min(context.y,window.innerHeight-360)}} onClick={event=>event.stopPropagation()}>
      <button onClick={()=>{openItem(context.item);setContext(null)}}><span className="material-symbols-rounded">open_in_new</span>Abrir / editar</button>
      <button onClick={()=>void rename(context.item)}><span className="material-symbols-rounded">edit</span>Renomear</button>
      <button onClick={()=>void star([context.item])}><span className="material-symbols-rounded">star</span>{context.item.starred?'Remover estrela':'Adicionar estrela'}</button>
      <hr/>
      <button onClick={()=>copy('cut',[context.item])}><span className="material-symbols-rounded">content_cut</span>Recortar</button>
      <button onClick={()=>copy('copy',[context.item])}><span className="material-symbols-rounded">content_copy</span>Copiar</button>
      <button onClick={()=>openMove([context.item])}><span className="material-symbols-rounded">drive_file_move</span>Mover para</button>
      <hr/>
      {view==='trash'?<><button onClick={()=>void restore([context.item])}><span className="material-symbols-rounded">restore_from_trash</span>Restaurar</button><button className="danger" onClick={()=>void deleteForever([context.item])}><span className="material-symbols-rounded">delete_forever</span>Excluir definitivamente</button></>:<button className="danger" onClick={()=>void trash([context.item])}><span className="material-symbols-rounded">delete</span>Mover para lixeira</button>}
    </div>:null}

    {newFolder?<div className="mai-drive-modal-layer" onMouseDown={()=>setNewFolder(false)}><form className="mai-drive-modal" onMouseDown={event=>event.stopPropagation()} onSubmit={event=>{event.preventDefault();void makeFolder()}}><header><strong>Nova pasta</strong><button type="button" onClick={()=>setNewFolder(false)}>×</button></header><input autoFocus value={folderName} onChange={event=>setFolderName(event.target.value)} onFocus={event=>event.target.select()}/><footer><button type="button" onClick={()=>setNewFolder(false)}>Cancelar</button><button disabled={!folderName.trim()||busy}>Criar</button></footer></form></div>:null}

    {moveDialog?<div className="mai-drive-modal-layer" onMouseDown={()=>setMoveDialog(null)}><section className="mai-drive-move-modal" onMouseDown={event=>event.stopPropagation()}><header><div><strong>Mover {moveDialog.ids.length===1?'item':`${moveDialog.ids.length} itens`}</strong><small>Escolha a pasta de destino</small></div><button onClick={()=>setMoveDialog(null)}>×</button></header><nav><button data-active={moveDialog.view==='meudrive'} onClick={()=>pickerLocation('root','','meudrive')}>Meu Drive</button>{sharedDrives.map(d=><button key={String(d.id)} data-active={moveDialog.view==='drive'&&moveDialog.driveId===String(d.id)} onClick={()=>pickerLocation('root',String(d.id),'drive')}>{String(d.name)}</button>)}</nav><div className="mai-drive-picker-path"><button onClick={()=>pickerLocation('root',moveDialog.driveId,moveDialog.view)}>Raiz</button>{pickerPath.map(part=><span key={String(part.id)}><b>›</b><button onClick={()=>pickerLocation(String(part.id),moveDialog.driveId,moveDialog.view)}>{String(part.name||part.nome)}</button></span>)}</div><div className="mai-drive-picker-list">{pickerFolders.map(folder=><button key={String(folder.id)} onDoubleClick={()=>pickerLocation(String(folder.id),moveDialog.driveId,moveDialog.view)} onClick={()=>pickerLocation(String(folder.id),moveDialog.driveId,moveDialog.view)}><span className="material-symbols-rounded">folder</span><span>{String(folder.name||folder.nome)}</span><span className="material-symbols-rounded">chevron_right</span></button>)}{!pickerFolders.length?<small>Nenhuma subpasta.</small>:null}</div><footer><button onClick={()=>setMoveDialog(null)}>Cancelar</button><button onClick={()=>void confirmMove()} disabled={busy}>Mover para cá</button></footer></section></div>:null}
  </div>
}
