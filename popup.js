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
  const roleInput = document.getElementById('role');
  const twoFactorSecretInput = document.getElementById('twoFactorSecret');
  const submitButton = passwordForm.querySelector('button[type="submit"]');

  let editingIndex = null;

  // Restore saved input fields
  chrome.storage.local.get(['name', 'url', 'username', 'password', 'role', 'twoFactorSecret'], (data) => {
    if (data.name) nameInput.value = data.name;
    if (data.url) urlInput.value = data.url;
    if (data.username) usernameInput.value = data.username;
    if (data.password) passwordInput.value = data.password;
    if (data.role) roleInput.value = data.role;
    if (data.twoFactorSecret) twoFactorSecretInput.value = data.twoFactorSecret;
  });

  // Save input fields on change
  nameInput.addEventListener('input', () => chrome.storage.local.set({ name: nameInput.value }));
  urlInput.addEventListener('input', () => chrome.storage.local.set({ url: urlInput.value }));
  usernameInput.addEventListener('input', () => chrome.storage.local.set({ username: usernameInput.value }));
  passwordInput.addEventListener('input', () => chrome.storage.local.set({ password: passwordInput.value }));
  roleInput.addEventListener('input', () => chrome.storage.local.set({ role: roleInput.value }));
  twoFactorSecretInput.addEventListener('input', () => chrome.storage.local.set({ twoFactorSecret: twoFactorSecretInput.value }));

  // Load saved passwords
  loadPasswords();

  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value;
    const url = urlInput.value;
    const username = usernameInput.value;
    const password = passwordInput.value;
    const role = roleInput.value;
    const twoFactorSecret = twoFactorSecretInput.value;
    const entry = { name, url, username, password, role, twoFactorSecret };

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
    chrome.storage.local.remove(['name', 'url', 'username', 'password', 'role', 'twoFactorSecret']);
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
        // Add a clickable span with data-url attribute
        const roleDisplay = entry.role ? ` [${entry.role}]` : '';
        li.innerHTML = `
          <span class="entry-details" data-url="${entry.url}" style="cursor: pointer;" title="Click to open ${entry.url}">
            <strong>${entry.name}</strong> (${entry.username})${roleDisplay}
          </span>
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
    const entryDetails = target.closest('.entry-details');

    if (entryDetails) {
      const url = entryDetails.getAttribute('data-url');
      if (url) {
        // Ensure the URL has a scheme
        const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
        chrome.tabs.create({ url: fullUrl });
      }
    } else if (target.classList.contains('delete-btn')) {
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
        roleInput.value = entry.role || '';
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

  document.getElementById('export-btn').addEventListener('click', () => {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const passwordsJson = JSON.stringify(data.passwords, null, 2);
      const blob = new Blob([passwordsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'passwords.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log('Passwords exported to passwords.json');
    });
  });

  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');

  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedPasswords = JSON.parse(e.target.result);
        if (!Array.isArray(importedPasswords)) {
          throw new Error('Invalid JSON format. Expected an array.');
        }

        chrome.storage.sync.get({ passwords: [] }, (data) => {
          const existingPasswords = data.passwords;
          let updatedCount = 0;
          let addedCount = 0;

          importedPasswords.forEach(importedEntry => {
            const existingIndex = existingPasswords.findIndex(
              p => p.url === importedEntry.url && p.username === importedEntry.username
            );

            if (existingIndex !== -1) {
              existingPasswords[existingIndex] = importedEntry;
              updatedCount++;
            } else {
              existingPasswords.push(importedEntry);
              addedCount++;
            }
          });

          chrome.storage.sync.set({ passwords: existingPasswords }, () => {
            loadPasswords();
            log(`Import successful. Updated: ${updatedCount}, Added: ${addedCount}`);
          });
        });
      } catch (error) {
        log(`Error importing file: ${error.message}`);
      }
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = null;
  });
});
