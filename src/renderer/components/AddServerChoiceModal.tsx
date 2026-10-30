import { FolderInput, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { RadioCards, type RadioCardOption } from '@/components/arc/radio-cards/radio-cards';
import { useTranslation } from '../../i18n';

type AddServerChoice = 'new' | 'import';

interface AddServerChoiceModalProps {
  open: boolean;
  onClose: () => void;
  onNewServer: () => void;
  onImportServer: () => void;
}

export default function AddServerChoiceModal({
  open,
  onClose,
  onNewServer,
  onImportServer,
}: AddServerChoiceModalProps) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<AddServerChoice | null>(null);

  const options: RadioCardOption[] = [
    {
      value: 'new',
      label: t('addServer.choice.newServer'),
      description: t('addServer.choice.newServerHint'),
      icon: <Plus size={16} strokeWidth={1.75} aria-hidden="true" />,
      testId: 'choice-new-server-button',
    },
    {
      value: 'import',
      label: t('addServer.choice.importServer'),
      description: t('addServer.choice.importServerHint'),
      icon: <FolderInput size={16} strokeWidth={1.75} aria-hidden="true" />,
      testId: 'choice-import-server-button',
    },
  ];

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    setChoice(null);
    onClose();
  };

  const proceed = () => {
    if (choice === null) return;
    if (choice === 'new') onNewServer();
    else onImportServer();
    setChoice(null);
    onClose();
  };

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        data-testid="choice-cancel-button"
        onClick={onClose}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        data-testid="choice-next-button"
        disabled={choice === null}
        onClick={proceed}
      >
        {t('common.next')}
      </Button>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        data-testid="add-server-choice-modal"
        title={t('addServer.choice.title')}
        footer={footer}
      >
        <RadioCards
          aria-label={t('addServer.choice.title')}
          layout="list"
          options={options}
          value={choice}
          onValueChange={(value) => setChoice(value as AddServerChoice)}
        />
      </DialogContent>
    </Dialog>
  );
}
