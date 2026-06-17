// BigQuery Release Radar Frontend Logic

// Check localStorage for saved theme preference immediately to prevent FOUC
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
}

// App State
let state = {
    notes: [],
    filteredNotes: [],
    selectedNote: null,
    currentCategory: 'all',
    searchQuery: '',
    currentTemplateStyle: 'casual',
    isComposerDirty: false
};

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    lastUpdatedTime: document.getElementById('last-updated-time'),
    notesList: document.getElementById('notes-list'),
    feedShimmer: document.getElementById('feed-shimmer'),
    errorAlert: document.getElementById('error-alert'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    noResults: document.getElementById('no-results'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    
    // Search & Filter
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterPills: document.querySelectorAll('.filter-pill'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeature: document.getElementById('stat-feature'),
    statChanged: document.getElementById('stat-changed'),
    statFixed: document.getElementById('stat-fixed'),
    statCards: document.querySelectorAll('.stat-card'),
    
    // Composer
    composerCard: document.getElementById('tweet-composer-card'),
    composerEmptyState: document.getElementById('composer-empty-state'),
    composerActiveState: document.getElementById('composer-active-state'),
    deselectBtn: document.getElementById('deselect-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charProgress: document.getElementById('char-progress'),
    charCountText: document.getElementById('char-count-text'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    tweetBtn: document.getElementById('tweet-btn'),
    suggestionBtns: document.querySelectorAll('.suggestion-pills button'),
    tweetLinkPreview: document.getElementById('tweet-link-preview'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    toastIcon: document.getElementById('toast-icon'),
    searchStatus: document.getElementById('search-status')
};

// Progress Ring Configuration
const CIRCLE_RADIUS = 14;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// Initialize SVG Progress Ring
if (elements.charProgress) {
    elements.charProgress.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
    elements.charProgress.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;
}

// -------------------------------------------------------------
// HTML & Text Utilities
// -------------------------------------------------------------

function getRelativeDateString(isoDateStr) {
    if (!isoDateStr) return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const recordDate = new Date(isoDateStr);
    recordDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - recordDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 30) return `${diffDays} days ago`;
    if (diffDays >= 30) {
        const months = Math.floor(diffDays / 30);
        return months === 1 ? "1 month ago" : `${months} months ago`;
    }
    return "";
}

function highlightDOMText(node, keyword) {
    if (!keyword) return;
    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    
    if (node.nodeType === Node.TEXT_NODE) {
        const matches = node.nodeValue.match(regex);
        if (matches) {
            const span = document.createElement('span');
            span.innerHTML = node.nodeValue.replace(regex, '<mark class="search-highlight">$1</mark>');
            node.parentNode.replaceChild(span, node);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes && !['SCRIPT', 'STYLE'].includes(node.nodeName)) {
        const children = Array.from(node.childNodes);
        children.forEach(child => highlightDOMText(child, keyword));
    }
}

function stripHtmlToPlainText(htmlStr) {
    // Create a temporary element to let browser parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlStr;
    
    // Replace code blocks with clean formatting
    const codes = tempDiv.querySelectorAll('code');
    codes.forEach(code => {
        const text = code.textContent.trim();
        // Avoid nested/redundant backticks
        if (text && !text.startsWith('`')) {
            code.textContent = `\`${text}\``;
        }
    });
    
    // Replace anchor links with their text and URL or just text
    const anchors = tempDiv.querySelectorAll('a');
    anchors.forEach(a => {
        const text = a.textContent.trim();
        const href = a.getAttribute('href');
        // If it's a long link, we just want to output text so we don't clutter the tweet
        a.textContent = text;
    });
    
    // Get text
    let plainText = tempDiv.innerText || tempDiv.textContent || "";
    
    // Clean up excessive whitespace and double newlines
    plainText = plainText.replace(/\n\s*\n/g, '\n\n');
    plainText = plainText.replace(/ +/g, ' ');
    return plainText.trim();
}

function generateTweetTemplate(note, style = 'casual') {
    const rawContent = stripHtmlToPlainText(note.content);
    const date = note.date_str;
    const category = note.category.toUpperCase();
    const link = note.link;
    
    let template = "";
    if (style === 'casual') {
        template = `🚀 New in #GoogleBigQuery (${date}) - ${category}:\n\n{text}\n\nRead more: ${link}`;
    } else if (style === 'pro') {
        template = `📢 BigQuery Update: ${category} (${date})\n\n{text}\n\nOfficial release notes: ${link}`;
    } else { // bullet
        template = `✨ #BigQuery release update (${date})\n\n🔹 Category: ${category}\n🔹 Details: {text}\n\n🔗 Details: ${link}`;
    }
    
    // Calculate character budget:
    // Twitter counts any URL as exactly 23 characters under t.co shortening.
    // So we subtract the length of the link string and add 23 to find the virtual length of the template.
    const virtualTemplateLength = template.replace('{text}', '').length - link.length + 23;
    const maxTweetLength = 280;
    const budget = maxTweetLength - virtualTemplateLength - 4; // 4 char buffer (for ellipse, safety)
    
    let textSnippet = rawContent;
    if (rawContent.length > budget) {
        textSnippet = rawContent.substring(0, budget - 3) + "...";
    }
    
    return template.replace('{text}', textSnippet);
}

// Show toast notifications
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    if (type === 'success') {
        elements.toastIcon.setAttribute('data-lucide', 'check-circle');
        elements.toastIcon.style.color = 'var(--color-feature)';
    } else {
        elements.toastIcon.setAttribute('data-lucide', 'alert-circle');
        elements.toastIcon.style.color = 'var(--color-deprecated)';
    }
    
    // Refresh lucide icons in toast
    lucide.createIcons();
    
    elements.toast.classList.remove('hidden');
    
    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 2500);
}

// -------------------------------------------------------------
// Data Fetching & Caching
// -------------------------------------------------------------

async function loadReleaseNotes(forceRefresh = false) {
    // Show loading state
    elements.notesList.classList.add('hidden');
    elements.errorAlert.classList.add('hidden');
    elements.noResults.classList.add('hidden');
    elements.feedShimmer.classList.remove('hidden');
    
    elements.refreshBtn.classList.add('loading');
    elements.refreshBtn.disabled = true;
    
    try {
        const url = `/api/notes?refresh=${forceRefresh}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            state.notes = result.notes;
            elements.lastUpdatedTime.textContent = result.last_updated;
            
            // Calculate and display stats
            calculateStats();
            
            // Apply filtering and render
            filterAndRenderNotes();
        } else {
            throw new Error(result.error || "Failed to load release notes.");
        }
    } catch (error) {
        console.error("Error loading release notes:", error);
        elements.errorMessage.textContent = error.message || "Failed to establish server connection.";
        elements.errorAlert.classList.remove('hidden');
        elements.feedShimmer.classList.add('hidden');
    } finally {
        elements.refreshBtn.classList.remove('loading');
        elements.refreshBtn.disabled = false;
    }
}

function calculateStats() {
    const total = state.notes.length;
    const features = state.notes.filter(n => n.category.toLowerCase() === 'feature').length;
    const changed = state.notes.filter(n => n.category.toLowerCase() === 'changed').length;
    const fixed = state.notes.filter(n => n.category.toLowerCase() === 'fixed').length;
    
    elements.statTotal.textContent = total;
    elements.statFeature.textContent = features;
    elements.statChanged.textContent = changed;
    elements.statFixed.textContent = fixed;
}

// -------------------------------------------------------------
// Filtering and Rendering
// -------------------------------------------------------------

function filterAndRenderNotes() {
    const search = state.searchQuery.toLowerCase().trim();
    const category = state.currentCategory.toLowerCase();
    
    state.filteredNotes = state.notes.filter(note => {
        // Category Filter
        const matchesCategory = (category === 'all' || note.category.toLowerCase() === category);
        
        // Search Filter (date, category or content)
        const matchesSearch = !search || 
            note.date_str.toLowerCase().includes(search) ||
            note.category.toLowerCase().includes(search) ||
            note.content.toLowerCase().includes(search);
            
        return matchesCategory && matchesSearch;
    });
    
    elements.feedShimmer.classList.add('hidden');
    
    // Show/hide search status counter
    if (state.searchQuery || state.currentCategory !== 'all') {
        elements.searchStatus.textContent = `Showing ${state.filteredNotes.length} of ${state.notes.length} updates`;
        elements.searchStatus.classList.remove('hidden');
    } else {
        elements.searchStatus.classList.add('hidden');
    }
    
    // Auto-scroll on mobile screens when list changes
    if (window.innerWidth <= 768 && (state.searchQuery || state.currentCategory !== 'all')) {
        elements.notesList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    if (state.filteredNotes.length === 0) {
        elements.notesList.classList.add('hidden');
        elements.noResults.classList.remove('hidden');
    } else {
        elements.noResults.classList.add('hidden');
        renderNotesList();
    }
}

function renderNotesList() {
    elements.notesList.innerHTML = '';
    
    state.filteredNotes.forEach(note => {
        const card = document.createElement('div');
        card.className = `note-card glass`;
        if (state.selectedNote && state.selectedNote.id === note.id) {
            card.classList.add('selected');
        }
        card.setAttribute('data-id', note.id);
        card.setAttribute('data-category', note.category);
        
        // Badge color class
        const badgeClass = `badge-${note.category.toLowerCase()}`;
        const relativeDateStr = getRelativeDateString(note.iso_date);
        const relativeDateHtml = relativeDateStr ? `• <span class="relative-date">${relativeDateStr}</span>` : '';
        
        card.innerHTML = `
            <div class="note-card-header">
                <div class="note-meta">
                    <span class="note-badge ${badgeClass}">${note.category}</span>
                    <span class="note-date">
                        <i data-lucide="calendar"></i>
                        ${note.date_str} ${relativeDateHtml}
                    </span>
                </div>
                <div class="note-card-actions">
                    <button class="card-action-btn copy-card-link-btn" title="Copy release link to clipboard">
                        <i data-lucide="link"></i>
                    </button>
                    <button class="card-action-btn copy-card-content-btn" title="Copy note to clipboard">
                        <i data-lucide="copy"></i>
                    </button>
                    <button class="card-action-btn select-card-btn" title="Draft Tweet">
                        <i data-lucide="twitter"></i>
                    </button>
                </div>
            </div>
            <div class="note-content">
                ${note.content}
            </div>
            <a href="${note.link}" target="_blank" rel="noopener noreferrer" class="note-original-link" onclick="event.stopPropagation();">
                <i data-lucide="external-link"></i>
                Official release details
            </a>
        `;
        
        // Apply text highlighting for search query
        if (state.searchQuery) {
            const contentEl = card.querySelector('.note-content');
            highlightDOMText(contentEl, state.searchQuery);
        }
        
        // Wire up copy link button click
        const copyLinkBtn = card.querySelector('.copy-card-link-btn');
        copyLinkBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent card selection
            try {
                await navigator.clipboard.writeText(note.link);
                showToast("Release link copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy link:", err);
                showToast("Failed to copy link.", "error");
            }
        });
        
        // Wire up copy content button click
        const copyBtn = card.querySelector('.copy-card-content-btn');
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent card selection
            const plainText = stripHtmlToPlainText(note.content);
            const copyText = `Google BigQuery Release Note (${note.date_str}) - ${note.category}:\n\n${plainText}\n\nRead more: ${note.link}`;
            try {
                await navigator.clipboard.writeText(copyText);
                showToast("Note content copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy:", err);
                showToast("Failed to copy note.", "error");
            }
        });
        
        // Handle selection on card click
        card.addEventListener('click', () => {
            selectNote(note);
        });
        
        elements.notesList.appendChild(card);
    });
    
    // Render Lucide icons
    lucide.createIcons();
    elements.notesList.classList.remove('hidden');
}

// -------------------------------------------------------------
// Selection and Tweet Composer
// -------------------------------------------------------------

function selectNote(note) {
    // Warning if dirty and switching notes
    if (state.isComposerDirty && state.selectedNote && state.selectedNote.id !== note.id) {
        const confirmDiscard = confirm("You have unsubmitted changes in your Tweet Composer. Do you want to discard them and select this release note?");
        if (!confirmDiscard) return;
    }
    state.isComposerDirty = false;

    state.selectedNote = note;
    
    // Toggle active class in the DOM list
    document.querySelectorAll('.note-card').forEach(card => {
        if (card.getAttribute('data-id') === note.id) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    // Update Composer Panel
    elements.composerEmptyState.classList.add('hidden');
    elements.composerActiveState.classList.remove('hidden');
    
    // Set active template preset button
    elements.suggestionBtns.forEach(btn => {
        if (btn.getAttribute('data-template') === state.currentTemplateStyle) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update link details in preview
    const linkDesc = stripHtmlToPlainText(note.content).substring(0, 100) + "...";
    const linkCard = elements.tweetLinkPreview;
    if (linkCard) {
        linkCard.querySelector('.link-title').textContent = `Google BigQuery Release Notes (${note.date_str})`;
        linkCard.querySelector('.link-desc').textContent = linkDesc;
    }
    
    // Generate draft text
    const tweetText = generateTweetTemplate(note, state.currentTemplateStyle);
    elements.tweetTextarea.value = tweetText;
    
    // Update counter
    updateCharCounter();
    
    // On mobile, expand the composer panel and scroll into view
    if (window.innerWidth <= 992) {
        elements.composerCard.classList.remove('collapsed');
        elements.composerCard.scrollIntoView({ behavior: 'smooth' });
    }
}

function deselectNote() {
    if (state.isComposerDirty) {
        const confirmDiscard = confirm("You have unsubmitted changes in your Tweet Composer. Do you want to discard them?");
        if (!confirmDiscard) return;
    }
    state.isComposerDirty = false;

    state.selectedNote = null;
    
    // Remove selection highlight from list
    document.querySelectorAll('.note-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    elements.composerActiveState.classList.add('hidden');
    elements.composerEmptyState.classList.remove('hidden');
    
    if (window.innerWidth <= 992) {
        elements.composerCard.classList.add('collapsed');
    }
}

function updateCharCounter() {
    const text = elements.tweetTextarea.value;
    
    // Twitter virtual URL character length is 23.
    // We must count any URL as exactly 23 characters.
    // Simple regex to match URLs in the text box
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    let virtualLength = text.length;
    urls.forEach(url => {
        virtualLength = virtualLength - url.length + 23;
    });
    
    const maxLength = 280;
    const remaining = maxLength - virtualLength;
    
    elements.charCountText.textContent = remaining;
    
    // Color states
    elements.charCountText.classList.remove('warning', 'error');
    if (remaining < 0) {
        elements.charCountText.classList.add('error');
        elements.tweetBtn.disabled = true;
    } else if (remaining <= 40) {
        elements.charCountText.classList.add('warning');
        elements.tweetBtn.disabled = false;
    } else {
        elements.tweetBtn.disabled = false;
    }
    
    // Empty state button safety
    if (virtualLength === 0) {
        elements.tweetBtn.disabled = true;
    }
    
    // Progress Ring Draw
    if (elements.charProgress) {
        const percent = Math.min(100, (virtualLength / maxLength) * 100);
        const offset = CIRCLE_CIRCUMFERENCE - (percent / 100) * CIRCLE_CIRCUMFERENCE;
        
        elements.charProgress.style.strokeDashoffset = offset;
        
        // Progress Ring color transition
        if (remaining < 0) {
            elements.charProgress.style.stroke = 'var(--google-red)';
        } else if (remaining <= 40) {
            elements.charProgress.style.stroke = 'var(--google-yellow)';
        } else {
            elements.charProgress.style.stroke = 'var(--twitter-blue)';
        }
    }
}

function exportToCSV() {
    if (state.filteredNotes.length === 0) {
        showToast("No release notes to export.", "error");
        return;
    }
    
    const headers = ["ID", "Date", "Category", "Content", "Link"];
    
    const rows = state.filteredNotes.map(note => {
        const plainContent = stripHtmlToPlainText(note.content);
        return [
            note.id,
            note.date_str,
            note.category,
            plainContent,
            note.link
        ].map(val => `"${val.replace(/"/g, '""')}"`);
    });
    
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `bq_releases_export_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("CSV export completed successfully!");
}

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------

function setupEventListeners() {
    // Refresh & Export Buttons
    elements.refreshBtn.addEventListener('click', () => loadReleaseNotes(true));
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    elements.retryBtn.addEventListener('click', () => loadReleaseNotes(true));
    
    // Theme Toggle button
    elements.themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        const themeIcon = document.getElementById('theme-icon');
        
        if (isLight) {
            localStorage.setItem('theme', 'light');
            elements.themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
            themeIcon.setAttribute('data-lucide', 'moon');
        } else {
            localStorage.setItem('theme', 'dark');
            elements.themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
            themeIcon.setAttribute('data-lucide', 'sun');
        }
        
        // Refresh lucide icons to swap the SVGs
        lucide.createIcons();
    });
    
    // Search Actions
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (state.searchQuery.length > 0) {
            elements.clearSearchBtn.classList.remove('hidden');
        } else {
            elements.clearSearchBtn.classList.add('hidden');
        }
        filterAndRenderNotes();
    });
    
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearchBtn.classList.add('hidden');
        filterAndRenderNotes();
    });
    
    // Category Pills Filters
    elements.filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            elements.filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            
            state.currentCategory = pill.getAttribute('data-category');
            filterAndRenderNotes();
        });
    });
    
    // Click stats to filter categories directly
    elements.statCards.forEach(card => {
        card.addEventListener('click', () => {
            const statCategory = card.getAttribute('data-stat');
            
            // Highlight matching filter pill
            elements.filterPills.forEach(pill => {
                const pillCategory = pill.getAttribute('data-category');
                if ((statCategory === 'all' && pillCategory === 'all') || 
                    (statCategory === pillCategory)) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
            });
            
            state.currentCategory = statCategory === 'all' ? 'all' : statCategory;
            filterAndRenderNotes();
        });
    });
    
    // Reset Filters Button
    elements.resetFiltersBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.clearSearchBtn.classList.add('hidden');
        
        elements.filterPills.forEach(pill => {
            if (pill.getAttribute('data-category') === 'all') {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
        
        state.currentCategory = 'all';
        filterAndRenderNotes();
    });
    
    // Deselect Composer button
    elements.deselectBtn.addEventListener('click', deselectNote);
    
    // Live update Tweet Char count & track user edits
    elements.tweetTextarea.addEventListener('input', () => {
        state.isComposerDirty = true;
        updateCharCounter();
    });
    
    // Suggestion templates selection
    elements.suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetStyle = btn.getAttribute('data-template');
            if (state.currentTemplateStyle === targetStyle) return;
            
            if (state.selectedNote && state.isComposerDirty) {
                const confirmDiscard = confirm("Overwriting with a template will discard your current edits. Continue?");
                if (!confirmDiscard) return;
            }
            
            elements.suggestionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.currentTemplateStyle = targetStyle;
            state.isComposerDirty = false;
            
            if (state.selectedNote) {
                const text = generateTweetTemplate(state.selectedNote, state.currentTemplateStyle);
                elements.tweetTextarea.value = text;
                updateCharCounter();
            }
        });
    });
    
    // Copy Tweet Action
    elements.copyTweetBtn.addEventListener('click', async () => {
        const text = elements.tweetTextarea.value;
        if (!text) return;
        
        try {
            await navigator.clipboard.writeText(text);
            showToast("Tweet text copied to clipboard!");
        } catch (err) {
            console.error("Clipboard copy failed:", err);
            showToast("Failed to copy text.", "error");
        }
    });
    
    // Tweet Action (Opens Web Intent)
    elements.tweetBtn.addEventListener('click', () => {
        const text = elements.tweetTextarea.value;
        if (!text) return;
        
        const encodedText = encodeURIComponent(text);
        const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
        
        // Open X sharing window
        window.open(twitterIntentUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
        showToast("Opened sharing dialog on X!");
    });
    
    // On mobile, clicking the header of the composer toggles collapse
    elements.composerCard.querySelector('.composer-header').addEventListener('click', () => {
        if (window.innerWidth <= 992 && state.selectedNote) {
            elements.composerCard.classList.toggle('collapsed');
        }
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = document.getElementById('theme-icon');
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (elements.themeToggleBtn && themeIcon) {
            elements.themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
            themeIcon.setAttribute('data-lucide', 'moon');
        }
    } else {
        if (elements.themeToggleBtn && themeIcon) {
            elements.themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
            themeIcon.setAttribute('data-lucide', 'sun');
        }
    }
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Initialise elements configuration for mobile
    if (window.innerWidth <= 992) {
        elements.composerCard.classList.add('collapsed');
    }
    
    initTheme();
    setupEventListeners();
    loadReleaseNotes();
});
