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
            const fillAndLogin = () => {
              function fillField(element, value) {
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

              let success = false;
              const isAdminPage = /camp-admin|camp\.test/.test(window.location.hostname);

              if (isAdminPage) {
                const usernameField = document.querySelector('input[placeholder="Enter email address"]');
                const passwordField = document.querySelector('input[placeholder="Enter password"]');
                const twoFactorField = document.querySelector('input[placeholder="Enter 2FA Verification Code"]');
                
                if (usernameField && passwordField) { // 2FA field might not be present initially
                  fillField(usernameField, username);
                  fillField(passwordField, password);
                  fillField(twoFactorField, code);

                  const signInButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Sign in');
                  if (signInButton) {
                      signInButton.click();
                      success = true;
                  }
                }
              } else {
                const usernameField = document.querySelector('input[name="username"], input[name="email"], input[autocomplete="username"]');
                const passwordField = document.querySelector('input[type="password"], input[name="password"]');
                
                if (usernameField && passwordField) {
                  const twoFactorField = document.querySelector('input[name="2fa"], input[name="one-time-code"], input[name="totp"]');
                  fillField(usernameField, username);
                  fillField(passwordField, password);
                  fillField(twoFactorField, code);
                  success = true; // Assume success if fields are filled, as login button is generic
                }
              }
              return success;
            };

            // Retry mechanism
            let attempts = 0;
            const maxAttempts = 10; // 10 * 500ms = 5 seconds
            const interval = setInterval(() => {
              console.log(`[Content Script] Attempt ${attempts + 1} to fill login form.`);
              if (fillAndLogin()) {
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
