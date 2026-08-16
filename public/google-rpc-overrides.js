(() => {
  'use strict'

  async function google(method, args = []) {
    const response = await fetch('/api/google/rpc', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({method,args}),
    })
    if (response.status === 401) throw new Error('Conecte sua conta Google para usar Drive e Agenda.')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Erro na integração Google')
    return data.payload
  }

  function install() {
    if (!window.MAIPort?.handlers) return setTimeout(install, 30)
    const h = window.MAIPort.handlers
    const localAgenda = h.getDadosAgendaCompleta
    const localToday = h.getResumoHoje

    h.getListaCalendarios = (...args) => google('getListaCalendarios', args)
    h.getGoogleCalendarPeriodo = (...args) => google('getGoogleCalendarPeriodo', args)
    h.salvarEventoAgenda = (...args) => google('salvarEventoAgenda', args)
    h.excluirEventoAgenda = (...args) => google('excluirEventoAgenda', args)

    h.getDadosAgendaCompleta = async (...args) => {
      const localRaw = await localAgenda(...args)
      const local = typeof localRaw === 'string' ? JSON.parse(localRaw) : localRaw
      const remote = await google('getGoogleCalendarPeriodo', args)
      return JSON.stringify({...local, eventos:[...(remote.eventos || []), ...(local.eventos || [])]})
    }

    let todayGoogleEvents = []
    let todayGoogleRequest = null
    let todayGoogleKey = ''

    function refreshTodayGoogle(start, end, key) {
      if (todayGoogleRequest && todayGoogleKey === key) return
      todayGoogleKey = key
      todayGoogleRequest = google('getGoogleCalendarPeriodo', [start.toISOString(), end.toISOString()])
        .then(remote => {
          todayGoogleEvents = remote.eventos || []
          window.dispatchEvent(new CustomEvent('mai:data-changed', {
            detail: { method: 'googleCalendarToday', at: Date.now() }
          }))
        })
        .catch(() => {})
        .finally(() => { todayGoogleRequest = null })
    }

    h.getResumoHoje = async () => {
      const local = await localToday()
      const start = new Date(); start.setHours(0,0,0,0)
      const end = new Date(); end.setHours(23,59,59,999)
      const key = start.toISOString().slice(0, 10)

      local.agenda = local.agenda || {eventos:[],tarefas:[],habitos:[],conclusoes:[]}
      local.agenda.eventos = [...todayGoogleEvents, ...(local.agenda.eventos || [])]

      refreshTodayGoogle(start, end, key)
      return local
    }

    ;['getDriveContent','uploadToDriveHub','trashDriveItem','criarPastaDriveHub',
      'criarArquivoTextoDriveHub','salvarAnexoDrive','deletarArquivoDrive'
    ].forEach(method => { h[method] = (...args) => google(method,args) })

    window.dispatchEvent(new CustomEvent('mai:google-ready'))
  }

  install()
})()
