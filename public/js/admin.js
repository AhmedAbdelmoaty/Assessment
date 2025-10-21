/**
 * Admin Dashboard - Pivot Matrix & Users Table
 * Real data from database, no mock data
 */

// State
let rawData = []; // All users from DB
let filteredData = []; // After applying filters
let currentFilters = {}; // { field: [values] }
let currentPage = 1;
const PAGE_SIZE = 20;

// Dimensions
const DIMENSIONS = ['country', 'sector', 'job_nature', 'age_band', 'experience_years_band', 'learning_reason'];
const DIMENSION_LABELS = {
  country: 'Country',
  sector: 'Sector',
  job_nature: 'Job Nature',
  age_band: 'Age Band',
  experience_years_band: 'Experience',
  learning_reason: 'Learning Reason'
};

/**
 * Fetch raw users data from API
 */
async function fetchData() {
  try {
    const response = await fetch('/api/admin/users/raw');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const result = await response.json();
    rawData = result.data || [];
    currentPage = 1; // Reset pagination when data refreshes
    applyFilters();
    updateAll();
  } catch (error) {
    console.error('Failed to fetch data:', error);
    showError('Failed to load data');
  }
}

/**
 * Apply filters to raw data
 */
function applyFilters() {
  currentPage = 1; // Reset pagination when filters change
  filteredData = rawData.filter(row => {
    for (const [field, values] of Object.entries(currentFilters)) {
      if (values.length === 0) continue;
      const rowValue = row[field] || '';
      if (!values.includes(rowValue)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Update all UI components
 */
function updateAll() {
  updateKPIs();
  updatePivot();
  updateUsersTable();
  updateFilterUI();
}

/**
 * Update KPI cards
 */
function updateKPIs() {
  const totalUsers = rawData.length;
  const filteredUsers = filteredData.length;
  
  document.getElementById('totalUsersKPI').textContent = totalUsers.toLocaleString();
  document.getElementById('filteredUsersKPI').textContent = filteredUsers.toLocaleString();
  
  // Top country (from filtered data)
  const countryCounts = {};
  filteredData.forEach(row => {
    const country = row.country || 'Unknown';
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  });
  
  const topCountry = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (topCountry) {
    document.getElementById('topCountryKPI').textContent = topCountry[0];
    document.getElementById('topCountryCount').textContent = `${topCountry[1]} users`;
  } else {
    document.getElementById('topCountryKPI').textContent = '-';
    document.getElementById('topCountryCount').textContent = '';
  }
}

/**
 * Build and render pivot matrix
 */
function updatePivot() {
  const container = document.getElementById('pivotContainer');
  const rowField = document.getElementById('rowsSelect').value;
  const colField = document.getElementById('columnsSelect').value;
  
  if (filteredData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No data available</p>
      </div>
    `;
    return;
  }
  
  // Build pivot data structure
  const pivot = buildPivot(filteredData, rowField, colField);
  
  // Render pivot table
  container.innerHTML = renderPivotTable(pivot, rowField, colField);
}

/**
 * Build pivot data structure
 */
function buildPivot(data, rowField, colField) {
  const matrix = {};
  const rowValues = new Set();
  const colValues = new Set();
  
  // Collect all unique values
  data.forEach(row => {
    const rowValue = row[rowField] || 'Unknown';
    const colValue = colField === 'none' ? 'Count' : (row[colField] || 'Unknown');
    
    rowValues.add(rowValue);
    colValues.add(colValue);
    
    // Initialize matrix
    if (!matrix[rowValue]) {
      matrix[rowValue] = {};
    }
    if (!matrix[rowValue][colValue]) {
      matrix[rowValue][colValue] = 0;
    }
    
    matrix[rowValue][colValue]++;
  });
  
  return {
    matrix,
    rowValues: Array.from(rowValues).sort(),
    colValues: Array.from(colValues).sort()
  };
}

/**
 * Render pivot table HTML
 */
function renderPivotTable(pivot, rowField, colField) {
  const { matrix, rowValues, colValues } = pivot;
  
  // Calculate column totals
  const colTotals = {};
  rowValues.forEach(rowValue => {
    colValues.forEach(colValue => {
      const count = matrix[rowValue]?.[colValue] || 0;
      colTotals[colValue] = (colTotals[colValue] || 0) + count;
    });
  });
  
  // Calculate row totals
  const rowTotals = {};
  rowValues.forEach(rowValue => {
    rowTotals[rowValue] = colValues.reduce((sum, colValue) => {
      return sum + (matrix[rowValue]?.[colValue] || 0);
    }, 0);
  });
  
  // Grand total
  const grandTotal = Object.values(rowTotals).reduce((sum, val) => sum + val, 0);
  
  // Find max for heatmap
  const maxCount = Math.max(...Object.values(matrix).flatMap(row => Object.values(row)));
  
  let html = '<div class="pivot-table-wrapper"><table class="pivot-table">';
  
  // Header row
  html += '<thead><tr>';
  html += `<th class="pivot-header">${escapeHtml(DIMENSION_LABELS[rowField])}</th>`;
  colValues.forEach(colValue => {
    html += `<th class="pivot-header">${escapeHtml(colValue)}</th>`;
  });
  html += '<th class="pivot-header total-header">Total</th>';
  html += '</tr></thead>';
  
  // Data rows
  html += '<tbody>';
  rowValues.forEach(rowValue => {
    html += '<tr>';
    html += `<td class="pivot-row-label">${escapeHtml(rowValue)}</td>`;
    
    colValues.forEach(colValue => {
      const count = matrix[rowValue]?.[colValue] || 0;
      const intensity = maxCount > 0 ? (count / maxCount) : 0;
      const bgColor = count > 0 ? `rgba(165, 32, 37, ${0.1 + intensity * 0.4})` : 'transparent';
      html += `<td class="pivot-cell" style="background-color: ${bgColor}">${count}</td>`;
    });
    
    html += `<td class="pivot-total">${rowTotals[rowValue]}</td>`;
    html += '</tr>';
  });
  
  // Totals row
  html += '<tr class="pivot-totals-row">';
  html += '<td class="pivot-row-label">Total</td>';
  colValues.forEach(colValue => {
    html += `<td class="pivot-total">${colTotals[colValue]}</td>`;
  });
  html += `<td class="pivot-grand-total">${grandTotal}</td>`;
  html += '</tr>';
  
  html += '</tbody></table></div>';
  
  return html;
}

/**
 * Update filter UI
 */
function updateFilterUI() {
  const container = document.getElementById('filtersContainer');
  container.innerHTML = '';
  
  DIMENSIONS.forEach(dimension => {
    // Get unique values for this dimension
    const values = [...new Set(rawData.map(row => row[dimension] || '').filter(v => v))].sort();
    
    if (values.length === 0) return;
    
    const filterDiv = document.createElement('div');
    filterDiv.className = 'filter-item';
    filterDiv.innerHTML = `
      <label>${DIMENSION_LABELS[dimension]}</label>
      <select multiple class="filter-select" data-field="${dimension}">
        ${values.map(value => {
          const selected = currentFilters[dimension]?.includes(value) ? 'selected' : '';
          return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(value)}</option>`;
        }).join('')}
      </select>
    `;
    
    container.appendChild(filterDiv);
    
    // Add change listener
    const select = filterDiv.querySelector('select');
    select.addEventListener('change', debounce(() => {
      const selected = Array.from(select.selectedOptions).map(opt => opt.value);
      if (selected.length > 0) {
        currentFilters[dimension] = selected;
      } else {
        delete currentFilters[dimension];
      }
      applyFilters();
      updateAll();
    }, 300));
  });
}

/**
 * Update users table with search and pagination
 */
function updateUsersTable() {
  const container = document.getElementById('usersTableContainer');
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  // Filter by search
  let displayData = filteredData.filter(row => {
    const name = (row.name || '').toLowerCase();
    const email = (row.email || '').toLowerCase();
    const username = (row.username || '').toLowerCase();
    return name.includes(searchTerm) || email.includes(searchTerm) || username.includes(searchTerm);
  });
  
  // Pagination
  const totalPages = Math.ceil(displayData.length / PAGE_SIZE);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const endIdx = startIdx + PAGE_SIZE;
  const pageData = displayData.slice(startIdx, endIdx);
  
  if (pageData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No users found</p>
      </div>
    `;
    document.getElementById('paginationContainer').innerHTML = '';
    return;
  }
  
  // Render table
  let html = '<table class="users-table">';
  html += `
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Username</th>
        <th>Country</th>
        <th>Age Band</th>
        <th>Sector</th>
        <th>Job Nature</th>
        <th>Experience</th>
        <th>Reason</th>
      </tr>
    </thead>
  `;
  
  html += '<tbody>';
  pageData.forEach(row => {
    html += `
      <tr>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${escapeHtml(row.email || '-')}</td>
        <td>${escapeHtml(row.username || '-')}</td>
        <td>${escapeHtml(row.country || '-')}</td>
        <td>${escapeHtml(row.age_band || '-')}</td>
        <td>${escapeHtml(row.sector || '-')}</td>
        <td>${escapeHtml(row.job_nature || '-')}</td>
        <td>${escapeHtml(row.experience_years_band || '-')}</td>
        <td>${escapeHtml(row.learning_reason || '-')}</td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  
  container.innerHTML = html;
  
  // Render pagination
  renderPagination(totalPages);
}

/**
 * Render pagination controls
 */
function renderPagination(totalPages) {
  const container = document.getElementById('paginationContainer');
  
  // Guard: clamp currentPage to valid range
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<div class="pagination">';
  
  // Previous button
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
    <i class="fas fa-chevron-left"></i>
  </button>`;
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="page-ellipsis">...</span>';
    }
  }
  
  // Next button
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
    <i class="fas fa-chevron-right"></i>
  </button>`;
  
  html += '</div>';
  
  container.innerHTML = html;
  
  // Add click listeners
  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      currentPage = parseInt(btn.dataset.page);
      updateUsersTable();
    });
  });
}

/**
 * Export to CSV
 */
function exportCSV() {
  const headers = ['Name', 'Email', 'Username', 'Country', 'Age Band', 'Sector', 'Job Nature', 'Experience', 'Learning Reason'];
  const rows = filteredData.map(row => [
    row.name || '',
    row.email || '',
    row.username || '',
    row.country || '',
    row.age_band || '',
    row.sector || '',
    row.job_nature || '',
    row.experience_years_band || '',
    row.learning_reason || ''
  ]);
  
  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.getElementById('pivotContainer');
  container.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-circle"></i>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Refresh data
 */
async function refreshData() {
  const refreshBtn = document.getElementById('refreshBtn');
  const originalContent = refreshBtn?.innerHTML;
  
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  }
  
  try {
    await fetchData();
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
  fetchData();
  
  // Attach event listeners
  document.getElementById('refreshBtn')?.addEventListener('click', refreshData);
  document.getElementById('rowsSelect')?.addEventListener('change', () => updatePivot());
  document.getElementById('columnsSelect')?.addEventListener('change', () => updatePivot());
  document.getElementById('searchInput')?.addEventListener('input', debounce(() => {
    currentPage = 1;
    updateUsersTable();
  }, 300));
  document.getElementById('exportBtn')?.addEventListener('click', exportCSV);
});
