import { zodResolver } from '@hookform/resolvers/zod';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/arc/button/button';
import { Combobox } from '@/components/arc/combobox/combobox';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { Select, type SelectOption } from '@/components/arc/select/select';
import { useTranslation } from '../../i18n';
import { getServerRoot } from '../../lib/config-commands';
import { logError } from '../../lib/error-utils';
import type { ServerTemplate } from '../../lib/server-commands';
import { VERSION_OPTIONS } from '../constants/versionOptions';
import styles from './AddServerModal.module.css';
import { softwareSelectOptions } from './serverSoftwareOptions';

/** Radix Select cannot take an empty string as an item value, so "no template" gets a sentinel. */
const NO_TEMPLATE = '__none__';

const addServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/),
  profileName: z.string().optional(),
  groupName: z.string().optional(),
  software: z.string().min(1),
  version: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  memory: z.number().int().min(1),
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
    control,
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
    ? `${rootPath}/${nameValue || t('addServer.pathPlaceholder')}`.replace(/\\/g, '/')
    : t('common.loading');

  const templateOptions: SelectOption[] = [
    { value: NO_TEMPLATE, label: t('addServer.template.none') },
    ...templates.map((template) => ({ value: template.id, label: template.name })),
  ];

  const softwareOptions = softwareSelectOptions(t);

  const versionOptions = VERSION_OPTIONS.map((version) => ({ value: version, label: version }));

  const handleClose = () => {
    reset();
    onClose();
  };

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

  const nameError = errors.name
    ? nameValue.trim()
      ? t('addServer.name.invalid')
      : t('addServer.name.required')
    : undefined;

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        data-testid="cancel-server-button"
        onClick={handleClose}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        form="add-server-form"
        variant="primary"
        data-testid="save-server-button"
      >
        {t('common.create')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-testid="add-server-modal"
        title={t('addServer.title')}
        width="min(520px, calc(100vw - var(--space-8)))"
        footer={footer}
      >
        <form
          id="add-server-form"
          className={styles.form}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {templates.length > 0 && (
            <Controller
              name="selectedTemplateId"
              control={control}
              render={({ field }) => (
                <Select
                  label={t('addServer.template.label')}
                  testId="server-template-select"
                  options={templateOptions}
                  value={field.value || NO_TEMPLATE}
                  onValueChange={(next) => field.onChange(next === NO_TEMPLATE ? '' : next)}
                />
              )}
            />
          )}

          <div>
            <Input
              label={t('addServer.name.label')}
              {...register('name')}
              data-testid="server-name-input"
              placeholder={t('addServer.name.placeholder')}
              error={nameError}
            />
            <p className={styles.pathPreview} data-testid="server-path-preview">
              {t('addServer.savePath')} {previewPath}
            </p>
          </div>

          <div className={styles.row}>
            <Input
              label={t('addServer.profileName.label')}
              {...register('profileName')}
              placeholder={t('addServer.profileName.placeholder')}
            />
            <Input
              label={t('addServer.groupName.label')}
              {...register('groupName')}
              placeholder={t('addServer.groupName.placeholder')}
            />
          </div>

          <div className={styles.row}>
            <Controller
              name="software"
              control={control}
              render={({ field }) => (
                <Select
                  label={t('addServer.software.label')}
                  testId="server-software-select"
                  options={softwareOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              name="version"
              control={control}
              render={({ field }) => (
                <Combobox
                  label={t('addServer.version.label')}
                  data-testid="server-version-select"
                  options={versionOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
          </div>

          <div className={styles.row}>
            <Controller
              name="port"
              control={control}
              render={({ field }) => (
                <NumberField
                  label={t('addServer.port.label')}
                  testId="server-port-input"
                  value={field.value}
                  onValueChange={field.onChange}
                  min={1}
                  max={65535}
                  formatOptions={{ useGrouping: false }}
                  error={errors.port ? t('addServer.port.invalid') : undefined}
                />
              )}
            />
            <Controller
              name="memory"
              control={control}
              render={({ field }) => (
                <NumberField
                  label={t('addServer.memory.label')}
                  testId="server-memory-input"
                  value={field.value}
                  onValueChange={field.onChange}
                  min={1}
                  suffix="GB"
                  error={errors.memory ? t('addServer.memory.invalid') : undefined}
                />
              )}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddServerModal;
