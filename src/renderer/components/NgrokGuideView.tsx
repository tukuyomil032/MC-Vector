import { useTranslation } from '../../i18n';

export default function NgrokGuideView() {
  const { t } = useTranslation();

  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="ngrok-guide-view">
      <h1 className="ngrok-guide-view__title">🌐 {t('ngrokGuide.title')}</h1>

      <div className="ngrok-guide-view__intro">
        <p className="ngrok-guide-view__intro-text">
          {t('ngrokGuide.introText')}
          <br />
          {t('ngrokGuide.introRequirements')}
        </p>
      </div>

      <div className="ngrok-guide-view__summary-grid">
        <div className="ngrok-guide-view__summary-card">
          <div className="ngrok-guide-view__summary-label">
            {t('ngrokGuide.summary.requirementsLabel')}
          </div>
          <div className="ngrok-guide-view__summary-value">
            {t('ngrokGuide.summary.requirementsValue')}
          </div>
          <div className="ngrok-guide-view__summary-note">
            {t('ngrokGuide.summary.requirementsNote')}
          </div>
        </div>
        <div className="ngrok-guide-view__summary-card">
          <div className="ngrok-guide-view__summary-label">
            {t('ngrokGuide.summary.obtainLabel')}
          </div>
          <div className="ngrok-guide-view__summary-value">
            {t('ngrokGuide.summary.obtainValue')}
          </div>
          <div className="ngrok-guide-view__summary-note">{t('ngrokGuide.summary.obtainNote')}</div>
        </div>
        <div className="ngrok-guide-view__summary-card">
          <div className="ngrok-guide-view__summary-label">
            {t('ngrokGuide.summary.shareLabel')}
          </div>
          <div className="ngrok-guide-view__summary-value">tcp://host:port</div>
          <div className="ngrok-guide-view__summary-note">{t('ngrokGuide.summary.shareNote')}</div>
        </div>
      </div>

      <div className="ngrok-guide-view__checklist-panel">
        <h2 className="ngrok-guide-view__checklist-title">{t('ngrokGuide.checklist.title')}</h2>
        <ul className="ngrok-guide-view__checklist">
          <li>{t('ngrokGuide.checklist.item1')}</li>
          <li>{t('ngrokGuide.checklist.item2')}</li>
          <li>{t('ngrokGuide.checklist.item3')}</li>
        </ul>
      </div>

      <div className="ngrok-guide-view__step">
        <div className="ngrok-guide-view__step-badge">{t('ngrokGuide.step1.badge')}</div>
        <h3>{t('ngrokGuide.step1.title')}</h3>
        <p>{t('ngrokGuide.step1.description')}</p>
        <button
          className="btn-primary ngrok-guide-view__cta-btn"
          onClick={() => openLink('https://dashboard.ngrok.com/get-started/your-authtoken')}
        >
          {t('ngrokGuide.step1.button')}
        </button>
        <div className="ngrok-guide-view__tip-box">{t('ngrokGuide.step1.tip')}</div>
      </div>

      <div className="ngrok-guide-view__step">
        <div className="ngrok-guide-view__step-badge">{t('ngrokGuide.step2.badge')}</div>
        <h3>{t('ngrokGuide.step2.title')}</h3>
        <p>
          {t('ngrokGuide.step2.description1')}
          <br />
          {t('ngrokGuide.step2.description2')}
        </p>
        <div className="ngrok-guide-view__token-example">{t('ngrokGuide.step2.example')}</div>
        <p className="ngrok-guide-view__note ngrok-guide-view__note--warning">
          {t('ngrokGuide.step2.securityWarning')}
        </p>
      </div>

      <div className="ngrok-guide-view__step">
        <div className="ngrok-guide-view__step-badge">{t('ngrokGuide.step3.badge')}</div>
        <h3>{t('ngrokGuide.step3.title')}</h3>
        <p>
          {t('ngrokGuide.step3.description1')}
          <br />
          {t('ngrokGuide.step3.description2')}
        </p>
        <p className="ngrok-guide-view__note">{t('ngrokGuide.step3.addressNote')}</p>
        <div className="ngrok-guide-view__tip-box">{t('ngrokGuide.step3.tip')}</div>
      </div>
    </div>
  );
}
