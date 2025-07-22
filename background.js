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
            function fillField(element, value) {
              if (element) {
                element.focus();
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.blur();
              }
            }

            if (window.location.hostname.includes('camp-admin')) {
              const usernameField = document.querySelector('input[placeholder="Enter email address"]');
              const passwordField = document.querySelector('input[placeholder="Enter password"]');
              const twoFactorField = document.querySelector('input[placeholder="Enter 2FA Verification Code"]');
              
              fillField(usernameField, username);
              fillField(passwordField, password);
              fillField(twoFactorField, code);

              const signInButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Sign in');
              if (signInButton) {
                  signInButton.click();
              }
            } else {
              const usernameField = document.querySelector('input[name="username"], input[name="email"], input[autocomplete="username"]');
              const passwordField = document.querySelector('input[type="password"], input[name="password"]');
              const twoFactorField = document.querySelector('input[name="2fa"], input[name="one-time-code"], input[name="totp"]');

              fillField(usernameField, username);
              fillField(passwordField, password);
              fillField(twoFactorField, code);
            }
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
