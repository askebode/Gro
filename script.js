// Kulturforeningen Gro — delt interaktion på tværs af alle sider

(function () {
    'use strict';

    // Indsæt indeværende år i footer
    var yearEl = document.querySelector('[data-year]');
    if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

    // Mål forskellen mellem 100vw og den reelle viewport-bredde, så
    // fuld-bredde farveblokke (kalenderens udfoldede begivenheder) kan
    // ramme skærmkanten præcist — på nogle platforme regner 100vw
    // scrollbaren med, men containerens % gør ikke
    var vwProbe = document.createElement('div');
    vwProbe.style.cssText = 'position:fixed; width:100vw; height:0; visibility:hidden; pointer-events:none;';
    document.documentElement.appendChild(vwProbe);
    var vwOverhang = vwProbe.getBoundingClientRect().width - document.documentElement.clientWidth;
    vwProbe.remove();
    document.documentElement.style.setProperty('--vw-overhang', vwOverhang + 'px');

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

    // Kalenderens kort "trækkes" magnetisk ind på midten af skærmen
    // (scroll-snap). Uden ekstra plads foroven kan den første begivenhed
    // aldrig nå den centrerede hvileposition — kun de andre kan. Vi
    // måler derfor, hvor meget luft der skal til for at den første
    // begivenhed allerede starter centreret, så man altid kan "lande"
    // tilbage på den, ligesom resten af listen
    var firstEventRow = eventList ? eventList.querySelector('.event-row') : null;
    function updateFirstEventSpacing() {
        if (!firstEventRow || !eventList) { return; }
        eventList.style.paddingTop = '0px';

        // Brug offsetTop (layout-baseret) i stedet for getBoundingClientRect().top
        // (maleri-baseret) — listen kan stadig være midt i sin reveal-animation
        // (translateY), som ellers ville forstyrre målingen af hvileposition
        var documentTop = 0;
        for (var el = firstEventRow; el; el = el.offsetParent) { documentTop += el.offsetTop; }
        var rowHeight = firstEventRow.getBoundingClientRect().height;
        var rowCenter = (documentTop - window.scrollY) + rowHeight / 2;

        var scrollPaddingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        var snapportCenter = scrollPaddingTop + (window.innerHeight - scrollPaddingTop) / 2;
        eventList.style.paddingTop = Math.max(0, snapportCenter - rowCenter) + 'px';
    }
    updateFirstEventSpacing();
    window.addEventListener('resize', updateFirstEventSpacing);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(updateFirstEventSpacing);
    }

    var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (eventList && 'IntersectionObserver' in window && isTouchDevice) {
        var touchEventRows = Array.prototype.slice.call(eventList.querySelectorAll('.event-row'));
        var ticking = false;

        function updateActiveEventRow() {
            ticking = false;
            var viewportCenter = window.innerHeight / 2;
            var closest = null;
            var closestDist = Infinity;
            touchEventRows.forEach(function (row) {
                var rect = row.getBoundingClientRect();
                var dist = Math.abs((rect.top + rect.height / 2) - viewportCenter);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = row;
                }
            });
            touchEventRows.forEach(function (row) { row.classList.toggle('is-active', row === closest); });
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
                    touchEventRows.forEach(function (row) { row.classList.remove('is-active'); });
                    eventList.classList.remove('has-active');
                }
            });
        }, { threshold: 0 });
        listObserver.observe(eventList);
    }

    // Kalender — "Læs mere" folder en beskrivelse ud under begivenheden.
    // Kun én begivenhed er åben ad gangen, og man kan også åbne/lukke den
    // ved at trykke på overskriften eller datoen (ikke kun selve knappen)
    var allEventRows = Array.prototype.slice.call(document.querySelectorAll('.event-row'));

    function setEventRowOpen(row, open) {
        var btn = row.querySelector('[data-event-toggle]');
        var panel = row.querySelector('.event-details-wrap');
        if (btn) { btn.setAttribute('aria-expanded', String(open)); }
        row.classList.toggle('is-open', open);
        if (panel) { panel.classList.toggle('is-open', open); }
    }

    function toggleEventRow(row) {
        var btn = row.querySelector('[data-event-toggle]');
        var willOpen = !btn || btn.getAttribute('aria-expanded') !== 'true';
        allEventRows.forEach(function (other) {
            setEventRowOpen(other, other === row ? willOpen : false);
        });

        // Lås den vandrette scrollposition mens fold-ud/sammenfold
        // animerer — layoutskiftet kan ellers udløse en glidende
        // vandret auto-scroll (scroll-anchoring + scroll-behavior:
        // smooth), som rykker hele billedet og klipper indhold
        var lockedX = window.scrollX;
        var lockUntil = Date.now() + 450;
        (function lockScrollX() {
            if (window.scrollX !== lockedX) {
                window.scrollTo({ left: lockedX, top: window.scrollY, behavior: 'instant' });
            }
            if (Date.now() < lockUntil) { window.requestAnimationFrame(lockScrollX); }
        })();
    }

    allEventRows.forEach(function (row) {
        var btn = row.querySelector('[data-event-toggle]');
        if (btn) {
            btn.addEventListener('click', function () { toggleEventRow(row); });
        }
        row.querySelectorAll('[data-event-open]').forEach(function (trigger) {
            trigger.addEventListener('click', function () { toggleEventRow(row); });
        });
    });

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
