(function() {
    'use strict';
    
    // State management
    let currentLang = 'en';
    let currentSection = 'landing';
    let sessionId = null;
    let currentStep = 'intake';
    let currentMCQ = null;
    let isProcessing = false;
    
    // DOM elements
    const langButtons = document.querySelectorAll('.lang-btn');
    const html = document.documentElement;
    const startBtn = document.getElementById('startBtn');
    const landingSection = document.getElementById('landingSection');
    const chatSection = document.getElementById('chatSection');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    
    // Initialize
    init();
    
    function init() {
        setupLanguageToggle();
        setupStartButton();
        setupSendButton();
        setupInputHandlers();
    }
    
    function setupLanguageToggle() {
        langButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const lang = this.getAttribute('data-lang');
                switchLanguage(lang);
            });
        });
    }
    
    function switchLanguage(lang) {
        currentLang = lang;
        
        // Update button states
        langButtons.forEach(btn => {
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update HTML dir and lang attributes
        if (lang === 'ar') {
            html.setAttribute('dir', 'rtl');
            html.setAttribute('lang', 'ar');
        } else {
            html.setAttribute('dir', 'ltr');
            html.setAttribute('lang', 'en');
        }
        
        // Toggle content visibility
        const allContent = document.querySelectorAll('[data-lang-content]');
        allContent.forEach(el => {
            if (el.getAttribute('data-lang-content') === lang) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
        
        // Update input placeholder
        if (chatInput) {
            chatInput.placeholder = lang === 'ar' ? 
                chatInput.getAttribute('data-placeholder-ar') : 
                chatInput.getAttribute('data-placeholder-en');
        }
    }
    
    function setupStartButton() {
        startBtn.addEventListener('click', function() {
            landingSection.style.display = 'none';
            chatSection.classList.add('active');
            currentSection = 'chat';
            updateProgress(0);
            startIntakeFlow();
        });
    }
    
    function setupSendButton() {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    function setupInputHandlers() {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !isProcessing) {
                sendMessage();
            }
        });
        
        // Choice chips delegation
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('choice-chip') && !isProcessing) {
                handleChoiceSelection(e.target);
            }
        });
        
        // MCQ choice delegation
        document.addEventListener('click', function(e) {
            if (e.target.closest('.mcq-choice') && !isProcessing) {
                handleMCQSelection(e.target.closest('.mcq-choice'));
            }
        });
        
        // Dropdown delegation
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('dropdown-item') && !isProcessing) {
                handleDropdownSelection(e.target);
            }
        });
        
        // Close dropdown on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-container')) {
                const dropdowns = document.querySelectorAll('.dropdown-list');
                dropdowns.forEach(dropdown => dropdown.classList.remove('active'));
            }
        });
    }
    
    async function startIntakeFlow() {
        showTypingIndicator();
        try {
            const response = await fetch('/api/intake/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lang: currentLang })
            });
            
            const data = await response.json();
            sessionId = data.sessionId;
            
            hideTypingIndicator();
            addSystemMessage(data.message, data.choices, data.dropdown);
            
        } catch (error) {
            console.error('Error starting intake:', error);
            hideTypingIndicator();
            addSystemMessage(currentLang === 'ar' ? 
                'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.' : 
                'Sorry, an error occurred. Please try again.');
        }
    }
    
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message || isProcessing) return;
        
        isProcessing = true;
        addUserMessage(message);
        chatInput.value = '';
        
        if (currentStep === 'intake') {
            await handleIntakeAnswer(message);
        }
        
        isProcessing = false;
    }
    
    async function handleIntakeAnswer(answer) {
        showTypingIndicator();
        
        try {
            const response = await fetch('/api/intake/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    lang: currentLang,
                    answer
                })
            });
            
            const data = await response.json();
            hideTypingIndicator();
            
            if (data.validation) {
                addSystemMessage(data.message);
                return;
            }
            
            addSystemMessage(data.message, data.choices, data.dropdown);
            
            if (data.isComplete) {
                currentStep = 'assessment';
                updateProgress(1);
                setTimeout(() => startAssessment(), 1000);
            }
            
        } catch (error) {
            console.error('Error in intake:', error);
            hideTypingIndicator();
            addSystemMessage(currentLang === 'ar' ? 
                'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.' : 
                'Sorry, an error occurred. Please try again.');
        }
    }
    
    async function handleChoiceSelection(chip) {
        // Visual feedback
        const siblings = chip.parentElement.querySelectorAll('.choice-chip');
        siblings.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        
        isProcessing = true;
        const choice = chip.textContent.trim();
        addUserMessage(choice);
        
        if (currentStep === 'intake') {
            await handleIntakeAnswer(choice);
        }
        
        isProcessing = false;
    }
    
    async function handleMCQSelection(choice) {
        // Visual feedback
        const siblings = choice.parentElement.querySelectorAll('.mcq-choice');
        siblings.forEach(c => c.classList.remove('selected'));
        choice.classList.add('selected');
        
        isProcessing = true;
        const choiceText = choice.textContent.trim();
        addUserMessage(choiceText);
        
        // Submit MCQ answer
        await submitMCQAnswer(choiceText);
        isProcessing = false;
    }
    
    async function handleDropdownSelection(item) {
        const country = item.getAttribute('data-country');
        const dropdown = item.parentElement;
        const search = dropdown.previousElementSibling;
        
        search.value = country;
        dropdown.classList.remove('active');
        
        isProcessing = true;
        addUserMessage(country);
        
        if (currentStep === 'intake') {
            await handleIntakeAnswer(country);
        }
        
        isProcessing = false;
    }
    
    async function startAssessment() {
        showTypingIndicator();
        
        try {
            const response = await fetch('/api/assess/next', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            
            const mcq = await response.json();
            currentMCQ = mcq;
            
            hideTypingIndicator();
            addMCQQuestion(mcq);
            
        } catch (error) {
            console.error('Error getting assessment question:', error);
            hideTypingIndicator();
            addSystemMessage(currentLang === 'ar' ? 
                'عذراً، حدث خطأ في التقييم.' : 
                'Sorry, an error occurred during assessment.');
        }
    }
    
    async function submitMCQAnswer(userAnswer) {
        showTypingIndicator();
        
        try {
            const response = await fetch('/api/assess/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    cluster: currentMCQ.cluster,
                    level: currentMCQ.level,
                    userAnswer,
                    correctAnswer: currentMCQ.correct_answer
                })
            });
            
            const result = await response.json();
            hideTypingIndicator();
            
            // Show feedback
            const feedbackMsg = result.correct ? 
                (currentLang === 'ar' ? 'إجابة صحيحة!' : 'Correct!') :
                (currentLang === 'ar' ? 'إجابة خاطئة.' : 'Incorrect.');
            
            addSystemMessage(feedbackMsg + ' ' + currentMCQ.rationale);
            
            // Continue or finish assessment
            if (result.nextAction === 'complete') {
                currentStep = 'report';
                updateProgress(2);
                setTimeout(() => generateReport(), 1500);
            } else if (result.nextAction === 'stop') {
                currentStep = 'report';
                updateProgress(2);
                setTimeout(() => generateReport(), 1500);
            } else {
                // Continue with next question
                setTimeout(() => startAssessment(), 1500);
            }
            
        } catch (error) {
            console.error('Error submitting answer:', error);
            hideTypingIndicator();
            addSystemMessage(currentLang === 'ar' ? 
                'عذراً، حدث خطأ في معالجة الإجابة.' : 
                'Sorry, an error occurred processing your answer.');
        }
    }
    
    async function generateReport() {
        showTypingIndicator();
        
        try {
            const response = await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            
            const report = await response.json();
            hideTypingIndicator();
            
            addFinalReport(report);
            updateProgress(2, true);
            
        } catch (error) {
            console.error('Error generating report:', error);
            hideTypingIndicator();
            addSystemMessage(currentLang === 'ar' ? 
                'عذراً، حدث خطأ في إنشاء التقرير.' : 
                'Sorry, an error occurred generating your report.');
        }
    }
    
    // UI helper functions
    function addUserMessage(text) {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble user';
        bubble.innerHTML = `
            <div class="message-content">${escapeHtml(text)}</div>
            <div class="message-avatar">
                <i class="fas fa-user"></i>
            </div>
        `;
        chatMessages.appendChild(bubble);
        scrollToBottom();
    }
    
    function addSystemMessage(text, choices = null, dropdown = null) {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble system';
        bubble.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">${escapeHtml(text)}</div>
        `;
        chatMessages.appendChild(bubble);
        
        if (choices) {
            addChoiceChips(choices);
        }
        
        if (dropdown) {
            addDropdown(dropdown);
        }
        
        scrollToBottom();
    }
    
    function addChoiceChips(choices) {
        const container = document.createElement('div');
        container.className = 'choice-chips';
        
        choices.forEach(choice => {
            const chip = document.createElement('div');
            chip.className = 'choice-chip';
            chip.textContent = choice;
            container.appendChild(chip);
        });
        
        chatMessages.appendChild(container);
        scrollToBottom();
    }
    
    function addDropdown(countries) {
        const container = document.createElement('div');
        container.className = 'dropdown-container';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'dropdown-search';
        searchInput.placeholder = currentLang === 'ar' ? 'ابحث عن دولة...' : 'Search countries...';
        
        const dropdownList = document.createElement('div');
        dropdownList.className = 'dropdown-list';
        
        countries.forEach(country => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.setAttribute('data-country', country);
            item.textContent = country;
            dropdownList.appendChild(item);
        });
        
        searchInput.addEventListener('focus', () => {
            dropdownList.classList.add('active');
        });
        
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const items = dropdownList.querySelectorAll('.dropdown-item');
            
            items.forEach(item => {
                const country = item.getAttribute('data-country').toLowerCase();
                if (country.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
        
        container.appendChild(searchInput);
        container.appendChild(dropdownList);
        chatMessages.appendChild(container);
        scrollToBottom();
    }
    
    function addMCQQuestion(mcq) {
        const container = document.createElement('div');
        container.className = 'mcq-container';
        
        const levelNames = {
            'L1': currentLang === 'ar' ? 'المستوى الأول - الأساسيات' : 'Level 1 - Foundations',
            'L2': currentLang === 'ar' ? 'المستوى الثاني - التطبيق' : 'Level 2 - Core Applied',
            'L3': currentLang === 'ar' ? 'المستوى الثالث - المهني' : 'Level 3 - Professional'
        };
        
        container.innerHTML = `
            <div class="mcq-header">
                <span class="mcq-level">${levelNames[mcq.level]}</span>
                <span class="mcq-number">${currentLang === 'ar' ? `السؤال ${mcq.questionNumber} من ${mcq.totalQuestions}` : `Question ${mcq.questionNumber} of ${mcq.totalQuestions}`}</span>
            </div>
            <div class="mcq-question">${escapeHtml(mcq.prompt)}</div>
            <div class="mcq-choices">
                ${mcq.choices.map((choice, index) => `
                    <div class="mcq-choice">
                        <div class="choice-letter">${String.fromCharCode(65 + index)}</div>
                        <span>${escapeHtml(choice)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        chatMessages.appendChild(container);
        scrollToBottom();
    }
    
    function addFinalReport(report) {
        const container = document.createElement('div');
        container.className = 'report-card';
        
        const levelClass = report.stats_level.toLowerCase();
        const levelText = currentLang === 'ar' ? 
            {
                'beginner': 'مبتدئ',
                'intermediate': 'متوسط',
                'advanced': 'متقدم'
            }[levelClass] : report.stats_level;
            
        const strengthsTitle = currentLang === 'ar' ? 'نقاط قوتك' : 'Your Strengths';
        const gapsTitle = currentLang === 'ar' ? 'فرص النمو' : 'Growth Opportunities';
        const resultsTitle = currentLang === 'ar' ? 'نتائج تقييمك' : 'Your Assessment Results';
        
        container.innerHTML = `
            <div class="report-header">
                <div class="level-badge ${levelClass}">${levelText} ${currentLang === 'ar' ? 'المستوى' : 'Level'}</div>
                <h2 class="report-title">${resultsTitle}</h2>
                <p class="report-message">${escapeHtml(report.message)}</p>
            </div>
            
            <div class="report-section">
                <div class="section-title">
                    <div class="section-icon strengths">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <span>${strengthsTitle}</span>
                </div>
                <div class="item-list">
                    ${report.strengths.map(strength => `
                        <div class="item">
                            <i class="fas fa-circle item-icon"></i>
                            <span>${escapeHtml(strength)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="report-section">
                <div class="section-title">
                    <div class="section-icon gaps">
                        <i class="fas fa-lightbulb"></i>
                    </div>
                    <span>${gapsTitle}</span>
                </div>
                <div class="item-list">
                    ${report.gaps.map(gap => `
                        <div class="item">
                            <i class="fas fa-circle item-icon"></i>
                            <span>${escapeHtml(gap)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        chatMessages.appendChild(container);
        scrollToBottom();
    }
    
    function showTypingIndicator() {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble system typing-indicator-bubble';
        bubble.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        chatMessages.appendChild(bubble);
        scrollToBottom();
    }
    
    function hideTypingIndicator() {
        const indicator = document.querySelector('.typing-indicator-bubble');
        if (indicator) {
            indicator.remove();
        }
    }
    
    function updateProgress(step, completed = false) {
        const steps = document.querySelectorAll('.progress-step');
        const progressFill = document.querySelector('.progress-fill');
        
        steps.forEach((s, index) => {
            if (index < step) {
                s.classList.add('completed');
                s.classList.remove('active');
            } else if (index === step) {
                s.classList.add('active');
                s.classList.remove('completed');
                if (completed) {
                    s.classList.add('completed');
                    s.classList.remove('active');
                }
            } else {
                s.classList.remove('active', 'completed');
            }
        });
        
        const progress = (step / (steps.length - 1)) * 100;
        progressFill.style.width = progress + '%';
        
        if (completed) {
            progressFill.style.width = '100%';
        }
    }
    
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
})();
