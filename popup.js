document.addEventListener('DOMContentLoaded', () => {
  const passwordForm = document.getElementById('passwordForm');
  const passwordList = document.getElementById('passwordList');
  const nameInput = document.getElementById('name');
  const urlInput = document.getElementById('url');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const submitButton = passwordForm.querySelector('button[type="submit"]');

  let editingIndex = null;

  // Restore saved input fields
  chrome.storage.local.get(['name', 'url', 'username', 'password'], (data) => {
    if (data.name) nameInput.value = data.name;
    if (data.url) urlInput.value = data.url;
    if (data.username) usernameInput.value = data.username;
    if (data.password) passwordInput.value = data.password;
  });

  // Save input fields on change
  nameInput.addEventListener('input', () => chrome.storage.local.set({ name: nameInput.value }));
  urlInput.addEventListener('input', () => chrome.storage.local.set({ url: urlInput.value }));
  usernameInput.addEventListener('input', () => chrome.storage.local.set({ username: usernameInput.value }));
  passwordInput.addEventListener('input', () => chrome.storage.local.set({ password: passwordInput.value }));

  // Load saved passwords
  loadPasswords();

  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value;
    const url = urlInput.value;
    const username = usernameInput.value;
    const password = passwordInput.value;
    const entry = { name, url, username, password };

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
    chrome.storage.local.remove(['name', 'url', 'username', 'password']);
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
    }
  });

  function startEdit(index) {
    chrome.storage.sync.get({ passwords: [] }, (data) => {
      const entry = data.passwords[index];
      if (entry) {
        nameInput.value = entry.name;
        urlInput.value = entry.url;
        usernameInput.value = entry.username;
        passwordInput.value = entry.password;
        
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
