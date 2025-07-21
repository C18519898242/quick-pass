document.addEventListener('DOMContentLoaded', () => {
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
    console.log(`[Popup] Fill button clicked for index: ${index}`);
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const entry = data.passwords[index];
      if (entry) {
        console.log('[Popup] Found entry:', entry);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
            console.error('[Popup] No active tab found.');
            return;
          }
          const tabId = tabs[0].id;
          console.log(`[Popup] Active tab found: ${tabId}`);

          let totpCode = '';
          if (entry.twoFactorSecret) {
            const totp = new TOTP(entry.twoFactorSecret);
            totpCode = totp.generate();
            console.log(`[Popup] Generated TOTP code: ${totpCode}`);
          }

          console.log('[Popup] Executing script...');
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (username, password, code) => {
              console.log('--- Password Fill Script Executing ---');
              console.log('Attempting to fill with:', { username, password, code });

              // Specific selectors for dev-camp-admin.mce.sg
              if (window.location.hostname === 'dev-camp-admin.mce.sg') {
                console.log('Site detected: dev-camp-admin.mce.sg');
                const usernameField = document.querySelector('input[placeholder="Enter email address"]');
                const passwordField = document.querySelector('input[placeholder="Enter password"]');
                const twoFactorField = document.querySelector('input[placeholder="Enter 2FA Verification Code"]');
                
                console.log('Fields found:', { usernameField, passwordField, twoFactorField });

                if (usernameField) {
                  usernameField.value = username;
                  console.log('Username field filled.');
                }
                if (passwordField) {
                  passwordField.value = password;
                  console.log('Password field filled.');
                }
                if (twoFactorField && code) {
                  twoFactorField.value = code;
                  console.log('2FA field filled.');
                }
              } else {
                console.log('Using generic selectors for site:', window.location.hostname);
                // Generic selectors for other sites
                const usernameField = document.querySelector('input[name="username"], input[name="email"], input[autocomplete="username"]');
                const passwordField = document.querySelector('input[type="password"], input[name="password"]');
                const twoFactorField = document.querySelector('input[name="2fa"], input[name="one-time-code"], input[name="totp"]');

                console.log('Fields found:', { usernameField, passwordField, twoFactorField });

                if (usernameField) {
                  usernameField.value = username;
                  console.log('Username field filled.');
                }
                if (passwordField) {
                  passwordField.value = password;
                  console.log('Password field filled.');
                }
                if (twoFactorField && code) {
                  twoFactorField.value = code;
                  console.log('2FA field filled.');
                }
              }
              console.log('--- Script Finished ---');
            },
            args: [entry.username, entry.password, totpCode]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error(`[Popup] Script injection failed: ${chrome.runtime.lastError.message}`);
            } else {
              console.log('[Popup] Script injected successfully.');
            }
          });
        });
      } else {
        console.error(`[Popup] No entry found for index: ${index}`);
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
