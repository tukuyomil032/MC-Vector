import { cn } from '@/lib/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import type { ServerTemplate } from '../../lib/server-commands';
import { VERSION_OPTIONS } from '../constants/versionOptions';

const addServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/),
  profileName: z.string().optional(),
  groupName: z.string().optional(),
  software: z.string().min(1),
  version: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  memory: z.coerce.number().int().min(1),
  selectedTemplateId: z.string().optional(),
});

type AddServerFormValues = z.infer<typeof addServerSchema>;

interface AddServerModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (serverData: unknown) => void;
  templates: ServerTemplate[];
}

const AddServerModal: FC<AddServerModalProps> = ({ open: isOpen, onClose, onAdd, templates }) => {
  const { t } = useTranslation();
  const [rootPath, setRootPath] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<AddServerFormValues>({
    resolver: zodResolver(addServerSchema),
    defaultValues: {
      name: '',
      profileName: '',
      groupName: '',
      software: 'Paper',
      version: '1.21.10',
      port: 25565,
      memory: 4,
      selectedTemplateId: '',
    },
  });

  const selectedTemplateId = watch('selectedTemplateId');
  const nameValue = watch('name');

  useEffect(() => {
    const fetchRoot = async () => {
      try {
        const path = await getServerRoot();
        setRootPath(path);
      } catch (e) {
        logError('Failed to resolve server root for AddServerModal', e);
      }
    };
    fetchRoot();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      return;
    }

    setValue('software', template.software || 'Paper');
    setValue('version', template.version || '1.21.10');
    setValue('port', template.port || 25565);
    setValue('memory', Math.max(1, Math.floor((template.memory || 1024) / 1024)));
    setValue('profileName', template.profileName || '');
    setValue('groupName', template.groupName || '');
  }, [selectedTemplateId, templates, setValue]);

  const previewPath = rootPath
    ? `${rootPath}/${nameValue || 'server-id'}`.replace(/\\/g, '/')
    : 'Loading...';

  const onSubmit = (values: AddServerFormValues) => {
    const template = templates.find((item) => item.id === values.selectedTemplateId);
    const sanitizedName = values.name.trim();
    const serverPath = rootPath ? `${rootPath}/${sanitizedName}` : '';
    onAdd({
      name: values.name,
      profileName: values.profileName?.trim() || undefined,
      groupName: values.groupName?.trim() || undefined,
      software: values.software,
      version: values.version,
      port: values.port,
      memory: values.memory,
      path: serverPath,
      javaPath: template?.javaPath,
      autoRestartOnCrash: template?.autoRestartOnCrash,
      maxAutoRestarts: template?.maxAutoRestarts,
      autoRestartDelaySec: template?.autoRestartDelaySec,
      autoBackupEnabled: template?.autoBackupEnabled,
      autoBackupIntervalMin: template?.autoBackupIntervalMin,
      autoBackupScheduleType: template?.autoBackupScheduleType,
      autoBackupTime: template?.autoBackupTime,
      autoBackupWeekday: template?.autoBackupWeekday,
    });
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="add-server-modal-backdrop" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'add-server-modal-panel',
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001]',
          )}
        >
          <Dialog.Title className="add-server-modal__title">{t('addServer.title')}</Dialog.Title>

          <form onSubmit={handleSubmit(onSubmit)}>
            {templates.length > 0 && (
              <div className="add-server-modal__section">
                <label className="add-server-modal__label">{t('addServer.template.label')}</label>
                <select {...register('selectedTemplateId')} className="add-server-modal__field">
                  <option value="">{t('addServer.template.none')}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="add-server-modal__section">
              <label className="add-server-modal__label">{t('addServer.name.label')}</label>
              <input
                type="text"
                {...register('name')}
                placeholder={t('addServer.name.placeholder')}
                className="add-server-modal__field add-server-modal__field--text"
              />
              {errors.name && (
                <div className="add-server-modal__error">{t('addServer.name.invalid')}</div>
              )}
              <div className="add-server-modal__path-preview">
                {t('addServer.savePath')} {previewPath}
              </div>
            </div>

            <div className="add-server-modal__row">
              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">
                  {t('addServer.profileName.label')}
                </label>
                <input
                  type="text"
                  {...register('profileName')}
                  placeholder={t('addServer.profileName.placeholder')}
                  className="add-server-modal__field"
                />
              </div>

              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">{t('addServer.groupName.label')}</label>
                <input
                  type="text"
                  {...register('groupName')}
                  placeholder={t('addServer.groupName.placeholder')}
                  className="add-server-modal__field"
                />
              </div>
            </div>

            <div className="add-server-modal__row">
              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">{t('addServer.software.label')}</label>
                <select {...register('software')} className="add-server-modal__field">
                  <optgroup label={t('addServer.software.groups.standard')}>
                    <option value="Vanilla">{t('addServer.software.options.vanilla')}</option>
                    <option value="Paper">{t('addServer.software.options.paper')}</option>
                    <option value="LeafMC">{t('addServer.software.options.leafmc')}</option>
                    <option value="Spigot">{t('addServer.software.options.spigot')}</option>
                  </optgroup>
                  <optgroup label={t('addServer.software.groups.modded')}>
                    <option value="Fabric">{t('addServer.software.options.fabric')}</option>
                    <option value="Forge">{t('addServer.software.options.forge')}</option>
                  </optgroup>
                  <optgroup label={t('addServer.software.groups.proxy')}>
                    <option value="Velocity">{t('addServer.software.options.velocity')}</option>
                    <option value="Waterfall">{t('addServer.software.options.waterfall')}</option>
                    <option value="BungeeCord">{t('addServer.software.options.bungeecord')}</option>
                  </optgroup>
                </select>
              </div>

              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">{t('addServer.version.label')}</label>
                <select {...register('version')} className="add-server-modal__field">
                  {VERSION_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="add-server-modal__row add-server-modal__row--spaced">
              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">{t('addServer.port.label')}</label>
                <input type="number" {...register('port')} className="add-server-modal__field" />
                {errors.port && (
                  <div className="add-server-modal__error">{t('addServer.port.invalid')}</div>
                )}
              </div>
              <div className="add-server-modal__field-group">
                <label className="add-server-modal__label">{t('addServer.memory.label')}</label>
                <input type="number" {...register('memory')} className="add-server-modal__field" />
                {errors.memory && (
                  <div className="add-server-modal__error">{t('addServer.memory.invalid')}</div>
                )}
              </div>
            </div>

            <div className="add-server-modal__footer">
              <Dialog.Close asChild>
                <button type="button" className="add-server-modal__cancel-btn">
                  {t('common.cancel')}
                </button>
              </Dialog.Close>
              <button type="submit" className="add-server-modal__submit-btn">
                {t('common.create')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default AddServerModal;
