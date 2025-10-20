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

  // Export to window
  window.HeaderUtils = {
    initHeaderLanguageSwitch,
    initLanguage,
    getCurrentLang,
    setLanguage,
    toggleLanguage
  };

  // Auto-initialize language on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
  } else {
    initLanguage();
  }

})(window);
