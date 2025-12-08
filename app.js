/* Shared app logic for all pages */
/* - Simple username login stored in localStorage
   - Per-user data stored under key 'ds_user_<username>'
   - To-do tasks, XP, badges managed locally
   - AI bot simulated; optional serverless endpoint supported
*/

(() => {
  const PAGE = document.body.id || '';

  /* --------- common helpers ---------- */
  function qs(sel){ return document.querySelector(sel) }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)) }
  function uid(prefix='id_'){ return prefix + Math.random().toString(36).slice(2,9) }
  function nowISO(){ return new Date().toISOString() }

  /* --------- user & storage --------- */
  const AUTH_KEY = 'ds_current_user';
  function currentUser(){ return localStorage.getItem(AUTH_KEY) || null }
  function setCurrentUser(name){ localStorage.setItem(AUTH_KEY, name) }

  function userKey(name){ return `ds_user_${name}` }
  function loadUserState(name){
    try{
      const raw = localStorage.getItem(userKey(name));
      return raw ? JSON.parse(raw) : { xp:0, tasks:[], badges: [] };
    } catch(e){ return { xp:0, tasks:[], badges: [] } }
  }
  function saveUserState(name, state){ localStorage.setItem(userKey(name), JSON.stringify(state)) }

  /* redirect to login if page requires auth */
  const protectedPages = ['page-todo','page-profile','page-rewards','page-ai'];
  if(protectedPages.includes(PAGE) && !currentUser()){
    // store redirect target, go to login
    localStorage.setItem('ds_redirect', window.location.pathname);
    window.location.href = 'login.html';
  }

  /* on login page */
  if(PAGE === 'page-login'){
    const btnLogin = qs('#btnLogin'), btnGuest = qs('#btnGuest');
    btnLogin.addEventListener('click', () => {
      const name = (qs('#loginName').value || '').trim();
      if(!name) { alert('Please enter a username'); return; }
      setCurrentUser(name);
      // ensure user state exists
      if(!localStorage.getItem(userKey(name))) saveUserState(name, { xp:0, tasks:[], badges: [] });
      const redirect = localStorage.getItem('ds_redirect') || 'todo.html';
      localStorage.removeItem('ds_redirect');
      window.location.href = redirect;
    });
    btnGuest.addEventListener('click', () => {
      const name = 'Guest';
      setCurrentUser(name);
      if(!localStorage.getItem(userKey(name))) saveUserState(name, { xp:0, tasks:[], badges: [] });
      window.location.href = 'todo.html';
    });
    return;
  }

  /* universal logout button if present */
  const logoutBtn = qs('#logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = 'index.html';
  });

  /* Display username badge where present */
  const user = currentUser();
  const userBadge = qs('#userBadge');
  if(userBadge){
    userBadge.textContent = user ? user : 'Guest';
  }

  /* -------- PAGE: To-Do -------- */
  if(PAGE === 'page-todo'){
    const name = currentUser() || 'Guest';
    const state = loadUserState(name);

    const taskListEl = qs('#taskList');
    const addBtn = qs('#addTaskBtn');
    const titleInput = qs('#taskTitle');
    const xpDisplay = qs('#xpDisplay');
    const filterQ = qs('#filterQ');
    const filterStatus = qs('#filterStatus');
    const sortBy = qs('#sortBy');
    const clearAllBtn = qs('#clearAllBtn');

    function save(){ saveUserState(name, state); render(); }
    function grantXP(amount){
      state.xp = (state.xp||0) + amount;
      // badge: first 50 xp
      if(state.xp >= 50 && !state.badges.includes('Starter')) state.badges.push('Starter');
      save();
      showXP();
    }
    function levelOf(xp){ return Math.floor(xp / 50) + 1 }

    function render(){
      // summary
      xpDisplay.textContent = `XP: ${state.xp||0} • Level: ${levelOf(state.xp||0)}`;
      // list
      const q = (filterQ.value||'').toLowerCase();
      const status = filterStatus.value;
      let items = (state.tasks || []).slice();
      if(q) items = items.filter(t => (t.title + ' ' + (t.notes||'')).toLowerCase().includes(q));
      if(status === 'pending') items = items.filter(t => !t.completed);
      if(status === 'completed') items = items.filter(t => t.completed);
      if(sortBy.value === 'priority') items.sort((a,b)=> (b.priorityVal||0) - (a.priorityVal||0));
      taskListEl.innerHTML = '';
      for(const t of items){
        const li = document.createElement('li');
        li.className = t.completed ? 'completed' : '';
        li.innerHTML = `
          <div>
            <strong>${escapeHtml(t.title)}</strong>
            <div class="muted" style="font-size:13px">${escapeHtml(t.notes||'')}</div>
          </div>
          <div>
            <button class="btn ${t.completed ? 'ghost':'complete-btn'}" data-act="toggle">${t.completed ? 'Undo':'Done'}</button>
            <button class="btn delete-btn" data-act="del">Delete</button>
          </div>
        `;
        // event handlers
        li.querySelector('[data-act="toggle"]').addEventListener('click', ()=>{
          t.completed = !t.completed;
          if(t.completed) { grantXP(10); confettiBurst(); } // reward 10 XP per completion
          save();
        });
        li.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(confirm('Delete task?')) {
            state.tasks = state.tasks.filter(x=>x.id !== t.id);
            save();
          }
        });
        taskListEl.appendChild(li);
      }
    }

    function addTask(){
      const title = (titleInput.value || '').trim();
      if(!title) return alert('Title required');
      const data = {
        id: uid('t_'),
        title,
        notes: '',
        createdAt: nowISO(),
        completed: false,
        priority: qs('#priority').value,
        priorityVal: qs('#priority').value === 'high' ? 3 : qs('#priority').value === 'medium' ? 2 : 1
      };
      state.tasks = [data, ...(state.tasks||[])];
      titleInput.value = '';
      save();
    }

    addBtn.addEventListener('click', addTask);
    clearAllBtn.addEventListener('click', ()=> {
      if(!confirm('Clear all tasks?')) return;
      state.tasks = [];
      save();
    });

    // filters
    filterQ.addEventListener('input', debounce(render,220));
    filterStatus.addEventListener('change', render);
    sortBy.addEventListener('change', render);

    // init
    showXP();
    render();

    // functions visible to other pages? not needed
    return;

    // helper showXP
    function showXP(){ /* handled above in render */ }
  }

  /* ---------- PAGE: AI Chatbot ---------- */
  if(PAGE === 'page-ai'){
    const sendBtn = qs('#sendBtn'), chatInput = qs('#chatInput'), messages = qs('#messages');
    const aiServerBtn = qs('#aiServerBtn');

    function append(user, text, cls){
      const p = document.createElement('p');
      p.className = cls || '';
      p.innerHTML = `<strong>${user}:</strong> ${escapeHtml(text)}`;
      messages.appendChild(p);
      messages.scrollTop = messages.scrollHeight;
    }

    sendBtn.addEventListener('click', ()=> {
      const q = (chatInput.value||'').trim();
      if(!q) return;
      append('You', q, 'msg-user');
      chatInput.value = '';
      // simple local AI heuristics:
      setTimeout(()=> { append('Bot', localBotReply(q), 'msg-bot'); }, 350);
    });

    aiServerBtn.addEventListener('click', ()=> {
      const prompt = 'Create 5 study tasks to learn algorithms in 2 weeks';
      // Example: make a POST to /api/ai-generate (serverless) returning tasks
      if(!confirm('This demo does not include a server. To use real AI, deploy a serverless proxy and set endpoint in app.js')) return;
    });

    function localBotReply(q){
      q = q.toLowerCase();
      if(q.includes('todo') || q.includes('task')) return 'I can help break goals into tasks. Try: "Plan study schedule for SQL"';
      if(q.includes('study')) return 'Try: 1) Read chapter 1 2) Solve 10 problems 3) Revise notes';
      if(q.includes('hello')) return 'Hello! I am your assistant. Ask me to generate tasks like "create 7 tasks to learn React"';
      return 'Nice! I suggest you be specific: e.g., "Plan 5-day sprint for testing".';
    }
    return;
  }

  /* ---------- PAGE: PROFILE ---------- */
  if(PAGE === 'page-profile'){
    const user = currentUser() || 'Guest';
    const state = loadUserState(user);
    qs('#profileUser').textContent = user;
    qs('#profileXP').textContent = state.xp || 0;
    qs('#profileLevel').textContent = Math.floor((state.xp||0)/50)+1;
    qs('#resetProgress').addEventListener('click', ()=> {
      if(!confirm('Reset your progress?')) return;
      saveUserState(user, { xp:0, tasks:[], badges: [] });
      window.location.reload();
    });
    return;
  }

  /* ---------- PAGE: REWARDS ---------- */
  if(PAGE === 'page-rewards'){
    const user = currentUser() || 'Guest';
    const state = loadUserState(user);
    const badgesArea = qs('#badgesArea');
    const master = [
      { id:'Starter', title:'Starter badge (50 XP)', need:50 },
      { id:'Achiever', title:'Achiever (200 XP)', need:200 },
      { id:'Master', title:'Master (500 XP)', need:500 }
    ];
    badgesArea.innerHTML = '';
    master.forEach(b => {
      const unlocked = (state.badges || []).includes(b.id) || (state.xp||0) >= b.need;
      const div = document.createElement('div');
      div.className = 'badge';
      div.innerHTML = `<strong>${b.title}</strong><div class="muted">${unlocked ? 'Unlocked':'Locked'}</div>`;
      badgesArea.appendChild(div);
    });
    return;
  }

  /* ---------- confetti (simple) ---------- */
  function confettiBurst(){
    // basic confetti using many small divs on #confetti-canvas
    const container = qs('#confetti-canvas') || createConfettiLayer();
    for(let i=0;i<24;i++){
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.width = '8px';
      el.style.height = '14px';
      el.style.left = (50 + (Math.random()*60-30)) + '%';
      el.style.top = (40 + (Math.random()*30-15)) + '%';
      el.style.background = randomColor();
      el.style.borderRadius = '2px';
      el.style.opacity = 0.95;
      el.style.transform = `translateY(0) rotate(${Math.random()*360}deg)`;
      el.style.transition = 'all 900ms cubic-bezier(.2,.8,.2,1)';
      container.appendChild(el);
      setTimeout(()=> {
        el.style.transform = `translateY(${200 + Math.random()*200}px) rotate(${Math.random()*720}deg)`;
        el.style.opacity = 0;
      }, 20);
      setTimeout(()=> el.remove(), 1100);
    }
  }
  function createConfettiLayer(){
    const div = document.createElement('div');
    div.id = 'confetti-canvas';
    div.className = 'confetti';
    document.body.appendChild(div);
    return div;
  }
  function randomColor(){
    const colors = ['#7c3aed','#06b6d4','#ffb86b','#ff6b6b','#60f2a2'];
    return colors[Math.floor(Math.random()*colors.length)];
  }

  /* ---------- small utilities ---------- */
  function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') }
  function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=> fn.apply(this, a), wait) } }
})();
