import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Suppress if already running in standalone installed mode
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          aria-label="Install Synapse App"
          title="Install Synapse as a desktop or mobile app"
          className="min-h-[44px] px-3 rounded-lg bg-surface-container-high border border-secondary/40 text-secondary hover:bg-surface-bright font-code-sm text-code-sm inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            download
          </span>
          <span className="hidden xl:inline">Install App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          aria-label="Install Synapse Web App"
          title="Install Synapse as an offline-capable Web App"
          className="min-h-[44px] px-2.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-code-sm text-code-sm inline-flex items-center gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            install_mobile
          </span>
          <span className="hidden 2xl:inline">{isIOS ? 'Install on iOS' : 'Install PWA'}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div className="bg-surface-container w-full max-w-md rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary">
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  install_desktop
                </span>
                <h3
                  id="pwa-install-guide-title"
                  className="font-headline-sm text-headline-sm text-on-surface"
                >
                  Install Synapse App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>

            {isIOS ? (
              <div className="font-body-sm text-body-sm text-on-surface-variant space-y-2">
                <p>To install Synapse on iPhone or iPad:</p>
                <ol className="list-decimal list-inside space-y-1 text-on-surface">
                  <li>
                    Tap the <strong>Share</strong> button in your Safari toolbar.
                  </li>
                  <li>
                    Scroll down and select <strong>Add to Home Screen</strong>.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="font-body-sm text-body-sm text-on-surface-variant space-y-2">
                <p>
                  Synapse is a Progressive Web App (PWA) with offline specification caching.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-on-surface">
                  <li>
                    Open this site in a top-level browser tab (outside of any preview iframe).
                  </li>
                  <li>
                    Click the <strong>Install Synapse</strong> icon in your browser address bar or
                    menu (<em>Install app</em> / <em>Add to Home screen</em>).
                  </li>
                </ol>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
