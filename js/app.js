(function () {
  "use strict";

  var $ = function (sel, el) {
    return (el || document).querySelector(sel);
  };

  /* ---------- storage: IndexedDB, fallback to localStorage, then memory ---------- */
  var DB_NAME = "xiangpiaopiao-works";
  var STORE = "works";
  var LS_KEY = "xiangpiaopiao-works-v1";
  var mode = "idb";
  var mem = [];

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbRequest(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve, reject) {
        setTimeout(function () {
          reject(new Error("idb-timeout"));
        }, ms || 2500);
      })
    ]);
  }

  var storage = {
    getAll: function () {
      if (mode === "idb") {
        return withTimeout(openDB()
          .then(function (db) {
            var tx = db.transaction(STORE, "readonly");
            return idbRequest(tx.objectStore(STORE).getAll());
          })
          .then(function (rows) {
            return rows.sort(function (a, b) {
              return b.createdAt - a.createdAt;
            });
          }))
          .catch(function () {
            mode = "ls";
            return storage.getAll();
          });
      }
      if (mode === "ls") {
        try {
          return Promise.resolve(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
        } catch (e) {
          mode = "mem";
          return storage.getAll();
        }
      }
      return Promise.resolve(mem.slice().sort(function (a, b) {
        return b.createdAt - a.createdAt;
      }));
    },
    add: function (work) {
      if (mode === "idb") {
        return withTimeout(openDB()
          .then(function (db) {
            var tx = db.transaction(STORE, "readwrite");
            return idbRequest(tx.objectStore(STORE).put(work));
          }))
          .catch(function () {
            mode = "ls";
            return storage.add(work);
          });
      }
      if (mode === "ls") {
        return storage.getAll().then(function (rows) {
          rows.unshift(work);
          localStorage.setItem(LS_KEY, JSON.stringify(rows));
        });
      }
      mem.unshift(work);
      return Promise.resolve();
    },
    remove: function (id) {
      if (mode === "idb") {
        return withTimeout(openDB()
          .then(function (db) {
            var tx = db.transaction(STORE, "readwrite");
            return idbRequest(tx.objectStore(STORE).delete(id));
          }))
          .catch(function () {
            mode = "ls";
            return storage.remove(id);
          });
      }
      if (mode === "ls") {
        return storage.getAll().then(function (rows) {
          localStorage.setItem(
            LS_KEY,
            JSON.stringify(rows.filter(function (w) {
              return w.id !== id;
            }))
          );
        });
      }
      mem = mem.filter(function (w) {
        return w.id !== id;
      });
      return Promise.resolve();
    }
  };

  /* ---------- helpers ---------- */
  function makeId() {
    return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    var p = function (n) {
      return String(n).padStart(2, "0");
    };
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate());
  }

  function fileNameWithoutExt(name) {
    return name.replace(/\.[^.]+$/, "");
  }

  function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("read-error"));
      };
      img.src = url;
    });
  }

  var toastTimer = null;
  function toast(message) {
    var el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 2600);
  }

  function burstConfetti(count) {
    count = count || 36;
    var colors = ["#c33d2e", "#d9a23f", "#fffdf8", "#2b2118"];
    for (var i = 0; i < count; i++) {
      var p = document.createElement("span");
      p.className = "confetti";
      var w = 6 + Math.random() * 8;
      p.style.width = w + "px";
      p.style.height = w * (0.7 + Math.random() * 0.9) + "px";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.setProperty("--dur", (2.2 + Math.random() * 2.2) + "s");
      p.style.setProperty("--delay", (Math.random() * 0.45) + "s");
      p.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      document.body.appendChild(p);
      setTimeout(function (node) {
        node.remove();
      }, 5600, p);
    }
  }

  /* ---------- render ---------- */
  var grid = $("#worksGrid");
  var empty = $("#emptyState");

  function render(rows) {
    grid.textContent = "";
    rows.forEach(function (work, index) {
      var li = document.createElement("li");
      li.className = "work-card";
      li.style.animationDelay = Math.min(index * 0.06, 0.5) + "s";

      var img = document.createElement("img");
      img.className = "work-card__thumb";
      img.src = work.src;
      img.alt = work.name || "作品照片";
      img.loading = "lazy";

      var body = document.createElement("div");
      body.className = "work-card__body";

      var name = document.createElement("p");
      name.className = "work-card__name";
      name.textContent = work.name || "未命名作品";

      var note = document.createElement("p");
      note.className = "work-card__note";
      note.textContent = work.note || "";
      if (!work.note) {
        note.hidden = true;
      }

      var date = document.createElement("p");
      date.className = "work-card__date";
      date.textContent = "加入于 " + formatDate(work.createdAt);

      body.appendChild(name);
      body.appendChild(note);
      body.appendChild(date);

      var del = document.createElement("button");
      del.className = "work-card__delete";
      del.type = "button";
      del.setAttribute("aria-label", "删除作品「" + (work.name || "未命名") + "」");
      del.textContent = "×";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        var label = work.name || "未命名作品";
        if (window.confirm("删除「" + label + "」？这个操作不能撤销。")) {
          storage.remove(work.id).then(function () {
            toast("已删除「" + label + "」");
            refresh();
          });
        }
      });

      li.appendChild(img);
      li.appendChild(body);
      li.appendChild(del);

      li.addEventListener("click", function () {
        openLightbox(work);
      });

      grid.appendChild(li);
    });
    empty.hidden = rows.length > 0;
  }

  function refresh() {
    storage.getAll().then(render);
  }

  /* ---------- lightbox ---------- */
  var lightbox = $("#lightbox");
  var lightboxImg = $("#lightboxImg");
  var lightboxCaption = $("#lightboxCaption");

  function openLightbox(work) {
    lightboxImg.src = work.src;
    lightboxImg.alt = work.name || "作品照片";
    lightboxCaption.textContent = work.name
      ? work.name + (work.note ? " · " + work.note : "")
      : "";
    lightbox.hidden = false;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }

  $("#lightbox .lightbox__close").addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  /* ---------- upload ---------- */
  var fileInput = $("#fileInput");
  var pending = [];

  function openPicker() {
    fileInput.value = "";
    fileInput.click();
  }

  $$("[data-open-picker]").forEach(function (btn) {
    btn.addEventListener("click", openPicker);
  });

  var uploadBar = $("#uploadBar");
  uploadBar.addEventListener("click", openPicker);
  uploadBar.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    uploadBar.addEventListener(evt, function (e) {
      e.preventDefault();
      uploadBar.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach(function (evt) {
    uploadBar.addEventListener(evt, function (e) {
      e.preventDefault();
      uploadBar.classList.remove("is-dragover");
    });
  });

  uploadBar.addEventListener("drop", function (e) {
    var files = Array.prototype.slice.call(e.dataTransfer.files || []).filter(function (f) {
      return f.type.indexOf("image/") === 0;
    });
    if (files.length) {
      handleFiles(files);
    }
  });

  fileInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    if (files.length) {
      handleFiles(files);
    }
  });

  function handleFiles(files) {
    if (files.length === 1) {
      compressImage(files[0])
        .then(function (dataUrl) {
          pending = [{ name: fileNameWithoutExt(files[0].name), note: "", src: dataUrl }];
          $("#dialogPreview").src = dataUrl;
          $("#workName").value = pending[0].name;
          $("#workNote").value = "";
          $("#dialog").hidden = false;
          $("#workName").focus();
        })
        .catch(function () {
          toast("这张图片无法读取，请换一张试试");
        });
      return;
    }

    var results = files.map(function (file) {
      return compressImage(file).then(function (dataUrl) {
        return {
          name: fileNameWithoutExt(file.name),
          note: "",
          src: dataUrl
        };
      });
    });

    Promise.all(results).then(function (works) {
      var tasks = works.map(function (work) {
        work.id = makeId();
        work.createdAt = Date.now();
        return storage.add(work);
      });
      return Promise.all(tasks).then(function () {
        toast("已添加 " + works.length + " 张作品");
        burstConfetti();
        refresh();
      });
    }).catch(function () {
      toast("部分图片无法读取，请检查格式（建议 JPG/PNG）");
    });
  }

  $("#dialogCancel").addEventListener("click", function () {
    $("#dialog").hidden = true;
    pending = [];
  });

  $("#dialogSave").addEventListener("click", function () {
    var work = pending[0];
    if (!work) {
      return;
    }
    work.id = makeId();
    work.name = $("#workName").value.trim() || "未命名作品";
    work.note = $("#workNote").value.trim();
    work.createdAt = Date.now();
    storage.add(work).then(function () {
      $("#dialog").hidden = true;
      pending = [];
      toast("已添加作品「" + work.name + "」");
      burstConfetti();
      refresh();
    });
  });

  $("#dialog").addEventListener("click", function (e) {
    if (e.target === $("#dialog")) {
      $("#dialog").hidden = true;
      pending = [];
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeLightbox();
      $("#dialog").hidden = true;
    }
  });

  /* ---------- seed + start ---------- */
  var SEED_KEY = "xiangpiaopiao-seeded-v1";
  var seeded = false;
  try {
    seeded = localStorage.getItem(SEED_KEY) === "1";
  } catch (e) {
    seeded = false;
  }

  var seedCard = {
    id: makeId(),
    name: "香飘飘",
    note: "新的作品，新的开始。",
    src: "assets/hero.jpg",
    createdAt: Date.now()
  };

  if (!seeded) {
    render([seedCard]);
  }

  storage.getAll().then(function (rows) {
    var changed = [];
    rows.forEach(function (w) {
      if (w.src === "assets/hero.jpg" && w.name === "开工大吉") {
        w.name = "香飘飘";
        w.note = "新的作品，新的开始。";
        changed.push(w);
      }
    });
    var tasks = changed.map(function (w) {
      return storage.add(w);
    });
    return Promise.all(tasks).then(function () {
      if (rows.length === 0 && !seeded) {
        return storage.add(seedCard).then(function () {
          try {
            localStorage.setItem(SEED_KEY, "1");
          } catch (e) {
            /* ignore */
          }
          refresh();
        });
      }
      render(rows);
    });
  });
})();

/* small helper for querying multiple elements */
function $$(sel, el) {
  return Array.prototype.slice.call((el || document).querySelectorAll(sel));
}
