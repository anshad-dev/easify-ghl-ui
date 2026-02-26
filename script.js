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

// ✅ Listen for locationId sent via postMessage from parent
window.addEventListener('message', (event) => {
    if (event.data && event.data.locationId) {
        state.locationId = event.data.locationId;
        localStorage.setItem('ghl_location_id', event.data.locationId);
        console.log("📍 Location ID received via postMessage:", state.locationId);
    }
});

// ✅ Request locationId from parent frame via postMessage
function requestLocationIdFromParent() {
    try {
        window.parent.postMessage({ action: 'getLocationId' }, '*');
    } catch (e) {
        console.warn('postMessage to parent failed:', e);
    }
}

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

// ✅ Comprehensive location ID extraction with all strategies
function getLocationIdFromUrl() {
    try {
        // 1. Query param — most reliable when GHL app URL uses {{location.id}}
        const urlParams = new URLSearchParams(window.location.search);
        const qpId = urlParams.get('locationId') || urlParams.get('location_id');
        if (qpId && qpId.length >= 10) {
            localStorage.setItem('ghl_location_id', qpId);
            return qpId;
        }

        // 2. Try parent (top) URL — works only if same-origin
        try {
            const topHref = window.top.location.href;
            const topMatch = topHref.match(/\/location\/([a-zA-Z0-9_-]{10,})/);
            if (topMatch && topMatch[1]) {
                localStorage.setItem('ghl_location_id', topMatch[1]);
                return topMatch[1];
            }
            // Also check query params of parent URL
            const topParams = new URLSearchParams(new URL(topHref).search);
            const topQp = topParams.get('locationId') || topParams.get('location_id');
            if (topQp && topQp.length >= 10) {
                localStorage.setItem('ghl_location_id', topQp);
                return topQp;
            }
        } catch (e) {
            // cross-origin — ignore
        }

        // 3. Try document.referrer
        if (document.referrer) {
            const refMatch = document.referrer.match(/\/location\/([a-zA-Z0-9_-]{10,})/);
            if (refMatch && refMatch[1]) {
                localStorage.setItem('ghl_location_id', refMatch[1]);
                return refMatch[1];
            }
        }

        // 4. Try current URL path
        const pathMatch = window.location.pathname.match(/\/location\/([a-zA-Z0-9_-]{10,})/);
        if (pathMatch && pathMatch[1]) {
            localStorage.setItem('ghl_location_id', pathMatch[1]);
            return pathMatch[1];
        }

        // 5. Try window.name (some platforms pass JSON context here)
        if (window.name) {
            try {
                const parsed = JSON.parse(window.name);
                if (parsed.locationId && parsed.locationId.length >= 10) {
                    localStorage.setItem('ghl_location_id', parsed.locationId);
                    return parsed.locationId;
                }
            } catch (e) {
                // not JSON — try regex match directly
                const nameMatch = window.name.match(/([a-zA-Z0-9_-]{10,})/);
                if (nameMatch && nameMatch[1]) {
                    return nameMatch[1];
                }
            }
        }

        // 6. Last fallback: localStorage
        const saved = localStorage.getItem('ghl_location_id');
        if (saved && saved.length >= 10) {
            return saved;
        }

        return null;
    } catch {
        return null;
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    extractLocationIdFromGHL();
    state.locationId = getLocationIdFromUrl();

    if (!state.locationId) {
        requestLocationIdFromParent();
    }

    console.log("📍 Initial Location ID:", state.locationId || '(not yet detected)');
    initEventListeners();
});

function initEventListeners() {
    elements.apiTokenInput.addEventListener('input', (e) => {
        state.apiToken = e.target.value.trim();
        if (state.apiToken.length > 0) {
            elements.apiTokenInput.parentElement.querySelector('.status-icon').classList.remove('hidden');
            elements.authError.classList.add('hidden');
        } else {
            elements.apiTokenInput.parentElement.querySelector('.status-icon').classList.add('hidden');
        }
    });

    elements.fetchBtn.addEventListener('click', handleFetchContacts);
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

    // ✅ Re-run all detection strategies fresh on submit
    state.locationId = getLocationIdFromUrl();

    // ✅ Extra attempt: parse parent URL directly (same-origin only)
    if (!state.locationId) {
        try {
            const topUrl = window.top.location.href;
            const match = topUrl.match(/\/location\/([a-zA-Z0-9_-]{10,})/);
            if (match) {
                state.locationId = match[1];
                localStorage.setItem('ghl_location_id', match[1]);
            }
        } catch (e) {
            // cross-origin — skip
        }
    }

    // ✅ Extra attempt: check window.name for JSON context
    if (!state.locationId && window.name) {
        try {
            const parsed = JSON.parse(window.name);
            if (parsed.locationId) {
                state.locationId = parsed.locationId;
            }
        } catch (e) {}
    }

    console.log("📍 Final Location ID:", state.locationId);

    if (!state.locationId) {
        showNotification('Unable to detect GHL Location ID. Please ensure the app URL includes ?locationId={{location.id}}', 'error');
        return;
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

        console.log("📦 Payload being sent:", {
            location_id: state.locationId,
            from_number: fromNumber
        });

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