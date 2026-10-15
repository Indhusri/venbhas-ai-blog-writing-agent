const STORAGE_KEY = 'venbhas-blog-drafts-v1';
const form = document.querySelector('#brief-form');
const editor = document.querySelector('#article-editor');
const emptyState = document.querySelector('#empty-state');
const loading = document.querySelector('#loading');
const notice = document.querySelector('#notice');
const saveStatus = document.querySelector('#saved-status');
const dialog = document.querySelector('#confirm-dialog');
let activeDraftId = null;
let dirty = false;
let pendingAction = null;

function readDrafts() {
  try {
    const drafts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(drafts) ? drafts : [];
  } catch { return []; }
}

function writeDrafts(drafts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    showNotice('Your browser could not save this draft. It may be out of local storage space.', 'error');
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showNotice(message, type = 'success') {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
}

function setBusy(isBusy) {
  loading.hidden = !isBusy;
  if (isBusy) {
    editor.hidden = true;
    emptyState.hidden = true;
    notice.hidden = true;
  } else {
    editor.hidden = !document.querySelector('#article-title').value.trim();
    emptyState.hidden = !editor.hidden;
  }
  document.querySelectorAll('#generate-button, #regenerate-button').forEach((button) => {
    button.disabled = isBusy;
    button.setAttribute('aria-busy', String(isBusy));
  });
  document.querySelector('#generate-button').querySelector('span:nth-child(2)').textContent = isBusy ? 'Writing your draft…' : 'Generate first draft';
}

function collectArticle() {
  return {
    title: document.querySelector('#article-title').value,
    introduction: document.querySelector('#article-intro').value,
    headings: [...document.querySelectorAll('.section-heading input')].map((input) => input.value),
    body: document.querySelector('#article-body').value,
    conclusion: document.querySelector('#article-conclusion').value,
    seoTitle: document.querySelector('#seo-title').value,
    metaDescription: document.querySelector('#meta-description').value,
    callToAction: document.querySelector('#call-to-action').value
  };
}

function updateCounts() {
  const article = collectArticle();
  const wordText = [article.title, article.introduction, article.body, article.conclusion].join(' ').trim();
  document.querySelector('#word-estimate').textContent = `${wordText ? wordText.split(/\s+/).length : 0} words`;
  document.querySelector('#seo-title-count').textContent = `${article.seoTitle.length} characters`;
  document.querySelector('#meta-count').textContent = `${article.metaDescription.length} characters`;
}

function renderArticle(article, draftTitle) {
  document.querySelector('#article-title').value = article.title || '';
  document.querySelector('#article-intro').value = article.introduction || '';
  document.querySelector('#article-body').value = article.body || '';
  document.querySelector('#article-conclusion').value = article.conclusion || '';
  document.querySelector('#seo-title').value = article.seoTitle || '';
  document.querySelector('#meta-description').value = article.metaDescription || '';
  document.querySelector('#call-to-action').value = article.callToAction || '';
  const headings = Array.isArray(article.headings) ? article.headings : [];
  document.querySelector('#section-editors').innerHTML = headings.map((heading, index) => `
    <div class="section-block"><div class="section-heading"><span class="section-index">${String(index + 1).padStart(2, '0')}</span><input aria-label="Section heading ${index + 1}" value="${escapeHTML(heading)}"></div></div>`).join('');
  const title = draftTitle || article.title || 'Untitled article';
  document.querySelector('#draft-title').textContent = title;
  document.querySelector('#draft-title').title = title;
  editor.hidden = false;
  emptyState.hidden = true;
  loading.hidden = true;
  dirty = false;
  saveStatus.textContent = activeDraftId ? 'Saved in this browser' : 'Unsaved changes';
  updateCounts();
}

function getBrief() {
  const data = new FormData(form);
  return {
    topic: String(data.get('topic') || '').trim(),
    audience: String(data.get('audience') || '').trim(),
    keywords: String(data.get('keywords') || '').trim(),
    tone: String(data.get('tone') || '').trim(),
    wordCount: Number(data.get('wordCount'))
  };
}

async function generate() {
  if (!form.reportValidity()) return;
  setBusy(true);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getBrief())
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'We could not generate your article. Please try again.');
    activeDraftId = null;
    renderArticle(result.article);
    showNotice('Your first draft is ready. Edit any section to make it your own.', 'success');
  } catch (error) {
    setBusy(false);
    showNotice(error instanceof TypeError ? 'Could not reach the app server. Check that it is running, then try again.' : error.message, 'error');
  }
}

function saveDraft() {
  if (editor.hidden) {
    showNotice('Generate an article before saving a draft.', 'error');
    return false;
  }
  const article = collectArticle();
  const drafts = readDrafts();
  const existingIndex = drafts.findIndex((draft) => draft.id === activeDraftId);
  const draft = {
    id: activeDraftId || (globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}`),
    title: article.title.trim() || 'Untitled article',
    brief: getBrief(), article, updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) drafts[existingIndex] = draft;
  else drafts.unshift(draft);
  if (!writeDrafts(drafts)) return false;
  activeDraftId = draft.id;
  dirty = false;
  saveStatus.textContent = 'Saved in this browser';
  renderDraftList();
  showNotice('Draft saved in this browser.', 'success');
  return true;
}

function renderDraftList() {
  const drafts = readDrafts();
  document.querySelector('#draft-count').textContent = String(drafts.length);
  const list = document.querySelector('#draft-list');
  if (!drafts.length) {
    list.innerHTML = '<p class="empty-drafts">Your saved drafts will show up here.</p>';
    return;
  }
  list.innerHTML = drafts.map((draft) => `<div class="draft-row ${draft.id === activeDraftId ? 'selected' : ''}" data-draft-row="${escapeHTML(draft.id)}"><span class="draft-symbol">✎</span><button class="draft-row-title" type="button" data-open-draft="${escapeHTML(draft.id)}">${escapeHTML(draft.title || 'Untitled article')}</button><button class="draft-remove" type="button" data-delete-draft="${escapeHTML(draft.id)}" aria-label="Delete ${escapeHTML(draft.title || 'draft')}">×</button></div>`).join('');
}

function openDraft(id) {
  const draft = readDrafts().find((item) => item.id === id);
  if (!draft) return;
  activeDraftId = draft.id;
  const brief = draft.brief || {};
  for (const field of ['topic', 'audience', 'keywords', 'tone', 'wordCount']) {
    const input = form.elements.namedItem(field);
    if (input && brief[field] != null) input.value = String(brief[field]);
  }
  renderArticle(draft.article || {}, draft.title);
  renderDraftList();
  notice.hidden = true;
}

function handlePending(action) {
  if (!dirty) return action();
  pendingAction = action;
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'save') saveDraft();
  if (dialog.returnValue === 'discard' || dialog.returnValue === 'save') pendingAction?.();
  pendingAction = null;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  handlePending(generate);
});
document.querySelector('#regenerate-button').addEventListener('click', () => handlePending(generate));
document.querySelector('#save-button').addEventListener('click', saveDraft);
document.querySelector('#save-bottom-button').addEventListener('click', saveDraft);
document.querySelector('#draft-list').addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-draft]');
  const openButton = event.target.closest('[data-open-draft]');
  if (deleteButton) {
    const id = deleteButton.dataset.deleteDraft;
    if (!confirm('Delete this saved draft from this browser?')) return;
    writeDrafts(readDrafts().filter((draft) => draft.id !== id));
    if (activeDraftId === id) { activeDraftId = null; editor.hidden = true; emptyState.hidden = false; }
    renderDraftList();
    saveStatus.textContent = 'Drafts stay in this browser';
  } else if (openButton) {
    handlePending(() => openDraft(openButton.dataset.openDraft));
  }
});

editor.addEventListener('input', () => {
  dirty = true;
  saveStatus.textContent = 'Unsaved changes';
  const title = document.querySelector('#article-title').value.trim();
  document.querySelector('#draft-title').textContent = title || 'Untitled article';
  updateCounts();
});
document.querySelector('#copy-button').addEventListener('click', async () => {
  if (editor.hidden) return showNotice('Generate or open a draft before copying it.', 'error');
  const article = collectArticle();
  const text = [article.title, '', article.introduction, '', ...article.headings.flatMap((heading) => [heading, '']), article.body, '', article.conclusion, '', `SEO title: ${article.seoTitle}`, `Meta description: ${article.metaDescription}`, `Call to action: ${article.callToAction}`].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showNotice('Article copied to your clipboard.', 'success');
  } catch { showNotice('Clipboard access was blocked. Select and copy the article text manually.', 'error'); }
});

renderDraftList();
fetch('/api/health').catch(() => { saveStatus.textContent = 'Server connection unavailable'; });
