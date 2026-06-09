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
            touchEventRows.forEach(function (row) {
                var wasActive = row.classList.contains('is-active');
                var willBeActive = row === closest;
                row.classList.toggle('is-active', willBeActive);
                if (willBeActive && !wasActive && row._marqueeStart) row._marqueeStart();
                if (!willBeActive && wasActive && row._marqueeStop) row._marqueeStop();
            });
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

    // Forudsiger hvor en begivenhed lander, når den foldes ud (og en
    // evt. anden åben begivenhed ovenover folder sig sammen), og
    // beregner hvilken scroll-position der placerer den pænt i vinduet:
    // centreret hvis den kan være der, ellers med toppen lige under
    // den klæbende header, så man kan læse den fra starten
    function predictOpenScrollTarget(row) {
        var rowRect = row.getBoundingClientRect();
        var detailsInner = row.querySelector('.event-details-inner');
        var predictedHeight = rowRect.height + (detailsInner ? detailsInner.offsetHeight : 0);

        var shiftAbove = 0;
        allEventRows.forEach(function (other) {
            if (other === row) { return; }
            var otherBtn = other.querySelector('[data-event-toggle]');
            var isOpen = otherBtn && otherBtn.getAttribute('aria-expanded') === 'true';
            if (!isOpen) { return; }
            var otherRect = other.getBoundingClientRect();
            if (otherRect.top < rowRect.top) {
                var otherDetailsInner = other.querySelector('.event-details-inner');
                shiftAbove -= (otherDetailsInner ? otherDetailsInner.offsetHeight : 0);
            }
        });

        var predictedTop = rowRect.top + shiftAbove;
        var scrollPaddingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        var availableHeight = window.innerHeight - scrollPaddingTop;
        var delta;
        if (predictedHeight <= availableHeight) {
            var areaCenter = scrollPaddingTop + availableHeight / 2;
            delta = (predictedTop + predictedHeight / 2) - areaCenter;
        } else {
            delta = predictedTop - scrollPaddingTop;
        }
        return Math.max(0, window.scrollY + delta);
    }

    function toggleEventRow(row) {
        var btn = row.querySelector('[data-event-toggle]');
        var willOpen = !btn || btn.getAttribute('aria-expanded') !== 'true';
        var scrollTarget;
        if (willOpen) {
            scrollTarget = predictOpenScrollTarget(row);
        } else {
            // Closing: center the compact row (without the open panel)
            var rowRect = row.getBoundingClientRect();
            var wrap = row.querySelector('.event-details-wrap');
            var panelHeight = wrap ? wrap.getBoundingClientRect().height : 0;
            var compactHeight = rowRect.height - panelHeight;
            var scrollPaddingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            var snapportCenter = scrollPaddingTop + (window.innerHeight - scrollPaddingTop) / 2;
            var delta = (rowRect.top + compactHeight / 2) - snapportCenter;
            scrollTarget = Math.max(0, window.scrollY + delta);
        }

        allEventRows.forEach(function (other) {
            setEventRowOpen(other, other === row ? willOpen : false);
        });

        // Lås den vandrette scrollposition og — når en begivenhed åbnes —
        // animer samtidig hen til dens plads i vinduet, i ét samlet loop
        // (to separate scrollTo-kald ville nemt afbryde hinanden).
        // Den vandrette lås er nødvendig fordi layoutskiftet ellers kan
        // udløse en glidende vandret auto-scroll (scroll-anchoring +
        // scroll-behavior: smooth), som rykker hele billedet og klipper
        // indhold
        var lockedX = window.scrollX;
        var startY = window.scrollY;
        var startTime = Date.now();
        var scrollDuration = 420; // matcher fold-ud-animationens varighed
        var lockDuration = 450;
        (function animate() {
            var elapsed = Date.now() - startTime;
            var targetY = startY;
            if (scrollTarget !== null) {
                var t = Math.min(elapsed / scrollDuration, 1);
                var eased = 1 - Math.pow(1 - t, 3);
                targetY = startY + (scrollTarget - startY) * eased;
            }
            if (window.scrollX !== lockedX || Math.round(window.scrollY) !== Math.round(targetY)) {
                window.scrollTo({ left: lockedX, top: targetY, behavior: 'instant' });
            }
            var stillScrolling = scrollTarget !== null && elapsed < scrollDuration;
            var stillLocking = elapsed < lockDuration;
            if (stillScrolling || stillLocking) { window.requestAnimationFrame(animate); }
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

    // Event title ticker — seamless infinite one-way scroll on hover
    allEventRows.forEach(function (row) {
        var h3 = row.querySelector('h3');
        if (!h3) return;
        var inner = document.createElement('span');
        inner.className = 'event-title-inner';
        while (h3.firstChild) { inner.appendChild(h3.firstChild); }
        h3.appendChild(inner);
        var originalText = inner.textContent;
        var isRunning = false;

        function start() {
            if (isRunning) return;
            var originalWidth = inner.offsetWidth;
            var overflow = h3.scrollWidth - h3.offsetWidth;
            if (overflow < 6) return;
            isRunning = true;
            var gap = 80;
            var spacer = document.createElement('span');
            spacer.className = 'event-title-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            spacer.style.cssText = 'display:inline-block;width:' + gap + 'px';
            var clone = document.createElement('span');
            clone.className = 'event-title-clone';
            clone.setAttribute('aria-hidden', 'true');
            clone.textContent = originalText;
            inner.appendChild(spacer);
            inner.appendChild(clone);
            var scrollDist = originalWidth + gap;
            var dur = (scrollDist / 80).toFixed(2);
            h3.style.setProperty('--marquee-scroll', scrollDist + 'px');
            h3.style.setProperty('--marquee-dur', dur + 's');
            h3.classList.add('is-marquee');
        }
        function stop() {
            if (!isRunning) return;
            isRunning = false;
            h3.classList.remove('is-marquee');
            inner.querySelectorAll('.event-title-spacer, .event-title-clone')
                .forEach(function (el) { el.remove(); });
        }

        row.addEventListener('mouseenter', start);
        row.addEventListener('mouseleave', stop);
        row._marqueeStart = start;
        row._marqueeStop = stop;
    });

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

// Frontpage load reveal — class is set in HTML; just clean up after animation
(function () {
    var main = document.getElementById('main');
    if (!main || !main.classList.contains('page-reveal')) return;
    main.addEventListener('animationend', function () {
        main.classList.remove('page-reveal');
    }, { once: true });
})();

// Kinetic Kalender headline — works on all browsers (JS drives the animation;
// a short CSS transition smooths between scroll frames)
(function () {
    var label = document.querySelector('.event-list-label');
    if (!label) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // exitScrollY = scroll position at which the label has fully exited the top
    // of the viewport. At scrollY=0 (page top) → bold/tight (p=0).
    // At exitScrollY → light/airy (p=1). Use offsetTop traversal so CSS
    // transforms (page-reveal animation) don't skew the measurement.
    var exitScrollY = 0;

    function calibrate() {
        var top = 0;
        for (var el = label; el; el = el.offsetParent) { top += el.offsetTop; }
        exitScrollY = Math.max(1, top + label.offsetHeight);
    }

    calibrate();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(calibrate); }
    window.addEventListener('resize', calibrate);

    function update() {
        var scrollY = window.scrollY || window.pageYOffset;
        var p = Math.max(0, Math.min(1, scrollY / exitScrollY));
        label.style.fontVariationSettings =
            '"opsz" ' + (144 - p * 120).toFixed(0) +
            ', "wght" ' + (640 - p * 340).toFixed(0) +
            ', "SOFT" ' + (p * 100).toFixed(0);
        label.style.letterSpacing = (-0.04 + p * 0.08).toFixed(4) + 'em';
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
})();

// Wildflower background — blomster der popper op som ukrudt
(function () {
    var IMGS = [
        'assets/img/flowers/1000009397.jpg',
        'assets/img/flowers/1000009398.jpg',
        'assets/img/flowers/1000009399.jpg',
        'assets/img/flowers/1000009400.jpg',
        'assets/img/flowers/1000009401.jpg',
        'assets/img/flowers/1000009402.jpg',
        'assets/img/flowers/1000009403.jpg',
        'assets/img/flowers/1000009404.jpg',
        'assets/img/flowers/1000009405.jpg',
        'assets/img/flowers/1000009406.jpg',
        'assets/img/flowers/1000009407.jpg',
        'assets/img/flowers/1000009408.jpg',
        'assets/img/flowers/1000009409.jpg',
        'assets/img/flowers/1000009410.jpg',
        'assets/img/flowers/1000009411.jpg',
        'assets/img/flowers/1000009412.jpg',
        'assets/img/flowers/1000009413.jpg',
    ];

    var MAX = 8;
    var active = 0;
    var used = [];
    var flowers = [];

    var MAX_BURST = 6;
    var burstActive = 0;
    var burstFlowers = [];  // live burst flowers (for spawn cap)
    var burstEls = [];      // all burst flowers in DOM incl. fading (for parallax)

    var layer = document.createElement('div');
    layer.className = 'weed-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    function pickImage() {
        // Avoid repeating the last 4 images
        var pool = IMGS.filter(function (s) { return used.indexOf(s) === -1; });
        if (!pool.length) { pool = IMGS.slice(); used = []; }
        var src = pool[Math.floor(Math.random() * pool.length)];
        used.push(src);
        if (used.length > 4) { used.shift(); }
        return src;
    }

    function rand(min, max) { return min + Math.random() * (max - min); }

    function spawn() {
        if (active >= MAX) { return schedule(); }
        active++;

        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var w  = rand(50, 80);
        var h  = w * rand(0.62, 0.88);

        // Restrict to left/right edges on wider screens
        var x;
        if (vw > 900) {
            x = Math.random() < 0.5
                ? rand(0, vw * 0.18)
                : rand(vw * 0.82, vw - w);
        } else {
            x = rand(0, vw - w);
        }
        x = Math.max(0, Math.min(vw - w, x));

        var y   = rand(vh * 0.1, vh * 0.78);
        var dur = rand(11, 20);
        var op  = rand(0.18, 0.30);

        var el = document.createElement('img');
        el.src = pickImage();
        el.className = 'weed-flower';
        el.alt = '';
        el.style.cssText =
            'left:' + x.toFixed(1) + 'px;' +
            'top:'  + y.toFixed(1) + 'px;' +
            'width:'  + w.toFixed(1) + 'px;' +
            'height:' + h.toFixed(1) + 'px;' +
            '--op:'  + op.toFixed(3) + ';' +
            '--dur:' + dur.toFixed(1) + 's;';

        el._baseScrollY = window.scrollY || window.pageYOffset;
        el._scrollSpeed = rand(0.10, 0.28);

        el.addEventListener('animationend', function () {
            flowers = flowers.filter(function (f) { return f !== el; });
            el.remove();
            active--;
            schedule();
        });

        layer.appendChild(el);
        flowers.push(el);
        schedule();
    }

    function schedule() {
        setTimeout(spawn, rand(2200, 5000));
    }

    function spawnBurst() {
        if (burstActive >= MAX_BURST) return;
        burstActive++;

        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var w = rand(45, 75);
        var h = w * rand(0.62, 0.88);
        var x;
        if (vw > 900) {
            x = Math.random() < 0.5 ? rand(0, vw * 0.2) : rand(vw * 0.8, vw - w);
        } else {
            x = rand(0, vw - w);
        }
        x = Math.max(0, Math.min(vw - w, x));
        var y = rand(vh * 0.05, vh * 0.88);
        var op = rand(0.16, 0.28);

        var el = document.createElement('img');
        el.src = pickImage();
        el.className = 'weed-flower weed-flower--burst';
        el.alt = '';
        el.style.cssText =
            'left:' + x.toFixed(1) + 'px;' +
            'top:' + y.toFixed(1) + 'px;' +
            'width:' + w.toFixed(1) + 'px;' +
            'height:' + h.toFixed(1) + 'px;' +
            '--op:' + op.toFixed(3) + ';';

        el._baseScrollY = window.scrollY || window.pageYOffset;
        el._scrollSpeed = rand(0.10, 0.28);

        layer.appendChild(el);
        burstFlowers.push(el);
        burstEls.push(el);
    }

    function fadeOutBursts() {
        var toFade = burstFlowers.slice();
        burstFlowers = [];
        toFade.forEach(function (el) {
            if (el.classList.contains('is-fading')) return;
            el.classList.add('is-fading');
            burstActive--;
            var rem = el;
            setTimeout(function () {
                rem.remove();
                burstEls = burstEls.filter(function (f) { return f !== rem; });
            }, 2200);
        });
    }

    // Scroll-driven parallax drift + burst spawning
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var scrollBurstTimer = null;
        var lastBurstSpawn = 0;

        window.addEventListener('scroll', function () {
            var sy = window.scrollY || window.pageYOffset;
            var now = Date.now();

            // Parallax — ambient flowers
            flowers.forEach(function (f) {
                var drift = -(sy - f._baseScrollY) * f._scrollSpeed;
                f.style.transform = 'translateY(' + drift.toFixed(1) + 'px)';
            });

            // Parallax — burst flowers (live + fading)
            burstEls.forEach(function (f) {
                var drift = -(sy - f._baseScrollY) * f._scrollSpeed;
                f.style.transform = 'translateY(' + drift.toFixed(1) + 'px)';
            });

            // Spawn one burst flower per throttle window
            if (now - lastBurstSpawn > 300) {
                lastBurstSpawn = now;
                spawnBurst();
            }

            // Fade out bursts 500ms after scroll stops
            clearTimeout(scrollBurstTimer);
            scrollBurstTimer = setTimeout(fadeOutBursts, 500);
        }, { passive: true });
    }

    // Staggered initial blooms — start immediately so flowers are present on load
    [0, 0, 100, 300, 700, 1200, 2000, 3500].forEach(function (t) {
        setTimeout(spawn, t);
    });
})();
