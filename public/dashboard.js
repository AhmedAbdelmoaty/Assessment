// Dashboard functionality
(async function() {
  // Check authentication
  try {
    const authRes = await fetch('/api/auth/me');
    const authData = await authRes.json();
    
    if (!authData.authenticated) {
      window.location.href = '/?login=1';
      return;
    }

    // Load profile data
    loadProfile();
    loadAssessments();
    loadTutorials();

    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
      } catch (err) {
        console.error('Logout error:', err);
      }
    });

  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = '/';
  }
})();

async function loadProfile() {
  try {
    const res = await fetch('/api/user/profile');
    const data = await res.json();
    
    if (data.user) {
      document.getElementById('userName').textContent = data.user.name;
      document.getElementById('infoName').textContent = data.user.name;
      document.getElementById('infoEmail').textContent = data.user.email;
      document.getElementById('infoStatus').textContent = data.user.emailVerified ? 'Verified ✓' : 'Pending';
    }
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

async function loadAssessments() {
  const container = document.getElementById('assessmentsContent');
  
  try {
    const res = await fetch('/api/user/assessments');
    const data = await res.json();
    
    if (!data.assessments || data.assessments.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-icons" style="font-size:48px">quiz</span></div>
          <p>No assessments yet</p>
          <a href="/" class="cta-link">Start Your First Assessment</a>
        </div>
      `;
      return;
    }

    container.innerHTML = data.assessments.map(assessment => {
      const date = new Date(assessment.startedAt).toLocaleDateString();
      const score = assessment.scorePercent || 'In Progress';
      
      return `
        <div class="assessment-card" data-testid="card-assessment-${assessment.id}">
          <div class="assessment-header">
            <span class="assessment-date">${date}</span>
            <span class="score-badge">${score}${typeof score === 'number' ? '%' : ''}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            Difficulty: ${assessment.difficulty}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Assessments load error:', err);
    container.innerHTML = '<div class="empty-state"><p>Error loading assessments</p></div>';
  }
}

async function loadTutorials() {
  const container = document.getElementById('tutorialsContent');
  
  try {
    const res = await fetch('/api/user/tutorials');
    const data = await res.json();
    
    if (!data.tutorials || data.tutorials.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><span class="material-icons" style="font-size:48px">menu_book</span></div>
          <p>No tutorials available yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.tutorials.map(tutorial => {
      return `
        <div class="tutorial-card" data-testid="card-tutorial-${tutorial.id}">
          <div class="tutorial-title">${tutorial.title}</div>
          <div class="tutorial-meta">
            <span>⏱ ${tutorial.duration}</span>
            <span>📊 ${tutorial.level}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Tutorials load error:', err);
    container.innerHTML = '<div class="empty-state"><p>Error loading tutorials</p></div>';
  }
}
