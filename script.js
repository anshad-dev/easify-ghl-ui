const state = {
    apiToken: '',
    contacts: [],
    selectedContacts: new Set(),
    isFetching: false,
    isSending: false,
    locationId: ''
};

// DOM Elements
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

function extractLocationIdFromGHL() {
    try {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            if (typeof url === 'string' && url.includes('locationId=')) {
                const match = url.match(/locationId=([a-zA-Z0-9_-]{10,})/);
                if (match && match[1]) {
                    state.locationId = match[1];
                    localStorage.setItem('ghl_location_id', match[1]);
                }
            }
            return originalFetch.apply(this, args);
        };
        
        // Intercept XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            if (typeof url === 'string' && url.includes('locationId=')) {
                const match = url.match(/locationId=([a-zA-Z0-9_-]{10,})/);
                if (match && match[1]) {
                    state.locationId = match[1];
                    localStorage.setItem('ghl_location_id', match[1]);
                }
            }
            return originalOpen.apply(this, arguments);
        };
        
        return null;
    } catch (e) {
        return null;
    }
}

// Function to extract location ID from URL
function getLocationIdFromUrl() {
    try {
        const savedLocationId = localStorage.getItem('ghl_location_id');
        if (savedLocationId && savedLocationId.length >= 10 && !savedLocationId.includes('{{')) {
            return savedLocationId;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const locationIdFromParams = urlParams.get('location_id') || 
                                     urlParams.get('locationId') || 
                                     urlParams.get('location');
        
        if (locationIdFromParams && 
            locationIdFromParams !== '{{location.id}}' && 
            !locationIdFromParams.includes('{{') &&
            locationIdFromParams.length >= 10) {
            localStorage.setItem('ghl_location_id', locationIdFromParams);
            return locationIdFromParams;
        }
        
        const ghlLocationId = extractLocationIdFromGHL();
        if (ghlLocationId) {
            return ghlLocationId;
        }
        
        if (document.referrer) {
            const match = document.referrer.match(/\/location\/([a-zA-Z0-9_-]{10,})/);
            if (match && match[1]) {
                localStorage.setItem('ghl_location_id', match[1]);
                return match[1];
            }
        }
        
        return null;
    } catch (e) {
        return null;
    }
}


// Initialization
document.addEventListener('DOMContentLoaded', () => {
    state.locationId = getLocationIdFromUrl();
    initEventListeners();
});

function initEventListeners() {
    // API Token Input
    elements.apiTokenInput.addEventListener('input', (e) => {
        state.apiToken = e.target.value.trim();
        if (state.apiToken.length > 0) {
            elements.apiTokenInput.parentElement.querySelector('.status-icon').classList.remove('hidden');
            elements.authError.classList.add('hidden');
        } else {
            elements.apiTokenInput.parentElement.querySelector('.status-icon').classList.add('hidden');
        }
    });

    // Fetch Button
    elements.fetchBtn.addEventListener('click', handleFetchContacts);

    // Submit 
    elements.submitBtn.addEventListener('click', handleSubmit);
}

// Logic implementations
async function handleFetchContacts() {
    if (!state.apiToken) {
        showAuthError('Please enter a valid API token.');
        return;
    }

    setLoading(true);
    elements.authError.classList.add('hidden');

    try {
        const data = await fetchGhlContacts(state.apiToken);

        const contacts = (data.data || []).map((item, index) => ({
            id: index + 1,
            name: item.number,   
            number: item.number
        }));

        state.contacts = contacts;
        renderContacts();

        elements.loadingState.classList.add('hidden');
        elements.contactsStep.classList.remove('hidden');
        showNotification('Phone numbers fetched successfully!', 'success');

        elements.contactsStep.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        setLoading(false);
        showAuthError(error.message);
        showNotification('Failed to fetch contacts.', 'error');
    }
}

function renderContacts() {
    elements.contactsList.innerHTML = '';

    state.contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.dataset.id = contact.id;
        item.onclick = () => toggleContactSelection(contact.id);

        item.innerHTML = `
            <div class="checkbox">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="check-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div class="contact-info">
                <div class="contact-number" style="font-weight: bold; color: gray;">${contact.number}</div>
            </div>
        `;

        elements.contactsList.appendChild(item);
    });
}

function toggleContactSelection(id) {
    const isCurrentlySelected = state.selectedContacts.has(id);

    state.selectedContacts.clear();
    document.querySelectorAll('.contact-item.selected').forEach(el => el.classList.remove('selected'));

    if (!isCurrentlySelected) {
        state.selectedContacts.add(id);
        const item = elements.contactsList.querySelector(`.contact-item[data-id="${id}"]`);
        if (item) item.classList.add('selected');
    }

    updateSelectionUI();
}

function updateSelectionUI() {
    const count = state.selectedContacts.size;
    elements.selectionCount.textContent = count;

    if (count > 0) {
        elements.actionBar.classList.remove('hidden');
        setTimeout(() => elements.actionBar.classList.add('visible'), 10);

        const btnText = elements.submitBtn.innerHTML;
        elements.submitBtn.innerHTML = btnText.replace(/Send to \d+ Recipient(s)?|Send SMS/, `Send to ${count} Recipient${count !== 1 ? 's' : ''}`);
    } else {
        elements.actionBar.classList.remove('visible');
        setTimeout(() => {
            if (state.selectedContacts.size === 0) {
                elements.actionBar.classList.add('hidden');
            }
        }, 300);
    }
}

async function handleSubmit() {
    if (state.selectedContacts.size === 0) return;

    if (!state.locationId) {
        state.locationId = getLocationIdFromUrl();
    }

    if (!state.locationId) {
        const promptedId = promptForLocationId();
        if (!promptedId) {
            showNotification('Location ID is required to proceed.', 'error');
            return;
        }
    }

    const originalBtnContent = elements.submitBtn.innerHTML;
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0;"></div> Sending...';

    try {
        const selectedContact = state.contacts.find(c => state.selectedContacts.has(c.id));
        
        if (!selectedContact) {
            throw new Error('No contact selected');
        }

        const fromNumber = selectedContact.number;

        const response = await fetch("https://easifyqc67.zinops.com/api/external/gh/connect-user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${state.apiToken}`
            },
            body: JSON.stringify({
                location_id: state.locationId,
                from_number: fromNumber  
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to send SMS");
        }

        showNotification(`Successfully connected user with number ${fromNumber}!`, 'success');

        setTimeout(() => {
            state.selectedContacts.clear();
            document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('selected'));
            updateSelectionUI();
            elements.submitBtn.disabled = false;
            elements.submitBtn.innerHTML = originalBtnContent;
        }, 1500);

    } catch (error) {
        showNotification(error.message || 'Failed to send messages.', 'error');
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = originalBtnContent;
    }
}

// UI Helpers
function setLoading(loading) {
    if (loading) {
        elements.fetchBtn.disabled = true;
        elements.fetchBtn.classList.add('opacity-50');
        elements.loadingState.classList.remove('hidden');
    } else {
        elements.fetchBtn.disabled = false;
        elements.fetchBtn.classList.remove('opacity-50');
        elements.loadingState.classList.add('hidden');
    }
}

function showAuthError(msg) {
    elements.authError.textContent = msg;
    elements.authError.classList.remove('hidden');
}

function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: type === 'success' ? '#10b981' : '#ef4444',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: '1000',
        transform: 'translateY(100px)',
        transition: 'all 0.3s ease'
    });

    elements.notificationContainer.appendChild(toast);

    setTimeout(() => toast.style.transform = 'translateY(0)', 10);

    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function fetchGhlContacts(token) {
    const response = await fetch("https://easifyqc67.zinops.com/api/external/get-phone-numbers", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`
        },
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to connect GHL");
    }

    return await response.json();
}


