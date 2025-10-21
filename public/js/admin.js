/**
 * Admin Dashboard - Interactive Drilldown Logic
 * Handles data fetching, tree building, and interactive expand/collapse
 */

// State management
let drilldownData = [];
let countersData = null;

// Drilldown levels configuration
const LEVELS = ['country', 'age_band', 'sector', 'job_nature'];
const LEVEL_LABELS = {
  country: { en: 'Country', ar: 'الدولة' },
  age_band: { en: 'Age Band', ar: 'الفئة العمرية' },
  sector: { en: 'Sector', ar: 'القطاع' },
  job_nature: { en: 'Job Nature', ar: 'طبيعة العمل' }
};

/**
 * Fetch counters data from API
 */
async function fetchCounters() {
  try {
    const response = await fetch('/api/admin/counters');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    countersData = await response.json();
    renderCounters();
  } catch (error) {
    console.error('Failed to fetch counters:', error);
    showError('Failed to load counters data');
  }
}

/**
 * Fetch drilldown data from API
 */
async function fetchDrilldownData() {
  try {
    const response = await fetch('/api/admin/drilldown');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const result = await response.json();
    drilldownData = result.data || [];
    renderDrilldown();
  } catch (error) {
    console.error('Failed to fetch drilldown data:', error);
    showError('Failed to load drilldown data');
  }
}

/**
 * Render counters to the UI
 */
function renderCounters() {
  if (!countersData) return;

  const totalUsersEl = document.getElementById('totalUsersValue');
  const topCountryEl = document.getElementById('topCountryValue');
  const topCountryCountEl = document.getElementById('topCountryCount');

  if (totalUsersEl) {
    totalUsersEl.textContent = countersData.totalUsers.toLocaleString();
  }

  if (topCountryEl && topCountryCountEl) {
    topCountryEl.textContent = countersData.topCountry.name;
    topCountryCountEl.textContent = `${countersData.topCountry.count} users`;
  }
}

/**
 * Build hierarchical tree structure from flat data
 */
function buildTree(data) {
  const tree = [];

  // Group by country (level 0)
  const countries = {};
  data.forEach(row => {
    const country = row.country || 'Unknown';
    if (!countries[country]) {
      countries[country] = { name: country, count: 0, children: {} };
    }
  });

  // Aggregate counts for each combination
  data.forEach(row => {
    const country = row.country || 'Unknown';
    const ageBand = row.age_band || 'Unknown';
    const sector = row.sector || 'Unknown';
    const jobNature = row.job_nature || 'Unknown';

    // Add to country
    countries[country].count += row.count;

    // Level 1: Age Band
    if (!countries[country].children[ageBand]) {
      countries[country].children[ageBand] = { name: ageBand, count: 0, children: {} };
    }
    countries[country].children[ageBand].count += row.count;

    // Level 2: Sector
    const ageBandNode = countries[country].children[ageBand];
    if (!ageBandNode.children[sector]) {
      ageBandNode.children[sector] = { name: sector, count: 0, children: {} };
    }
    ageBandNode.children[sector].count += row.count;

    // Level 3: Job Nature
    const sectorNode = ageBandNode.children[sector];
    if (!sectorNode.children[jobNature]) {
      sectorNode.children[jobNature] = { name: jobNature, count: row.count, children: {} };
    } else {
      sectorNode.children[jobNature].count += row.count;
    }
  });

  // Convert to array
  Object.keys(countries).forEach(countryName => {
    tree.push(countries[countryName]);
  });

  // Sort by count descending
  tree.sort((a, b) => b.count - a.count);

  return tree;
}

/**
 * Render drilldown table
 */
function renderDrilldown() {
  const container = document.getElementById('drilldownContainer');
  if (!container) return;

  if (drilldownData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p data-lang-content="en">No data available</p>
        <p class="hidden" data-lang-content="ar">لا توجد بيانات متاحة</p>
      </div>
    `;
    return;
  }

  const tree = buildTree(drilldownData);
  
  const tableHTML = `
    <div class="drilldown-table" role="table" aria-label="User distribution drilldown">
      <div class="drilldown-header" role="row">
        <div class="drilldown-cell" data-lang-content="en">Category</div>
        <div class="drilldown-cell hidden" data-lang-content="ar">الفئة</div>
        <div class="drilldown-cell" data-lang-content="en">Count</div>
        <div class="drilldown-cell hidden" data-lang-content="ar">العدد</div>
      </div>
      <div class="drilldown-body">
        ${renderTreeLevel(tree, 0)}
      </div>
    </div>
  `;

  container.innerHTML = tableHTML;
  attachExpandHandlers();
}

/**
 * Render a level of the tree recursively
 */
function renderTreeLevel(nodes, level, path = []) {
  if (!nodes || Object.keys(nodes).length === 0) return '';

  const nodeArray = Array.isArray(nodes) ? nodes : Object.values(nodes);
  const currentLevel = LEVELS[level];
  const hasNextLevel = level < LEVELS.length - 1;

  return nodeArray.map((node, index) => {
    const nodePath = [...path, node.name];
    const nodeId = nodePath.join('_').replace(/[^a-zA-Z0-9_-]/g, '_');
    const indentClass = `indent-${level}`;
    const expandable = hasNextLevel && Object.keys(node.children).length > 0;

    let html = `
      <div class="drilldown-row ${indentClass} ${expandable ? 'expandable' : 'leaf'}" 
           data-node-id="${nodeId}" 
           data-level="${level}"
           role="row"
           ${expandable ? 'tabindex="0"' : ''}>
        <div class="drilldown-cell">
          ${expandable ? '<i class="fas fa-chevron-right expand-icon"></i>' : '<span class="leaf-icon"></span>'}
          <span class="node-label">${escapeHtml(node.name)}</span>
        </div>
        <div class="drilldown-cell count-cell">${node.count.toLocaleString()}</div>
      </div>
    `;

    // Add children container (initially hidden)
    if (expandable) {
      html += `
        <div class="drilldown-children" data-parent-id="${nodeId}" style="display: none;">
          ${renderTreeLevel(node.children, level + 1, nodePath)}
        </div>
      `;
    }

    return html;
  }).join('');
}

/**
 * Attach click handlers for expand/collapse
 */
function attachExpandHandlers() {
  const expandableRows = document.querySelectorAll('.drilldown-row.expandable');
  
  expandableRows.forEach(row => {
    row.addEventListener('click', toggleRow);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleRow.call(row);
      }
    });
  });
}

/**
 * Toggle row expansion
 */
function toggleRow() {
  const nodeId = this.getAttribute('data-node-id');
  const childrenContainer = document.querySelector(`[data-parent-id="${nodeId}"]`);
  const icon = this.querySelector('.expand-icon');

  if (!childrenContainer || !icon) return;

  const isExpanded = childrenContainer.style.display !== 'none';

  if (isExpanded) {
    // Collapse
    childrenContainer.style.display = 'none';
    icon.classList.remove('fa-chevron-down');
    icon.classList.add('fa-chevron-right');
    this.setAttribute('aria-expanded', 'false');
  } else {
    // Expand
    childrenContainer.style.display = 'block';
    icon.classList.remove('fa-chevron-right');
    icon.classList.add('fa-chevron-down');
    this.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.getElementById('drilldownContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-circle"></i>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Refresh all data
 */
async function refreshData() {
  const refreshBtn = document.getElementById('refreshBtn');
  const originalContent = refreshBtn?.innerHTML;

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  }

  try {
    await Promise.all([fetchCounters(), fetchDrilldownData()]);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = originalContent;
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initial data fetch
  refreshData();

  // Attach refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshData);
  }
});
