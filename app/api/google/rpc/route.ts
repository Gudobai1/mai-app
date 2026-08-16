import { NextRequest, NextResponse } from 'next/server'
import { authorizedGoogle, GOOGLE_COOKIE, sealTokens } from '../../../../lib/google'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
const q = (value: unknown) => encodeURIComponent(String(value ?? ''))
const dateOnly = (value: unknown) => String(value || '').slice(0, 10)

async function drive(method: string, args: unknown[], g: Awaited<ReturnType<typeof authorizedGoogle>>) {
  if (method === 'getDriveContent') {
    const folderId = String(args[0] || 'root')
    const parent = folderId === 'root' ? 'root' : folderId
    const fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents),nextPageToken'
    const url = `https://www.googleapis.com/drive/v3/files?q=${q(`'${parent}' in parents and trashed=false`)}&orderBy=folder,name&pageSize=200&fields=${q(fields)}`
    const response = await g.fetch(url)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Erro ao consultar o Drive')
    const items = (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      nome: file.name,
      tipo: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : file.mimeType,
      tamanho: Number(file.size || 0),
      modificado: file.modifiedTime,
      url: file.webViewLink,
    }))
    return { ok: true, items, folders: items.filter((x:any) => x.tipo === 'folder'), files: items.filter((x:any) => x.tipo !== 'folder'), path: [] }
  }

  if (method === 'criarPastaDriveHub' || method === 'criarArquivoTextoDriveHub') {
    const name = String(args[0] || (method === 'criarPastaDriveHub' ? 'Nova pasta' : 'arquivo.txt'))
    const parent = String(args[1] || 'root')
    const metadata:any = { name, parents: [parent === 'root' ? 'root' : parent] }
    metadata.mimeType = method === 'criarPastaDriveHub' ? 'application/vnd.google-apps.folder' : 'text/plain'
    const response = await g.fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,size,modifiedTime,webViewLink', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(metadata),
    })
    const file = await response.json()
    if (!response.ok) throw new Error(file.error?.message || 'Erro ao criar item no Drive')
    return { ok: true, item: { id:file.id, name:file.name, nome:file.name, tipo:file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : file.mimeType, tamanho:Number(file.size||0), modificado:file.modifiedTime, url:file.webViewLink } }
  }

  if (method === 'uploadToDriveHub' || method === 'salvarAnexoDrive') {
    const [dataUrl, fileName, mime, folderArg] = args.map(String)
    const parent = method === 'salvarAnexoDrive' ? 'root' : (folderArg || 'root')
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
    const boundary = `mai-${crypto.randomUUID()}`
    const metadata = JSON.stringify({ name:fileName || 'arquivo', parents:[parent === 'root' ? 'root' : parent] })
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`
    const response = await g.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink', {
      method:'POST', headers:{'content-type':`multipart/related; boundary=${boundary}`}, body,
    })
    const file = await response.json()
    if (!response.ok) throw new Error(file.error?.message || 'Erro no upload')
    return { ok:true, item:{id:file.id,name:file.name,nome:file.name,tipo:file.mimeType,tamanho:Number(file.size||0),modificado:file.modifiedTime,url:file.webViewLink} }
  }

  if (method === 'trashDriveItem' || method === 'deletarArquivoDrive') {
    const response = await g.fetch(`https://www.googleapis.com/drive/v3/files/${q(args[0])}`, {
      method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({trashed:true}),
    })
    if (!response.ok) throw new Error('Erro ao mover item para a lixeira')
    return { ok:true }
  }
  throw new Error(`Método Drive não implementado: ${method}`)
}

async function calendar(method:string, args:unknown[], g:Awaited<ReturnType<typeof authorizedGoogle>>) {
  if (method === 'getListaCalendarios') {
    const response = await g.fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Erro ao consultar calendários')
    return (data.items || []).map((cal:any) => ({
      id:cal.id,
      nome:cal.summary,
      cor:cal.backgroundColor || '#4285f4',
      primary:cal.primary === true,
      acesso:cal.accessRole || '',
    }))
  }

  if (method === 'getGoogleCalendarPeriodo' || method === 'getDadosAgendaCompleta') {
    const timeMin = new Date(String(args[0])).toISOString()
    const timeMax = new Date(String(args[1])).toISOString()
    const requested = Array.isArray(args[2]) ? args[2].map(String).filter(Boolean) : []
    const calendarIds = requested.length ? requested : ['primary']
    const results = await Promise.all(calendarIds.map(async calendarId => {
      const response = await g.fetch(`https://www.googleapis.com/calendar/v3/calendars/${q(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${q(timeMin)}&timeMax=${q(timeMax)}&maxResults=2500`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro ao consultar agenda')
      return (data.items || []).map((event:any) => {
        const start = event.start?.dateTime || event.start?.date || ''
        const end = event.end?.dateTime || event.end?.date || ''
        return {
          id:`${calendarId}::${event.id}`,
          google_event_id:event.id,
          calendario_id:calendarId,
          titulo:event.summary||'Compromisso',
          descricao:event.description||'',
          data_inicio:dateOnly(start),
          hora_inicio:start.includes('T')?start.slice(11,16):'',
          hora_fim:end.includes('T')?end.slice(11,16):'',
          dia_inteiro:!start.includes('T'),
          repeticao:event.recurrence?.[0]||'',
          cor:event.colorId||'',
          tipo:'google',
          url:event.htmlLink,
        }
      })
    }))
    return {ok:true,eventos:results.flat()}
  }

  if (method === 'salvarEventoAgenda') {
    const d:any = args[0] || {}
    const start = d.dia_inteiro ? {date:dateOnly(d.data_inicio)} : {dateTime:`${dateOnly(d.data_inicio)}T${d.hora_inicio || '09:00'}:00`,timeZone:'America/Maceio'}
    const endDate = d.dia_inteiro ? new Date(`${dateOnly(d.data_inicio)}T12:00:00`) : null
    if (endDate) endDate.setDate(endDate.getDate()+1)
    const end = d.dia_inteiro ? {date:endDate!.toISOString().slice(0,10)} : {dateTime:`${dateOnly(d.data_inicio)}T${d.hora_fim || d.hora_inicio || '10:00'}:00`,timeZone:'America/Maceio'}
    const isGoogleId = d.tipo === 'google' && d.id
    const [idCalendar, compositeEventId] = String(d.id || '').split('::')
    const calendarId = String(d.calendario_id || (compositeEventId ? idCalendar : 'primary'))
    const eventId = String(d.google_event_id || compositeEventId || d.id || '')
    const url = `https://www.googleapis.com/calendar/v3/calendars/${q(calendarId)}/events${isGoogleId ? `/${q(eventId)}` : ''}`
    const response = await g.fetch(url,{method:isGoogleId?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({summary:d.titulo,description:d.descricao||'',start,end})})
    const event = await response.json()
    if (!response.ok) throw new Error(event.error?.message || 'Erro ao salvar evento')
    return {ok:true,id:event.id}
  }

  if (method === 'excluirEventoAgenda') {
    const [calendarPart, eventPart] = String(args[0] || '').split('::')
    const calendarId = eventPart ? calendarPart : 'primary'
    const eventId = eventPart || calendarPart
    const response = await g.fetch(`https://www.googleapis.com/calendar/v3/calendars/${q(calendarId)}/events/${q(eventId)}`,{method:'DELETE'})
    if (!response.ok && response.status !== 410) throw new Error('Erro ao excluir evento')
    return {ok:true}
  }
  throw new Error(`Método Calendar não implementado: ${method}`)
}

export async function POST(request:NextRequest) {
  try {
    const body = await request.json()
    const method = String(body?.method || '')
    const args = Array.isArray(body?.args) ? body.args : []
    const g = await authorizedGoogle(request)
    const payload = method.includes('Drive') || ['getDriveContent','uploadToDriveHub','trashDriveItem','criarPastaDriveHub','criarArquivoTextoDriveHub','salvarAnexoDrive','deletarArquivoDrive'].includes(method)
      ? await drive(method,args,g)
      : await calendar(method,args,g)
    const response = json({payload})
    response.cookies.set(GOOGLE_COOKIE, sealTokens(g.tokens), {httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*365})
    return response
  } catch (error:any) {
    const status = error?.message === 'GOOGLE_NOT_CONNECTED' ? 401 : 500
    return json({error:error?.message || 'Erro Google'},status)
  }
}
