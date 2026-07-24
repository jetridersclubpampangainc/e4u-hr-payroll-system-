const cfg = window.E4U_SUPABASE_CONFIG || {};
const CONFIGURED = cfg.url && cfg.anonKey && !cfg.url.includes('PASTE_') && !cfg.anonKey.includes('PASTE_');
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  payroll_officer: 'Payroll Officer',
  supervisor: 'Supervisor',
  employee: 'Employee'
};
const ADMIN_ROLES = ['super_admin', 'hr_admin', 'payroll_officer'];

let supabaseClient = null;
let session = null;
let profile = null;
let company = null;
let activeView = 'dashboard';
let authMode = 'login';
let filters = { employees: '', users: '' };
let state = {
  settings: null,
  profiles: [],
  employees: [],
  schedules: [],
  attendance: [],
  leaves: [],
  payrollRuns: [],
  payrollItems: []
};

function initSupabase() {
  if (!CONFIGURED || !window.supabase) return false;
  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  return true;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}
function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}
function badge(text, type = '') {
  return `<span class="badge ${type}">${escapeHtml(text)}</span>`;
}
function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}
function input(label, name, value = '', type = 'text', extraClass = '', attrs = '') {
  return `<label class="${extraClass}">${label}<input type="${type}" id="${name}" value="${escapeHtml(value ?? '')}" ${attrs}></label>`;
}
function selectInput(label, name, options, selected = '', extraClass = '') {
  const opts = options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<label class="${extraClass}">${label}<select id="${name}">${opts}</select></label>`;
}
function modal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modal').showModal();
}
function closeModal() {
  document.getElementById('modal').close();
}
async function sb(promise, fallbackMessage = 'Supabase request failed') {
  const { data, error } = await promise;
  if (error) {
    console.error(error);
    throw new Error(error.message || fallbackMessage);
  }
  return data;
}
function hasAdminAccess() {
  return profile && ADMIN_ROLES.includes(profile.role);
}
function hasPayrollAccess() {
  return profile && ['super_admin', 'payroll_officer'].includes(profile.role);
}
function getEmployee(id) {
  return state.employees.find(e => e.id === id);
}
function getEmployeeName(id) {
  const emp = getEmployee(id);
  return emp ? `${emp.last_name}, ${emp.first_name} ${emp.middle_name || ''}`.trim() : 'Unknown Employee';
}
function getEmployeeFullName(emp = {}) {
  return `${emp.first_name || ''} ${emp.middle_name || ''} ${emp.last_name || ''}`.replace(/\s+/g, ' ').trim();
}
function employeeOptions(selected = '') {
  const rows = state.employees.filter(e => e.status === 'Active');
  return rows.map(e => `<option value="${e.id}" ${selected === e.id ? 'selected' : ''}>${escapeHtml(getEmployeeName(e.id))}</option>`).join('');
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('loginTab').classList.toggle('active', mode === 'login');
  document.getElementById('signupTab').classList.toggle('active', mode === 'signup');
  document.getElementById('fullNameWrap').classList.toggle('hidden', mode !== 'signup');
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Login' : 'Create Account';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!CONFIGURED) return toast('Paste Supabase URL and anon key in config.js first.');
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const fullName = document.getElementById('authFullName').value.trim();
  try {
    if (authMode === 'login') {
      await sb(supabaseClient.auth.signInWithPassword({ email, password }), 'Login failed');
      toast('Logged in.');
    } else {
      await sb(supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email.split('@')[0] } }
      }), 'Signup failed');
      toast('Account created. Check email if confirmation is enabled.');
    }
    await boot();
  } catch (error) {
    toast(error.message);
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  session = null;
  profile = null;
  company = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
}

async function boot() {
  if (!initSupabase()) {
    document.getElementById('configWarning').classList.remove('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  session = data.session;
  if (!session) {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    return;
  }
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  await loadAllData();
  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    if (!nextSession) logout();
  });
}

async function loadProfile() {
  const user = session.user;
  let rows = await sb(supabaseClient.from('profiles').select('*').eq('id', user.id).limit(1), 'Cannot load profile');
  if (!rows.length) {
    await sb(supabaseClient.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email.split('@')[0],
      role: 'employee',
      status: 'Active'
    }), 'Cannot create profile');
    rows = await sb(supabaseClient.from('profiles').select('*').eq('id', user.id).limit(1));
  }
  profile = rows[0];
  document.getElementById('currentUserName').textContent = profile.full_name || profile.email || 'User';
  document.getElementById('currentUserRole').textContent = ROLE_LABELS[profile.role] || profile.role;
}

async function loadAllData() {
  try {
    await loadProfile();
    if (profile.company_id) {
      const companyRows = await sb(supabaseClient.from('companies').select('*').eq('id', profile.company_id).limit(1));
      company = companyRows[0] || null;
    } else {
      company = null;
    }

    if (!company) {
      state = { settings: null, profiles: [], employees: [], schedules: [], attendance: [], leaves: [], payrollRuns: [], payrollItems: [] };
      renderSetupCompany();
      return;
    }

    const [settings, profiles, employees, schedules, attendance, leaves, payrollRuns, payrollItems] = await Promise.all([
      sb(supabaseClient.from('settings').select('*').eq('company_id', company.id).maybeSingle()),
      sb(supabaseClient.from('profiles').select('*').order('created_at', { ascending: false })),
      sb(supabaseClient.from('employees').select('*').eq('company_id', company.id).order('last_name')),
      sb(supabaseClient.from('schedules').select('*').eq('company_id', company.id).order('schedule_date', { ascending: false })),
      sb(supabaseClient.from('attendance_records').select('*').eq('company_id', company.id).order('attendance_date', { ascending: false })),
      sb(supabaseClient.from('leave_requests').select('*').eq('company_id', company.id).order('created_at', { ascending: false })),
      sb(supabaseClient.from('payroll_runs').select('*').eq('company_id', company.id).order('created_at', { ascending: false })),
      sb(supabaseClient.from('payroll_items').select('*').eq('company_id', company.id).order('created_at', { ascending: false }))
    ]);
    state.settings = settings || defaultSettings();
    state.profiles = profiles || [];
    state.employees = employees || [];
    state.schedules = schedules || [];
    state.attendance = attendance || [];
    state.leaves = leaves || [];
    state.payrollRuns = payrollRuns || [];
    state.payrollItems = payrollItems || [];
    document.querySelectorAll('.nav-item').forEach(btn => btn.disabled = false);
    setView(activeView);
    toast('Synced with Supabase.');
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

function defaultSettings() {
  return {
    standard_days: 26,
    grace_minutes: 15,
    overtime_multiplier: 1.25,
    default_pagibig: 200,
    payroll_officer: profile?.full_name || 'Payroll Officer'
  };
}

function renderSetupCompany() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.disabled = true);
  activeView = 'company';
  document.querySelectorAll('.view').forEach(section => section.classList.remove('active'));
  document.getElementById('companyView').classList.add('active');
  document.getElementById('pageTitle').textContent = 'Initial Company Setup';
  document.getElementById('companyView').innerHTML = `
    <div class="card">
      <h3>Initial Company Setup</h3>
      <p>Create your company profile first. Your account will be connected as Super Admin.</p>
      <div class="form-grid">
        ${input('Company Name', 'setupCompanyName', '')}
        ${input('Contact Person', 'setupContactPerson', profile?.full_name || '')}
        ${input('Address', 'setupAddress', '', 'text', 'full-span')}
        ${input('TIN', 'setupTin')}
        ${input('SSS Employer No.', 'setupSss')}
        ${input('PhilHealth Employer No.', 'setupPhilhealth')}
        ${input('Pag-IBIG Employer No.', 'setupPagibig')}
        ${input('Contact No.', 'setupContactNo')}
      </div>
      <div class="form-actions">
        <button class="btn primary" onclick="createInitialCompany()">Create Company</button>
      </div>
    </div>`;
}

async function createInitialCompany() {
  try {
    const payload = {
      name: document.getElementById('setupCompanyName').value.trim(),
      contact_person: document.getElementById('setupContactPerson').value.trim(),
      address: document.getElementById('setupAddress').value.trim(),
      tin: document.getElementById('setupTin').value.trim(),
      sss_no: document.getElementById('setupSss').value.trim(),
      philhealth_no: document.getElementById('setupPhilhealth').value.trim(),
      pagibig_no: document.getElementById('setupPagibig').value.trim(),
      contact_no: document.getElementById('setupContactNo').value.trim(),
      created_by: session.user.id
    };
    if (!payload.name) return toast('Company name is required.');
    await sb(supabaseClient.rpc('create_company_for_current_user', {
      p_name: payload.name,
      p_address: payload.address,
      p_tin: payload.tin,
      p_sss_no: payload.sss_no,
      p_philhealth_no: payload.philhealth_no,
      p_pagibig_no: payload.pagibig_no,
      p_contact_person: payload.contact_person,
      p_contact_no: payload.contact_no
    }), 'Cannot create company');
    toast('Company created.');
    await loadAllData();
  } catch (error) {
    toast(error.message);
  }
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(section => section.classList.remove('active'));
  document.getElementById(`${view}View`).classList.add('active');
  document.getElementById('pageTitle').textContent = ({
    dashboard: 'Dashboard', company: 'Company Profile', employees: 'Employee Masterfile', users: 'Users & Roles',
    schedule: 'Scheduling', attendance: 'Timekeeping / DTR', leave: 'Leave Management', payroll: 'Payroll Processing',
    payslips: 'Payslips', coe: 'Certificate of Employment', reports: 'Reports', settings: 'Settings'
  })[view];
  render();
}

function render() {
  if (!company) return;
  renderDashboard();
  renderCompany();
  renderEmployees();
  renderUsers();
  renderSchedule();
  renderAttendance();
  renderLeave();
  renderPayroll();
  renderPayslips();
  renderCOE();
  renderReports();
  renderSettings();
}

function renderDashboard() {
  const active = state.employees.filter(e => e.status === 'Active').length;
  const inactive = state.employees.filter(e => e.status !== 'Active').length;
  const today = new Date().toISOString().slice(0, 10);
  const attendanceToday = state.attendance.filter(a => a.attendance_date === today).length;
  const pendingLeaves = state.leaves.filter(l => l.status === 'Pending').length;
  const latestPayroll = state.payrollRuns[0];
  document.getElementById('dashboardView').innerHTML = `
    <div class="grid four">
      <div class="stat"><p>Total Employees</p><strong>${state.employees.length}</strong></div>
      <div class="stat"><p>Active Employees</p><strong>${active}</strong></div>
      <div class="stat"><p>Inactive / Resigned</p><strong>${inactive}</strong></div>
      <div class="stat"><p>Attendance Today</p><strong>${attendanceToday}</strong></div>
    </div>
    <div class="grid two" style="margin-top:18px;">
      <div class="card">
        <h3>${escapeHtml(company.name)}</h3>
        <p>${escapeHtml(company.address || '')}</p>
        <p>Contact: ${escapeHtml(company.contact_person || '')} ${escapeHtml(company.contact_no || '')}</p>
      </div>
      <div class="card">
        <h3>Action Items</h3>
        <p>${pendingLeaves ? `${pendingLeaves} pending leave request/s for approval.` : 'No pending leave requests.'}</p>
        <p>${latestPayroll ? `Latest payroll: ${escapeHtml(latestPayroll.period_label)} — Net Pay ${money(latestPayroll.total_net_pay)}` : 'No payroll run yet.'}</p>
        <div class="toolbar-left">
          <button class="btn primary" onclick="setView('employees')">Add Employees</button>
          <button class="btn secondary" onclick="setView('attendance')">Encode DTR</button>
          <button class="btn secondary" onclick="setView('payroll')">Process Payroll</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px;">
      <h3>Cloud Status</h3>
      <div class="grid three">
        <p>${badge('Supabase Auth')} Email/password login</p>
        <p>${badge('Postgres Database')} Cloud records</p>
        <p>${badge('RLS Policies')} Role-based access</p>
        <p>${badge('Employee Masterfile')} CRUD + CSV</p>
        <p>${badge('Payroll')} Basic computation</p>
        <p>${badge('Payslip')} Printable slips</p>
      </div>
    </div>`;
}

function renderCompany() {
  document.getElementById('companyView').innerHTML = `
    <div class="card">
      <h3>Company Profile</h3>
      <div class="form-grid">
        ${input('Company Name', 'companyName', company.name)}
        ${input('Contact Person', 'contactPerson', company.contact_person)}
        ${input('Address', 'address', company.address, 'text', 'full-span')}
        ${input('TIN', 'tin', company.tin)}
        ${input('SSS Employer No.', 'sssNo', company.sss_no)}
        ${input('PhilHealth Employer No.', 'philhealthNo', company.philhealth_no)}
        ${input('Pag-IBIG Employer No.', 'pagibigNo', company.pagibig_no)}
        ${input('Contact No.', 'contactNo', company.contact_no)}
      </div>
      <div class="form-actions">
        <button class="btn primary" onclick="saveCompany()">Save Company</button>
      </div>
    </div>`;
}
async function saveCompany() {
  try {
    const payload = {
      name: document.getElementById('companyName').value.trim(),
      contact_person: document.getElementById('contactPerson').value.trim(),
      address: document.getElementById('address').value.trim(),
      tin: document.getElementById('tin').value.trim(),
      sss_no: document.getElementById('sssNo').value.trim(),
      philhealth_no: document.getElementById('philhealthNo').value.trim(),
      pagibig_no: document.getElementById('pagibigNo').value.trim(),
      contact_no: document.getElementById('contactNo').value.trim(),
      updated_at: new Date().toISOString()
    };
    await sb(supabaseClient.from('companies').update(payload).eq('id', company.id), 'Cannot save company');
    toast('Company saved.');
    await loadAllData();
  } catch (error) { toast(error.message); }
}

function renderEmployees() {
  const q = filters.employees.toLowerCase();
  const rows = state.employees.filter(e => `${e.employee_no} ${e.first_name} ${e.middle_name} ${e.last_name} ${e.position} ${e.department}`.toLowerCase().includes(q));
  document.getElementById('employeesView').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn primary" onclick="openEmployeeForm()">+ Add Employee</button>
          <button class="btn secondary" onclick="exportEmployeesCSV()">Export CSV</button>
        </div>
        <input class="search" placeholder="Search employee..." value="${escapeHtml(filters.employees)}" oninput="filters.employees=this.value; renderEmployees();">
      </div>
      ${rows.length ? employeeTable(rows) : empty('Wala pang employee record. Add employee muna lods.')}
    </div>`;
}
function employeeTable(rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Employee ID</th><th>Name</th><th>Position</th><th>Department</th><th>Date Hired</th><th>Salary</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${rows.map(e => `<tr>
      <td>${escapeHtml(e.employee_no || '')}</td>
      <td><strong>${escapeHtml(getEmployeeName(e.id))}</strong><div class="small">${escapeHtml(e.contact_no || '')}</div></td>
      <td>${escapeHtml(e.position || '')}</td>
      <td>${escapeHtml(e.department || '')}</td>
      <td>${formatDate(e.date_hired)}</td>
      <td>${money(e.basic_salary)}</td>
      <td>${badge(e.status || 'Active', e.status === 'Active' ? '' : 'gray')}</td>
      <td class="actions"><button class="btn secondary" onclick="openEmployeeForm('${e.id}')">Edit</button><button class="btn danger" onclick="deleteEmployee('${e.id}')">Delete</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}
function openEmployeeForm(id = '') {
  const e = id ? getEmployee(id) : {};
  modal(id ? 'Edit Employee' : 'Add Employee', `
    <div class="form-grid">
      ${input('Employee ID', 'empNo', e.employee_no || nextEmployeeNo())}
      ${input('Date Hired', 'empDateHired', e.date_hired || new Date().toISOString().slice(0,10), 'date')}
      ${input('Last Name', 'empLastName', e.last_name || '')}
      ${input('First Name', 'empFirstName', e.first_name || '')}
      ${input('Middle Name', 'empMiddleName', e.middle_name || '')}
      ${input('Birth Date', 'empBirthDate', e.birth_date || '', 'date')}
      ${input('Position', 'empPosition', e.position || '')}
      ${input('Department', 'empDepartment', e.department || '')}
      ${selectInput('Employment Status', 'empStatus', [['Active','Active'],['Inactive','Inactive'],['Resigned','Resigned'],['On Leave','On Leave']], e.status || 'Active')}
      ${input('Basic Salary', 'empSalary', e.basic_salary || 13000, 'number', '', 'step="0.01"')}
      ${input('Daily Rate', 'empDailyRate', e.daily_rate || '', 'number', '', 'step="0.01"')}
      ${input('Hourly Rate', 'empHourlyRate', e.hourly_rate || '', 'number', '', 'step="0.01"')}
      ${input('SSS Number', 'empSss', e.sss_no || '')}
      ${input('PhilHealth Number', 'empPhilhealth', e.philhealth_no || '')}
      ${input('Pag-IBIG Number', 'empPagibig', e.pagibig_no || '')}
      ${input('TIN', 'empTin', e.tin || '')}
      ${input('Contact No.', 'empContact', e.contact_no || '')}
      ${input('Emergency Contact', 'empEmergency', e.emergency_contact || '')}
      ${input('Address', 'empAddress', e.address || '', 'text', 'full-span')}
    </div>
    <div class="form-actions"><button class="btn primary" onclick="saveEmployee('${id}')">Save Employee</button></div>`);
}
function nextEmployeeNo() {
  const n = state.employees.length + 1;
  return `EMP-${String(n).padStart(4, '0')}`;
}
async function saveEmployee(id = '') {
  try {
    const basic = Number(document.getElementById('empSalary').value || 0);
    const daily = Number(document.getElementById('empDailyRate').value || 0) || basic / Number(state.settings?.standard_days || 26);
    const hourly = Number(document.getElementById('empHourlyRate').value || 0) || daily / 8;
    const payload = {
      company_id: company.id,
      employee_no: document.getElementById('empNo').value.trim(),
      date_hired: document.getElementById('empDateHired').value,
      last_name: document.getElementById('empLastName').value.trim(),
      first_name: document.getElementById('empFirstName').value.trim(),
      middle_name: document.getElementById('empMiddleName').value.trim(),
      birth_date: document.getElementById('empBirthDate').value || null,
      position: document.getElementById('empPosition').value.trim(),
      department: document.getElementById('empDepartment').value.trim(),
      status: document.getElementById('empStatus').value,
      basic_salary: basic,
      daily_rate: daily,
      hourly_rate: hourly,
      sss_no: document.getElementById('empSss').value.trim(),
      philhealth_no: document.getElementById('empPhilhealth').value.trim(),
      pagibig_no: document.getElementById('empPagibig').value.trim(),
      tin: document.getElementById('empTin').value.trim(),
      contact_no: document.getElementById('empContact').value.trim(),
      emergency_contact: document.getElementById('empEmergency').value.trim(),
      address: document.getElementById('empAddress').value.trim(),
      updated_at: new Date().toISOString()
    };
    if (!payload.employee_no || !payload.last_name || !payload.first_name) return toast('Employee ID, first name, and last name are required.');
    if (id) await sb(supabaseClient.from('employees').update(payload).eq('id', id), 'Cannot update employee');
    else await sb(supabaseClient.from('employees').insert({ ...payload, created_by: session.user.id }), 'Cannot add employee');
    closeModal(); toast('Employee saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}
async function deleteEmployee(id) {
  if (!confirm('Delete this employee record?')) return;
  try {
    await sb(supabaseClient.from('employees').delete().eq('id', id), 'Cannot delete employee');
    toast('Employee deleted.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

function renderUsers() {
  const q = filters.users.toLowerCase();
  const rows = state.profiles.filter(p => `${p.email} ${p.full_name} ${p.role}`.toLowerCase().includes(q));
  document.getElementById('usersView').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div><h3>Users & Roles</h3><p>Users create account on login screen. Admin can connect them to company and assign role.</p></div>
        <input class="search" placeholder="Search user..." value="${escapeHtml(filters.users)}" oninput="filters.users=this.value; renderUsers();">
      </div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Company</th><th>Action</th></tr></thead><tbody>${rows.map(p => `<tr>
        <td>${escapeHtml(p.full_name || '')}</td>
        <td>${escapeHtml(p.email || '')}</td>
        <td>${badge(ROLE_LABELS[p.role] || p.role)}</td>
        <td>${badge(p.status || 'Active', p.status === 'Active' ? '' : 'gray')}</td>
        <td>${p.company_id ? 'Connected' : badge('Not connected', 'orange')}</td>
        <td class="actions"><button class="btn secondary" onclick="openUserRoleForm('${p.id}')">Edit Role</button></td>
      </tr>`).join('')}</tbody></table></div>` : empty('No users found.')}
    </div>`;
}
function openUserRoleForm(id) {
  const p = state.profiles.find(x => x.id === id);
  modal('Edit User Role', `
    <div class="form-grid">
      ${input('Full Name', 'userFullName', p.full_name || '')}
      ${input('Email', 'userEmail', p.email || '', 'email', '', 'disabled')}
      ${selectInput('Role', 'userRole', Object.entries(ROLE_LABELS), p.role || 'employee')}
      ${selectInput('Status', 'userStatus', [['Active','Active'],['Inactive','Inactive']], p.status || 'Active')}
      ${selectInput('Connect to Company', 'userCompany', [[company.id, company.name], ['', 'No company']], p.company_id || company.id)}
    </div>
    <div class="form-actions"><button class="btn primary" onclick="saveUserRole('${id}')">Save User</button></div>`);
}
async function saveUserRole(id) {
  try {
    await sb(supabaseClient.from('profiles').update({
      full_name: document.getElementById('userFullName').value.trim(),
      role: document.getElementById('userRole').value,
      status: document.getElementById('userStatus').value,
      company_id: document.getElementById('userCompany').value || null
    }).eq('id', id), 'Cannot save user role');
    closeModal(); toast('User role saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

function renderSchedule() {
  document.getElementById('scheduleView').innerHTML = `
    <div class="card">
      <div class="toolbar"><button class="btn primary" onclick="openScheduleForm()">+ Add Schedule</button><button class="btn secondary" onclick="exportCSV('schedules')">Export CSV</button></div>
      ${state.schedules.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Employee</th><th>Shift</th><th>Time</th><th>Rest Day</th><th>Action</th></tr></thead><tbody>${state.schedules.map(s => `<tr>
        <td>${formatDate(s.schedule_date)}</td><td>${escapeHtml(getEmployeeName(s.employee_id))}</td><td>${escapeHtml(s.shift_name || '')}</td><td>${s.start_time || ''} - ${s.end_time || ''}</td><td>${s.is_rest_day ? badge('Rest Day','gray') : ''}</td>
        <td class="actions"><button class="btn secondary" onclick="openScheduleForm('${s.id}')">Edit</button><button class="btn danger" onclick="deleteRow('schedules','${s.id}')">Delete</button></td>
      </tr>`).join('')}</tbody></table></div>` : empty('No schedule yet.')}
    </div>`;
}
function openScheduleForm(id = '') {
  const s = state.schedules.find(x => x.id === id) || {};
  modal(id ? 'Edit Schedule' : 'Add Schedule', `
    <div class="form-grid">
      <label>Employee<select id="schEmployee">${employeeOptions(s.employee_id)}</select></label>
      ${input('Schedule Date', 'schDate', s.schedule_date || new Date().toISOString().slice(0,10), 'date')}
      ${input('Shift Name', 'schShift', s.shift_name || 'Regular Shift')}
      ${input('Start Time', 'schStart', s.start_time || '08:00', 'time')}
      ${input('End Time', 'schEnd', s.end_time || '17:00', 'time')}
      ${selectInput('Rest Day?', 'schRest', [['false','No'],['true','Yes']], String(Boolean(s.is_rest_day)))}
    </div>
    <div class="form-actions"><button class="btn primary" onclick="saveSchedule('${id}')">Save Schedule</button></div>`);
}
async function saveSchedule(id = '') {
  try {
    const payload = {
      company_id: company.id,
      employee_id: document.getElementById('schEmployee').value,
      schedule_date: document.getElementById('schDate').value,
      shift_name: document.getElementById('schShift').value.trim(),
      start_time: document.getElementById('schStart').value || null,
      end_time: document.getElementById('schEnd').value || null,
      is_rest_day: document.getElementById('schRest').value === 'true'
    };
    if (id) await sb(supabaseClient.from('schedules').update(payload).eq('id', id));
    else await sb(supabaseClient.from('schedules').insert(payload));
    closeModal(); toast('Schedule saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

function minutesFromTime(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function hoursBetween(start, end) {
  const s = minutesFromTime(start);
  let e = minutesFromTime(end);
  if (s === null || e === null) return 0;
  if (e < s) e += 24 * 60;
  return Math.max(0, (e - s) / 60);
}
function deriveAttendance(employeeId, date, timeIn, timeOut, breakMinutes, statusOverride = '') {
  const selectedStatus = statusOverride || 'Present';
  if (['Absent', 'Leave Without Pay'].includes(selectedStatus)) {
    return { worked: 0, late: 0, undertime: 0, ot: 0, status: selectedStatus };
  }
  const sched = state.schedules.find(s => s.employee_id === employeeId && s.schedule_date === date);
  const worked = selectedStatus === 'Half Day'
    ? Math.max(0, Math.min(4, hoursBetween(timeIn, timeOut) - Number(breakMinutes || 0) / 60))
    : Math.max(0, hoursBetween(timeIn, timeOut) - Number(breakMinutes || 0) / 60);
  let late = 0, undertime = 0, ot = 0, status = selectedStatus;
  if ((!timeIn || !timeOut) && !['Holiday', 'Rest Day', 'Leave With Pay'].includes(selectedStatus)) status = 'Incomplete';
  if (sched && !sched.is_rest_day && !['Holiday', 'Rest Day', 'Leave With Pay'].includes(selectedStatus)) {
    const start = minutesFromTime(sched.start_time);
    const end = minutesFromTime(sched.end_time);
    const tin = minutesFromTime(timeIn);
    const tout = minutesFromTime(timeOut);
    const grace = Number(state.settings?.grace_minutes || 0);
    if (tin !== null && start !== null) late = Math.max(0, tin - start - grace);
    if (tout !== null && end !== null) undertime = Math.max(0, end - tout);
    const schedHours = Math.max(0, hoursBetween(sched.start_time, sched.end_time) - 1);
    ot = Math.max(0, worked - schedHours);
  } else if (worked > 8) {
    ot = Math.max(0, worked - 8);
  }
  return { worked, late, undertime, ot, status };
}
function renderAttendance() {
  document.getElementById('attendanceView').innerHTML = `
    <div class="card">
      <div class="toolbar"><button class="btn primary" onclick="openAttendanceForm()">+ Encode DTR</button><button class="btn secondary" onclick="exportCSV('attendance_records')">Export CSV</button></div>
      ${state.attendance.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Employee</th><th>Time</th><th>Work Mode</th><th>Hours</th><th>Late</th><th>Undertime</th><th>OT</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.attendance.map(a => `<tr>
        <td>${formatDate(a.attendance_date)}</td><td>${escapeHtml(getEmployeeName(a.employee_id))}</td><td>${a.time_in || ''} - ${a.time_out || ''}</td><td>${escapeHtml(a.work_mode || '')}</td><td>${Number(a.hours_worked || 0).toFixed(2)}</td><td>${a.late_minutes || 0} min</td><td>${a.undertime_minutes || 0} min</td><td>${Number(a.overtime_hours || 0).toFixed(2)}</td><td>${badge(a.status || 'Present')}</td>
        <td class="actions"><button class="btn secondary" onclick="openAttendanceForm('${a.id}')">Edit</button><button class="btn danger" onclick="deleteRow('attendance_records','${a.id}')">Delete</button></td>
      </tr>`).join('')}</tbody></table></div>` : empty('No attendance records yet.')}
    </div>`;
}
function openAttendanceForm(id = '') {
  const a = state.attendance.find(x => x.id === id) || {};
  modal(id ? 'Edit DTR' : 'Encode DTR', `
    <div class="form-grid">
      <label>Employee<select id="attEmployee">${employeeOptions(a.employee_id)}</select></label>
      ${input('Date', 'attDate', a.attendance_date || new Date().toISOString().slice(0,10), 'date')}
      ${selectInput('Status', 'attStatus', [['Present','Present'],['Absent','Absent'],['Half Day','Half Day'],['Rest Day','Rest Day'],['Holiday','Holiday'],['Leave With Pay','Leave With Pay'],['Leave Without Pay','Leave Without Pay'],['Incomplete','Incomplete']], a.status || 'Present')}
      ${input('Time In', 'attIn', a.time_in || '08:00', 'time')}
      ${input('Time Out', 'attOut', a.time_out || '17:00', 'time')}
      ${input('Break Minutes', 'attBreak', a.break_minutes ?? 60, 'number')}
      ${selectInput('Work Mode', 'attMode', [['Office','Office'],['WFH','Work From Home'],['Hybrid','Hybrid'],['Field','Field Work']], a.work_mode || 'Office')}
      ${input('Remarks', 'attRemarks', a.remarks || '', 'text', 'full-span')}
    </div>
    <div class="form-actions"><button class="btn primary" onclick="saveAttendance('${id}')">Save DTR</button></div>`);
}
async function saveAttendance(id = '') {
  try {
    const employeeId = document.getElementById('attEmployee').value;
    const date = document.getElementById('attDate').value;
    const statusOverride = document.getElementById('attStatus').value;
    const timeIn = document.getElementById('attIn').value;
    const timeOut = document.getElementById('attOut').value;
    const breakMinutes = Number(document.getElementById('attBreak').value || 0);
    const d = deriveAttendance(employeeId, date, timeIn, timeOut, breakMinutes, statusOverride);
    const payload = {
      company_id: company.id, employee_id: employeeId, attendance_date: date, time_in: ['Absent','Leave Without Pay'].includes(d.status) ? null : (timeIn || null), time_out: ['Absent','Leave Without Pay'].includes(d.status) ? null : (timeOut || null),
      break_minutes: breakMinutes, work_mode: document.getElementById('attMode').value, remarks: document.getElementById('attRemarks').value.trim(),
      hours_worked: d.worked, late_minutes: d.late, undertime_minutes: d.undertime, overtime_hours: d.ot, status: d.status
    };
    if (id) await sb(supabaseClient.from('attendance_records').update(payload).eq('id', id));
    else await sb(supabaseClient.from('attendance_records').insert(payload));
    closeModal(); toast('DTR saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

function renderLeave() {
  document.getElementById('leaveView').innerHTML = `
    <div class="card">
      <div class="toolbar"><button class="btn primary" onclick="openLeaveForm()">+ File Leave</button><button class="btn secondary" onclick="exportCSV('leave_requests')">Export CSV</button></div>
      ${state.leaves.length ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Type</th><th>Date</th><th>Days</th><th>Status</th><th>Reason</th><th>Action</th></tr></thead><tbody>${state.leaves.map(l => `<tr>
        <td>${escapeHtml(getEmployeeName(l.employee_id))}</td><td>${escapeHtml(l.leave_type)}</td><td>${formatDate(l.start_date)} - ${formatDate(l.end_date)}</td><td>${l.days}</td><td>${badge(l.status, l.status === 'Approved' ? '' : l.status === 'Rejected' ? 'red' : 'orange')}</td><td>${escapeHtml(l.reason || '')}</td>
        <td class="actions"><button class="btn secondary" onclick="openLeaveForm('${l.id}')">Edit</button><button class="btn danger" onclick="deleteRow('leave_requests','${l.id}')">Delete</button></td>
      </tr>`).join('')}</tbody></table></div>` : empty('No leave request yet.')}
    </div>`;
}
function openLeaveForm(id = '') {
  const l = state.leaves.find(x => x.id === id) || {};
  modal(id ? 'Edit Leave' : 'File Leave', `
    <div class="form-grid">
      <label>Employee<select id="leaveEmployee">${employeeOptions(l.employee_id)}</select></label>
      ${selectInput('Leave Type', 'leaveType', [['Vacation Leave','Vacation Leave'],['Sick Leave','Sick Leave'],['Emergency Leave','Emergency Leave'],['Maternity Leave','Maternity Leave'],['Paternity Leave','Paternity Leave']], l.leave_type || 'Vacation Leave')}
      ${input('Start Date', 'leaveStart', l.start_date || new Date().toISOString().slice(0,10), 'date')}
      ${input('End Date', 'leaveEnd', l.end_date || new Date().toISOString().slice(0,10), 'date')}
      ${input('Days', 'leaveDays', l.days || 1, 'number', '', 'step="0.5"')}
      ${selectInput('Status', 'leaveStatus', [['Pending','Pending'],['Approved','Approved'],['Rejected','Rejected']], l.status || 'Pending')}
      <label class="full-span">Reason<textarea id="leaveReason">${escapeHtml(l.reason || '')}</textarea></label>
    </div>
    <div class="form-actions"><button class="btn primary" onclick="saveLeave('${id}')">Save Leave</button></div>`);
}
async function saveLeave(id = '') {
  try {
    const payload = {
      company_id: company.id,
      employee_id: document.getElementById('leaveEmployee').value,
      leave_type: document.getElementById('leaveType').value,
      start_date: document.getElementById('leaveStart').value,
      end_date: document.getElementById('leaveEnd').value,
      days: Number(document.getElementById('leaveDays').value || 1),
      status: document.getElementById('leaveStatus').value,
      reason: document.getElementById('leaveReason').value.trim(),
      approved_by: document.getElementById('leaveStatus').value === 'Pending' ? null : session.user.id
    };
    if (id) await sb(supabaseClient.from('leave_requests').update(payload).eq('id', id));
    else await sb(supabaseClient.from('leave_requests').insert(payload));
    closeModal(); toast('Leave saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

function renderPayroll() {
  const options = getPayrollLocalOptions();
  const adjustmentRows = state.employees.filter(e => e.status === 'Active').map(e => {
    const a = getAdjustment(e.id);
    return `<tr><td>${escapeHtml(getEmployeeName(e.id))}</td><td>${money(totalAllowance(a))}</td><td>${money(totalLoanDeduction(a))}</td><td class="actions"><button class="btn secondary" onclick="openPayrollAdjustmentForm('${e.id}')">Edit</button><button class="btn danger" onclick="clearPayrollAdjustment('${e.id}')">Clear</button></td></tr>`;
  }).join('');
  document.getElementById('payrollView').innerHTML = `
    <div class="grid two">
      <div class="card"><h3>Process Payroll</h3>
        <div class="form-grid">
          ${input('Period Label', 'payPeriodLabel', `Payroll ${new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`)}
          ${input('Pay Date', 'payDate', new Date().toISOString().slice(0,10), 'date')}
          ${input('Period Start', 'payStart', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10), 'date')}
          ${input('Period End', 'payEnd', new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10), 'date')}
        </div>
        <p class="small">Mode: <strong>${payrollModeLabel(options.payroll_mode)}</strong> • Auto tax: <strong>${options.auto_tax === 'true' ? 'Enabled' : 'Off'}</strong></p>
        <div class="form-actions"><button class="btn primary" onclick="processPayroll()">Compute & Save Payroll</button></div>
      </div>
      <div class="card"><h3>Payroll Rules v2.5</h3><p>Supports attendance-based, daily-rate, and monthly-fixed payroll modes. DTR statuses include absent, half-day, holiday, leave with pay, and leave without pay. Employee government deductions auto-compute SSS, PhilHealth, and Pag-IBIG when payroll has earnings. Allowances, cash advances, loans, and tax estimates are available under payroll adjustments.</p></div>
    </div>
    <div class="card" style="margin-top:18px;"><h3>Payroll Adjustments</h3><p class="small">Local per-employee adjustments for this browser. Use for demo or quick client testing; production should store these in Supabase tables.</p>
      ${adjustmentRows ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Allowances</th><th>Cash/Loans/Other Deductions</th><th>Action</th></tr></thead><tbody>${adjustmentRows}</tbody></table></div>` : empty('No active employees.')}
    </div>
    <div class="card" style="margin-top:18px;">
      <h3>Payroll Runs</h3>
      ${state.payrollRuns.length ? `<div class="table-wrap"><table><thead><tr><th>Period</th><th>Date</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Action</th></tr></thead><tbody>${state.payrollRuns.map(r => `<tr>
        <td>${escapeHtml(r.period_label)}</td><td>${formatDate(r.pay_date)}</td><td>${money(r.total_gross_pay)}</td><td>${money(r.total_deductions)}</td><td><strong>${money(r.total_net_pay)}</strong></td><td><button class="btn secondary" onclick="viewPayrollRun('${r.id}')">View</button></td>
      </tr>`).join('')}</tbody></table></div>` : empty('No payroll run yet.')}
    </div>`;
}
function openPayrollAdjustmentForm(employeeId) {
  const emp = getEmployee(employeeId) || {};
  const a = getAdjustment(employeeId);
  modal(`Payroll Adjustments: ${getEmployeeName(employeeId)}`, `
    <div class="form-grid">
      ${input('Rice Allowance', 'adjRice', a.rice_allowance, 'number', '', 'step="0.01"')}
      ${input('Transportation Allowance', 'adjTransport', a.transport_allowance, 'number', '', 'step="0.01"')}
      ${input('Meal Allowance', 'adjMeal', a.meal_allowance, 'number', '', 'step="0.01"')}
      ${input('Communication Allowance', 'adjComm', a.communication_allowance, 'number', '', 'step="0.01"')}
      ${input('Other Allowance', 'adjOtherAllow', a.other_allowance, 'number', '', 'step="0.01"')}
      ${input('Cash Advance', 'adjCash', a.cash_advance, 'number', '', 'step="0.01"')}
      ${input('SSS Loan', 'adjSssLoan', a.sss_loan, 'number', '', 'step="0.01"')}
      ${input('Pag-IBIG Loan', 'adjPagibigLoan', a.pagibig_loan, 'number', '', 'step="0.01"')}
      ${input('Company Loan', 'adjCompanyLoan', a.company_loan, 'number', '', 'step="0.01"')}
      ${input('Other Deduction', 'adjOtherDed', a.other_deduction, 'number', '', 'step="0.01"')}
    </div>
    <div class="form-actions"><button class="btn primary" onclick="savePayrollAdjustment('${employeeId}')">Save Adjustment</button></div>`);
}
function savePayrollAdjustment(employeeId) {
  const all = getPayrollAdjustments();
  all[employeeId] = {
    rice_allowance: Number(document.getElementById('adjRice').value || 0),
    transport_allowance: Number(document.getElementById('adjTransport').value || 0),
    meal_allowance: Number(document.getElementById('adjMeal').value || 0),
    communication_allowance: Number(document.getElementById('adjComm').value || 0),
    other_allowance: Number(document.getElementById('adjOtherAllow').value || 0),
    cash_advance: Number(document.getElementById('adjCash').value || 0),
    sss_loan: Number(document.getElementById('adjSssLoan').value || 0),
    pagibig_loan: Number(document.getElementById('adjPagibigLoan').value || 0),
    company_loan: Number(document.getElementById('adjCompanyLoan').value || 0),
    other_deduction: Number(document.getElementById('adjOtherDed').value || 0)
  };
  savePayrollAdjustments(all);
  closeModal(); toast('Payroll adjustment saved.'); renderPayroll();
}
function clearPayrollAdjustment(employeeId) {
  if (!confirm('Clear adjustments for this employee?')) return;
  const all = getPayrollAdjustments();
  delete all[employeeId];
  savePayrollAdjustments(all);
  toast('Payroll adjustment cleared.'); renderPayroll();
}
async function processPayroll() {
  try {
    const start = document.getElementById('payStart').value;
    const end = document.getElementById('payEnd').value;
    const periodLabel = document.getElementById('payPeriodLabel').value.trim();
    const payDate = document.getElementById('payDate').value;
    const options = getPayrollLocalOptions();
    const duplicate = state.payrollRuns.find(r => r.period_start === start && r.period_end === end && r.period_label === periodLabel);
    if (duplicate && !confirm('Payroll run for this period/label already exists. Continue and create another run?')) return;
    if (options.payroll_mode !== 'monthly_fixed') {
      const hasAnyDTR = state.attendance.some(a => a.attendance_date >= start && a.attendance_date <= end);
      if (!hasAnyDTR && !confirm('No DTR found in this period. This will compute zero pay for attendance/daily mode. Continue?')) return;
    }
    const items = state.employees.filter(e => e.status === 'Active').map(e => computePayrollItem(e, start, end));
    const totals = items.reduce((acc, x) => {
      acc.gross += x.gross_pay; acc.deductions += x.total_deductions; acc.net += x.net_pay; return acc;
    }, { gross: 0, deductions: 0, net: 0 });
    const run = await sb(supabaseClient.from('payroll_runs').insert({
      company_id: company.id, period_label: periodLabel, period_start: start, period_end: end, pay_date: payDate,
      total_gross_pay: totals.gross, total_deductions: totals.deductions, total_net_pay: totals.net, created_by: session.user.id
    }).select().single(), 'Cannot create payroll run');
    const rows = items.map(i => ({ ...i, company_id: company.id, payroll_run_id: run.id }));
    if (rows.length) await sb(supabaseClient.from('payroll_items').insert(rows), 'Cannot save payroll items');
    toast('Payroll run saved.'); await loadAllData(); activeView = 'payroll';
  } catch (error) { toast(error.message); }
}
function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
function getMonthlySalaryBasis(e) {
  const monthly = Number(e.basic_salary || 0);
  if (monthly > 0) return monthly;
  const daily = Number(e.daily_rate || 0);
  const standardDays = Number(state.settings?.standard_days || 26);
  return daily > 0 ? daily * standardDays : 0;
}
function computeSSSEmployeeShare(monthlySalary) {
  const salary = Number(monthlySalary || 0);
  if (salary <= 0) return 0;
  const minMSC = 5000;
  const maxMSC = 35000;
  const roundedMSC = Math.round(salary / 500) * 500;
  const msc = Math.min(maxMSC, Math.max(minMSC, roundedMSC));
  return roundMoney(msc * 0.05);
}
function computePhilHealthEmployeeShare(monthlySalary) {
  const salary = Number(monthlySalary || 0);
  if (salary <= 0) return 0;
  const floor = 10000;
  const ceiling = 100000;
  const basis = Math.min(ceiling, Math.max(floor, salary));
  return roundMoney(basis * 0.025);
}
function computePagibigEmployeeShare(monthlySalary) {
  const salary = Number(monthlySalary || 0);
  if (salary <= 0) return 0;
  const cap = Number(state.settings?.default_pagibig || 200);
  return roundMoney(Math.min(cap, salary * 0.02));
}
function getSSSMSC(monthlySalary) {
  const salary = Number(monthlySalary || 0);
  if (salary <= 0) return 0;
  const minMSC = 5000;
  const maxMSC = 35000;
  const roundedMSC = Math.round(salary / 500) * 500;
  return Math.min(maxMSC, Math.max(minMSC, roundedMSC));
}
function computeSSSEmployerShare(monthlySalary) {
  return roundMoney(getSSSMSC(monthlySalary) * 0.10);
}
function computeECContribution(monthlySalary) {
  const msc = getSSSMSC(monthlySalary);
  if (msc <= 0) return 0;
  return msc < 15000 ? 10 : 30;
}
function computePhilHealthEmployerShare(monthlySalary) {
  return computePhilHealthEmployeeShare(monthlySalary);
}
function computePagibigEmployerShare(monthlySalary) {
  return computePagibigEmployeeShare(monthlySalary);
}
function getPayrollEmployerShares(item) {
  const emp = getEmployee(item.employee_id) || {};
  const monthlyBasis = getMonthlySalaryBasis(emp);
  return {
    sss_er: computeSSSEmployerShare(monthlyBasis),
    ec: computeECContribution(monthlyBasis),
    philhealth_er: computePhilHealthEmployerShare(monthlyBasis),
    pagibig_er: computePagibigEmployerShare(monthlyBasis)
  };
}


function getPayrollLocalOptions() {
  const defaults = { payroll_mode: 'attendance', auto_tax: 'false' };
  if (!company?.id) return defaults;
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(`e4u_payroll_options_${company.id}`) || '{}') };
  } catch (_) {
    return defaults;
  }
}
function savePayrollLocalOptions(options) {
  if (!company?.id) return;
  localStorage.setItem(`e4u_payroll_options_${company.id}`, JSON.stringify(options));
}
function adjustmentDefaults() {
  return {
    rice_allowance: 0,
    transport_allowance: 0,
    meal_allowance: 0,
    communication_allowance: 0,
    other_allowance: 0,
    cash_advance: 0,
    sss_loan: 0,
    pagibig_loan: 0,
    company_loan: 0,
    other_deduction: 0
  };
}
function getPayrollAdjustments() {
  if (!company?.id) return {};
  try {
    return JSON.parse(localStorage.getItem(`e4u_payroll_adjustments_${company.id}`) || '{}');
  } catch (_) {
    return {};
  }
}
function savePayrollAdjustments(adjustments) {
  if (!company?.id) return;
  localStorage.setItem(`e4u_payroll_adjustments_${company.id}`, JSON.stringify(adjustments));
}
function getAdjustment(employeeId) {
  const all = getPayrollAdjustments();
  return { ...adjustmentDefaults(), ...(all[employeeId] || {}) };
}
function totalAllowance(adj) {
  return roundMoney(Number(adj.rice_allowance || 0) + Number(adj.transport_allowance || 0) + Number(adj.meal_allowance || 0) + Number(adj.communication_allowance || 0) + Number(adj.other_allowance || 0));
}
function totalLoanDeduction(adj) {
  return roundMoney(Number(adj.cash_advance || 0) + Number(adj.sss_loan || 0) + Number(adj.pagibig_loan || 0) + Number(adj.company_loan || 0) + Number(adj.other_deduction || 0));
}
function annualCompensationTaxPH(taxableAnnual) {
  const x = Number(taxableAnnual || 0);
  if (x <= 250000) return 0;
  if (x <= 400000) return (x - 250000) * 0.15;
  if (x <= 800000) return 22500 + (x - 400000) * 0.20;
  if (x <= 2000000) return 102500 + (x - 800000) * 0.25;
  if (x <= 8000000) return 402500 + (x - 2000000) * 0.30;
  return 2202500 + (x - 8000000) * 0.35;
}
function monthlyWithholdingTaxEstimate(taxableMonthly) {
  return roundMoney(annualCompensationTaxPH(Number(taxableMonthly || 0) * 12) / 12);
}
function isPaidAttendanceStatus(status = '') {
  return ['Present', 'Half Day', 'Holiday', 'Rest Day', 'Leave With Pay'].includes(status || 'Present');
}
function isUnpaidAttendanceStatus(status = '') {
  return ['Absent', 'Leave Without Pay'].includes(status || '');
}
function attendanceDayValue(record = {}) {
  if (!isPaidAttendanceStatus(record.status)) return 0;
  if (record.status === 'Half Day') return 0.5;
  return 1;
}
function payrollModeLabel(mode) {
  return ({ attendance: 'Attendance-Based', daily: 'Daily Rate', monthly_fixed: 'Monthly Fixed' })[mode] || 'Attendance-Based';
}
function getOtherPayFromItem(item) {
  return roundMoney(Number(item.gross_pay || 0) - Number(item.basic_pay || 0) - Number(item.overtime_pay || 0));
}
function computePayrollItem(e, start, end) {
  const options = getPayrollLocalOptions();
  const allRecords = state.attendance.filter(a => a.employee_id === e.id && a.attendance_date >= start && a.attendance_date <= end);
  const paidRecords = allRecords.filter(r => isPaidAttendanceStatus(r.status));
  const unpaidRecords = allRecords.filter(r => isUnpaidAttendanceStatus(r.status));
  const paidDays = paidRecords.reduce((sum, r) => sum + attendanceDayValue(r), 0);
  const absentDays = unpaidRecords.length;
  const otHours = paidRecords.reduce((sum, r) => sum + Number(r.overtime_hours || 0), 0);
  const lateMins = paidRecords.reduce((sum, r) => sum + Number(r.late_minutes || 0), 0);
  const undertimeMins = paidRecords.reduce((sum, r) => sum + Number(r.undertime_minutes || 0), 0);
  const monthlyBasis = getMonthlySalaryBasis(e);
  const standardDays = Number(state.settings?.standard_days || 26);
  const daily = Number(e.daily_rate || (monthlyBasis / standardDays));
  const hourly = Number(e.hourly_rate || daily / 8);
  const adj = getAdjustment(e.id);
  const allowances = totalAllowance(adj);
  const loanDeductions = totalLoanDeduction(adj);
  let basicPay = 0;
  let absentDeduction = 0;
  if (options.payroll_mode === 'monthly_fixed') {
    basicPay = monthlyBasis;
    absentDeduction = roundMoney(absentDays * daily);
  } else {
    basicPay = roundMoney(paidDays * daily);
  }
  const holidayDays = paidRecords.filter(r => r.status === 'Holiday').length;
  const restDayHours = paidRecords.filter(r => r.status === 'Rest Day').reduce((sum, r) => sum + Number(r.hours_worked || 0), 0);
  const holidayPay = roundMoney(holidayDays * daily); // demo estimate
  const restDayPay = roundMoney(restDayHours * hourly * 0.30); // extra premium estimate
  const otPay = roundMoney(otHours * hourly * Number(state.settings?.overtime_multiplier || 1.25));
  const lateDeduction = roundMoney(lateMins / 60 * hourly);
  const undertimeDeduction = roundMoney((undertimeMins / 60 * hourly) + absentDeduction);
  const gross = roundMoney(basicPay + otPay + holidayPay + restDayPay + allowances);
  const hasPayrollEarnings = gross > 0 && (paidDays > 0 || options.payroll_mode === 'monthly_fixed' || allowances > 0);
  const sss = hasPayrollEarnings ? computeSSSEmployeeShare(monthlyBasis) : 0;
  const philhealth = hasPayrollEarnings ? computePhilHealthEmployeeShare(monthlyBasis) : 0;
  const pagibig = hasPayrollEarnings ? computePagibigEmployeeShare(monthlyBasis) : 0;
  const taxableMonthly = Math.max(0, gross - sss - philhealth - pagibig);
  const withholdingTax = hasPayrollEarnings && options.auto_tax === 'true' ? monthlyWithholdingTaxEstimate(taxableMonthly) : 0;
  const cashAdvance = loanDeductions;
  const totalDeductions = hasPayrollEarnings
    ? roundMoney(lateDeduction + undertimeDeduction + sss + philhealth + pagibig + withholdingTax + cashAdvance)
    : 0;
  const net = roundMoney(Math.max(0, gross - totalDeductions));
  return {
    employee_id: e.id, days_worked: paidDays, overtime_hours: otHours, late_minutes: lateMins, undertime_minutes: undertimeMins,
    basic_pay: roundMoney(basicPay), overtime_pay: otPay, gross_pay: gross, late_deduction: lateDeduction, undertime_deduction: undertimeDeduction,
    sss, philhealth, pagibig, withholding_tax: withholdingTax, cash_advance: cashAdvance, total_deductions: totalDeductions, net_pay: net
  };
}
function viewPayrollRun(id) {
  const run = state.payrollRuns.find(r => r.id === id);
  const items = state.payrollItems.filter(i => i.payroll_run_id === id);
  const totals = items.reduce((acc, i) => {
    const er = getPayrollEmployerShares(i);
    acc.sss += Number(i.sss || 0); acc.philhealth += Number(i.philhealth || 0); acc.pagibig += Number(i.pagibig || 0);
    acc.tax += Number(i.withholding_tax || 0); acc.cash += Number(i.cash_advance || 0); acc.otherPay += getOtherPayFromItem(i);
    acc.sss_er += er.sss_er; acc.ec += er.ec; acc.philhealth_er += er.philhealth_er; acc.pagibig_er += er.pagibig_er;
    return acc;
  }, { sss: 0, philhealth: 0, pagibig: 0, tax: 0, cash: 0, otherPay: 0, sss_er: 0, ec: 0, philhealth_er: 0, pagibig_er: 0 });
  const govSummary = `<div class="grid three" style="margin-bottom:14px;">
    <div class="card"><h3>Employee Deductions</h3><p>SSS: ${money(totals.sss)}<br>PhilHealth: ${money(totals.philhealth)}<br>Pag-IBIG: ${money(totals.pagibig)}<br>Tax: ${money(totals.tax)}<br>Loans/Cash: ${money(totals.cash)}</p></div>
    <div class="card"><h3>Employer Share</h3><p>SSS ER: ${money(totals.sss_er)}<br>EC: ${money(totals.ec)}<br>PhilHealth ER: ${money(totals.philhealth_er)}<br>Pag-IBIG ER: ${money(totals.pagibig_er)}</p></div>
    <div class="card"><h3>Total Remittance Estimate</h3><p>SSS+EC: ${money(totals.sss + totals.sss_er + totals.ec)}<br>PhilHealth: ${money(totals.philhealth + totals.philhealth_er)}<br>Pag-IBIG: ${money(totals.pagibig + totals.pagibig_er)}</p></div>
  </div>`;
  modal(`Payroll: ${run.period_label}`, `${govSummary}<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Days</th><th>Gross</th><th>SSS</th><th>PhilHealth</th><th>Pag-IBIG</th><th>Tax</th><th>Cash/Loans</th><th>Deductions</th><th>Net Pay</th></tr></thead><tbody>${items.map(i => `<tr><td>${escapeHtml(getEmployeeName(i.employee_id))}${Number(i.days_worked || 0) === 0 ? '<div class="small">No paid DTR in period</div>' : ''}</td><td>${i.days_worked}</td><td>${money(i.gross_pay)}</td><td>${money(i.sss)}</td><td>${money(i.philhealth)}</td><td>${money(i.pagibig)}</td><td>${money(i.withholding_tax)}</td><td>${money(i.cash_advance)}</td><td>${money(i.total_deductions)}</td><td><strong>${money(i.net_pay)}</strong></td></tr>`).join('')}</tbody></table></div>`);
}

function renderPayslips() {
  const runOptions = state.payrollRuns.map(r => `<option value="${r.id}">${escapeHtml(r.period_label)} - ${formatDate(r.pay_date)}</option>`).join('');
  const selected = state.payrollRuns[0]?.id || '';
  document.getElementById('payslipsView').innerHTML = `
    <div class="card">
      <div class="toolbar"><label>Payroll Run<select id="payslipRun" onchange="renderPayslipList(this.value)">${runOptions}</select></label><button class="btn primary" onclick="window.print()">Print Payslips</button></div>
      <div id="payslipList">${selected ? payslipHtml(selected) : empty('No payroll run yet.')}</div>
    </div>`;
}
function renderPayslipList(runId) {
  document.getElementById('payslipList').innerHTML = payslipHtml(runId);
}
function payslipHtml(runId) {
  const run = state.payrollRuns.find(r => r.id === runId);
  const items = state.payrollItems.filter(i => i.payroll_run_id === runId);
  return items.map(i => {
    const emp = getEmployee(i.employee_id) || {};
    const otherPay = getOtherPayFromItem(i);
    return `<div class="payslip">
      <div class="payslip-head"><div><h3>${escapeHtml(company.name)}</h3><p>${escapeHtml(company.address || '')}</p></div><div><strong>PAYSLIP</strong><p>${escapeHtml(run.period_label)}</p></div></div>
      <div class="grid two"><div><p><strong>${escapeHtml(getEmployeeName(i.employee_id))}</strong><br>${escapeHtml(emp.position || '')} • ${escapeHtml(emp.department || '')}</p><p>Pay Date: ${formatDate(run.pay_date)}<br>Days Paid: ${Number(i.days_worked || 0).toFixed(2)}</p></div>
      <div class="kv"><span>Basic Pay</span><strong>${money(i.basic_pay)}</strong><span>Overtime Pay</span><strong>${money(i.overtime_pay)}</strong><span>Allowances / Holiday / Rest Day</span><strong>${money(otherPay)}</strong><span>Gross Pay</span><strong>${money(i.gross_pay)}</strong><span>Late Deduction</span><strong>${money(i.late_deduction)}</strong><span>Undertime / Absent</span><strong>${money(i.undertime_deduction)}</strong><span>SSS</span><strong>${money(i.sss)}</strong><span>PhilHealth</span><strong>${money(i.philhealth)}</strong><span>Pag-IBIG</span><strong>${money(i.pagibig)}</strong><span>Withholding Tax</span><strong>${money(i.withholding_tax)}</strong><span>Cash Advance / Loans</span><strong>${money(i.cash_advance)}</strong><span>Total Deductions</span><strong>${money(i.total_deductions)}</strong><span>NET PAY</span><strong>${money(i.net_pay)}</strong></div></div>
    </div>`;
  }).join('') || empty('No payslip items found.');
}

function renderCOE() {
  const activeEmployees = state.employees.filter(e => e.status === 'Active' || e.status === 'On Leave' || e.status === 'Resigned' || e.status === 'Inactive');
  const options = activeEmployees.map(e => `<option value="${e.id}">${escapeHtml(getEmployeeFullName(e) || getEmployeeName(e.id))}</option>`).join('');
  const selected = activeEmployees[0]?.id || '';
  const today = new Date().toISOString().slice(0, 10);
  const defaultSignatory = state.settings?.payroll_officer || company.contact_person || profile?.full_name || '';
  document.getElementById('coeView').innerHTML = `
    <div class="grid two">
      <div class="card"><h3>Certificate of Employment Generator v2.5</h3>
        <p>Generate COE without compensation, with compensation, for loan, visa/travel, or employment requirement.</p>
        <div class="form-grid">
          <label>Employee<select id="coeEmployee" onchange="updateCOEPreview()">${options}</select></label>
          <label>COE Type<select id="coeType" onchange="updateCOEPreview()"><option value="without_comp">Without Compensation</option><option value="with_comp">With Compensation</option><option value="loan">For Loan / Bank Requirement</option><option value="visa">For Visa / Travel</option><option value="employment">For Employment Requirement</option></select></label>
          ${input('Date Issued', 'coeDate', today, 'date')}
          ${input('Purpose', 'coePurpose', 'employment requirement')}
          ${input('Place Issued', 'coePlace', company.address || '')}
          ${input('Authorized Signatory', 'coeSignatory', defaultSignatory)}
          ${input('Signatory Position', 'coeSignatoryPosition', 'Authorized Representative')}
        </div>
        <div class="form-actions">
          <button class="btn secondary" onclick="updateCOEPreview()">Generate Preview</button>
          <button class="btn primary" onclick="printCOE()">Print COE</button>
        </div>
      </div>
      <div class="card"><h3>COE Notes</h3><p>For COE with compensation/loan, the system uses the employee's Basic Salary from Employee Masterfile. Confirm salary, position, department, and date hired before printing.</p></div>
    </div>
    <div class="card" style="margin-top:18px;">
      <div id="coePreview">${selected ? coeHtml(selected, today, 'employment requirement', company.address || '', defaultSignatory, 'Authorized Representative', 'without_comp') : empty('No employees available for COE.')}</div>
    </div>`;
}
function updateCOEPreview() {
  const el = document.getElementById('coePreview');
  if (!el) return;
  const employeeId = document.getElementById('coeEmployee')?.value;
  const dateIssued = document.getElementById('coeDate')?.value || new Date().toISOString().slice(0, 10);
  const purpose = document.getElementById('coePurpose')?.value.trim() || 'employment requirement';
  const placeIssued = document.getElementById('coePlace')?.value.trim() || company.address || '';
  const signatory = document.getElementById('coeSignatory')?.value.trim() || company.contact_person || profile?.full_name || '';
  const signatoryPosition = document.getElementById('coeSignatoryPosition')?.value.trim() || 'Authorized Representative';
  const coeType = document.getElementById('coeType')?.value || 'without_comp';
  el.innerHTML = employeeId ? coeHtml(employeeId, dateIssued, purpose, placeIssued, signatory, signatoryPosition, coeType) : empty('Select an employee.');
}
function coeHtml(employeeId, dateIssued, purpose, placeIssued, signatory, signatoryPosition, coeType = 'without_comp') {
  const emp = getEmployee(employeeId) || {};
  const fullName = getEmployeeFullName(emp) || getEmployeeName(employeeId);
  const position = emp.position || 'Employee';
  const department = emp.department || '';
  const dateHired = emp.date_hired ? formatDate(emp.date_hired) : 'the company records';
  const statusText = emp.status === 'Active' ? 'is currently employed' : `has employment status: ${emp.status || 'on record'}`;
  const issued = formatDate(dateIssued);
  const place = placeIssued || company.address || '';
  const monthly = getMonthlySalaryBasis(emp);
  const compLine = (coeType === 'with_comp' || coeType === 'loan') && monthly > 0
    ? `<p>Based on company records, the employee's current basic monthly compensation is <strong>${money(monthly)}</strong>. This amount is stated for certification purposes only and is subject to applicable payroll records and company policies.</p>`
    : '';
  const purposeMap = { without_comp: purpose, with_comp: purpose || 'employment and compensation verification', loan: 'loan / bank requirement', visa: 'visa / travel requirement', employment: 'employment requirement' };
  const finalPurpose = purposeMap[coeType] || purpose;
  return `<div class="coe-document">
    <div class="coe-company">
      <h2>${escapeHtml(company.name || 'Company Name')}</h2>
      <p>${escapeHtml(company.address || '')}</p>
      <p>${company.tin ? `TIN: ${escapeHtml(company.tin)}` : ''}</p>
    </div>
    <h1>CERTIFICATE OF EMPLOYMENT</h1>
    <p>To Whom It May Concern:</p>
    <p>This is to certify that <strong>${escapeHtml(fullName)}</strong> ${statusText} with <strong>${escapeHtml(company.name || 'the company')}</strong> as <strong>${escapeHtml(position)}</strong>${department ? ` under the ${escapeHtml(department)} department` : ''}. Based on company records, the employee's date hired is <strong>${escapeHtml(dateHired)}</strong>.</p>
    ${compLine}
    <p>This certification is issued upon the request of the above-mentioned employee for <strong>${escapeHtml(finalPurpose)}</strong> and for whatever legal purpose it may serve.</p>
    <p>Issued this <strong>${escapeHtml(issued)}</strong>${place ? ` at <strong>${escapeHtml(place)}</strong>` : ''}.</p>
    <div class="coe-signature">
      <strong>${escapeHtml(signatory || 'Authorized Signatory')}</strong>
      <span>${escapeHtml(signatoryPosition || 'Authorized Representative')}</span>
    </div>
  </div>`;
}
function printCOE() {
  updateCOEPreview();
  const html = document.getElementById('coePreview')?.innerHTML || '';
  if (!html || html.includes('empty')) return toast('Generate a COE first.');
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return toast('Allow pop-ups to print COE.');
  win.document.write(`<!doctype html><html><head><title>Certificate of Employment</title><style>
    body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#111;background:#fff}.coe-document{max-width:780px;margin:auto;border:1px solid #ddd;padding:44px;min-height:900px}.coe-company{text-align:center;border-bottom:2px solid #111;margin-bottom:42px;padding-bottom:16px}.coe-company h2{margin:0 0 6px;font-size:22px}.coe-company p{margin:2px 0;color:#333}.coe-document h1{text-align:center;font-size:24px;letter-spacing:1px;margin:36px 0}.coe-document p{font-size:15px;line-height:1.9;text-align:justify}.coe-signature{margin-top:90px;display:grid;gap:4px;width:320px;border-top:1px solid #111;padding-top:8px;text-align:center}.coe-signature span{font-size:13px;color:#444}@media print{body{padding:0}.coe-document{border:0;min-height:0}}
  </style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function renderReports() {
  document.getElementById('reportsView').innerHTML = `
    <div class="grid three">
      <div class="card"><h3>Employee List</h3><p>Export employee masterfile.</p><button class="btn primary" onclick="exportEmployeesCSV()">Download CSV</button></div>
      <div class="card"><h3>Attendance</h3><p>Export DTR records.</p><button class="btn primary" onclick="exportCSV('attendance_records')">Download CSV</button></div>
      <div class="card"><h3>Leave Requests</h3><p>Export leave monitoring.</p><button class="btn primary" onclick="exportCSV('leave_requests')">Download CSV</button></div>
      <div class="card"><h3>Payroll Summary</h3><p>Gross, deductions, and net pay by payroll run.</p><button class="btn primary" onclick="exportPayrollSummaryCSV()">Download CSV</button></div>
      <div class="card"><h3>Government Contributions</h3><p>SSS, PhilHealth, Pag-IBIG employee/employer report.</p><button class="btn primary" onclick="exportGovernmentContributionsCSV()">Download CSV</button></div>
      <div class="card"><h3>13th Month Estimate</h3><p>Basic pay totals divided by 12 from loaded payroll runs.</p><button class="btn primary" onclick="export13thMonthCSV()">Download CSV</button></div>
      <div class="card"><h3>Tax & Loan Summary</h3><p>Withholding tax, cash advances, loans and other deductions.</p><button class="btn primary" onclick="exportTaxLoanSummaryCSV()">Download CSV</button></div>
      <div class="card"><h3>Bank Payroll Upload</h3><p>Employee net pay listing for bank upload preparation.</p><button class="btn primary" onclick="exportBankUploadCSV()">Download CSV</button></div>
      <div class="card"><h3>Payroll Items</h3><p>Export raw payroll details.</p><button class="btn primary" onclick="exportCSV('payroll_items')">Download CSV</button></div>
      <div class="card"><h3>Full Backup</h3><p>Download JSON backup from Supabase-loaded data.</p><button class="btn secondary" onclick="exportBackupJSON()">Backup JSON</button></div>
    </div>`;
}
function exportPayrollSummaryCSV() {
  if (!state.payrollRuns.length) return toast('No payroll runs to export.');
  const rows = state.payrollRuns.map(r => ({
    period_label: r.period_label,
    period_start: r.period_start,
    period_end: r.period_end,
    pay_date: r.pay_date,
    total_gross_pay: r.total_gross_pay,
    total_deductions: r.total_deductions,
    total_net_pay: r.total_net_pay
  }));
  downloadFile('payroll_summary.csv', toCSV(rows), 'text/csv');
}
function exportGovernmentContributionsCSV() {
  if (!state.payrollItems.length) return toast('No payroll items to export.');
  const rows = state.payrollItems.map(i => {
    const emp = getEmployee(i.employee_id) || {};
    const run = state.payrollRuns.find(r => r.id === i.payroll_run_id) || {};
    const er = getPayrollEmployerShares(i);
    return {
      period: run.period_label || '',
      employee_no: emp.employee_no || '',
      employee_name: getEmployeeName(i.employee_id),
      monthly_salary_basis: getMonthlySalaryBasis(emp),
      sss_employee: i.sss || 0,
      sss_employer: er.sss_er,
      ec: er.ec,
      sss_total_remittance: roundMoney(Number(i.sss || 0) + er.sss_er + er.ec),
      philhealth_employee: i.philhealth || 0,
      philhealth_employer: er.philhealth_er,
      philhealth_total_remittance: roundMoney(Number(i.philhealth || 0) + er.philhealth_er),
      pagibig_employee: i.pagibig || 0,
      pagibig_employer: er.pagibig_er,
      pagibig_total_remittance: roundMoney(Number(i.pagibig || 0) + er.pagibig_er)
    };
  });
  downloadFile('government_contributions_summary.csv', toCSV(rows), 'text/csv');
}
function export13thMonthCSV() {
  if (!state.payrollItems.length) return toast('No payroll items to export.');
  const grouped = {};
  state.payrollItems.forEach(i => {
    if (!grouped[i.employee_id]) grouped[i.employee_id] = { employee_name: getEmployeeName(i.employee_id), total_basic_pay: 0 };
    grouped[i.employee_id].total_basic_pay += Number(i.basic_pay || 0);
  });
  const rows = Object.values(grouped).map(r => ({
    employee_name: r.employee_name,
    total_basic_pay: roundMoney(r.total_basic_pay),
    estimated_13th_month: roundMoney(r.total_basic_pay / 12)
  }));
  downloadFile('13th_month_estimate.csv', toCSV(rows), 'text/csv');
}
function exportTaxLoanSummaryCSV() {
  const rows = state.payrollItems.map(i => {
    const run = state.payrollRuns.find(r => r.id === i.payroll_run_id) || {};
    return {
      period: run.period_label || '', pay_date: run.pay_date || '', employee: getEmployeeName(i.employee_id),
      withholding_tax: i.withholding_tax || 0, cash_advance_loans: i.cash_advance || 0, total_deductions: i.total_deductions || 0, net_pay: i.net_pay || 0
    };
  });
  downloadFile(`tax_loan_summary_${Date.now()}.csv`, toCSV(rows), 'text/csv');
}
function exportBankUploadCSV() {
  const rows = state.payrollItems.map(i => {
    const run = state.payrollRuns.find(r => r.id === i.payroll_run_id) || {};
    const emp = getEmployee(i.employee_id) || {};
    return {
      period: run.period_label || '', employee_no: emp.employee_no || '', employee: getEmployeeName(i.employee_id), bank_name: '', bank_account_no: '', net_pay: i.net_pay || 0
    };
  });
  downloadFile(`bank_payroll_upload_${Date.now()}.csv`, toCSV(rows), 'text/csv');
}

function renderSettings() {
  const s = state.settings || defaultSettings();
  const local = getPayrollLocalOptions();
  document.getElementById('settingsView').innerHTML = `
    <div class="card"><h3>Payroll Settings v2.5</h3>
      <div class="form-grid">
        ${input('Standard Working Days / Month', 'setDays', s.standard_days, 'number', '', 'step="0.01"')}
        ${input('Grace Minutes', 'setGrace', s.grace_minutes, 'number')}
        ${input('OT Multiplier', 'setOt', s.overtime_multiplier, 'number', '', 'step="0.01"')}
        ${input('Pag-IBIG Employee Share Cap / Default', 'setPagibig', s.default_pagibig, 'number', '', 'step="0.01"')}
        ${selectInput('Payroll Mode', 'setPayrollMode', [['attendance','Attendance-Based'],['daily','Daily Rate'],['monthly_fixed','Monthly Fixed']], local.payroll_mode)}
        ${selectInput('Auto Withholding Tax Estimate', 'setAutoTax', [['false','Off'],['true','On']], local.auto_tax)}
        ${input('Payroll Officer', 'setOfficer', s.payroll_officer || '', 'text', 'full-span')}
      </div>
      <p class="small">Tax is an estimate for payroll preview only. Validate actual withholding against BIR rules before filing.</p>
      <div class="form-actions"><button class="btn primary" onclick="saveSettings()">Save Settings</button></div>
    </div>`;
}
async function saveSettings() {
  try {
    const payload = {
      company_id: company.id,
      standard_days: Number(document.getElementById('setDays').value || 26),
      grace_minutes: Number(document.getElementById('setGrace').value || 0),
      overtime_multiplier: Number(document.getElementById('setOt').value || 1.25),
      default_pagibig: Number(document.getElementById('setPagibig').value || 0),
      payroll_officer: document.getElementById('setOfficer').value.trim(),
      updated_at: new Date().toISOString()
    };
    savePayrollLocalOptions({ payroll_mode: document.getElementById('setPayrollMode').value, auto_tax: document.getElementById('setAutoTax').value });
    await sb(supabaseClient.from('settings').upsert(payload, { onConflict: 'company_id' }), 'Cannot save settings');
    toast('Settings saved.'); await loadAllData();
  } catch (error) { toast(error.message); }
}

async function deleteRow(table, id) {
  if (!confirm('Delete this record?')) return;
  try {
    await sb(supabaseClient.from(table).delete().eq('id', id), 'Cannot delete record');
    toast('Deleted.'); await loadAllData();
  } catch (error) { toast(error.message); }
}
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}
function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function exportCSV(table) {
  const map = { schedules: state.schedules, attendance_records: state.attendance, leave_requests: state.leaves, payroll_items: state.payrollItems };
  const rows = map[table] || [];
  if (!rows.length) return toast('No data to export.');
  downloadFile(`${table}.csv`, toCSV(rows), 'text/csv');
}
function exportEmployeesCSV() {
  if (!state.employees.length) return toast('No employees to export.');
  downloadFile('employees.csv', toCSV(state.employees), 'text/csv');
}
function exportBackupJSON() {
  const backup = { exported_at: new Date().toISOString(), company, profile, state };
  downloadFile(`e4u-cloud-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
}

document.addEventListener('click', event => {
  const btn = event.target.closest('.nav-item');
  if (btn && btn.dataset.view && !btn.disabled) setView(btn.dataset.view);
});

document.addEventListener('DOMContentLoaded', boot);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
