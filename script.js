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

    // Mål header-højden, så undersidens forsidefarve kan strække sig
    // helt op under den gennemsigtige header
    var headerEl = document.querySelector('.site-header');
    function updateHeaderHeight() {
        document.documentElement.style.setProperty('--header-h', headerEl.getBoundingClientRect().height + 'px');
    }
    if (headerEl) {
        updateHeaderHeight();
        window.addEventListener('resize', updateHeaderHeight);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(updateHeaderHeight);
        }
    }

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
            link.addEventListener('click', function (event) {
                if (nav.getAttribute('data-open') !== 'true') return;
                // Lad menuen lukke sig blødt, før vi navigerer videre —
                // ellers springer den åbne menu instant væk, fordi
                // sidehovedet skiftes uden animation ved view transitions
                event.preventDefault();
                var href = link.href;
                toggle.setAttribute('aria-expanded', 'false');
                nav.setAttribute('data-open', 'false');
                setTimeout(function () {
                    window.location.href = href;
                }, 220);
            });
        });
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

    // documentTop bruger offsetTop-kæden (layout-baseret) i stedet for
    // getBoundingClientRect().top (maleri-baseret) — listen kan stadig
    // være midt i sin reveal-animation (transform), som ellers ville
    // forstyrre målingen af hvilepositionen
    function eventRowMetrics() {
        var documentTop = 0;
        for (var el = firstEventRow; el; el = el.offsetParent) { documentTop += el.offsetTop; }
        var rowHeight = firstEventRow.getBoundingClientRect().height;
        var scrollPaddingTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        var snapportCenter = scrollPaddingTop + (window.innerHeight - scrollPaddingTop) / 2;
        return { documentTop: documentTop, rowHeight: rowHeight, snapportCenter: snapportCenter };
    }

    function updateFirstEventSpacing() {
        if (!firstEventRow || !eventList) { return; }
        eventList.style.paddingTop = '0px';
        var m = eventRowMetrics();
        // Beregnes uafhængigt af window.scrollY: padding'en er en fast
        // egenskab ved layoutet (hvor meget plads der skal til for at den
        // første begivenhed kan nå midten). Bruger man den aktuelle
        // scrollposition, bliver paddingen forkert (og vokser sig selv
        // større ved genindlæsning), når browseren har gendannet en
        // scrollposition længere nede ad siden.
        var rowCenter = m.documentTop + m.rowHeight / 2;
        eventList.style.paddingTop = Math.max(0, m.snapportCenter - rowCenter) + 'px';
    }
    updateFirstEventSpacing();
    window.addEventListener('resize', updateFirstEventSpacing);

    // Ved indlæsning starter forsiden nederst i kalenderen og glider
    // langsomt op til den første begivenhed over 2 sekunder — et lille
    // "kig" ned gennem hele listen af kommende ting, før blikket samles
    // om den nærmeste. Sker uden "smooth"/scroll-snap (kun
    // window.scrollTo pr. frame), så det er fuldt under kontrol.
    var introScrollDone = Promise.resolve();
    if (firstEventRow && eventList && window.scrollY === 0 && !location.hash) {
        var m0 = eventRowMetrics();
        var target = Math.max(0, m0.documentTop + m0.rowHeight / 2 - m0.snapportCenter);
        var reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reduceMotion) {
            if (target > 1) { window.scrollTo({ top: target, behavior: 'instant' }); }
        } else {
            var lastRow = eventList.querySelector('.event-row:last-child');
            var lastRowBottom = 0;
            for (var lel = lastRow; lel; lel = lel.offsetParent) { lastRowBottom += lel.offsetTop; }
            lastRowBottom += lastRow.getBoundingClientRect().height;
            var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            var viaTop = Math.min(maxScroll, Math.max(0, lastRowBottom - window.innerHeight));

            if (viaTop > target + 1) {
                window.scrollTo({ top: viaTop, behavior: 'instant' });

                // #main's "page-reveal"-transform kører i ca. 1100ms og
                // forskubber alt malet indhold i forhold til de
                // offsetTop-baserede mål (viaTop/target) ovenfor. Vent derfor
                // med selve op-rulningen til transformen er færdig — siden
                // står stille nederst i kalenderen imens (samme reveal som
                // alle andre sider), og selve 2s-rulningen sker bagefter med
                // korrekt, transform-fri geometri.
                introScrollDone = revealDonePromise().then(function () {
                    return new Promise(function (resolve) {
                        var DURATION_MS = 2000;
                        var startTime = null;
                        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
                        function frame(now) {
                            if (startTime === null) { startTime = now; }
                            var elapsed = now - startTime;
                            var t = Math.min(elapsed / DURATION_MS, 1);
                            var y = viaTop + (target - viaTop) * easeOutCubic(t);
                            window.scrollTo({ top: y, behavior: 'instant' });
                            if (t < 1) {
                                requestAnimationFrame(frame);
                            } else {
                                resolve();
                            }
                        }
                        requestAnimationFrame(frame);
                    });
                });
            } else if (target > 1) {
                window.scrollTo({ top: target, behavior: 'instant' });
            }
        }
    }

    // Scroll-snap slås først til, når både skrifterne er indlæst (så
    // rækkehøjder er endelige), forsidens "page-reveal"-animation er
    // færdig, og en evt. intro-rul gennem kalenderen er landet. #main
    // animeres med en transform under indlæsning, og browserens
    // scroll-snap måler positioner inkl. denne transform — slås snap til
    // mens den stadig kører, retter browseren sig selv hen mod målet i
    // takt med at transformen forsvinder, hvilket ses som et hop
    // efterfulgt af en glidende scroll. Selve snappet sker uden "smooth",
    // så en evt. lille resterende korrektion ikke ses som en animeret
    // overshoot.
    function enableSnap() {
        if (!firstEventRow) { return; }
        updateFirstEventSpacing();
        var root = document.documentElement;
        root.classList.add('snap-ready', 'snap-instant');
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                root.classList.remove('snap-instant');
            });
        });
    }
    function revealDonePromise() {
        var main = document.getElementById('main');
        var reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!main || reduceMotion || !main.classList.contains('page-reveal')) {
            return Promise.resolve();
        }
        return new Promise(function (resolve) {
            main.addEventListener('animationend', resolve, { once: true });
        });
    }
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.all([fontsReady, revealDonePromise(), introScrollDone]).then(enableSnap);

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

    var MAX_BURST = 42;  // ambient 8 + burst 42 = 50 total max
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
        var w = rand(35, 90);
        var h = w * rand(0.62, 0.92);
        var x = rand(0, vw - w);
        x = Math.max(0, Math.min(vw - w, x));
        var y = rand(0, vh - h);
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
            if (now - lastBurstSpawn > 80) {
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

// Scratch-overlay flimmer — mens man scroller, hopper ridse-teksturen på
// farveblokkene til en ny tilfældig position hvert 300ms, som et stykke
// filmstrimmel der rasler igennem en projektor. Står stille når scrollet
// gør (og helt fra ved reduced motion).
(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var blocks = document.querySelectorAll('.bg-green, .bg-orange, .bg-yellow, .bg-blue, .bg-pink');
    if (!blocks.length) return;

    var FLICKER_MS = 300;
    var flickerTimer = null;
    var stopTimer = null;

    function flicker() {
        blocks.forEach(function (block) {
            var x = Math.floor(Math.random() * 600);
            var y = Math.floor(Math.random() * 400);
            block.style.setProperty('--scratch-pos', x + 'px ' + y + 'px');
        });
    }

    window.addEventListener('scroll', function () {
        if (!flickerTimer) {
            flicker();
            flickerTimer = setInterval(flicker, FLICKER_MS);
        }
        clearTimeout(stopTimer);
        stopTimer = setTimeout(function () {
            clearInterval(flickerTimer);
            flickerTimer = null;
        }, FLICKER_MS);
    }, { passive: true });
})();
