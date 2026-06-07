// Kulturforeningen Gro — delt interaktion på tværs af alle sider

(function () {
    'use strict';

    // Indsæt indeværende år i footer
    var yearEl = document.querySelector('[data-year]');
    if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

    // Mobil-menu
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.querySelector('[data-nav]');
    if (toggle && nav) {
        toggle.addEventListener('click', function () {
            var open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!open));
            nav.setAttribute('data-open', String(!open));
        });
        nav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                toggle.setAttribute('aria-expanded', 'false');
                nav.setAttribute('data-open', 'false');
            });
        });
    }

    // Reveal-on-scroll
    var revealEls = document.querySelectorAll('[data-reveal]');
    if (revealEls.length) {
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
            revealEls.forEach(function (el) { observer.observe(el); });
        } else {
            revealEls.forEach(function (el) { el.classList.add('is-visible'); });
        }
    }

    // Kalender — fremhæv begivenheden midt i billedet, når man
    // scroller på en touch-enhed (samme effekt som hover på desktop)
    var eventList = document.querySelector('.event-list');
    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (eventList && 'IntersectionObserver' in window && isTouchDevice) {
        var eventRows = Array.prototype.slice.call(eventList.querySelectorAll('.event-row'));
        var ticking = false;

        function updateActiveEventRow() {
            ticking = false;
            var viewportCenter = window.innerHeight / 2;
            var closest = null;
            var closestDist = Infinity;
            eventRows.forEach(function (row) {
                var rect = row.getBoundingClientRect();
                var dist = Math.abs((rect.top + rect.height / 2) - viewportCenter);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = row;
                }
            });
            eventRows.forEach(function (row) { row.classList.toggle('is-active', row === closest); });
            eventList.classList.toggle('has-active', !!closest);
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(updateActiveEventRow);
            }
        }

        var listObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    window.addEventListener('scroll', onScroll, { passive: true });
                    updateActiveEventRow();
                } else {
                    window.removeEventListener('scroll', onScroll);
                    eventRows.forEach(function (row) { row.classList.remove('is-active'); });
                    eventList.classList.remove('has-active');
                }
            });
        }, { threshold: 0 });
        listObserver.observe(eventList);
    }

    // Tal-op-tællere
    var counters = document.querySelectorAll('[data-counter]');
    if (counters.length && 'IntersectionObserver' in window) {
        var counterObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                var el = entry.target;
                var target = parseInt(el.getAttribute('data-counter'), 10) || 0;
                var suffix = el.getAttribute('data-counter-suffix') || '';
                var duration = 900;
                var start = null;

                function step(timestamp) {
                    if (start === null) { start = timestamp; }
                    var progress = Math.min((timestamp - start) / duration, 1);
                    var eased = 1 - Math.pow(1 - progress, 3);
                    el.textContent = Math.round(eased * target) + suffix;
                    if (progress < 1) { window.requestAnimationFrame(step); }
                }
                window.requestAnimationFrame(step);
                counterObserver.unobserve(el);
            });
        }, { threshold: 0.6 });
        counters.forEach(function (el) { counterObserver.observe(el); });
    } else {
        counters.forEach(function (el) {
            el.textContent = (el.getAttribute('data-counter') || '0') + (el.getAttribute('data-counter-suffix') || '');
        });
    }

    // Kontaktformular (demo — ingen backend endnu)
    var form = document.querySelector('[data-contact-form]');
    if (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var status = form.querySelector('[data-form-status]');
            if (status) {
                status.textContent = 'Tak for din besked! Vi vender tilbage hurtigst muligt.';
            }
            form.reset();
        });
    }
})();
