/**
 * English translations (default locale)
 */
import type { TranslationDictionary } from '../types';

export const en: TranslationDictionary = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    refresh: 'Refresh',
    copy: 'Copy',
    paste: 'Paste',
  },

  settings: {
    title: 'Settings',
    language: {
      title: 'Language',
      description: 'Select your preferred language',
    },
    theme: {
      title: 'Theme',
      description: 'Choose the app appearance',
      options: {
        dark: 'Dark',
        darkBlue: 'Dark Blue',
        grey: 'Grey',
        forest: 'Forest',
        sunset: 'Sunset',
        neon: 'Neon',
        coffee: 'Coffee',
        ocean: 'Ocean',
        system: 'System',
      },
    },
    general: {
      title: 'General',
    },
    advanced: {
      title: 'Advanced',
    },
  },

  server: {
    title: 'Servers',
    create: {
      title: 'Create Server',
      name: 'Server Name',
      version: 'Minecraft Version',
      type: 'Server Type',
      description: 'Description',
    },
    list: {
      empty: 'No servers yet. Create your first server!',
      running: 'Running',
      stopped: 'Stopped',
    },
    actions: {
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      backup: 'Backup',
      delete: 'Delete',
      openFolder: 'Open Folder',
    },
    console: {
      title: 'Console',
      placeholder: 'Enter command...',
    },
  },

  plugins: {
    title: 'Plugins',
    search: {
      placeholder: 'Search plugins...',
      noResults: 'No plugins found',
    },
    install: {
      button: 'Install',
      success: 'Plugin installed successfully',
      error: 'Failed to install plugin',
    },
    installed: {
      title: 'Installed Plugins',
      empty: 'No plugins installed',
    },
    sources: {
      modrinth: 'Modrinth',
      hangar: 'Hangar',
      spigot: 'SpigotMC',
    },
  },

  nav: {
    home: 'Home',
    servers: 'Servers',
    plugins: 'Plugins',
    settings: 'Settings',
  },

  errors: {
    generic: 'An error occurred',
    network: 'Network error. Please check your connection.',
    notFound: 'Not found',
    permission: 'Permission denied',
    validation: 'Invalid input',
  },
};
