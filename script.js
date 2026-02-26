/* ------------------------
   GLOBAL STATE
------------------------- */
const state = {
    apiToken: '',
    contacts: [],
    selectedContacts: new Set(),
    isFetching: false,
    isSending: false,
    locationId: null
};

/* ------------------------
   DOM ELEMENTS
------------------------- */
const elements = {
    apiTokenInput: document.getElementById('api-token'),
    authStep: document.getElementById('step-auth'),
    contactsStep: document.getElementById('step-contacts'),
    fetchBtn: document.getElementById('btn-fetch'),
    loadingState: document.getElementById('loading'),
    contactsList: document.getElementById('contacts-list'),
    selectionCount: document.getElementById('selection-count'),
    actionBar: document.getElementById('action-bar'),
    submitBtn: document.getElementById('btn-submit'),
    authError: document.getElementById('auth-error'),
    notificationContainer: document.getElementById('notification-container')
};

/* ------------------------
   LOCATION ID (ONLY SOURCE)
------------------------- */
function getLocationIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const locationId = params.get('locationId');

    if (
        locationId &&
        locationId.length >= 10 &&
        !locationId.includes('{{')
    ) {
        return locationId;
    }

    return null;
}

/* ------------------------
   INIT
------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    state.locationId = getLocationIdFromUrl();

    if (!state.locationId) {
        console.error(
            '❌ Location ID missing. Fix Custom Page Live URL:\n' +
            'https://yourapp.com/?locationId={{location.id}}'
        );
        showNotification('Location not detected. Contact support.', 'error');
    } else {
        console.log('✅ Location ID detected:', state.locationId);
    }

    initEventListeners();
});

/* ------------------------
   EVENT LISTENERS
------------------------- */
function initEventListeners() {
    elements.apiTokenInput.addEventListener('input', (e) => {
        state.apiToken = e.target.value.trim();

        const icon = elements.apiTokenInput.parentElement.querySelector('.status-icon');
        if (state.apiToken) {
            icon?.classList.remove('hidden');
            elements.authError.classList.add('hidden');
        } else {
            icon?.classList.add('hidden');
        }
    });

    elements.fetchBtn.addEventListener('click', handleFetchContacts);
    elements.submitBtn.addEventListener('click', handleSubmit);
}

/* ------------------------
   FETCH CONTACTS
------------------------- */
async function handleFetchContacts() {
    if (!state.apiToken) {
        showAuthError('Please enter a valid API token.');
        return;
    }

    setLoading(true);
    elements.authError.classList.add('hidden');

    try {
        const data = await fetchGhlContacts(state.apiToken);

        state.contacts = (data.data || []).map((item, index) => ({
            id: index + 1,
            number: item.number
        }));

        renderContacts();

        elements.loadingState.classList.add('hidden');
        elements.contactsStep.classList.remove('hidden');
        showNotification('Phone numbers fetched successfully!', 'success');

        elements.contactsStep.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        setLoading(false);
        showAuthError(error.message);
        showNotification('Failed to fetch contacts.', 'error');
    }
}

/* ------------------------
   RENDER CONTACTS
------------------------- */
function renderContacts() {
    elements.contactsList.innerHTML = '';

    state.contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.dataset.id = contact.id;
        item.onclick = () => toggleContactSelection(contact.id);

        item.innerHTML = `
            <div class="checkbox"></div>
            <div class="contact-info">
                <div class="contact-number">${contact.number}</div>
            </div>
        `;

        elements.contactsList.appendChild(item);
    });
}

/* ------------------------
   SELECTION LOGIC
------------------------- */
function toggleContactSelection(id) {
    const alreadySelected = state.selectedContacts.has(id);

    state.selectedContacts.clear();
    document.querySelectorAll('.contact-item.selected')
        .forEach(el => el.classList.remove('selected'));

    if (!alreadySelected) {
        state.selectedContacts.add(id);
        document.querySelector(`.contact-item[data-id="${id}"]`)
            ?.classList.add('selected');
    }

    updateSelectionUI();
}

function updateSelectionUI() {
    const count = state.selectedContacts.size;
    elements.selectionCount.textContent = count;

    if (count > 0) {
        elements.actionBar.classList.remove('hidden');
        setTimeout(() => elements.actionBar.classList.add('visible'), 10);
        elements.submitBtn.textContent = `Send to ${count} Recipient${count > 1 ? 's' : ''}`;
    } else {
        elements.actionBar.classList.remove('visible');
        setTimeout(() => elements.actionBar.classList.add('hidden'), 300);
    }
}

/* ------------------------
   SUBMIT
------------------------- */
async function handleSubmit() {
    if (!state.locationId) {
        showNotification('Location ID missing.', 'error');
        return;
    }

    if (state.selectedContacts.size === 0) return;

    const contact = state.contacts.find(c => state.selectedContacts.has(c.id));
    if (!contact) return;

    const originalText = elements.submitBtn.textContent;
    elements.submitBtn.disabled = true;
    elements.submitBtn.textContent = 'Sending...';

    try {
        const response = await fetch(
            'https://easifyqc67.zinops.com/api/external/gh/connect-user',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.apiToken}`
                },
                body: JSON.stringify({
                    location_id: state.locationId,
                    from_number: contact.number
                })
            }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        showNotification('User connected successfully!', 'success');

    } catch (err) {
        showNotification(err.message || 'Failed to connect user.', 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = originalText;
        state.selectedContacts.clear();
        updateSelectionUI();
    }
}

/* ------------------------
   HELPERS
------------------------- */
function setLoading(loading) {
    elements.fetchBtn.disabled = loading;
    elements.loadingState.classList.toggle('hidden', !loading);
}

function showAuthError(msg) {
    elements.authError.textContent = msg;
    elements.authError.classList.remove('hidden');
}

function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    elements.notificationContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/* ------------------------
   API
------------------------- */
async function fetchGhlContacts(token) {
    const res = await fetch(
        'https://easifyqc67.zinops.com/api/external/get-phone-numbers',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to connect GHL');
    }

    return res.json();
}