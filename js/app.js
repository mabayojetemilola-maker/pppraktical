(function (global) {
  'use strict';

  var db = null, auth = null;
  var currentUser = null;
  var isAdmin = false;
  var products = [];
  var cart = JSON.parse(localStorage.getItem('pratikal_cart') || '[]');
  var wishlist = JSON.parse(localStorage.getItem('pratikal_wish') || '[]');

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  function toast(msg) {
    var t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  function money(n) {
    return '₦' + Number(n || 0).toLocaleString('en-NG');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function productsRef() {
    return db.collection(APP.productsCollection || 'pratikal_products');
  }

  function initFirebase() {
    if (typeof firebase === 'undefined' || !firebaseConfig.apiKey) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  function ensureUserDoc(user) {
    if (!db || !user) return Promise.resolve();
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function (snap) {
      if (!snap.exists) {
        return ref.set({
          email: user.email,
          role: (APP.ownerEmail && user.email === APP.ownerEmail) ? 'admin' : 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      if (APP.ownerEmail && user.email === APP.ownerEmail && snap.data().role !== 'admin') {
        return ref.update({ role: 'admin' });
      }
    });
  }

  function checkAdmin(user) {
    if (!user) { isAdmin = false; return Promise.resolve(false); }
    if (APP.ownerEmail && user.email === APP.ownerEmail) {
      isAdmin = true;
      return Promise.resolve(true);
    }
    if (!db) { isAdmin = false; return Promise.resolve(false); }
    return db.collection('users').doc(user.uid).get().then(function (snap) {
      isAdmin = !!(snap.exists && snap.data().role === 'admin');
      return isAdmin;
    }).catch(function () { isAdmin = false; return false; });
  }

  function updateAuthUI() {
    var chip = $('#userChip');
    var adminBar = $('#adminBar');
    var adminLinks = $all('[data-admin-only]');
    if (chip) {
      if (currentUser) {
        chip.style.display = 'block';
        chip.textContent = currentUser.email.split('@')[0];
      } else chip.style.display = 'none';
    }
    if (adminBar) {
      if (isAdmin) adminBar.classList.add('show');
      else adminBar.classList.remove('show');
    }
    adminLinks.forEach(function (el) {
      el.style.display = isAdmin ? '' : 'none';
    });
    updateCartBadge();
    updateWishBadge();
  }

  function saveCart() {
    localStorage.setItem('pratikal_cart', JSON.stringify(cart));
    updateCartBadge();
  }

  function updateCartBadge() {
    var n = cart.reduce(function (s, i) { return s + i.qty; }, 0);
    $all('.cart-badge').forEach(function (b) {
      b.textContent = n;
      b.style.display = n ? 'flex' : 'none';
    });
  }

  function updateWishBadge() {
    $all('.wish-badge').forEach(function (b) {
      b.textContent = wishlist.length;
      b.style.display = wishlist.length ? 'flex' : 'none';
    });
  }

  function addToCart(product, qty) {
    qty = qty || 1;
    var ex = cart.find(function (c) { return c.id === product.id; });
    if (ex) ex.qty += qty;
    else {
      cart.push({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        image: product.imageUrl || '',
        qty: qty
      });
    }
    saveCart();
    toast('Added to cart');
  }

  function setQty(id, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    cart.forEach(function (c) {
      if (c.id === id) c.qty = qty;
    });
    saveCart();
  }

  function toggleWish(id) {
    var i = wishlist.indexOf(id);
    if (i >= 0) wishlist.splice(i, 1);
    else wishlist.push(id);
    localStorage.setItem('pratikal_wish', JSON.stringify(wishlist));
    updateWishBadge();
    toast(i >= 0 ? 'Removed from wishlist' : 'Saved to wishlist');
  }

  function demoProducts() {
    return [
      { id: 'd1', name: 'Wireless Earbuds Pro', description: 'Clear sound, long battery — everyday essentials.', price: 18500, category: 'Electronics', imageUrl: '' },
      { id: 'd2', name: 'Classic Cotton Tee', description: 'Soft fit for daily wear. Mixed sizes available.', price: 7500, category: 'Fashion', imageUrl: '' },
      { id: 'd3', name: 'Home Organiser Set', description: 'Keep your space practical and tidy.', price: 12000, category: 'Home', imageUrl: '' },
      { id: 'd4', name: 'Sports Cap', description: 'Lightweight cap for sun and style.', price: 4500, category: 'Fashion', imageUrl: '' },
      { id: 'd5', name: 'Power Bank 20000mAh', description: 'Charge on the go — dual ports.', price: 22000, category: 'Electronics', imageUrl: '' },
      { id: 'd6', name: 'Kitchen Mixer Bowl Set', description: 'Durable set for home cooking.', price: 15000, category: 'Home', imageUrl: '' }
    ];
  }

  function loadProducts(callback) {
    if (!db) {
      products = demoProducts();
      if (callback) callback(products);
      return;
    }
    productsRef().orderBy('createdAt', 'desc').onSnapshot(function (snap) {
      products = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        if (d.active !== false) products.push(d);
      });
      if (!products.length) products = demoProducts();
      if (callback) callback(products);
    }, function () {
      products = demoProducts();
      if (callback) callback(products);
    });
  }

  function renderProductGrid(el, list) {
    if (!el) return;
    list = list || products;
    if (!list.length) {
      el.innerHTML = '<p class="empty-note">No products yet.</p>';
      return;
    }
    el.innerHTML = list.map(function (p) {
      var img = p.imageUrl
        ? '<img src="' + escapeHtml(p.imageUrl) + '" alt="">'
        : '<div class="ph">▣</div>';
      var wished = wishlist.indexOf(p.id) >= 0;
      var href = 'product.html?id=' + encodeURIComponent(p.id);
      return (
        '<article class="product-card">' +
          '<a class="product-img" href="' + href + '">' +
            img +
            '<button type="button" class="wish-btn' + (wished ? ' on' : '') + '" data-wish="' + escapeHtml(p.id) + '" aria-label="Wishlist">♥</button>' +
          '</a>' +
          '<div class="product-body">' +
            '<div class="cat">' + escapeHtml(p.category || 'General') + '</div>' +
            '<h3><a href="' + href + '">' + escapeHtml(p.name) + '</a></h3>' +
            '<p>' + escapeHtml(p.description || '') + '</p>' +
            '<div class="product-foot">' +
              '<div class="price">' + money(p.price) + '</div>' +
              '<button type="button" class="btn btn-accent btn-sm btn-add" data-id="' + escapeHtml(p.id) + '">Add to cart</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
    $all('.btn-add', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var p = products.find(function (x) { return x.id === id; });
        if (p) addToCart(p);
      });
    });
    $all('.wish-btn', el).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleWish(btn.getAttribute('data-wish'));
        btn.classList.toggle('on');
      });
    });
  }

  function bindNav() {
    var hb = $('#menuBtn');
    var mm = $('#mobileMenu');
    if (hb && mm) {
      hb.addEventListener('click', function () {
        hb.classList.toggle('open');
        mm.classList.toggle('open');
      });
      $all('a', mm).forEach(function (a) {
        a.addEventListener('click', function () {
          hb.classList.remove('open');
          mm.classList.remove('open');
        });
      });
    }
  }

  function onAuth(cb) {
    if (!auth) {
      currentUser = null;
      isAdmin = false;
      updateAuthUI();
      if (cb) cb(null);
      return;
    }
    auth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (user) {
        ensureUserDoc(user).then(function () { return checkAdmin(user); }).then(function () {
          updateAuthUI();
          if (cb) cb(user);
        });
      } else {
        isAdmin = false;
        updateAuthUI();
        if (cb) cb(null);
      }
    });
  }

  function payWithPaystack(opts) {
    opts = opts || {};
    if (typeof PaystackPop === 'undefined') {
      toast('Payment script not loaded');
      return;
    }
    var amount = opts.amount;
    if (!amount || amount < 100) {
      toast('Invalid amount');
      return;
    }
    var handler = PaystackPop.setup({
      key: APP.paystackPublicKey,
      email: opts.email,
      amount: Math.round(amount * 100),
      currency: 'NGN',
      ref: 'PRATIKAL_' + Date.now(),
      metadata: {
        custom_fields: [
          { display_name: 'Full Name', variable_name: 'customer_name', value: opts.name || '' },
          { display_name: 'Phone', variable_name: 'phone', value: opts.phone || '' },
          { display_name: 'Street', variable_name: 'street', value: opts.street || '' },
          { display_name: 'City', variable_name: 'city', value: opts.city || '' },
          { display_name: 'State', variable_name: 'state', value: opts.state || '' },
          { display_name: 'Full Address', variable_name: 'address', value: opts.fullAddress || '' }
        ]
      },
      callback: function (response) {
        var order = {
          email: opts.email,
          name: opts.name || '',
          phone: opts.phone || '',
          street: opts.street || '',
          city: opts.city || '',
          state: opts.state || '',
          address: opts.fullAddress || '',
          items: cart.slice(),
          total: amount,
          reference: response.reference,
          status: 'paid',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (currentUser) order.userId = currentUser.uid;
        if (db) {
          db.collection('pratikal_orders').add(order).catch(function () {});
        }
        cart = [];
        saveCart();
        toast('Payment successful! Order saved.');
        setTimeout(function () { location.href = 'index.html?paid=1'; }, 1400);
      },
      onClose: function () { toast('Payment window closed'); }
    });
    handler.openIframe();
  }

  global.Store = {
    init: function (opts) {
      opts = opts || {};
      initFirebase();
      bindNav();
      updateCartBadge();
      updateWishBadge();
      onAuth(function () { if (opts.onReady) opts.onReady(); });
      if (opts.loadProducts) {
        loadProducts(function (list) {
          if (opts.onProducts) opts.onProducts(list);
        });
      }
    },
    toast: toast,
    money: money,
    escapeHtml: escapeHtml,
    getCart: function () { return cart; },
    setCart: function (c) { cart = c; saveCart(); },
    setQty: setQty,
    addToCart: addToCart,
    saveCart: saveCart,
    loadProducts: loadProducts,
    renderProductGrid: renderProductGrid,
    getProducts: function () { return products; },
    getUser: function () { return currentUser; },
    getIsAdmin: function () { return isAdmin; },
    getDb: function () { return db; },
    getAuth: function () { return auth; },
    productsRef: productsRef,
    payWithPaystack: payWithPaystack,
    login: function (email, pass) { return auth.signInWithEmailAndPassword(email, pass); },
    register: function (email, pass) {
      return auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
        return ensureUserDoc(cred.user).then(function () { return cred; });
      });
    },
    logout: function () { return auth ? auth.signOut() : Promise.resolve(); }
  };
})(window);
