import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { CodeBlock } from '@/components/arc/code-block/code-block';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import type { FC } from 'react';
import { useTranslation } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { openGuideLink } from '../shared/guide-links';
import { notify } from '../shared/notify';
import { GuideStep } from './GuideStep';
import styles from './GuideView.module.css';

const ProxyHelpView: FC = () => {
  const { t } = useTranslation();
  const returnToPreviousView = useUiStore((state) => state.returnToPreviousView);

  const openLink = async (url: string) => {
    if (!(await openGuideLink(url))) {
      notify.error(t('proxyHelp.openLinkFailed'));
    }
  };

  const checklistItems = [
    t('proxyHelp.checklistItem1'),
    t('proxyHelp.checklistItem2'),
    t('proxyHelp.checklistItem3'),
  ];

  return (
    <div className={styles.root} data-testid="proxy-help-view">
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
          {t('proxyHelp.introLine1')} {t('proxyHelp.introLine2')}
        </p>

        <div className={styles.summary}>
          <Card title={t('proxyHelp.recommendedSoftware')} className={styles.card}>
            <p className={styles.value}>Velocity</p>
            <p className={styles.note}>{t('proxyHelp.recommendedSoftwareNote')}</p>
          </Card>
          <Card title={t('proxyHelp.recommendedPort')} className={styles.card}>
            <p className={styles.value}>25577</p>
            <p className={styles.note}>{t('proxyHelp.recommendedPortNote')}</p>
          </Card>
          <Card title={t('proxyHelp.minConfig')} className={styles.card}>
            <p className={styles.value}>{t('proxyHelp.minConfigValue')}</p>
            <p className={styles.note}>{t('proxyHelp.minConfigNote')}</p>
          </Card>
        </div>

        <Card title={t('proxyHelp.checklistTitle')} className={styles.card}>
          <ul className={styles.checklist}>
            {checklistItems.map((item) => (
              <li key={item}>
                <Check
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={styles.checkIcon}
                />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <GuideStep badge={t('proxyHelp.step1Badge')} title={t('proxyHelp.step1Title')}>
          <p>{t('proxyHelp.step1Desc')}</p>
          <ul className={styles.list}>
            <li className={styles.stack}>
              <span className={styles.listTitle}>{t('proxyHelp.step1Software')}</span>
              <span className={styles.listNote}>{t('proxyHelp.step1SoftwareDesc')}</span>
            </li>
            <li className={styles.stack}>
              <span className={styles.listTitle}>{t('proxyHelp.step1Port')}</span>
              <span className={styles.listNote}>{t('proxyHelp.step1PortDesc1')}</span>
              <span className={styles.listNote}>{t('proxyHelp.step1PortDesc2')}</span>
            </li>
            <li className={styles.stack}>
              <span className={styles.listTitle}>{t('proxyHelp.step1Backend')}</span>
              <span className={styles.listNote}>{t('proxyHelp.step1BackendDesc')}</span>
            </li>
          </ul>
          <p>{t('proxyHelp.step1Action')}</p>
          <Alert tone="info" title={t('proxyHelp.step1Tip')} />
        </GuideStep>

        <GuideStep badge={t('proxyHelp.step2Badge')} title={t('proxyHelp.step2Title')}>
          <p>{t('proxyHelp.step2Desc')}</p>
          <div className={styles.stack}>
            <span className={styles.listTitle}>{t('proxyHelp.step2Navigate')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step2NavigateDesc')}</span>
            <CodeBlock code="servers/Proxy-Server" filename="Proxy-Server" language="text" />
          </div>
          <div className={styles.stack}>
            <span className={styles.listTitle}>{t('proxyHelp.step2Download')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step2DownloadDesc')}</span>
            <div className={styles.ctaRow}>
              <Button
                type="button"
                variant="primary"
                onClick={() => void openLink('https://papermc.io/downloads/velocity')}
              >
                {t('proxyHelp.openPaperVelocity')}
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void openLink('https://docs.papermc.io/velocity/')}
              >
                {t('proxyHelp.openVelocityDocs')}
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </GuideStep>

        <GuideStep badge={t('proxyHelp.step3Badge')} title={t('proxyHelp.step3Title')}>
          <div className={styles.stack}>
            <span className={styles.listTitle}>{t('proxyHelp.step3Edit')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step3EditDesc1')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step3EditDesc2')}</span>
            <CodeBlock
              code="servers/Proxy-Server/velocity.toml"
              filename="velocity.toml"
              language="toml"
            />
            <span className={styles.listNote}>{t('proxyHelp.autoGenerated')}</span>
          </div>
          <div className={styles.stack}>
            <span className={styles.listTitle}>{t('proxyHelp.step3Save')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step3SaveDesc1')}</span>
            <span className={styles.listNote}>{t('proxyHelp.step3SaveDesc2')}</span>
          </div>
          <Alert tone="info" title={t('proxyHelp.step3Tip')} />
        </GuideStep>

        <Alert tone="success" title={t('proxyHelp.done')} />
      </div>
    </div>
  );
};

export default ProxyHelpView;
