/* 博识堂 - 后台管理页：直连 GitHub 读写仓库 JSON */
(function () {
  'use strict';

  var ADMIN_KEY = 'bst_admin';
  var GH_KEY = 'bst_gh';
  var ADMIN_PASSWORD = '123456';
  var REPO_BASE = 'student/';      /* 系统部署在仓库的 student/ 子目录，后台写回也需落在该目录下 */

  var $ = function (id) { return document.getElementById(id); };

  var config = loadConfig();
  var studentsFile = 'data/students.json';
  var students = [];
  var archData = null;   /* 当前编辑的学生档案 */

  /* ================= 工具 ================= */
  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(GH_KEY) || 'null') || { owner: '', repo: '', branch: 'main', token: '' };
    } catch (e) { return { owner: '', repo: '', branch: 'main', token: '' }; }
  }
  function saveToLocal(key, v) { localStorage.setItem(key, v); }

  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (isErr ? 'toast-err' : 'toast-ok');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 3200);
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setBtn(btn, on, text) { btn.disabled = on; btn.textContent = text; }

  /* UTF-8 <-> base64（JSON/文本必须走 UTF-8，避免中文乱码） */
  function utf8ToB64(str) {
    var b = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* ================= GitHub API ================= */
  function ghHeaders() {
    return {
      'Authorization': 'Bearer ' + config.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function ghUrl(path) {
    return 'https://api.github.com/repos/' + encodeURIComponent(config.owner) +
      '/' + encodeURIComponent(config.repo) + '/contents/' + REPO_BASE + String(path).replace(/^\/+/, '') +
      (config.branch ? '?ref=' + encodeURIComponent(config.branch) : '');
  }
  function ghErr(r) {
    return r.json().then(function (j) {
      var m = (j && j.message) || ('HTTP ' + r.status);
      return Promise.reject(new Error('GitHub: ' + m));
    });
  }
  function ghGet(path) {
    return fetch(ghUrl(path), { headers: ghHeaders() }).then(function (r) {
      if (r.status === 404) return Promise.reject(new Error('不存在：' + path));
      if (!r.ok) return ghErr(r);
      return r.json().then(function (j) { return { text: b64ToUtf8(j.content), sha: j.sha }; });
    });
  }
  function ghPut(path, text) {
    /* 先取 sha；不存在则新建（GitHub 要求 sha 才可覆盖已存在文件） */
    return ghGet(path).then(function (cur) {
      return doPut(path, utf8ToB64(text), cur.sha);
    }).catch(function (err) {
      if (/不存在/.test(err.message)) return doPut(path, utf8ToB64(text), null);
      throw err;
    });
  }
  function doPut(path, b64, sha) {
    var body = { message: '更新 ' + path, content: b64, branch: config.branch };
    if (sha) body.sha = sha;
    return fetch(ghUrl(path), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) return ghErr(r); return r.json(); });
  }
  function ghUpload(path, fileB64) {
    return fetch(ghUrl(path), {
      method: 'PUT', headers: ghHeaders(),
      body: JSON.stringify({ message: '上传 ' + path, content: fileB64, branch: config.branch })
    }).then(function (r) { if (!r.ok) return ghErr(r); return r.json(); });
  }

  /* ================= 登录 / 连接状态 ================= */
  function setLoggedIn() {
    $('setupPanel').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
  }
  function setLoggedOut() {
    $('workspace').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
    $('loginForm').classList.remove('hidden');
    $('connForm').classList.add('hidden');
    $('adminPass').value = '';
    fillConnFields();
    $('setupPanel').classList.remove('hidden');
  }
  function repoReady() { return !!(config.owner && config.repo && config.token); }
  function fillConnFields() {
    $('ghOwner').value = config.owner || '';
    $('ghRepo').value = config.repo || '';
    $('ghBranch').value = config.branch || 'main';
    $('ghToken').value = config.token || '';
  }
  function readConnFields() {
    config.owner = $('ghOwner').value.trim();
    config.repo = $('ghRepo').value.trim();
    config.branch = $('ghBranch').value.trim() || 'main';
    config.token = $('ghToken').value.trim();
  }

  /* ================= 学生账号 ================= */
  function renderStudents() {
    var tb = $('studentsTbody');
    tb.innerHTML = '';
    if (!students.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无学生，点击「新增学生」</td></tr>';
      return;
    }
    students.forEach(function (s, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input class="cell-inp" data-i="' + i + '" data-k="id" value="' + esc(s.id) + '"></td>' +
        '<td><input class="cell-inp" data-i="' + i + '" data-k="name" value="' + esc(s.name) + '"></td>' +
        '<td><input class="cell-inp" data-i="' + i + '" data-k="password" value="' + esc(s.password) + '"></td>' +
        '<td><input class="cell-inp" data-i="' + i + '" data-k="grade" value="' + esc(s.grade) + '"></td>' +
        '<td><input class="cell-inp" data-i="' + i + '" data-k="subject" value="' + esc(s.subject) + '"></td>' +
        '<td><input class="cell-inp" data-i="' + i + '" data-k="dataFile" value="' + esc(s.dataFile) + '" placeholder="data/student_XX.json"></td>' +
        '<td><button class="btn-ghost btn-xs row-del" data-i="' + i + '">删除</button></td>';
      tb.appendChild(tr);
    });
  }
  function collectStudents() {
    document.querySelectorAll('#studentsTbody tr').forEach(function (tr) {
      var first = tr.querySelector('[data-i]');
      if (!first) return;
      var i = +first.getAttribute('data-i');
      tr.querySelectorAll('[data-k]').forEach(function (el) {
        students[i] = students[i] || {};
        students[i][el.getAttribute('data-k')] = el.value.trim();
      });
    });
    students = students.filter(function (s) { return s && (s.id || s.name); });
    return students;
  }
  function fillStudentSelects(selectedId) {
    ['archStudent', 'photoStudent'].forEach(function (selId) {
      var sel = $(selId);
      var cur = selectedId || sel.value;
      sel.innerHTML = '<option value="">请选择学生</option>';
      students.forEach(function (s) {
        if (!s.id) return;
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.id + ' - ' + (s.name || '');
        sel.appendChild(o);
      });
      if (cur) sel.value = cur;
    });
  }

  /* ================= 档案编辑（渲染） ================= */
  function renderArchive() {
    if (!archData) return;
    archData.dailyScores = archData.dailyScores || [];
    archData.exams = archData.exams || [];
    archData.comments = archData.comments || [];
    archData.photos = archData.photos || [];

    $('edName').value = archData.name || '';
    $('edGrade').value = archData.grade || '';
    $('edSubject').value = archData.subject || '';
    $('edRegDate').value = archData.regDate || '';
    $('edAvatar').value = archData.avatar || '';

    var sTb = $('scoresTbody'); sTb.innerHTML = '';
    archData.dailyScores.forEach(function (sc) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input class="cell-inp" data-k="date" value="' + esc(sc.date) + '"></td>' +
        '<td><select class="cell-inp" data-k="type"><option>午练</option><option>晚练</option></select></td>' +
        '<td><input class="cell-inp" data-k="subject" value="' + esc(sc.subject) + '"></td>' +
        '<td><input class="cell-inp" data-k="score" type="number" value="' + esc(sc.score) + '"></td>' +
        '<td><input class="cell-inp" data-k="fullMark" type="number" value="' + esc(sc.fullMark) + '"></td>' +
        '<td><button class="btn-ghost btn-xs score-del">×</button></td>';
      tr.querySelector('select').value = sc.type;
      sTb.appendChild(tr);
    });

    var eW = $('examsWrap'); eW.innerHTML = '';
    archData.exams.forEach(function (ex) {
      var blk = document.createElement('div');
      blk.className = 'sub-block';
      blk.innerHTML =
        '<div class="sub-block-head"><b>' + esc(ex.name || '考试') + '</b>' +
          '<button class="btn-ghost btn-xs exam-del">删除</button></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>日期</label><input data-k="date" value="' + esc(ex.date) + '"></div>' +
          '<div class="field"><label>名称</label><input data-k="name" value="' + esc(ex.name) + '"></div>' +
          '<div class="field field-wide"><label>试卷照片路径（多个用英文逗号分隔）</label>' +
            '<input data-k="paperPhotos" value="' + esc((ex.paperPhotos || []).join(',')) + '"></div>' +
        '</div>' +
        '<div class="sub-table-title">科目</div>' +
        '<table><thead><tr><th>科目</th><th>分数</th><th>班排名</th><th>年级排名</th><th></th></tr></thead>' +
          '<tbody></tbody></table>' +
        '<button class="btn-ghost btn-xs subj-add">+ 添加科目</button>';
      var tb = blk.querySelector('tbody');
      (ex.subjects || []).forEach(function (su) {
        tb.appendChild(subjectRow(su));
      });
      eW.appendChild(blk);
    });

    var cW = $('commentsWrap'); cW.innerHTML = '';
    archData.comments.forEach(function (c) {
      var blk = document.createElement('div');
      blk.className = 'sub-block';
      blk.innerHTML =
        '<div class="sub-block-head"><b>' + esc(c.date || '评语') + '</b>' +
          '<button class="btn-ghost btn-xs comment-del">删除</button></div>' +
        '<div class="form-grid">' +
          '<div class="field"><label>日期</label><input data-k="date" value="' + esc(c.date) + '"></div>' +
          '<div class="field"><label>老师</label><input data-k="teacher" value="' + esc(c.teacher) + '"></div>' +
        '</div>' +
        '<div class="field"><label>内容</label><textarea rows="2" data-k="content">' + esc(c.content) + '</textarea></div>';
      cW.appendChild(blk);
    });

    var pW = $('photosWrap'); pW.innerHTML = '';
    archData.photos.forEach(function (p) {
      var blk = document.createElement('div');
      blk.className = 'sub-block';
      blk.innerHTML =
        '<div class="sub-block-head"><b>照片</b><button class="btn-ghost btn-xs photo-del">删除</button></div>' +
        '<div class="form-grid">' +
          '<div class="field field-wide"><label>图片路径</label><input data-k="url" value="' + esc(p.url) + '"></div>' +
          '<div class="field"><label>说明</label><input data-k="caption" value="' + esc(p.caption) + '"></div>' +
          '<div class="field"><label>日期</label><input data-k="date" value="' + esc(p.date) + '"></div>' +
        '</div>';
      pW.appendChild(blk);
    });

    $('archiveEditor').classList.remove('hidden');
  }
  function subjectRow(su) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="cell-inp" data-k="subject" value="' + esc(su.subject) + '"></td>' +
      '<td><input class="cell-inp" data-k="score" type="number" value="' + esc(su.score) + '"></td>' +
      '<td><input class="cell-inp" data-k="classRank" type="number" value="' + esc(su.classRank) + '"></td>' +
      '<td><input class="cell-inp" data-k="gradeRank" type="number" value="' + esc(su.gradeRank) + '"></td>' +
      '<td><button class="btn-ghost btn-xs subj-del">×</button></td>';
    return tr;
  }

  /* ================= 档案编辑（收集到 archData） ================= */
  function collectArchive() {
    if (!archData) return;
    archData.name = $('edName').value.trim();
    archData.grade = $('edGrade').value.trim();
    archData.subject = $('edSubject').value.trim();
    archData.regDate = $('edRegDate').value.trim();
    archData.avatar = $('edAvatar').value.trim();

    archData.dailyScores = [];
    document.querySelectorAll('#scoresTbody tr').forEach(function (tr) {
      var row = {};
      tr.querySelectorAll('[data-k]').forEach(function (el) {
        row[el.getAttribute('data-k')] = el.value.trim();
      });
      if (row.date) archData.dailyScores.push(row);
    });

    archData.exams = [];
    $('examsWrap').querySelectorAll('.sub-block').forEach(function (blk) {
      var ex = {};
      blk.querySelectorAll('.form-grid [data-k]').forEach(function (el) {
        ex[el.getAttribute('data-k')] = el.value.trim();
      });
      ex.paperPhotos = (ex.paperPhotos || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      ex.subjects = [];
      blk.querySelectorAll('tbody tr').forEach(function (tr) {
        var row = {};
        tr.querySelectorAll('[data-k]').forEach(function (el) {
          row[el.getAttribute('data-k')] = el.value.trim();
        });
        if (row.subject || row.score) ex.subjects.push(row);
      });
      if (ex.date) archData.exams.push(ex);
    });

    archData.comments = [];
    $('commentsWrap').querySelectorAll('.sub-block').forEach(function (blk) {
      var c = {};
      blk.querySelectorAll('[data-k]').forEach(function (el) {
        c[el.getAttribute('data-k')] = el.value.trim();
      });
      if (c.date || c.content) archData.comments.push(c);
    });

    archData.photos = [];
    $('photosWrap').querySelectorAll('.sub-block').forEach(function (blk) {
      var p = {};
      blk.querySelectorAll('[data-k]').forEach(function (el) {
        p[el.getAttribute('data-k')] = el.value.trim();
      });
      if (p.url) archData.photos.push(p);
    });
  }

  /* ================= 加载 / 保存 ================= */
  function loadStudents() {
    return ghGet(studentsFile).then(function (res) {
      students = JSON.parse(res.text);
      renderStudents();
      fillStudentSelects();
    });
  }
  function saveStudents() {
    collectStudents();
    if (!students.length) { toast('学生列表为空，不能保存', true); return; }
    var btn = $('saveStudentsBtn');
    setBtn(btn, true, '保存中…');
    ghPut(studentsFile, JSON.stringify(students, null, 2))
      .then(function () { toast('学生账号已保存到仓库'); fillStudentSelects(); })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { setBtn(btn, false, '保存学生账号'); });
  }
  function loadArchive(id) {
    var st = students.find(function (s) { return String(s.id) === String(id); });
    var path = (st && st.dataFile) ? st.dataFile : ('data/student_' + id + '.json');
    var btn = $('archLoadBtn');
    setBtn(btn, true, '加载中…');
    ghGet(path).then(function (res) {
      archData = JSON.parse(res.text);
      archData.studentId = String(id);
      renderArchive();
      toast('已加载「' + (archData.name || id) + '」档案');
    }).catch(function (err) {
      if (/不存在/.test(err.message)) {
        archData = { studentId: String(id), name: (st && st.name) || '', grade: (st && st.grade) || '', subject: (st && st.subject) || '', regDate: '', avatar: '', dailyScores: [], exams: [], comments: [], photos: [] };
        renderArchive();
        toast('该学生暂无档案文件，已按空档案新建（保存时创建）');
      } else { toast(err.message, true); }
    }).finally(function () { setBtn(btn, false, '加载该学生档案'); });
  }
  function saveArchive() {
    if (!archData) { toast('请先加载学生档案', true); return; }
    collectArchive();
    var path = 'data/student_' + archData.studentId + '.json';
    var btn = $('saveArchiveBtn');
    setBtn(btn, true, '保存中…');
    ghPut(path, JSON.stringify(archData, null, 2))
      .then(function () { toast('档案已保存到仓库'); })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { setBtn(btn, false, '保存档案'); });
  }

  /* ================= 照片上传 ================= */
  function uploadPhotos() {
    var id = $('photoStudent').value;
    var files = $('photoFiles').files;
    if (!id) { toast('请选择学生', true); return; }
    if (!files.length) { toast('请选择图片文件', true); return; }
    var prefix = $('photoPrefix').value.trim();
    var btn = $('uploadPhotosBtn');
    setBtn(btn, true, '上传中…');

    var done = [];
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (file, i) {
      chain = chain.then(function () {
        return readB64(file).then(function (b64) {
          var fname = (prefix || stem(file.name)) + (files.length > 1 ? '_' + (i + 1) : '') + '.' + ext(file.name);
          var path = 'images/students/' + id + '/' + fname;
          return ghUpload(path, b64).then(function () { done.push(path); });
        });
      });
    });

    chain.then(function () {
      $('uploadResult').innerHTML =
        '<p class="up-ok">成功上传 ' + done.length + ' 张，复制下面路径，粘贴到「档案编辑」对应输入框：</p>' +
        '<textarea rows="' + done.length + '" readonly>' + esc(done.join('\n')) + '</textarea>' +
        '<button class="btn-ghost btn-xs up-copy">复制全部</button>';
      $('photoFiles').value = '';
    }).catch(function (err) { toast(err.message, true); })
      .finally(function () { setBtn(btn, false, '上传到 images/students/{ID}/'); });
  }
  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('读取图片失败')); };
      fr.readAsDataURL(file);
    });
  }
  function stem(name) { var m = /^(.*?)(\.\w+)?$/.exec(name || ''); return (m && m[1] ? m[1] : 'file').replace(/[^0-9a-zA-Z_-]/g, '_'); }
  function ext(name) { var m = /\.(\w+)$/.exec(name || ''); return m ? m[1].toLowerCase() : 'jpg'; }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    $('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var h = $('loginHint');
      if ($('adminPass').value === ADMIN_PASSWORD) {
        h.textContent = '';
        $('loginForm').classList.add('hidden');
        $('connForm').classList.remove('hidden');
      } else {
        h.textContent = '管理密码错误';
        h.style.color = 'var(--danger)';
      }
    });

    $('testConnBtn').addEventListener('click', function () {
      readConnFields();
      if (!repoReady()) { toast('请填写 GitHub 用户名、仓库和 Token', true); return; }
      var btn = this;
      setBtn(btn, true, '连接中…');
      ghGet(studentsFile).then(function () {
        saveToLocal(GH_KEY, JSON.stringify(config));
        saveToLocal(ADMIN_KEY, '1');
        setLoggedIn();
        refreshAll();
      }).catch(function (err) { toast(err.message, true); })
        .finally(function () { setBtn(btn, false, '测试连接并进入管理'); });
    });
    $('logoutBtn').addEventListener('click', function () {
      localStorage.removeItem(ADMIN_KEY);
      setLoggedOut();
    });

    /* tab */
    $('tabBar').addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn');
      if (!b) return;
      document.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.add('hidden'); });
      $('tab-' + b.getAttribute('data-tab')).classList.remove('hidden');
    });

    /* 学生账号 */
    $('addStudentRow').addEventListener('click', function () {
      students.push({ id: '', name: '', password: '', grade: '', subject: '', dataFile: '' });
      renderStudents();
    });
    $('studentsTbody').addEventListener('click', function (e) {
      var b = e.target.closest('.row-del');
      if (!b) return;
      students.splice(+b.getAttribute('data-i'), 1);
      renderStudents();
    });
    $('saveStudentsBtn').addEventListener('click', saveStudents);
    $('reloadStudentsBtn').addEventListener('click', refreshAll);

    /* 档案 */
    $('archLoadBtn').addEventListener('click', function () {
      var id = $('archStudent').value;
      if (!id) { toast('请选择学生', true); return; }
      loadArchive(id);
    });
    $('addScoreBtn').addEventListener('click', function () {
      archData.dailyScores.push({ date: '', type: '午练', subject: '', score: '', fullMark: 100 });
      renderArchive();
    });
    $('scoresTbody').addEventListener('click', function (e) {
      var b = e.target.closest('.score-del');
      if (b) b.closest('tr').remove();
    });
    $('addExamBtn').addEventListener('click', function () {
      archData.exams.push({ date: '', name: '', subjects: [{ subject: '', score: '', classRank: '', gradeRank: '' }], paperPhotos: [] });
      renderArchive();
    });
    $('examsWrap').addEventListener('click', function (e) {
      var del = e.target.closest('.exam-del');
      if (del) { del.closest('.sub-block').remove(); return; }
      var add = e.target.closest('.subj-add');
      if (add) { add.closest('.sub-block').querySelector('tbody').appendChild(subjectRow({ subject: '', score: '', classRank: '', gradeRank: '' })); return; }
      var sd = e.target.closest('.subj-del');
      if (sd) sd.closest('tr').remove();
    });
    $('addCommentBtn').addEventListener('click', function () {
      archData.comments.push({ date: '', teacher: '', content: '' });
      renderArchive();
    });
    $('commentsWrap').addEventListener('click', function (e) {
      var b = e.target.closest('.comment-del');
      if (b) b.closest('.sub-block').remove();
    });
    $('addPhotoBtn').addEventListener('click', function () {
      archData.photos.push({ url: '', caption: '', date: '' });
      renderArchive();
    });
    $('photosWrap').addEventListener('click', function (e) {
      var b = e.target.closest('.photo-del');
      if (b) b.closest('.sub-block').remove();
    });
    $('saveArchiveBtn').addEventListener('click', saveArchive);
    $('reloadArchiveBtn').addEventListener('click', function () {
      if (archData) loadArchive(archData.studentId);
    });
    $('uploadPhotosBtn').addEventListener('click', uploadPhotos);
    $('uploadResult').addEventListener('click', function (e) {
      var b = e.target.closest('.up-copy');
      if (!b) return;
      var ta = this.querySelector('textarea');
      ta.select(); ta.setSelectionRange(0, 99999);
      try { document.execCommand('copy'); toast('已复制'); } catch (err) { toast('请手动复制', true); }
    });
  }

  function refreshAll() {
    loadStudents().then(function () { toast('已读取仓库学生账号'); })
      .catch(function (err) { toast('读取失败：' + err.message, true); });
  }

  /* ================= 初始化 ================= */
  function init() {
    bindEvents();
    fillConnFields();
    if (localStorage.getItem(ADMIN_KEY) && repoReady()) {
      setLoggedIn();
      refreshAll();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();