chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Quick Pass extension installed/updated. Background script is running.');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.storage.local.get('pendingLogin', (data) => {
      if (data.pendingLogin && tab.url.includes(new URL(data.pendingLogin.url).hostname)) {
        console.log('[Background] Pending login detected for:', tab.url);
        const { username, password, totpCode } = data.pendingLogin;

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (username, password, code) => {
            const fillAndLoginWithStrategy = () => {
              const siteStrategies = {
                'camp-admin': {
                  username: 'input[placeholder="Enter email address"]',
                  password: 'input[placeholder="Enter password"]',
                  twoFactor: 'input[placeholder="Enter 2FA Verification Code"]',
                  submit: () => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Sign in');
                    if (btn) btn.click();
                    return !!btn;
                  }
                },
                'camp.test': {
                  username: 'input[placeholder="Please enter email address"]',
                  password: 'input[placeholder="Please enter password"]',
                  twoFactor: 'input[placeholder="Please enter your 2FA code"]',
                  submit: () => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Login');
                    if (btn) btn.click();
                    return !!btn;
                  }
                },
                'default': {
                  username: 'input[name="username"], input[name="email"], input[autocomplete="username"]',
                  password: 'input[type="password"], input[name="password"]',
                  twoFactor: 'input[name="2fa"], input[name="one-time-code"], input[name="totp"]',
                  submit: () => true // Assume success, no specific button to click
                }
              };

              const hostname = window.location.hostname;
              let activeStrategyKey = 'default';
              for (const key in siteStrategies) {
                if (hostname.includes(key)) {
                  activeStrategyKey = key;
                  break;
                }
              }
              const strategy = siteStrategies[activeStrategyKey];

              function fillField(selector, value) {
                if (!selector || !value) return false;
                const element = document.querySelector(selector);
                if (element) {
                  element.focus();
                  element.value = value;
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  element.blur();
                  return true;
                }
                return false;
              }

              const usernameField = document.querySelector(strategy.username);
              const passwordField = document.querySelector(strategy.password);

              if (!usernameField || !passwordField) {
                return false; // Essential fields not found
              }

              fillField(strategy.username, username);
              fillField(strategy.password, password);
              fillField(strategy.twoFactor, code);

              return strategy.submit();
            };

            // Retry mechanism
            let attempts = 0;
            const maxAttempts = 10; // 10 * 500ms = 5 seconds
            const interval = setInterval(() => {
              console.log(`[Content Script] Attempt ${attempts + 1} to fill login form.`);
              if (fillAndLoginWithStrategy()) {
                console.log('[Content Script] Successfully filled and submitted.');
                clearInterval(interval);
              } else {
                attempts++;
                if (attempts >= maxAttempts) {
                  console.error('[Content Script] Failed to find login form elements after multiple attempts.');
                  clearInterval(interval);
                }
              }
            }, 500);
          },
          args: [username, password, totpCode]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error(`[Background] Script injection failed: ${chrome.runtime.lastError.message}`);
          } else {
            console.log('[Background] Script injected successfully.');
            // Clean up the pending login info
            chrome.storage.local.remove('pendingLogin', () => {
              console.log('[Background] Pending login data cleared.');
            });
          }
        });
      }
    });
  }
});
