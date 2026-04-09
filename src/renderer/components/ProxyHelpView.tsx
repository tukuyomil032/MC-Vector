import type { FC } from 'react';
import { useTranslation } from '../../i18n';

const ProxyHelpView: FC = () => {
  const { t } = useTranslation();

  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="proxy-help-view">
      <h1 className="proxy-help-view__title">🌐 {t('proxyHelp.title')}</h1>

      <div className="proxy-help-view__intro">
        <p className="proxy-help-view__intro-text">
          {t('proxyHelp.introLine1')}
          <br />
          {t('proxyHelp.introLine2')}
        </p>
      </div>

      <div className="proxy-help-view__summary-grid">
        <div className="proxy-help-view__summary-card">
          <div className="proxy-help-view__summary-label">{t('proxyHelp.recommendedSoftware')}</div>
          <div className="proxy-help-view__summary-value">Velocity</div>
          <div className="proxy-help-view__summary-note">
            {t('proxyHelp.recommendedSoftwareNote')}
          </div>
        </div>
        <div className="proxy-help-view__summary-card">
          <div className="proxy-help-view__summary-label">{t('proxyHelp.recommendedPort')}</div>
          <div className="proxy-help-view__summary-value">25577</div>
          <div className="proxy-help-view__summary-note">{t('proxyHelp.recommendedPortNote')}</div>
        </div>
        <div className="proxy-help-view__summary-card">
          <div className="proxy-help-view__summary-label">{t('proxyHelp.minConfig')}</div>
          <div className="proxy-help-view__summary-value">{t('proxyHelp.minConfigValue')}</div>
          <div className="proxy-help-view__summary-note">{t('proxyHelp.minConfigNote')}</div>
        </div>
      </div>

      <div className="proxy-help-view__checklist-panel">
        <h2 className="proxy-help-view__checklist-title">{t('proxyHelp.checklistTitle')}</h2>
        <ul className="proxy-help-view__checklist">
          <li>{t('proxyHelp.checklistItem1')}</li>
          <li>{t('proxyHelp.checklistItem2')}</li>
          <li>{t('proxyHelp.checklistItem3')}</li>
        </ul>
      </div>

      {/* --- Step 1 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">{t('proxyHelp.step1Badge')}</div>
        <h3>{t('proxyHelp.step1Title')}</h3>
        <p>{t('proxyHelp.step1Desc')}</p>

        <ul className="proxy-help-view__list">
          <li>
            <strong>{t('proxyHelp.step1Software')}</strong>
            <br />
            <span className="proxy-help-view__muted">{t('proxyHelp.step1SoftwareDesc')}</span>
          </li>
          <li>
            <strong>{t('proxyHelp.step1Port')}</strong>
            <br />
            <span className="proxy-help-view__muted">
              {t('proxyHelp.step1PortDesc1')}
              <br />
              {t('proxyHelp.step1PortDesc2')}
            </span>
          </li>
          <li>
            <strong>{t('proxyHelp.step1Backend')}</strong>
            <br />
            <span className="proxy-help-view__muted">{t('proxyHelp.step1BackendDesc')}</span>
          </li>
        </ul>
        <p>{t('proxyHelp.step1Action')}</p>
        <div className="proxy-help-view__tip-box">{t('proxyHelp.step1Tip')}</div>
      </div>

      {/* --- Step 2 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">{t('proxyHelp.step2Badge')}</div>
        <h3>{t('proxyHelp.step2Title')}</h3>
        <p>{t('proxyHelp.step2Desc')}</p>

        <div className="mb-4">
          <strong>{t('proxyHelp.step2Navigate')}</strong>
          <br />
          <span className="proxy-help-view__muted">{t('proxyHelp.step2NavigateDesc')}</span>
          <div className="proxy-help-view__code">servers/Proxy-Server</div>
        </div>

        <div>
          <strong>{t('proxyHelp.step2Download')}</strong>
          <br />
          <span className="proxy-help-view__muted">{t('proxyHelp.step2DownloadDesc')}</span>
          <div className="proxy-help-view__cta-row">
            <button
              className="btn-primary proxy-help-view__cta-btn"
              onClick={() => openLink('https://papermc.io/downloads/velocity')}
            >
              {t('proxyHelp.openPaperVelocity')}
            </button>
            <button
              className="btn-secondary proxy-help-view__cta-btn-secondary"
              onClick={() => openLink('https://docs.papermc.io/velocity/')}
            >
              {t('proxyHelp.openVelocityDocs')}
            </button>
          </div>
        </div>
      </div>

      {/* --- Step 3 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">{t('proxyHelp.step3Badge')}</div>
        <h3>{t('proxyHelp.step3Title')}</h3>

        <div className="mb-4">
          <strong>{t('proxyHelp.step3Edit')}</strong>
          <br />
          <span className="proxy-help-view__muted">
            {t('proxyHelp.step3EditDesc1')}
            <br />
            {t('proxyHelp.step3EditDesc2')}
          </span>
          <div className="proxy-help-view__code">
            velocity.toml{' '}
            <span className="text-zinc-600 text-xs">{t('proxyHelp.autoGenerated')}</span>
          </div>
        </div>

        <div>
          <strong>{t('proxyHelp.step3Save')}</strong>
          <br />
          <span className="proxy-help-view__muted">
            {t('proxyHelp.step3SaveDesc1')}
            <br />
            {t('proxyHelp.step3SaveDesc2')}
          </span>
        </div>

        <div className="proxy-help-view__tip-box">{t('proxyHelp.step3Tip')}</div>
      </div>

      <div className="proxy-help-view__done">🎉 {t('proxyHelp.done')}</div>
    </div>
  );
};

export default ProxyHelpView;
