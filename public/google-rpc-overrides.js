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
    const localGetConfigs = h.getConfigsAgenda
    const localSaveConfigs = h.salvarConfigsAgenda

    async function selectedCalendarIds() {
      const configs = await localGetConfigs()
      return Array.isArray(configs?.calendarios) ? configs.calendarios : []
    }

    h.getListaCalendarios = async () => {
      const [calendars, selected] = await Promise.all([
        google('getListaCalendarios'),
        selectedCalendarIds(),
      ])
      const selectedSet = new Set(selected.map(String))
      return calendars.map(cal => ({
        ...cal,
        selecionado: selected.length ? selectedSet.has(String(cal.id)) : cal.primary === true,
      }))
    }
    h.getConfigsAgenda = () => localGetConfigs()
    h.salvarConfigsAgenda = ids => localSaveConfigs(Array.isArray(ids) ? ids : [])
    h.getGoogleCalendarPeriodo = async (start, end) =>
      google('getGoogleCalendarPeriodo', [start, end, await selectedCalendarIds()])
    h.salvarEventoAgenda = (...args) => google('salvarEventoAgenda', args)
    h.excluirEventoAgenda = (...args) => google('excluirEventoAgenda', args)

    h.getDadosAgendaCompleta = async (...args) => {
      const localRaw = await localAgenda(...args)
      const local = typeof localRaw === 'string' ? JSON.parse(localRaw) : localRaw
      const remote = await h.getGoogleCalendarPeriodo(...args)
      return JSON.stringify({...local, eventos:[...(remote.eventos || []), ...(local.eventos || [])]})
    }

    let todayGoogleEvents = []
    let todayGoogleRequest = null
    let todayGoogleKey = ''

    function refreshTodayGoogle(start, end, key) {
      if (todayGoogleRequest && todayGoogleKey === key) return
      todayGoogleKey = key
      todayGoogleRequest = selectedCalendarIds()
        .then(ids => google('getGoogleCalendarPeriodo', [start.toISOString(), end.toISOString(), ids]))
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

    function openCalendarSettings() {
      const open = () => {
        if (window.Sys?.promoteModuleModals) window.Sys.promoteModuleModals('agenda')
        if (window.AppAgenda?.abrirConfiguracoes) window.AppAgenda.abrirConfiguracoes()
      }
      if (window.Sys?.ensureModule) window.Sys.ensureModule('agenda', open)
      else open()
    }

    function showCalendarSettingsButton() {
      const legacyButton = document.querySelector('button[onclick*="AppAgenda.abrirConfiguracoes"]')
      if (legacyButton && legacyButton.dataset.maiCalendarSettings !== 'ready') {
        legacyButton.dataset.maiCalendarSettings = 'ready'
        legacyButton.title = 'Escolher calendários do Google'
        legacyButton.setAttribute('aria-label', 'Configurar calendários do Google')
        legacyButton.style.setProperty('display', 'inline-flex', 'important')
        legacyButton.style.setProperty('width', 'auto', 'important')
        legacyButton.style.setProperty('min-width', 'auto', 'important')
        legacyButton.style.setProperty('gap', '6px', 'important')
        legacyButton.style.setProperty('padding', '0 12px', 'important')
        legacyButton.innerHTML = '<span class="material-symbols-rounded">settings</span><span style="font-size:12px;font-weight:700">Calendários</span>'
      }

      const actions = document.querySelector('#mod-em-breve .mai-upcoming-pane-switches')
      if (!actions || document.getElementById('upcoming-google-calendars-btn')) return
      const button = document.createElement('button')
      button.id = 'upcoming-google-calendars-btn'
      button.type = 'button'
      button.className = 'mai-upcoming-pane-toggle'
      button.title = 'Escolher calendários do Google'
      button.setAttribute('aria-label', 'Configurar calendários do Google')
      button.innerHTML = '<span class="material-symbols-rounded">calendar_month</span><span>Calendários</span>'
      button.addEventListener('click', openCalendarSettings)
      actions.appendChild(button)
    }

    showCalendarSettingsButton()
    const calendarButtonObserver = new MutationObserver(showCalendarSettingsButton)
    calendarButtonObserver.observe(document.body, {childList:true, subtree:true})

    window.dispatchEvent(new CustomEvent('mai:google-ready'))
  }

  install()
})()
