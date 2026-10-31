import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { CodeBlock } from '@/components/arc/code-block/code-block';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useArcMessages } from '../shared/arc-messages';
import { useUiStore } from '../../store/uiStore';
import { openGuideLink } from '../shared/guide-links';
import { Phrase } from '../shared/japanese-phrase';
import { notify } from '../shared/notify';
import { GuideStep } from './GuideStep';
import styles from './GuideView.module.css';

export default function NgrokGuideView() {
  const { t } = useTranslation();
  const arc = useArcMessages();
  const returnToPreviousView = useUiStore((state) => state.returnToPreviousView);

  const openLink = async (url: string) => {
    if (!(await openGuideLink(url))) {
      notify.error(t('ngrokGuide.openLinkFailed'));
    }
  };

  const checklistItems = [
    t('ngrokGuide.checklist.item1'),
    t('ngrokGuide.checklist.item2'),
    t('ngrokGuide.checklist.item3'),
  ];

  return (
    <div className={styles.root} data-testid="ngrok-guide-view">
      <div className={styles.inner}>
        <div className={styles.topbar}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="guide-back-button"
            onClick={returnToPreviousView}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            {t('common.back')}
          </Button>
        </div>

        <p className={styles.intro}>
          <Phrase text={t('ngrokGuide.introText')} />{' '}
          <Phrase text={t('ngrokGuide.introRequirements')} />
        </p>

        <div className={styles.summary}>
          <Card title={t('ngrokGuide.summary.requirementsLabel')} className={styles.card}>
            <p className={styles.value}>{t('ngrokGuide.summary.requirementsValue')}</p>
            <p className={styles.note}>
              <Phrase text={t('ngrokGuide.summary.requirementsNote')} />
            </p>
          </Card>
          <Card title={t('ngrokGuide.summary.obtainLabel')} className={styles.card}>
            <p className={styles.value}>{t('ngrokGuide.summary.obtainValue')}</p>
            <p className={styles.note}>
              <Phrase text={t('ngrokGuide.summary.obtainNote')} />
            </p>
          </Card>
          <Card title={t('ngrokGuide.summary.shareLabel')} className={styles.card}>
            <p className={styles.value}>tcp://host:port</p>
            <p className={styles.note}>
              <Phrase text={t('ngrokGuide.summary.shareNote')} />
            </p>
          </Card>
        </div>

        <Card title={t('ngrokGuide.checklist.title')} className={styles.card}>
          <ul className={styles.checklist}>
            {checklistItems.map((item) => (
              <li key={item}>
                <Check
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={styles.checkIcon}
                />
                <Phrase text={item} />
              </li>
            ))}
          </ul>
        </Card>

        <GuideStep badge={t('ngrokGuide.step1.badge')} title={t('ngrokGuide.step1.title')}>
          <p>
            <Phrase text={t('ngrokGuide.step1.description')} />
          </p>
          <div className={styles.ctaRow}>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                void openLink('https://dashboard.ngrok.com/get-started/your-authtoken')
              }
            >
              {t('ngrokGuide.step1.button')}
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
          <Alert tone="info" title={t('ngrokGuide.step1.tip')} />
        </GuideStep>

        <GuideStep badge={t('ngrokGuide.step2.badge')} title={t('ngrokGuide.step2.title')}>
          <p>
            <Phrase text={t('ngrokGuide.step2.description1')} />
          </p>
          <p>
            <Phrase text={t('ngrokGuide.step2.description2')} />
          </p>
          <CodeBlock
            code="2Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx"
            filename={t('ngrokGuide.summary.obtainValue')}
            messages={arc.codeBlock}
            language="text"
          />
          <Alert tone="warning" title={t('ngrokGuide.step2.securityWarning')} />
        </GuideStep>

        <GuideStep badge={t('ngrokGuide.step3.badge')} title={t('ngrokGuide.step3.title')}>
          <p>
            <Phrase text={t('ngrokGuide.step3.description1')} />
          </p>
          <p>
            <Phrase text={t('ngrokGuide.step3.description2')} />
          </p>
          <p className={styles.note}>
            <Phrase text={t('ngrokGuide.step3.addressNote')} />
          </p>
          <Alert tone="info" title={t('ngrokGuide.step3.tip')} />
        </GuideStep>
      </div>
    </div>
  );
}
