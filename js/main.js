// ═══════════════════════════════════
// STEG EINS — Main JavaScript
// ═══════════════════════════════════

(function () {
  'use strict';

  // ── Supabase Config (anon key ist public, designed for browser use) ──
  var SUPABASE_URL = 'https://tdnnfmfaymnzukjhoidq.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbm5mbWZheW1uenVramhvaWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3ODEzNTMsImV4cCI6MjA5MDM1NzM1M30.xS-xcS6Ds1Rtaz_7qh24arNPQ2EDgH6AtDZAONqvLIg';

  // ── Öffnungsstatus (direkt von Supabase, mit Cache) ──
  async function fetchOpeningStatus() {
    var CACHE_KEY = 'steg1_status_cache';
    var CACHE_DURATION = 5 * 60 * 1000;

    try {
      var cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        var cacheData = JSON.parse(cached);
        if (Date.now() - cacheData.timestamp < CACHE_DURATION) {
          return cacheData.is_open;
        }
      }
    } catch (e) {
      localStorage.removeItem(CACHE_KEY);
    }

    try {
      var response = await fetch(
        SUPABASE_URL + '/rest/v1/opening_status?id=eq.1&select=is_open,manual_override,override_until',
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          }
        }
      );

      var data = await response.json();
      if (!data || data.length === 0) throw new Error('No data');

      var isOpen = data[0].is_open;

      // Override prüfen
      if (data[0].manual_override && data[0].override_until) {
        var now = new Date();
        var overrideUntil = new Date(data[0].override_until);
        if (now >= overrideUntil) {
          // Override abgelaufen — zeitbasierte Logik
          var h = now.getHours();
          var d = now.getDay();
          isOpen = (d >= 1 && d <= 5 && h >= 11 && h < 22) ||
                   ((d === 0 || d === 6) && h >= 10 && h < 23);
        }
      }

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        is_open: isOpen,
        timestamp: Date.now()
      }));

      return isOpen;
    } catch (err) {
      // Fallback: zeitbasierte Logik
      var now = new Date();
      var h = now.getHours();
      var d = now.getDay();
      return (d >= 1 && d <= 5 && h >= 11 && h < 22) ||
             ((d === 0 || d === 6) && h >= 10 && h < 23);
    }
  }

  async function updateStatus() {
    const isOpen = await fetchOpeningStatus();

    const dot = document.getElementById('dot');
    const stxt = document.getElementById('stxt');
    const ssub = document.getElementById('ssub');
    if (!dot || !stxt || !ssub) return;

    const wbarStatus = document.getElementById('wbar-status');
    const wbarHours = document.getElementById('wbar-hours');

    const now = new Date();
    const d = now.getDay();

    if (isOpen) {
      dot.classList.remove('closed');
      stxt.textContent = 'Heute geöffnet';
      ssub.textContent = (d === 0 || d === 6)
        ? '10:00 – 23:00 Uhr'
        : '11:00 – 22:00 Uhr';
      if (wbarStatus) wbarStatus.textContent = 'Geöffnet';
      if (wbarHours) wbarHours.textContent = ssub.textContent;
    } else {
      dot.classList.add('closed');
      stxt.textContent = 'Heute geschlossen';
      const tomorrow = (d + 1) % 7;
      const openHour = (tomorrow === 0 || tomorrow === 6) ? '10:00' : '11:00';
      ssub.textContent = 'Morgen ab ' + openHour + ' Uhr wieder da';
      if (wbarStatus) wbarStatus.textContent = 'Geschlossen';
      if (wbarHours) wbarHours.textContent = 'Morgen ab ' + openHour;
    }
  }

  updateStatus();

  // ── Nav Scroll Effect ──
  const nav = document.querySelector('nav');

  if (nav) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // ── Mobile Menu ──
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu on link click
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ── Reveal on Scroll ──
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );

  document.querySelectorAll('.reveal').forEach(function (el) {
    observer.observe(el);
  });

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = nav.offsetHeight + 10;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

})();
