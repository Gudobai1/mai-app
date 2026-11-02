import { googleDriveRpc } from '../DriveAsset'

type Row = Record<string, any>

/** Envia um arquivo para o Drive e devolve o anexo no formato guardado nos itens. */
export async function uploadAttachment(file: File): Promise<Row> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const response = await googleDriveRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
  const saved = response?.item || response || {}
  return { idDrive: saved.id, nome: saved.name || saved.nome || file.name, tipo: saved.tipo || saved.mimeType || file.type, tamanho: Number(saved.tamanho || saved.size || file.size || 0), url: saved.url || saved.webViewLink || '', criado_em: new Date().toISOString() }
}
