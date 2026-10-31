import type { SelectOption } from '@/components/arc/select/select';
import type { Translate } from '../../i18n';

/** Server software choices shared by the add-server and import forms, grouped the same way in both. */
export function softwareSelectOptions(t: Translate): SelectOption[] {
  const standard = t('addServer.software.groups.standard');
  const modded = t('addServer.software.groups.modded');
  const proxy = t('addServer.software.groups.proxy');
  return [
    { value: 'Vanilla', label: t('addServer.software.options.vanilla'), group: standard },
    { value: 'Paper', label: t('addServer.software.options.paper'), group: standard },
    { value: 'LeafMC', label: t('addServer.software.options.leafmc'), group: standard },
    { value: 'Spigot', label: t('addServer.software.options.spigot'), group: standard },
    { value: 'Fabric', label: t('addServer.software.options.fabric'), group: modded },
    { value: 'Forge', label: t('addServer.software.options.forge'), group: modded },
    { value: 'Velocity', label: t('addServer.software.options.velocity'), group: proxy },
    { value: 'Waterfall', label: t('addServer.software.options.waterfall'), group: proxy },
    { value: 'BungeeCord', label: t('addServer.software.options.bungeecord'), group: proxy },
  ];
}
