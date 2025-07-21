document.addEventListener('DOMContentLoaded', () => {
  const logContainer = document.getElementById('log-container');
  function log(message) {
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  log('Popup script loaded.');

  const passwordForm = document.getElementById('passwordForm');
  const passwordList = document.getElementById('passwordList');
  const nameInput = document.getElementById('name');
  const urlInput = document.getElementById('url');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const twoFactorSecretInput = document.getElementById('twoFactorSecret');
  const submitButton = passwordForm.querySelector('button[type="submit"]');

  let editingIndex = null;

  // Restore saved input fields
  chrome.storage.local.get(['name', 'url', 'username', 'password', 'twoFactorSecret'], (data) => {
    if (data.name) nameInput.value = data.name;
    if (data.url) urlInput.value = data.url;
    if (data.username) usernameInput.value = data.username;
    if (data.password) passwordInput.value = data.password;
    if (data.twoFactorSecret) twoFactorSecretInput.value = data.twoFactorSecret;
  });

  // Save input fields on change
  nameInput.addEventListener('input', () => chrome.storage.local.set({ name: nameInput.value }));
  urlInput.addEventListener('input', () => chrome.storage.local.set({ url: urlInput.value }));
  usernameInput.addEventListener('input', () => chrome.storage.local.set({ username: usernameInput.value }));
  passwordInput.addEventListener('input', () => chrome.storage.local.set({ password: passwordInput.value }));
  twoFactorSecretInput.addEventListener('input', () => chrome.storage.local.set({ twoFactorSecret: twoFactorSecretInput.value }));

  // Load saved passwords
  loadPasswords();

  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value;
    const url = urlInput.value;
    const username = usernameInput.value;
    const password = passwordInput.value;
    const twoFactorSecret = twoFactorSecretInput.value;
    const entry = { name, url, username, password, twoFactorSecret };

    if (editingIndex !== null) {
      updatePassword(editingIndex, entry);
    } else {
      savePassword(entry);
    }

    resetForm();
  });

  function resetForm() {
    passwordForm.reset();
    editingIndex = null;
    submitButton.textContent = 'Save';
    chrome.storage.local.remove(['name', 'url', 'username', 'password', 'twoFactorSecret']);
  }

  function updatePassword(index, entry) {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const passwords = data.passwords;
      passwords[index] = entry;
      chrome.storage.sync.set({ passwords }, () => {
        loadPasswords();
      });
    });
  }

  function savePassword(entry) {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const passwords = data.passwords;
      passwords.push(entry);
      chrome.storage.sync.set({ passwords }, () => {
        loadPasswords();
      });
    });
  }

  function loadPasswords() {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      passwordList.innerHTML = '';
      data.passwords.forEach((entry, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span><strong>${entry.name}</strong> (${entry.username})</span>
          <div>
            <button class="fill-btn" data-index="${index}">Fill</button>
            <button class="edit-btn" data-index="${index}">Edit</button>
            <button class="delete-btn" data-index="${index}">Delete</button>
          </div>
        `;
        passwordList.appendChild(li);
      });
    });
  }

  passwordList.addEventListener('click', (e) => {

    const target = e.target;
    if (target.classList.contains('delete-btn')) {
      const index = target.getAttribute('data-index');
      deletePassword(index);
    } else if (target.classList.contains('edit-btn')) {
      const index = target.getAttribute('data-index');
      startEdit(index);
    } else if (target.classList.contains('fill-btn')) {
      const index = target.getAttribute('data-index');
      fillPassword(index);
    }
  });

  function fillPassword(index) {
    log(`Fill button clicked for index: ${index}`);
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const entry = data.passwords[index];
      if (entry) {
        log('Found entry: ' + JSON.stringify(entry));
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
            log('ERROR: No active tab found.');
            return;
          }
          const tabId = tabs[0].id;
          log(`Active tab found: ${tabId}`);

          let totpCode = '';
          if (entry.twoFactorSecret) {
            try {
              const totp = new OTPAuth.TOTP({
                secret: entry.twoFactorSecret
              });
              totpCode = totp.generate();
              log(`Generated TOTP code: ${totpCode}`);
            } catch (error) {
              log(`Error generating TOTP code: ${error.message}`);
            }
          }

          log('Executing script...');
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

              if (window.location.hostname === 'dev-camp-admin.mce.sg') {
                const usernameField = document.querySelector('input[placeholder="Enter email address"]');
                const passwordField = document.querySelector('input[placeholder="Enter password"]');
                const twoFactorField = document.querySelector('input[placeholder="Enter 2FA Verification Code"]');
                
                fillField(usernameField, username);
                fillField(passwordField, password);
                fillField(twoFactorField, code);
              } else {
                const usernameField = document.querySelector('input[name="username"], input[name="email"], input[autocomplete="username"]');
                const passwordField = document.querySelector('input[type="password"], input[name="password"]');
                const twoFactorField = document.querySelector('input[name="2fa"], input[name="one-time-code"], input[name="totp"]');

                fillField(usernameField, username);
                fillField(passwordField, password);
                fillField(twoFactorField, code);
              }
            },
            args: [entry.username, entry.password, totpCode]
          }, () => {
            if (chrome.runtime.lastError) {
              log(`ERROR: Script injection failed: ${chrome.runtime.lastError.message}`);
            } else {
              log('Script injected successfully.');
            }
          });
        });
      } else {
        log(`ERROR: No entry found for index: ${index}`);
      }
    });
  }

  function startEdit(index) {

    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const entry = data.passwords[index];
      if (entry) {
        nameInput.value = entry.name;
        urlInput.value = entry.url;
        usernameInput.value = entry.username;
        passwordInput.value = entry.password;
        twoFactorSecretInput.value = entry.twoFactorSecret || '';
        
        editingIndex = index;
        submitButton.textContent = 'Update';
      }
    });
  }

  function deletePassword(index) {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const passwords = data.passwords;
      passwords.splice(index, 1);
      chrome.storage.sync.set({ passwords }, () => {
        loadPasswords();
      });
    });
  }
});
