/* 博识堂学生成长档案 - 学生档案页逻辑 */
(function () {
  var SESSION_KEY = 'bst_session';
  var REMEMBER_KEY = 'bst_remember';

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');

  /* 1. 检查登录状态 */
  if (!sessionStorage.getItem(SESSION_KEY)) {
    location.href = 'index.html';
    return;
  }

  /* 2. 读取 URL 中的学生 id */
  var params = new URLSearchParams(location.search);
  var studentId = (params.get('id') || '').trim();

  if (!studentId) {
    location.href = 'index.html';
    return;
  }

  init();

  function init() {
    loadStudents().then(function (students) {
      var record = (students || []).find(function (s) { return String(s.id) === String(studentId); });
      if (!record || !record.dataFile) {
        location.href = 'index.html';
        return;
      }
      return loadJSON(record.dataFile).then(function (data) { render(data); });
    }).catch(function () {
      location.href = 'index.html';
    });
  }

  function loadStudents() {
    return loadJSON('data/students.json');
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ============ 渲染 ============ */
  function render(d) {
    loading.classList.add('hidden');
    app.classList.remove('hidden');

    renderProfile(d);
    renderOverview(d);
    setupTrendChart(d);
    renderExams(d);
    renderComments(d);
    renderGallery(d);

    showWhenData('trendSection', (d.dailyScores || []).length > 0);
    showWhenData('examSection', (d.exams || []).length > 0);
    showWhenData('commentSection', (d.comments || []).length > 0);
    showWhenData('gallerySection', (d.photos || []).length > 0);

    var hasAny = (d.dailyScores || []).length || (d.exams || []).length ||
                 (d.comments || []).length || (d.photos || []).length;
    if (!hasAny) {
      document.getElementById('emptyBox').classList.remove('hidden');
    } else {
      document.getElementById('emptyBox').classList.add('hidden');
    }
  }

  function showWhenData(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
  }

  function renderProfile(d) {
    document.getElementById('avatarImg').src = d.avatar || placeholderAvatar();
    document.getElementById('avatarImg').onerror = function () { this.src = placeholderAvatar(); };
    document.getElementById('studentName').textContent = d.name || '';
    document.getElementById('tagGrade').textContent = d.grade || '—';
    document.getElementById('tagSubject').textContent = d.subject || '—';
    document.getElementById('regDate').textContent = d.regDate || d.date || '—';
    document.getElementById('studentInfo').classList.remove('hidden');
  }

  function placeholderAvatar() {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="152" height="152">' +
      '<rect width="152" height="152" fill="#c3cffa"/>' +
      '<circle cx="76" cy="58" r="26" fill="#7b97ff"/>' +
      '<path d="M38 126c0-22 17-34 38-34s38 12 38 34" fill="#7b97ff"/>' +
      '</svg>'
    );
  }

  /* ============ 概览卡片 ============ */
  function renderOverview(d) {
    var latestExam = (d.exams || []).slice().sort(byDateDesc)[0];
    if (latestExam) {
      var subs = latestExam.subjects || [];
      var total = subs.reduce(function (m, s) { return m + num(s.score); }, 0);
      var classRank = '' , gradeRank = '';
      if (subs.length) {
        classRank = subs[0].classRank != null ? '班第' + subs[0].classRank + '名' : '';
        gradeRank = subs[0].gradeRank != null ? '年级第' + subs[0].gradeRank + '名' : '';
      }
      document.getElementById('ovLatestScore').textContent = total || '--';
      document.getElementById('ovLatestRank').textContent =
        latestExam.name + (classRank || gradeRank ? '　' + classRank + ' / ' + gradeRank : '');
    } else {
      document.getElementById('ovLatestScore').textContent = '--';
      document.getElementById('ovLatestRank').textContent = '暂无考试记录';
    }

    var noon = weekAvg(d.dailyScores || [], '午练');
    var evening = weekAvg(d.dailyScores || [], '晚练');
    document.getElementById('ovNoonAvg').textContent = noon != null ? noon : '--';
    document.getElementById('ovEveningAvg').textContent = evening != null ? evening : '--';

    var latestComment = (d.comments || []).slice().sort(byDateDesc)[0];
    document.getElementById('ovComment').textContent =
      latestComment ? latestComment.content : '暂无老师评语';
    document.getElementById('overview').classList.remove('hidden');
  }

  function weekAvg(list, type) {
    var items = list.filter(function (i) { return i.type === type; });
    if (!items.length) return null;

    var startOfThisWeek = startOfWeek(new Date());
    var thisWeek = items.filter(function (i) { return +new Date(i.date) >= +startOfThisWeek; });
    var source = thisWeek.length ? thisWeek : items; /* 本周无数据则退回首条记录 */

    var sum = source.reduce(function (m, i) { return m + num(i.score); }, 0);
    return (sum / source.length).toFixed(1);
  }

  /* ============ 成绩趋势图 ============ */
  var trendChart = null;
  var currentTrendType = '午练';

  function setupTrendChart(d) {
    var damped = (d.dailyScores || []).filter(function (i) { return i.type === currentTrendType; })
      .slice().sort(function (a, b) { return +new Date(a.date) - +new Date(b.date); });
    if (!damped.length) {
      damped = (d.dailyScores || []).slice().sort(function (a, b) { return +new Date(a.date) - +new Date(b.date); });
    }

    trendChart = renderChart('trendChart', damped);

    var toggle = document.getElementById('trendToggle');
    toggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      currentTrendType = btn.getAttribute('data-type');
      toggle.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      var items = (d.dailyScores || []).filter(function (i) { return i.type === currentTrendType; })
        .slice().sort(function (a, b) { return +new Date(a.date) - +new Date(b.date); });
      updateChart(items);
    });

    document.getElementById('trendToggle').classList.remove('hidden');
  }

  function renderChart(canvasId, items) {
    if (typeof Chart === 'undefined') {
      return null; /* CDN 未加载时静默降级 */
    }
    var ctx = document.getElementById(canvasId);
    return new Chart(ctx, {
      type: 'line',
      data: buildChartData(items),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                var rec = items[c.dataIndex];
                return ' 得分：' + c.parsed.y + (rec && rec.fullMark ? ' / ' + rec.fullMark : '');
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            suggestedMin: 50,
            suggestedMax: 100,
            grid: { color: '#eef1ff' },
            ticks: { font: { size: 11 } }
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        },
        elements: { line: { tension: 0.35 }, point: { radius: 4, hoverRadius: 6 } }
      }
    });
  }

  function buildChartData(items) {
    return {
      labels: items.map(function (i) { return i.date; }),
      datasets: [{
        label: currentTrendType + '成绩',
        data: items.map(function (i) { return num(i.score); }),
        borderColor: '#4F6EF7',
        backgroundColor: 'rgba(79,110,247,0.12)',
        fill: true,
        borderWidth: 2.5,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#4F6EF7',
        pointBorderWidth: 2
      }]
    };
  }

  function updateChart(items) {
    if (!trendChart) return;
    trendChart.data = buildChartData(items);
    trendChart.update();
  }

  /* ============ 考试成绩 ============ */
  function renderExams(d) {
    var list = (d.exams || []).slice().sort(byDateDesc);
    var container = document.getElementById('examList');
    container.innerHTML = '';

    list.forEach(function (exam, idx) {
      var subs = exam.subjects || [];
      var item = document.createElement('div');
      item.className = 'exam-item';

      var total = subs.reduce(function (m, s) { return m + num(s.score); }, 0);

      var rowsHtml = subs.map(function (s, si) {
        return '<tr>' +
          '<td>' + (s.subject || '—') + '</td>' +
          '<td>' + num(s.score) + '</td>' +
          '<td>' + (s.classRank != null ? s.classRank : '—') + '</td>' +
          '<td>' + (s.gradeRank != null ? s.gradeRank : '—') + '</td>' +
        '</tr>';
      }).join('');

      var totalHtml = subs.length > 1
        ? '<tr class="exam-total"><td><b>总分</b></td><td colspan="3"><b>' + total + '</b></td></tr>'
        : '';

      var papersHtml = '';
      if (exam.paperPhotos && exam.paperPhotos.length) {
        papersHtml = '<div class="exam-papers">' +
          '<p class="paper-label">试卷照片</p>' +
          '<div class="paper-thumbs">' +
          exam.paperPhotos.map(function (p) {
            return '<img class="paper-thumb" src="' + p + '" data-src="' + p +
              '" data-caption="' + escAttr((exam.name || '') + ' · 试卷') + '" alt="试卷照片" onerror="this.style.display=\'none\'">';
          }).join('') +
          '</div></div>';
      }

      item.innerHTML =
        '<div class="exam-head" data-collapse-for="examBody' + idx + '">' +
          '<div><div class="exam-title">' + esc(exam.name || '考试') + '</div>' +
          '<div class="exam-date">' + exam.date + '</div></div>' +
          '<div class="exam-toggle">收起 ▲</div>' +
        '</div>' +
        '<div class="exam-body" id="examBody' + idx + '">' +
          '<table><thead><tr>' +
            '<th>科目</th><th>分数</th><th>班排名</th><th>年级排名</th>' +
          '</tr></thead><tbody>' + rowsHtml + totalHtml + '</tbody></table>' +
          papersHtml +
        '</div>';

      container.appendChild(item);
    });

    /* 考试展开/收起：容器事件委托 */
    container.addEventListener('click', function (e) {
      var head = e.target.closest('[data-collapse-for]');
      if (!head) return;
      var body = document.getElementById(head.getAttribute('data-collapse-for'));
      var toggle = head.querySelector('.exam-toggle');
      if (body.style.display === 'none') {
        body.style.display = '';
        if (toggle) toggle.textContent = '收起 ▲';
      } else {
        body.style.display = 'none';
        if (toggle) toggle.textContent = '展开 ▼';
      }
    });
  }

  /* ============ 老师评语 ============ */
  function renderComments(d) {
    var list = (d.comments || []).slice().sort(byDateDesc);
    var container = document.getElementById('commentList');
    container.innerHTML = '';

    list.forEach(function (c) {
      var attachHtml = '';
      if (c.photos && c.photos.length) {
        attachHtml = '<div class="tl-attach">' + c.photos.map(function (p) {
          return '<img src="' + p + '" data-src="' + p +
            '" data-caption="' + escAttr((c.teacher || '') + ' 的评语照片') + '" alt="评语照片" onerror="this.style.display=\'none\'">';
        }).join('') + '</div>';
      }

      var item = document.createElement('div');
      item.className = 'tl-item';
      item.innerHTML =
        '<div class="tl-head">' +
          '<span class="tl-date">' + esc(c.date || '') + '</span>' +
          '<span class="tl-teacher">' + esc(c.teacher || '') + '</span>' +
        '</div>' +
        '<div class="tl-content">' + esc(c.content || '') + '</div>' +
        attachHtml;
      container.appendChild(item);
    });
  }

  /* ============ 成长相册 ============ */
  function renderGallery(d) {
    var photos = d.photos || [];
    var grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';

    photos.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML =
        '<img src="' + p.url + '" data-src="' + p.url +
          '" data-caption="' + escAttr((p.date ? p.date + '　' : '') + (p.caption || '')) + '" alt="' + escAttr(p.caption || '照片') + '" onerror="this.parentNode.style.display=\'none\'">' +
        '<div class="gallery-caption"><b>' + esc(p.caption || '') + '</b></div>';
      grid.appendChild(item);
    });
  }

  /* ============ 图片放大查看 ============ */
  var lightbox = document.getElementById('lightbox');
  document.getElementById('lbClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox || e.target.id === 'lbImg') return;
    if (!e.target.closest('.lb-body')) closeLightbox();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });

  /* 事件委托：点击任何带 data-src 的图片放大 */
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-src]');
    if (!el) return;
    openLightbox(el.getAttribute('data-src'), el.getAttribute('data-caption') || '');
  });

  function openLightbox(src, caption) {
    document.getElementById('lbImg').src = src;
    document.getElementById('lbCaption').textContent = caption || '';
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ============ 退出登录 ============ */
  document.getElementById('logoutBtn').addEventListener('click', function () {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    location.href = 'index.html';
  });

  /* ============ 工具函数 ============ */
  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function byDateDesc(a, b) {
    var ta = +new Date(a.date || 0);
    var tb = +new Date(b.date || 0);
    return tb - ta;
  }

  function startOfWeek(d) {
    var copy = new Date(d);
    var day = (copy.getDay() + 6) % 7; /* 周一为一周开始 */
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(t) {
    return esc(t);
  }
})();