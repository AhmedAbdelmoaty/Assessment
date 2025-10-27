/**
 * Shared header utilities for all pages
 * Handles unified language toggle across the application
 */

(function(window) {
  'use strict';

  // Language configuration
  const LANG_KEY = 'lang';
  const DEFAULT_LANG = 'en';

  // Language labels and icons
  const LANG_CONFIG = {
    en: {
      otherLabel: 'العربية', // Show Arabic when current is English
      otherLang: 'ar',
      icon: '\uf0ac' // globe icon (Font Awesome)
    },
    ar: {
      otherLabel: 'English', // Show English when current is Arabic
      otherLang: 'en',
      icon: '\uf1ab' // language icon (Font Awesome)
    }
  };

  /**
   * Get current language from localStorage or default
   */
  function getCurrentLang() {
    return localStorage.getItem(LANG_KEY) || DEFAULT_LANG;
  }

  /**
   * Set language in localStorage and update DOM
   */
  function setLanguage(lang) {
    localStorage.setItem(LANG_KEY, lang);
    updateDocumentLang(lang);
    updateAllLanguageContent(lang);
  }

  /**
   * Update document language attributes
   */
  function updateDocumentLang(lang) {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.classList.toggle('lang-ar', lang === 'ar');
    document.documentElement.classList.toggle('lang-en', lang !== 'ar');
  }

  /**
   * Update all elements with data-lang-content attribute
   */
  function updateAllLanguageContent(lang) {
    document.querySelectorAll('[data-lang-content]').forEach(el => {
      const elLang = el.getAttribute('data-lang-content');
      el.classList.toggle('hidden', elLang !== lang);
    });
  }

  /**
   * Toggle to the other language
   */
  function toggleLanguage() {
    const currentLang = getCurrentLang();
    const newLang = currentLang === 'en' ? 'ar' : 'en';
    setLanguage(newLang);
    
    // Update the button label
    updateLanguageButton();
  }

  /**
   * Update language button to show the OTHER language
   */
  function updateLanguageButton() {
    const currentLang = getCurrentLang();
    const config = LANG_CONFIG[currentLang];
    
    const buttons = document.querySelectorAll('.lang-btn');
    buttons.forEach(btn => {
      // Update text content
      const textSpan = btn.querySelector('.lang-text');
      if (textSpan) {
        textSpan.textContent = config.otherLabel;
      }
      
      // Update icon if using ::before pseudo-element
      btn.setAttribute('data-lang-icon', config.icon);
    });
  }

  /**
   * Initialize language switch in a container
   * @param {string|HTMLElement} container - Container element or selector
   */
  function initHeaderLanguageSwitch(container) {
    const containerEl = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
    
    if (!containerEl) {
      console.error('Language switch container not found:', container);
      return;
    }

    const currentLang = getCurrentLang();
    const config = LANG_CONFIG[currentLang];

    // Create the language button
    const langSwitch = document.createElement('div');
    langSwitch.className = 'lang-switch';
    
    const langBtn = document.createElement('button');
    langBtn.type = 'button';
    langBtn.className = 'lang-btn';
    langBtn.setAttribute('data-lang-icon', config.icon);
    langBtn.setAttribute('aria-label', 'Switch language');
    
    const textSpan = document.createElement('span');
    textSpan.className = 'lang-text';
    textSpan.textContent = config.otherLabel;
    
    langBtn.appendChild(textSpan);
    langSwitch.appendChild(langBtn);
    
    // Add click handler
    langBtn.addEventListener('click', toggleLanguage);
    
    // Clear container and append new button
    containerEl.innerHTML = '';
    containerEl.appendChild(langSwitch);
    
    // Apply current language state
    updateDocumentLang(currentLang);
    updateAllLanguageContent(currentLang);
  }

  /**
   * Initialize language on page load
   */
  function initLanguage() {
    const currentLang = getCurrentLang();
    updateDocumentLang(currentLang);
    updateAllLanguageContent(currentLang);
  }

  /**
   * Mobile Menu Logic
   */
  let mobileDrawerOpen = false;
  let focusableElements = [];
  let firstFocusable = null;
  let lastFocusable = null;

  /**
   * Initialize mobile drawer (hamburger menu)
   */
  function initMobileDrawer() {
    const hamburger = document.getElementById('btnHamburger');
    const drawer = document.getElementById('mobileDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    
    if (!hamburger || !drawer) return; // Not on a page with mobile menu

    // Hamburger click - toggle drawer
    hamburger.addEventListener('click', toggleDrawer);

    // Backdrop click - close drawer
    if (backdrop) {
      backdrop.addEventListener('click', closeDrawer);
    }

    // ESC key - close drawer
    document.addEventListener('keydown', handleEscKey);

    // Close on any drawer link click
    const drawerLinks = drawer.querySelectorAll('.drawer-link');
    drawerLinks.forEach(link => {
      link.addEventListener('click', () => {
        // For logout button, don't close immediately (let handler execute)
        if (!link.id || !link.id.includes('Logout')) {
          closeDrawer();
        }
      });
    });

    // Setup drawer logout button
    const drawerLogout = document.getElementById('drawerLogout');
    if (drawerLogout) {
      drawerLogout.addEventListener('click', handleLogout);
    }

    // Setup drawer language toggle
    const drawerLangToggle = document.getElementById('drawerLangToggle');
    if (drawerLangToggle) {
      drawerLangToggle.addEventListener('click', () => {
        toggleLanguage();
        updateDrawerLanguageButton();
      });
    }

    // Initialize drawer language button text
    updateDrawerLanguageButton();
  }

  /**
   * Toggle drawer open/closed
   */
  function toggleDrawer() {
    if (mobileDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  /**
   * Open mobile drawer
   */
  function openDrawer() {
    const hamburger = document.getElementById('btnHamburger');
    const drawer = document.getElementById('mobileDrawer');
    
    if (!drawer) return;

    mobileDrawerOpen = true;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', 'true');
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Setup focus trap
    setupFocusTrap(drawer);
  }

  /**
   * Close mobile drawer
   */
  function closeDrawer() {
    const hamburger = document.getElementById('btnHamburger');
    const drawer = document.getElementById('mobileDrawer');
    
    if (!drawer) return;

    mobileDrawerOpen = false;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.focus(); // Return focus to hamburger
    }

    // Restore body scroll
    document.body.style.overflow = '';

    // Clear focus trap
    focusableElements = [];
    firstFocusable = null;
    lastFocusable = null;
  }

  /**
   * Handle ESC key to close drawer
   */
  function handleEscKey(e) {
    if (e.key === 'Escape' && mobileDrawerOpen) {
      closeDrawer();
    }
  }

  /**
   * Setup focus trap within drawer
   */
  function setupFocusTrap(drawer) {
    // Get all focusable elements
    focusableElements = drawer.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    firstFocusable = focusableElements[0];
    lastFocusable = focusableElements[focusableElements.length - 1];

    // Focus first element
    firstFocusable.focus();

    // Trap focus
    drawer.addEventListener('keydown', trapFocus);
  }

  /**
   * Trap focus within drawer
   */
  function trapFocus(e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  /**
   * Update drawer language button text
   */
  function updateDrawerLanguageButton() {
    const drawerLangBtn = document.getElementById('drawerLangToggle');
    if (!drawerLangBtn) return;

    const currentLang = getCurrentLang();
    const config = LANG_CONFIG[currentLang];
    
    // Update button text to show OTHER language
    const textContent = drawerLangBtn.querySelector('.drawer-link-text') || drawerLangBtn;
    textContent.textContent = config.otherLabel;
  }

  /**
   * Handle logout (for both header and drawer)
   */
  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      // Still redirect on error
      window.location.href = '/';
    }
  }

  /**
   * Initialize logout buttons (header and drawer)
   */
  function initLogoutButtons() {
    // Header logout button
    const headerLogout = document.getElementById('headerLogoutBtn') || document.getElementById('logoutBtn');
    if (headerLogout) {
      headerLogout.addEventListener('click', handleLogout);
    }

    // Drawer logout button (handled in initMobileDrawer)
  }

  // Export to window
  window.HeaderUtils = {
    initHeaderLanguageSwitch,
    initLanguage,
    getCurrentLang,
    setLanguage,
    toggleLanguage,
    initMobileDrawer,
    initLogoutButtons,
    handleLogout
  };

  // Auto-initialize language on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initLanguage();
      initMobileDrawer();
      initLogoutButtons();
    });
  } else {
    initLanguage();
    initMobileDrawer();
    initLogoutButtons();
  }

})(window);
