const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    stations: {
      getAll:   ()          => ipcRenderer.invoke('db:stations:getAll'),
      update:   (id, data)  => ipcRenderer.invoke('db:stations:update', id, data),
      add:      (station)   => ipcRenderer.invoke('db:stations:add', station),
      delete:   (id)        => ipcRenderer.invoke('db:stations:delete', id),
    },
    customers: {
      getAll:   ()          => ipcRenderer.invoke('db:customers:getAll'),
      getById:  (id)        => ipcRenderer.invoke('db:customers:getById', id),
      add:      (customer)  => ipcRenderer.invoke('db:customers:add', customer),
      update:   (id, data)  => ipcRenderer.invoke('db:customers:update', id, data),
    },
    sessions: {
      getAll:              ()            => ipcRenderer.invoke('db:sessions:getAll'),
      getActiveByStation:  (stationId)   => ipcRenderer.invoke('db:sessions:getActiveByStation', stationId),
      add:                 (session)     => ipcRenderer.invoke('db:sessions:add', session),
      update:              (id, data)    => ipcRenderer.invoke('db:sessions:update', id, data),
    },
    menu: {
      getAll:   ()          => ipcRenderer.invoke('db:menu:getAll'),
      add:      (item)      => ipcRenderer.invoke('db:menu:add', item),
      update:   (id, data)  => ipcRenderer.invoke('db:menu:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:menu:delete', id),
    },
    transactions: {
      getAll:   ()          => ipcRenderer.invoke('db:transactions:getAll'),
      add:      (tx)        => ipcRenderer.invoke('db:transactions:add', tx),
    },
    settings: {
      get:      ()          => ipcRenderer.invoke('db:settings:get'),
      update:   (data)      => ipcRenderer.invoke('db:settings:update', data),
    },
    pricingRules: {
      getAll:   ()          => ipcRenderer.invoke('db:pricingRules:getAll'),
      add:      (rule)      => ipcRenderer.invoke('db:pricingRules:add', rule),
      update:   (id, data)  => ipcRenderer.invoke('db:pricingRules:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:pricingRules:delete', id),
    },
    reviewRequests: {
      getAll:   ()          => ipcRenderer.invoke('db:reviewRequests:getAll'),
      add:      (request)   => ipcRenderer.invoke('db:reviewRequests:add', request),
      markSent: (id)        => ipcRenderer.invoke('db:reviewRequests:markSent', id),
    },
    templates: {
      getAll:   ()          => ipcRenderer.invoke('db:templates:getAll'),
      add:      (template)  => ipcRenderer.invoke('db:templates:add', template),
      update:   (id, data)  => ipcRenderer.invoke('db:templates:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:templates:delete', id),
    },
    games: {
      getAll:   ()          => ipcRenderer.invoke('db:games:getAll'),
      add:      (game)      => ipcRenderer.invoke('db:games:add', game),
      update:   (id, data)  => ipcRenderer.invoke('db:games:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:games:delete', id),
    },
    expenses: {
      getAll:   ()          => ipcRenderer.invoke('db:expenses:getAll'),
      add:      (expense)   => ipcRenderer.invoke('db:expenses:add', expense),
      delete:   (id)        => ipcRenderer.invoke('db:expenses:delete', id),
    },
    whatsappQueue: {
      getAll:   ()          => ipcRenderer.invoke('db:whatsappQueue:getAll'),
      add:      (item)      => ipcRenderer.invoke('db:whatsappQueue:add', item),
      update:   (id, data)  => ipcRenderer.invoke('db:whatsappQueue:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:whatsappQueue:delete', id),
      clear:    ()          => ipcRenderer.invoke('db:whatsappQueue:clear'),
      resend:   (id)        => ipcRenderer.invoke('db:whatsappQueue:resend', id),
    },
    whatsappPromotions: {
      getAll:   ()          => ipcRenderer.invoke('db:whatsappPromotions:getAll'),
      add:      (item)      => ipcRenderer.invoke('db:whatsappPromotions:add', item),
      update:   (id, data)  => ipcRenderer.invoke('db:whatsappPromotions:update', id, data),
      delete:   (id)        => ipcRenderer.invoke('db:whatsappPromotions:delete', id),
      cancel:   (id)        => ipcRenderer.invoke('db:whatsappPromotions:cancel', id),
    },
    backup: {
      export:           ()                 => ipcRenderer.invoke('db:backup:export'),
      restore:          (data)             => ipcRenderer.invoke('db:backup:restore', data),
      writeExportFile:  (filePath, data)   => ipcRenderer.invoke('db:backup:writeExportFile', { filePath, data }),
      readImportFile:   (filePath)         => ipcRenderer.invoke('db:backup:readImportFile', filePath),
    },
  },
  whatsapp: {
    getStatus:   ()     => ipcRenderer.invoke('whatsapp:getStatus'),
    sendInvoice: (data) => ipcRenderer.invoke('whatsapp:sendInvoice', data),
    reconnect:   ()     => ipcRenderer.invoke('whatsapp:reconnect'),
  },
  auth: {
    login:  (password) => ipcRenderer.invoke('auth:login', password),
    check:  ()         => ipcRenderer.invoke('auth:check'),
    logout: ()         => ipcRenderer.invoke('auth:logout'),
  },
  updater: {
    // Listen for update events from main process
    onUpdateChecking:     (cb) => ipcRenderer.on('update_checking',      () => cb()),
    onUpdateAvailable:    (cb) => ipcRenderer.on('update_available',     (_, info) => cb(info)),
    onUpdateNotAvailable: (cb) => ipcRenderer.on('update_not_available', (_, info) => cb(info)),
    onUpdateProgress:     (cb) => ipcRenderer.on('update_progress',      (_, info) => cb(info)),
    onUpdateDownloaded:   (cb) => ipcRenderer.on('update_downloaded',    (_, info) => cb(info)),
    onUpdateError:        (cb) => ipcRenderer.on('update_error',         (_, err) => cb(err)),
    installUpdate: () => ipcRenderer.invoke('updater:installNow'),
    checkForUpdates: () => ipcRenderer.invoke('updater:checkNow'),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('update_checking');
      ipcRenderer.removeAllListeners('update_available');
      ipcRenderer.removeAllListeners('update_not_available');
      ipcRenderer.removeAllListeners('update_downloaded');
      ipcRenderer.removeAllListeners('update_progress');
      ipcRenderer.removeAllListeners('update_error');
    },
  },
  dialog: {
    showSaveDialog:    (filename) => ipcRenderer.invoke('save-backup-dialog', filename),
    showOpenDialog:    ()         => ipcRenderer.invoke('open-restore-dialog'),
  },
});
