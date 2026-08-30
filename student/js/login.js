/* 博识堂学生成长档案 - 登录逻辑 */
(function () {
  var SESSION_KEY = 'bst_session';
  var REMEMBER_KEY = 'bst_remember';

  var form = document.getElementById('loginForm');
  var idInput = document.getElementById('studentId');
  var pwdInput = document.getElementById('password');
  var rememberCheck = document.getElementById('rememberMe');
  var errorEl = document.getElementById('loginError');
  var btn = document.getElementById('loginBtn');

  /* 若已记住登录状态，直接跳转对应学生档案 */
  restoreRemembered();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = idInput.value.trim();
    var pwd = pwdInput.value;
    if (!id || !pwd) {
      showError('请输入学号和密码');
      return;
    }
    setLoading(true);
    loadStudents().then(function (students) {
      var found = (students || []).find(function (s) {
        return String(s.id) === String(id) && String(s.password) === String(pwd);
      });
      if (found) {
        startSession(found.id, rememberCheck.checked);
        location.href = 'student.html?id=' + encodeURIComponent(found.id);
      } else {
        showError('账号或密码错误');
        setLoading(false);
      }
    }).catch(function () {
      showError('数据加载失败，请检查网络后重试');
      setLoading(false);
    });
  });

  function loadStudents() {
    return fetch('data/students.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function startSession(id, remember) {
    var sess = { id: String(id), loginAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, sess.id);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }

  function restoreRemembered() {
    var rememberedId = localStorage.getItem(REMEMBER_KEY);
    if (!rememberedId) return;
    /* 校验该学号仍存在，避免跳转后档案缺失 */
    loadStudents().then(function (students) {
      var ok = (students || []).some(function (s) { return String(s.id) === rememberedId; });
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: rememberedId, loginAt: Date.now() }));
        location.href = 'student.html?id=' + encodeURIComponent(rememberedId);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    }).catch(function () { /* 网络异常时不强制跳转 */ });
  }

  function showError(msg) {
    errorEl.textContent = msg || '';
  }

  function setLoading(on) {
    btn.disabled = on;
    btn.textContent = on ? '登录中…' : '登 录';
  }
})();