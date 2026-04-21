/**
 * i18n Type Definitions
 *
 * Defines locale codes, translation dictionary structure, and type-safe key paths.
 */

/**
 * Supported locale codes.
 * - 'en': English (default)
 * - 'ja': Japanese
 * - 'ko': Korean (reserved for future)
 * - 'zh': Chinese (reserved for future)
 */
export type LocaleCode = 'en' | 'ja' | 'ko' | 'zh';

/**
 * Default locale when none is specified or saved.
 */
export const DEFAULT_LOCALE: LocaleCode = 'en';

/**
 * Hierarchical translation dictionary structure.
 * Organized by feature/component for maintainability.
 */
export interface TranslationDictionary {
  /** Common UI elements used across the app */
  common: {
    ok: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    close: string;
    back: string;
    next: string;
    loading: string;
    downloading: string;
    loadingView: string;
    error: string;
    success: string;
    confirm: string;
    yes: string;
    no: string;
    search: string;
    refresh: string;
    copy: string;
    paste: string;
  };

  /** Settings page translations */
  settings: {
    title: string;
    backButton: string;
    update: {
      title: string;
      description: string;
      checkButton: string;
      checking: string;
      download: string;
      restart: string;
      idle: string;
      checkingStatus: string;
      available: string;
      notAvailable: string;
      downloading: string;
      downloaded: string;
      error: string;
      releaseNotes: string;
    };
    language: {
      title: string;
      description: string;
      label: string;
      options: {
        en: string;
        ja: string;
      };
    };
    theme: {
      title: string;
      description: string;
      label: string;
      options: {
        light: string;
        dark: string;
        system: string;
      };
    };
    general: {
      title: string;
    };
    advanced: {
      title: string;
    };
  };

  /** Server management translations */
  server: {
    title: string;
    create: {
      title: string;
      name: string;
      version: string;
      type: string;
      description: string;
      templateNamePrompt: string;
      templateDefaultName: string;
      cloneDefaultName: string;
    };
    list: {
      empty: string;
      running: string;
      stopped: string;
      selectOrCreate: string;
      ungrouped: string;
    };
    actions: {
      start: string;
      stop: string;
      restart: string;
      backup: string;
      delete: string;
      openFolder: string;
      clone: string;
      saveTemplate: string;
    };
    console: {
      title: string;
      placeholder: string;
    };
    toast: {
      loadError: string;
      downloadStarting: string;
      downloadComplete: string;
      autoBackupCreated: string;
      autoBackupFailed: string;
      autoRestartLimitReached: string;
      autoRestartScheduled: string;
      autoRestartTriggered: string;
      noServerSelected: string;
      startFailed: string;
      stopFailed: string;
      restartFailed: string;
      settingsSaved: string;
      saveFailed: string;
      pathEmpty: string;
      created: string;
      jarDownloadFailed: string;
      jarUrlFailed: string;
      createFailed: string;
      deleted: string;
      deleteFailed: string;
      deleteError: string;
      cloned: string;
      cloneFailed: string;
      templateSaved: string;
      templateSaveFailed: string;
    };
    confirm: {
      delete: string;
      clone: string;
    };
  };

  /** Dashboard view translations */
  dashboard: {
    title: string;
    stats: {
      status: string;
      software: string;
      currentCpu: string;
      currentMemory: string;
      currentTps: string;
      tpsAutoSampled: string;
      tpsLogBased: string;
      statusValues: {
        online: string;
        offline: string;
        starting: string;
        stopping: string;
        restarting: string;
        crashed: string;
        unknown: string;
      };
    };
    charts: {
      cpuLast60s: string;
      memoryLast60s: string;
      tpsLast60s: string;
      tpsNoData: string;
    };
  };

  /** Console view translations */
  console: {
    actions: {
      find: string;
      saveLogs: string;
      send: string;
    };
    command: {
      placeholder: string;
    };
    emptyLog: {
      waiting: string;
      notFound: string;
    };
    filter: {
      label: string;
      ariaLabel: string;
    };
    historyHint: string;
    search: {
      label: string;
      placeholder: string;
      prev: string;
      next: string;
    };
    status: {
      address: string;
      clickToCopy: string;
      status: string;
      memory: string;
    };
    toast: {
      noLogsToSave: string;
      logsSaved: string;
      logsSaveFailed: string;
    };
  };

  /** Files view translations */
  files: {
    confirm: {
      delete: string;
      deleteTitle: string;
    };
    contextMenu: {
      rename: string;
      moveItem: string;
      compressItem: string;
      extractItem: string;
      deleteItem: string;
      newCreate: string;
      import: string;
      move: string;
    };
    dropHint: string;
    editor: {
      saving: string;
    };
    emptyFolder: string;
    loading: string;
    modal: {
      createImportTitle: string;
      file: string;
      folder: string;
      import: string;
      nameLabel: string;
      newFolderPlaceholder: string;
      newFilePlaceholder: string;
      moveDirectoryTitle: string;
      moveTitle: string;
      moveDirectoryDescription: string;
      moveDescription: string;
      moveDestPlaceholder: string;
      moveButton: string;
      renameTitle: string;
      renameButton: string;
    };
    toast: {
      uploadSuccess: string;
      uploadFailed: string;
      loadFailed: string;
      readFailed: string;
      saved: string;
      saveFailed: string;
      deleted: string;
      deleteFailed: string;
      created: string;
      createFailed: string;
      imported: string;
      moved: string;
      moveFailed: string;
      renamed: string;
      renameFailed: string;
      compressed: string;
      compressFailed: string;
      extracted: string;
      extractFailed: string;
    };
    toolbar: {
      goUp: string;
      createImport: string;
      openExplorer: string;
      move: string;
      compress: string;
      extract: string;
      delete: string;
    };
  };

  /** Backups view translations */
  backups: {
    title: string;
    createButton: string;
    empty: string;
    processing: string;
    parent: string;
    mode: {
      full: string;
      differential: string;
    };
    actions: {
      restore: string;
      tag: string;
    };
    modal: {
      createTitle: string;
      fileName: string;
      fileNameHelp: string;
      compressionLevel: string;
      compressionHelp: string;
      modeLabel: string;
      modeFull: string;
      modeDiff: string;
      modeHelp: string;
      selectTarget: string;
      openSelector: string;
      clearAll: string;
      noSelection: string;
      selectedCount: string;
      andMore: string;
      create: string;
      creating: string;
    };
    tagEditor: {
      title: string;
      tagsLabel: string;
      tagsPlaceholder: string;
      noteLabel: string;
      notePlaceholder: string;
    };
    toast: {
      targetUpdated: string;
      selectorOpenError: string;
      targetInitFailed: string;
      loadFailed: string;
      worldLoadFailed: string;
      selectAtLeastOne: string;
      noDiffSkipped: string;
      diffCreated: string;
      created: string;
      createFailed: string;
      restored: string;
      restoreFailed: string;
      deleteFailed: string;
      tagSaved: string;
      tagSaveFailed: string;
    };
    world: {
      title: string;
      detected: string;
      empty: string;
      deleteButton: string;
      confirmDelete: string;
      deleteTitle: string;
      finalConfirm: string;
      finalConfirmTitle: string;
      deleted: string;
      deleteFailed: string;
    };
  };

  /** Java manager modal translations */
  javaManager: {
    title: string;
    availableVersions: string;
    download: string;
    downloading: string;
    downloadingStatus: string;
    installed: string;
    installedRuntimes: string;
    noRuntimes: string;
    confirm: {
      uninstall: string;
      deleteTitle: string;
    };
    manualSelect: {
      title: string;
      description: string;
      button: string;
    };
    toast: {
      downloadSuccess: string;
      downloadFailed: string;
      removed: string;
      removeFailed: string;
      pathCopied: string;
      pathInfo: string;
      selectionCancelled: string;
    };
  };

  /** Users view translations */
  users: {
    title: string;
    entriesCount: string;
    empty: string;
    lists: {
      whitelist: string;
      operators: string;
      bannedPlayers: string;
      bannedIps: string;
    };
    actions: {
      add: string;
      remove: string;
    };
    placeholder: {
      playerName: string;
      ipAddress: string;
    };
    level: string;
    toast: {
      alreadyExists: string;
      listUpdated: string;
      removed: string;
    };
  };

  /** Plugin management translations */
  plugins: {
    title: string;
    search: {
      placeholder: string;
      noResults: string;
    };
    install: {
      button: string;
      success: string;
      error: string;
    };
    installed: {
      title: string;
      empty: string;
    };
    sources: {
      modrinth: string;
      hangar: string;
      spigot: string;
    };
    browser: {
      viewSwitch: string;
      tabBrowse: string;
      tabInstalled: string;
      searchOn: string;
      searching: string;
      sortLabel: string;
      sortRelevance: string;
      sortDownloads: string;
      sortName: string;
      sortCompatibility: string;
      noResults: string;
      prev: string;
      next: string;
      pageLabel: string;
      pageLabelWithTotal: string;
      go: string;
      pageNumberAriaLabel: string;
      details: string;
      closeDetailsAriaLabel: string;
      byAuthor: string;
      installing: string;
      update: string;
      open: string;
      enable: string;
      disable: string;
      installedBadge: string;
      disabledBadge: string;
      externalDownload: string;
      compatChecking: string;
      compatCompatible: string;
      compatIncompatible: string;
      compatUnknown: string;
      updateChecking: string;
      updateAvailable: string;
      upToDate: string;
      updateUnknown: string;
      latestTooltip: string;
      versionsNotPublished: string;
      loaderSpigotPaper: string;
      loaderDefault: string;
      loaderMod: string;
      unsupportedPlatform: string;
      openInBrowser: string;
      downloadInstructions: string;
      spigotNote: string;
      hangarNote: string;
      updateSummary: string;
      updateSummaryNote: string;
      pageInputError: string;
      fetchHangarError: string;
      fetchSpigotError: string;
      fetchError: string;
      deleteExistingError: string;
      noCompatibleVersion: string;
      dependencyCheck: string;
      dependencyMissing: string;
      dependencyVersionNotFound: string;
      dependencyInstallFailed: string;
      dependencyInstallSuccess: string;
      dependencyCheckOnly: string;
      incompatibilityWarning: string;
      compatibilityUnknown: string;
      compatibilityUnknownWithVersions: string;
      browserDownloadRequired: string;
      spigotIdInvalid: string;
      spigotBrowserRequired: string;
      installSuccess: string;
      overwriteSuccess: string;
      updateSuccess: string;
      installError: string;
      browserOpenError: string;
      pluginEnabled: string;
      pluginDisabled: string;
      toggleError: string;
      readmeFetchError: string;
      readmeLoading: string;
      noReadme: string;
      dupTitle: string;
      dupDescription: string;
      dupExistingFile: string;
      dupOverwriteNote: string;
      dupUpdateNote: string;
      dupCancel: string;
      dupOverwrite: string;
      dupUpdate: string;
      detailProject: string;
      detailSlug: string;
      detailSupportedMC: string;
      detailLoader: string;
      detailDownloads: string;
      detailSummary: string;
      detailProjectPage: string;
      detailInfo: string;
      detailReadme: string;
      localSource: string;
      installedFile: string;
      installedVersion: string;
      installedGameVersions: string;
      uninstall: string;
      reinstall: string;
      uninstallSuccess: string;
      uninstallError: string;
      reinstallUnavailable: string;
      noDescription: string;
      na: string;
    };
  };

  /** Navigation translations */
  nav: {
    home: string;
    servers: string;
    plugins: string;
    settings: string;
    dashboard: string;
    console: string;
    users: string;
    files: string;
    pluginsMods: string;
    backups: string;
    properties: string;
    generalSettings: string;
    proxyNetwork: string;
    addServer: string;
    openSettings: string;
  };

  /** Proxy configuration translations */
  proxy: {
    configTitle: string;
    settingsUpdated: string;
    configError: string;
    confirmRewriteProperties: string;
  };

  /** Proxy setup view translations */
  proxySetup: {
    title: string;
    proxySoftware: string;
    velocityRecommended: string;
    waterfall: string;
    bungeecord: string;
    proxyPort: string;
    portHint: string;
    backendServers: string;
    noBackendServers: string;
    backendDetail: string;
    building: string;
    buildNetwork: string;
    viewHelp: string;
    confirmFewServers: string;
    dialogTitle: string;
  };

  /** Proxy help view translations */
  proxyHelp: {
    title: string;
    introLine1: string;
    introLine2: string;
    recommendedSoftware: string;
    recommendedSoftwareNote: string;
    recommendedPort: string;
    recommendedPortNote: string;
    minConfig: string;
    minConfigValue: string;
    minConfigNote: string;
    checklistTitle: string;
    checklistItem1: string;
    checklistItem2: string;
    checklistItem3: string;
    step1Badge: string;
    step1Title: string;
    step1Desc: string;
    step1Software: string;
    step1SoftwareDesc: string;
    step1Port: string;
    step1PortDesc1: string;
    step1PortDesc2: string;
    step1Backend: string;
    step1BackendDesc: string;
    step1Action: string;
    step1Tip: string;
    step2Badge: string;
    step2Title: string;
    step2Desc: string;
    step2Navigate: string;
    step2NavigateDesc: string;
    step2Download: string;
    step2DownloadDesc: string;
    openPaperVelocity: string;
    openVelocityDocs: string;
    step3Badge: string;
    step3Title: string;
    step3Edit: string;
    step3EditDesc1: string;
    step3EditDesc2: string;
    autoGenerated: string;
    step3Save: string;
    step3SaveDesc1: string;
    step3SaveDesc2: string;
    step3Tip: string;
    done: string;
  };

  /** Error messages */
  errors: {
    generic: string;
    network: string;
    notFound: string;
    permission: string;
    validation: string;
    updateSignatureVerificationFailed: string;
    updateSignatureVerificationDetails: string;
    updateReadOnlyLocationTitle: string;
    updateReadOnlyLocationCurrent: string;
    updateReadOnlyLocationSteps: string;
    updateReadOnlyLocationStep1: string;
    updateReadOnlyLocationStep2: string;
    updateReadOnlyLocationStep3: string;
    updateReadOnlyLocationStep4: string;
    updatePermissionDeniedTitle: string;
    updatePermissionDeniedCurrent: string;
    updatePermissionDeniedSteps: string;
    updatePermissionDeniedStep1: string;
    updatePermissionDeniedStep2: string;
    updatePermissionDeniedStep3: string;
    updatePermissionDeniedStep4: string;
    updateCannotApply: string;
  };

  /** Server settings panel translations */
  serverSettings: {
    title: string;
    basicConfig: string;
    serverName: string;
    profileName: string;
    profileNamePlaceholder: string;
    groupName: string;
    groupNamePlaceholder: string;
    serverSoftware: string;
    softwareGroups: {
      standard: string;
      modded: string;
      proxy: string;
    };
    softwareOptions: {
      vanilla: string;
      paper: string;
      leafmc: string;
      spigot: string;
      fabric: string;
      forge: string;
      velocity: string;
      waterfall: string;
      bungeecord: string;
    };
    version: string;
    javaRuntime: string;
    javaSystemDefault: string;
    manageJava: string;
    memory: string;
    port: string;
    savePath: string;
    autoRestart: {
      title: string;
      enableDescription: string;
      maxRetries: string;
      delaySeconds: string;
    };
    autoBackup: {
      title: string;
      enableDescription: string;
      scheduleType: string;
      scheduleOptions: {
        interval: string;
        daily: string;
        weekly: string;
      };
      intervalMinutes: string;
      executionTime: string;
      weekday: string;
    };
    weekdays: {
      sunday: string;
      monday: string;
      tuesday: string;
      wednesday: string;
      thursday: string;
      friday: string;
      saturday: string;
    };
    saveSettings: string;
    ngrok: {
      title: string;
      onlineBadge: string;
      description: string;
      connectionGuide: string;
      changeToken: string;
      publicAddress: string;
      shareWithFriends: string;
      ready: string;
      initializing: string;
      initializingWithNewToken: string;
      addressCopied: string;
      tokenRequired: {
        title: string;
        description: string;
        placeholder: string;
        cancel: string;
        saveAndConnect: string;
      };
    };
  };

  /** Add server modal translations */
  addServer: {
    title: string;
    template: {
      label: string;
      none: string;
    };
    name: {
      label: string;
      placeholder: string;
    };
    savePath: string;
    profileName: {
      label: string;
      placeholder: string;
    };
    groupName: {
      label: string;
      placeholder: string;
    };
    software: {
      label: string;
      groups: {
        standard: string;
        modded: string;
        proxy: string;
      };
      options: {
        vanilla: string;
        paper: string;
        leafmc: string;
        spigot: string;
        fabric: string;
        forge: string;
        velocity: string;
        waterfall: string;
        bungeecord: string;
      };
    };
    version: {
      label: string;
    };
    port: {
      label: string;
    };
    memory: {
      label: string;
    };
  };

  /** Server properties view translations */
  properties: {
    title: string;
    openAdvanced: string;
    saveChanges: string;
    loadFailed: string;
    saveSuccess: string;
    saveFailed: string;
    advancedSaveSuccess: string;
    loading: string;
    sections: {
      basic: string;
      gameplay: string;
      network: string;
    };
    motd: {
      label: string;
      description: string;
    };
    gameMode: {
      label: string;
      options: {
        survival: string;
        creative: string;
        adventure: string;
        spectator: string;
      };
    };
    difficulty: {
      label: string;
      options: {
        peaceful: string;
        easy: string;
        normal: string;
        hard: string;
      };
    };
    maxPlayers: string;
    serverPort: string;
    toggles: {
      pvp: {
        label: string;
        description: string;
      };
      allowFlight: {
        label: string;
        description: string;
      };
      commandBlock: {
        label: string;
        description: string;
      };
      onlineMode: {
        label: string;
        description: string;
      };
      whitelist: {
        label: string;
        description: string;
      };
    };
  };

  /** Backup target selector window translations */
  backupSelector: {
    title: string;
    subtitle: string;
    serverPathNotSet: string;
    selectionCount: string;
    viewMode: string;
    viewTree: string;
    viewGraph: string;
    selectAll: string;
    clearAll: string;
    loading: string;
    empty: string;
    cancel: string;
    apply: string;
    saving: string;
    ariaCollapseDirectory: string;
    ariaExpandDirectory: string;
  };

  /** Advanced settings window translations */
  advancedSettings: {
    title: string;
    loading: string;
    applyAndClose: string;
    inferredDescription: string;
    propertyDescriptionFallback: string;
    categories: {
      general: string;
      gameplay: string;
      world: string;
      network: string;
      security: string;
      advanced: string;
    };
  };

  /** ngrok guide view translations */
  ngrokGuide: {
    title: string;
    introText: string;
    introRequirements: string;
    summary: {
      requirementsLabel: string;
      requirementsValue: string;
      requirementsNote: string;
      obtainLabel: string;
      obtainValue: string;
      obtainNote: string;
      shareLabel: string;
      shareNote: string;
    };
    checklist: {
      title: string;
      item1: string;
      item2: string;
      item3: string;
    };
    step1: {
      badge: string;
      title: string;
      description: string;
      button: string;
      tip: string;
    };
    step2: {
      badge: string;
      title: string;
      description1: string;
      description2: string;
      example: string;
      securityWarning: string;
    };
    step3: {
      badge: string;
      title: string;
      description1: string;
      description2: string;
      addressNote: string;
      tip: string;
    };
  };
}

/**
 * Utility type to generate dot-notation keys from nested object structure.
 * E.g., { common: { ok: string } } -> 'common.ok'
 */
export type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`>
        : `${Prefix}${Prefix extends '' ? '' : '.'}${K}`;
    }[keyof T & string]
  : never;

/**
 * All valid translation keys as dot-notation strings.
 * Provides autocomplete support in IDEs.
 */
export type TranslationKey = NestedKeyOf<TranslationDictionary>;

/**
 * Parameters for interpolation in translation strings.
 * E.g., t('greeting', { name: 'John' }) for "Hello, {name}!"
 */
export type TranslationParams = Record<string, string | number>;

/**
 * Type guard to check if a value is a valid LocaleCode.
 */
export function isValidLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && ['en', 'ja', 'ko', 'zh'].includes(value);
}
