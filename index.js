var word = 'Studios';
var delay = 1400;  /* ms before typing begins — raised to the logo draw's end below */
var interval = 80;    /* ms per character */

var textEl = document.querySelector('.logo-studios-text');
var cursorEl = document.querySelector('.logo-cursor');
var bioLines = document.querySelectorAll('.bio-text-line');

/* ── LOGO DRAW-ON ── */
var SVG_NS = 'http://www.w3.org/2000/svg';

var DRAW_START_MS = 200;     /* lets .logo-wrap begin its rise first */
var DRAW_MS_PER_UNIT = 22;   /* pace of the "nib" in ms per SVG user unit */
var DRAW_MIN_MS = 280;
var DRAW_MAX_MS = 1000;
var DRAW_EASE = 'cubic-bezier(0.65,0,0.35,1)';
/* A hand does not trace a letterform in one unbroken sweep, so the contour is
   cut into strokes of roughly this length. Contours shorter than about one
   stroke stay whole — which is what keeps the full stop and tittle to a single
   circular movement. */
var OUTLINE_STROKE_UNITS = 8;      /* longest a stroke may run before it is
                                      subdivided further */
var OUTLINE_STROKE_MIN = 1.2;      /* shorter sections are merged into their
                                      neighbour rather than drawn as a flick */
var OUTLINE_CORNER_ANGLE = 35;     /* degrees of turn that counts as a corner */
var OUTLINE_CORNER_STEP = 0.06;    /* user units between tangent samples when
                                      hunting for those corners */
var OUTLINE_DOWNWARD_EPS = 0.15;   /* below this net rise/fall a stroke counts as
                                      horizontal and is drawn left to right */
var OUTLINE_BREAK_JITTER = 0.25;   /* ± on where a break falls when a long
                                      section has to be subdivided between
                                      corners, as a fraction of a stroke */
var OUTLINE_STROKE_OVERLAP = 0.15; /* user units each stroke runs past its ends,
                                      so round caps meet instead of nicking */
var OUTLINE_STROKE_LAG = 0.85;     /* a stroke starts this far into the previous
                                      one; below 1 the hand is already moving on */
var OUTLINE_SAMPLE_STEP = 0.04;    /* spacing of the points a stroke is rebuilt
                                      from, in user units */

/* Each glyph is hatched by a notionally different pass of the pen, so angle,
   row spacing and nib width are all jittered per glyph around these bases.
   Kept modest — past roughly ±10° the mark stops reading as one hand. */
var SCRIBBLE_ANGLE_DEG = -10;   /* hatching direction, as a right-handed sketcher */
var SCRIBBLE_ANGLE_JITTER = 20;  /* ± degrees off the base angle */
var SCRIBBLE_SPACING = 0.5;     /* gap between hatch rows, in SVG user units */
var SCRIBBLE_SPACING_JITTER = 0.5;  /* ± fraction of the base spacing */
var SCRIBBLE_SPACING_MIN = 0.18;    /* floor, so a low roll cannot explode the
                                       row count into a huge path */
/* Sketch nib as a fraction of the band's own row gap, not an absolute width:
   spacing is jittered hard, so a fixed nib leaves close-pitched bands already
   solid after one sweep and wide-pitched ones barely touched. Keep it under
   1 / SKETCH_PASSES so the sketch is still visibly open when the closing pass
   arrives — at 0.35 coverage runs ~35% -> ~70% -> solid. */
var SKETCH_COVERAGE = 0.35;
var SCRIBBLE_WIDTH_JITTER = 0.3;    /* ± fraction of the derived sketch nib */
var SCRIBBLE_WOBBLE = 0.7;      /* how far a sketch row wanders off its line,
                                   peak-to-peak, as a fraction of its spacing */
/* The three handoffs below all read the same way: the fraction of a beat that
   elapses before the next one starts. 1 = strictly sequential, below 1 = the
   two overlap, above 1 = a pause between them. Fractions rather than fixed
   gaps, so the overlap keeps its proportions when the pacing is retuned. */
var SCRIBBLE_LEAD = 0;      /* outline trace -> this glyph's first hatch */
var SCRIBBLE_LEAD_JITTER = 2;  /* ± on that lead, absolute rather than a
                                    fraction, so the roll can reach 0 (shading
                                    and outline set off together) and below it
                                    (the shape is blocked in first, and the pen
                                    only afterwards goes round to define it) */
var SCRIBBLE_BASE_MS = 220;
var SCRIBBLE_MS_PER_AREA = 600;  /* ms per square user unit of glyph bbox */
var SCRIBBLE_MIN_MS = 500;
var SCRIBBLE_MAX_MS = 2400;
/* Linear: a scribbling hand moves at a roughly constant speed, and an ease-in-out
   here compounds with the geometry — the middle of a sweep is already where most
   of a shape's ink lies, so easing made bands appear to fill all at once. */
var SCRIBBLE_EASE = 'linear';
var BAND_HANDOFF = 0.85;     /* hatch pass -> the next pass on the same glyph */
var SKETCH_PASSES = 2;       /* loose sweeps per band, each phase-shifted a
                                fraction of a row into the previous one's gaps */
/* Then one last pass with a nib fat enough to blot the band solid, so the
   hatching arrives at the fill rather than being replaced by it. A loose sketch
   nib cannot do this itself: rows that wander by more than the gap they tile
   can never close it, so the closing pass trades the wobble for width. */
var SOLID_PASS_COVERAGE = 1.01;  /* its nib, as a multiple of its own row gap;
                                    above 1 the strokes overlap into solid */
var SOLID_PASS_WOBBLE = 0;     /* peak-to-peak, as a fraction of that gap;
                                    must stay under SOLID_PASS_COVERAGE - 1 */
var PASS_LAG = 0.25;         /* a sketch pass starts this far into the one before
                                it, within the band's own time budget */
var SOLID_PASS_LAG = 0.5;    /* the closing pass waits longer, so it reads as a
                                separate go over the top rather than merging
                                into the sketch passes it is meant to finish */
var GLYPH_HANDOFF = 0.4;    /* a glyph's whole sketch -> the next glyph */
var BAND_OVERLAP = 0.03;     /* bands bleed into each other, as a fraction of
                                bbox width, so the seam cross-hatches instead of
                                showing a ruled edge */
var BAND_MIN_MS = 160;
var BAND_INK_COLS = 40;      /* sampling grid used to weight each band's time
                                and to find where its ink actually sits */
var BAND_INK_ROWS = 60;

var FILL_LEAD = 1;        /* solid fill starts this far into the scribble */
var FILL_MS = 0;
var TYPE_GAP_MS = 220;       /* pause between the mark landing and typing */

var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Small deterministic PRNG, so the hand-drawn jitter is identical on every
 * load rather than re-rolling a different scribble each visit.
 *
 * @param {number} seed
 * @returns {function(): number} generator of floats in [0, 1)
 */
function seededRandom(seed)
{
    /* The seed is hashed first, not used raw. A plain LCG turns a constant
       difference between seeds into a constant difference between their first
       outputs, so per-glyph streams seeded index-by-index would hand back a
       tidy arithmetic sequence instead of anything resembling variety. */
    var state = seed | 0;
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state = (state ^ (state >>> 16)) >>> 0;

    return function ()
    {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

/**
 * Builds a serpentine "scribble" path centred on the origin, large enough to
 * cover a shape of the given size at any rotation. Row ends and heights are
 * jittered so the hatching reads as hand-drawn rather than machined.
 * Time: O(rows) | Space: O(rows)
 *
 * @param {number} width    the area's width in user units
 * @param {number} height   the area's height in user units
 * @param {number} angleDeg the angle this hatch will be rotated to
 * @param {number} spacing  this pass's row spacing in user units
 * @param {function(): number} rand
 * @param {number} phase    row offset in user units; a later pass uses a
 *                          fraction of the spacing to fall between the rows
 *                          the earlier pass laid down
 * @param {number} wobble   peak-to-peak row wander in user units
 * @returns {string} an SVG path `d` attribute
 */
function buildScribblePath(width, height, angleDeg, spacing, rand, phase, wobble)
{
    /* Exact half-extents of the rotated rectangle along the hatch axes. Using
       the half-diagonal instead would size every hatch to the circumscribing
       circle, so the opening and closing rows would fall outside the shape
       entirely — dead time in which the pen appears to have stalled. */
    var theta = angleDeg * Math.PI / 180;
    var cos = Math.abs(Math.cos(theta));
    var sin = Math.abs(Math.sin(theta));
    var across = (width * cos + height * sin) / 2 + spacing;
    var down = (width * sin + height * cos) / 2 + spacing;

    var jitter = wobble;
    var parts = ['M', (-across).toFixed(3), (-down + phase).toFixed(3)];
    var y = -down + phase;
    var dir = 1;

    while (y < down) {
        /* Across the shape, bowing through a wandering midpoint so no two rows
           are the same straight line — a ruled hatch reads as machine-made. */
        parts.push('Q', ((rand() - 0.5) * across * 0.3).toFixed(3),
            (y + (rand() - 0.5) * jitter).toFixed(3),
            (across * dir + (rand() - 0.5) * jitter).toFixed(3),
            (y + (rand() - 0.5) * jitter * 0.5).toFixed(3));
        y += spacing;
        /* …then a short step down before doubling back. */
        parts.push('L', (across * dir + (rand() - 0.5) * jitter).toFixed(3), y.toFixed(3));
        dir = -dir;
    }

    return parts.join(' ');
}

/**
 * Reads a glyph's `data-sketch-bands` split points into a list of x ranges,
 * expressed as fractions of the bbox width. Bands overlap slightly so the join
 * between two passes cross-hatches rather than butting at a ruled edge.
 *
 * @param {SVGPathElement} glyph
 * @returns {Array<{from: number, to: number}>} left-to-right, always non-empty
 */
function readBands(glyph)
{
    var raw = (glyph.getAttribute('data-sketch-bands') || '').trim();
    var splits = raw ? raw.split(',').map(parseFloat).filter(function (n)
    {
        return isFinite(n) && n > 0 && n < 1;
    }) : [];

    var edges = [0].concat(splits, [1]);
    var bands = [];

    for (var i = 0; i < edges.length - 1; i++) {
        bands.push({
            from: Math.max(0, edges[i] - (i > 0 ? BAND_OVERLAP : 0)),
            to: Math.min(1, edges[i + 1] + (i < edges.length - 2 ? BAND_OVERLAP : 0))
        });
    }

    return bands;
}

/**
 * Samples the glyph's fill on a grid to find, for each band, how much ink it
 * holds and where that ink actually sits. The weight decides how much of the
 * glyph's time the band earns; the box decides how far its hatching has to
 * sweep, which is what keeps a pass from spending its duration drawing outside
 * its own clip. Weights are normalised and always sum to 1.
 * Time: O(cols * rows) | Space: O(bands)
 *
 * @param {SVGPathElement} glyph
 * @param {DOMRect} box
 * @param {Array<{from: number, to: number}>} bands
 * @returns {Array<{weight: number, box: {x: number, y: number,
 *                  width: number, height: number}}>} one entry per band
 */
function measureBandInk(glyph, box, bands)
{
    var point = glyph.ownerSVGElement.createSVGPoint();
    var stats = bands.map(function () { return { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; });
    var total = 0;

    for (var i = 0; i < BAND_INK_COLS; i++) {
        var fx = (i + 0.5) / BAND_INK_COLS;
        point.x = box.x + box.width * fx;
        for (var j = 0; j < BAND_INK_ROWS; j++) {
            point.y = box.y + box.height * (j + 0.5) / BAND_INK_ROWS;
            if (!glyph.isPointInFill(point)) {
                continue;
            }
            /* Ink in an overlap belongs to the first band that claims it, so
               the weights stay a partition of the glyph rather than double
               counting the seam. */
            for (var k = 0; k < bands.length; k++) {
                if (fx >= bands[k].from && fx <= bands[k].to) {
                    var hit = stats[k];
                    hit.n += 1;
                    hit.x0 = Math.min(hit.x0, point.x);
                    hit.x1 = Math.max(hit.x1, point.x);
                    hit.y0 = Math.min(hit.y0, point.y);
                    hit.y1 = Math.max(hit.y1, point.y);
                    total += 1;
                    break;
                }
            }
        }
    }

    return stats.map(function (hit, k)
    {
        return {
            weight: total > 0 ? hit.n / total : 1 / bands.length,
            box: inkBoxFor(hit, box, bands[k])
        };
    });
}

/**
 * Turns sampled ink extents into a box for the hatching to cover, padded by a
 * grid cell so thin strokes the grid stepped over are still reached. Falls back
 * to the band's full slice if the grid found no ink at all.
 *
 * @param {{n: number, x0: number, y0: number, x1: number, y1: number}} hit
 * @param {DOMRect} box  the glyph's bbox
 * @param {{from: number, to: number}} band
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function inkBoxFor(hit, box, band)
{
    if (hit.n === 0) {
        return {
            x: box.x + box.width * band.from, y: box.y,
            width: box.width * (band.to - band.from), height: box.height
        };
    }

    var padX = box.width / BAND_INK_COLS;
    var padY = box.height / BAND_INK_ROWS;

    return {
        x: hit.x0 - padX, y: hit.y0 - padY,
        width: (hit.x1 - hit.x0) + padX * 2,
        height: (hit.y1 - hit.y0) + padY * 2
    };
}

/**
 * The character of one pass over a band. The opening passes are loose sketch
 * sweeps with a thin, freely jittered nib; the last is the closing pass, whose
 * nib is sized against its own row gap so its strokes overlap into solid.
 *
 * @param {number} pass     0-based; SKETCH_PASSES is the closing pass
 * @param {number} spacing  the band's row spacing in user units
 * @param {function(): number} rand
 * @returns {{width: number, spacing: number, phase: number,
 *            wobble: number, solid: boolean}}
 */
function passStyle(pass, spacing, rand)
{
    if (pass < SKETCH_PASSES) {
        return {
            width: spacing * SKETCH_COVERAGE
                * (1 + (rand() - 0.5) * 2 * SCRIBBLE_WIDTH_JITTER),
            spacing: spacing,
            phase: spacing * pass / SKETCH_PASSES,
            wobble: spacing * SCRIBBLE_WOBBLE,
            solid: false
        };
    }

    return {
        width: spacing * SOLID_PASS_COVERAGE,
        spacing: spacing,
        /* Offset off both sketch passes, so the closing strokes bed down
           between what is already there rather than tracking one of them. */
        phase: spacing / (SKETCH_PASSES * 2),
        wobble: spacing * SOLID_PASS_WOBBLE,
        solid: true
    };
}

/**
 * Builds one clipped hatch pass, clipped twice: to the glyph outline, then to
 * this band's slice of it. The two clips must sit on separate untransformed
 * wrappers — a transform on a clipped element rotates its clip path too.
 *
 * @param {SVGPathElement} glyph
 * @param {DOMRect} box
 * @param {string} glyphClipId
 * @param {{from: number, to: number}} band
 * @param {string} bandClipId
 * @param {SVGDefsElement} defs
 * @param {function(): number} rand
 * @returns {SVGPathElement[]} this band's hatch passes, in drawing order
 */
function buildBandLayer(glyph, box, glyphClipId, band, bandClipId, defs, rand)
{
    var clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', bandClipId);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');

    var slice = document.createElementNS(SVG_NS, 'rect');
    slice.setAttribute('x', box.x + box.width * band.from);
    slice.setAttribute('width', box.width * (band.to - band.from));
    slice.setAttribute('y', box.y - box.height);
    slice.setAttribute('height', box.height * 3);
    clip.appendChild(slice);
    defs.appendChild(clip);

    var wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('class', 'logo-scribble');
    wrap.setAttribute('clip-path', 'url(#' + glyphClipId + ')');
    if (glyph.classList.contains('logo-mark-dot')) {
        wrap.classList.add('is-accent');
    }

    var slicer = document.createElementNS(SVG_NS, 'g');
    slicer.setAttribute('clip-path', 'url(#' + bandClipId + ')');

    /* Every band re-rolls its own angle, spacing and nib rather than inheriting
       the glyph's. All of its passes then share that angle and spacing — they
       have to, or the later ones would not land in the earlier one's gaps. */
    var angle = SCRIBBLE_ANGLE_DEG + (rand() - 0.5) * 2 * SCRIBBLE_ANGLE_JITTER;
    var spacing = Math.max(SCRIBBLE_SPACING_MIN,
        SCRIBBLE_SPACING * (1 + (rand() - 0.5) * 2 * SCRIBBLE_SPACING_JITTER));

    /* Centred and sized on this band's ink, not the whole glyph. Sweeping the
       full bbox would spend most of a narrow band's duration drawing outside
       its own clip — invisibly — and then cram the visible hatching into
       whatever time was left. */
    var ink = band.inkBox;
    var rotor = document.createElementNS(SVG_NS, 'g');
    rotor.setAttribute('transform', 'translate(' + (ink.x + ink.width / 2) + ' '
        + (ink.y + ink.height / 2) + ') rotate(' + angle.toFixed(2) + ')');

    var lines = [];
    for (var pass = 0; pass <= SKETCH_PASSES; pass++) {
        var style = passStyle(pass, spacing, rand);
        var line = document.createElementNS(SVG_NS, 'path');
        line.setAttribute('class', 'logo-scribble-line' + (style.solid ? ' is-solid' : ''));
        line.style.strokeWidth = style.width.toFixed(4);
        line.setAttribute('d', buildScribblePath(ink.width, ink.height, angle,
            style.spacing, rand, style.phase, style.wobble));

        rotor.appendChild(line);
        lines.push(line);
    }

    slicer.appendChild(rotor);
    wrap.appendChild(slicer);
    glyph.parentNode.insertBefore(wrap, glyph);

    lines.head = sketchHeadFraction(lines[0], glyph, angle,
        ink.x + ink.width / 2, ink.y + ink.height / 2,
        box.x + box.width * band.from, box.x + box.width * band.to);

    return lines;
}

/**
 * How much of a hatch pass is drawn before it first marks the page, as a
 * fraction of its length.
 *
 * A sweep is clipped to its glyph and to its band, so its opening stretch can
 * run entirely outside both and leave nothing behind. An outline, by contrast,
 * inks from its very first millisecond. Without knowing this figure, timing the
 * two against each other times the pen's first *move* rather than its first
 * *mark*, and the shading always appears to lag.
 * Time: O(samples) | Space: O(1)
 *
 * @param {SVGPathElement} line   the hatch pass, in the rotor's local space
 * @param {SVGPathElement} glyph
 * @param {number} angleDeg  the rotor's rotation
 * @param {number} cx        the rotor's origin, in glyph user units
 * @param {number} cy
 * @param {number} xMin      the band clip's horizontal span
 * @param {number} xMax
 * @returns {number} 0 if it marks immediately, approaching 1 if it never does
 */
function sketchHeadFraction(line, glyph, angleDeg, cx, cy, xMin, xMax)
{
    var theta = angleDeg * Math.PI / 180;
    var cos = Math.cos(theta);
    var sin = Math.sin(theta);
    var length = line.getTotalLength();
    var point = glyph.ownerSVGElement.createSVGPoint();
    var samples = 120;

    for (var i = 0; i < samples; i++) {
        var at = line.getPointAtLength(length * i / samples);
        /* The rotor's transform, applied by hand: getScreenCTM would force a
           layout for every band just to learn the same thing. */
        point.x = cx + at.x * cos - at.y * sin;
        point.y = cy + at.x * sin + at.y * cos;

        if (point.x >= xMin && point.x <= xMax && glyph.isPointInFill(point)) {
            return i / samples;
        }
    }

    return 1;
}

/**
 * Creates the traced outline as its own path above the glyph, clipped to the
 * glyph so the stroke can only paint inward.
 *
 * An SVG stroke straddles its path, so a stroke on the glyph itself would hang
 * half its width outside the letterform and the glyph would visibly shrink the
 * moment that stroke gave way to the fill. Clipping the glyph would fix the
 * geometry but re-antialiases the fill edge; a separate clipped path leaves the
 * fill untouched, so the resolved letterform is exactly what no-JS renders.
 * Being the glyph's own colour and inside its own area, it needs no fade — once
 * the fill is up, it is simply indistinguishable.
 *
 * The contour is split into separate strokes so the hand lifts and resets a few
 * times round a letter rather than tracing it in one unbroken sweep. Short
 * contours come back as a single stroke, which is what keeps the full stop and
 * the tittle as one circular movement.
 *
 * @param {SVGPathElement} glyph
 * @param {string} clipId
 * @param {number} index  seeds where this glyph's strokes break
 * @returns {{strokes: SVGPathElement[], length: number}}
 */
function buildOutline(glyph, clipId, index)
{
    /* Measured from a stand-in rather than the glyph: the glyph's own length is
       the same, but this keeps the geometry queries off the element whose
       styles are mid-flight. Removed again as soon as it has been read. */
    var measure = document.createElementNS(SVG_NS, 'path');
    measure.setAttribute('d', glyph.getAttribute('d'));
    measure.style.display = 'none';
    glyph.parentNode.appendChild(measure);

    var length = measure.getTotalLength();
    var ranges = outlineStrokeRanges(length, seededRandom(index * 6151 + 29),
        contourCorners(measure, length));
    var accent = glyph.classList.contains('logo-mark-dot') ? ' is-accent' : '';
    /* Fixed reference, so successive inserts land in drawing order rather than
       stacking up reversed immediately after the glyph. */
    var after = glyph.nextSibling;
    var strokes = ranges.map(function (range)
    {
        var stroke = document.createElementNS(SVG_NS, 'path');
        stroke.setAttribute('class', 'logo-outline' + accent);
        stroke.setAttribute('d', strokePathData(measure, range.from, range.to, length));
        stroke.setAttribute('clip-path', 'url(#' + clipId + ')');
        glyph.parentNode.insertBefore(stroke, after);
        return stroke;
    });

    measure.parentNode.removeChild(measure);

    return { strokes: strokes, length: length };
}

/**
 * Finds the corners of a contour: the arc-length positions where the tangent
 * turns sharply. Breaking strokes here is what a hand does — it comes off the
 * page at the angles, not at arbitrary points along a curve.
 * Time: O(length / step) | Space: O(corners)
 *
 * @param {SVGPathElement} source
 * @param {number} length
 * @returns {number[]} arc-length positions, ascending
 */
function contourCorners(source, length)
{
    var count = Math.max(8, Math.round(length / OUTLINE_CORNER_STEP));
    var threshold = OUTLINE_CORNER_ANGLE * Math.PI / 180;
    var points = [];
    var corners = [];
    var i;

    for (i = 0; i < count; i++) {
        points.push(source.getPointAtLength(length * i / count));
    }

    for (i = 0; i < count; i++) {
        /* Wrapped: a glyph contour is closed, so the corner at its seam is a
           corner like any other. */
        var prev = points[(i - 1 + count) % count];
        var at = points[i];
        var next = points[(i + 1) % count];
        var turn = Math.atan2(next.y - at.y, next.x - at.x)
            - Math.atan2(at.y - prev.y, at.x - prev.x);

        while (turn > Math.PI) { turn -= 2 * Math.PI; }
        while (turn < -Math.PI) { turn += 2 * Math.PI; }

        var pos = length * i / count;
        if (Math.abs(turn) > threshold
            && (corners.length === 0 || pos - corners[corners.length - 1] > OUTLINE_STROKE_MIN)) {
            corners.push(pos);
        }
    }

    return corners;
}

/**
 * Divides a contour into stroke ranges, breaking at its corners. Runs longer
 * than a stroke's worth are subdivided (with jittered breaks, since there is no
 * corner to justify a tidy one), and slivers are merged into their neighbour. A
 * contour with no corners and no length to spare — the full stop, the tittle —
 * comes back whole, as one circular movement.
 *
 * @param {number} length  the contour's total length in user units
 * @param {function(): number} rand
 * @param {number[]} corners
 * @returns {Array<{from: number, to: number}>}
 */
function outlineStrokeRanges(length, rand, corners)
{
    var breaks = [0].concat(corners, [length]);
    var ranges = [];

    for (var i = 0; i < breaks.length - 1; i++) {
        var span = breaks[i + 1] - breaks[i];
        var parts = Math.max(1, Math.round(span / OUTLINE_STROKE_UNITS));
        var step = span / parts;
        /* Each part starts where the last one ended. Anchoring starts to the
           unjittered grid instead would leave a hole the width of the jitter
           wherever a break was nudged backwards — far wider than the overlap
           that is supposed to hide the joins. */
        var at = breaks[i];

        for (var k = 0; k < parts; k++) {
            var end = k === parts - 1
                ? breaks[i + 1]
                : Math.min(breaks[i + 1], Math.max(at + step * 0.25,
                    breaks[i] + step * (k + 1)
                        + (rand() - 0.5) * 2 * step * OUTLINE_BREAK_JITTER));
            ranges.push({ from: at, to: end });
            at = end;
        }
    }

    return mergeSlivers(ranges, length);
}

/**
 * Folds any range too short to read as a stroke into the one before it, so the
 * corner hunt cannot produce a rash of flicks.
 *
 * @param {Array<{from: number, to: number}>} ranges
 * @param {number} length
 * @returns {Array<{from: number, to: number}>} never empty
 */
function mergeSlivers(ranges, length)
{
    var kept = [];

    ranges.forEach(function (range)
    {
        var previous = kept[kept.length - 1];
        if (previous && range.to - range.from < OUTLINE_STROKE_MIN) {
            previous.to = range.to;
            return;
        }
        kept.push({ from: range.from, to: range.to });
    });

    /* The ends have no neighbour in the direction the loop above merges, so
       they are folded inward by hand. Without this the contour's seam, which is
       itself usually a corner, leaves a sliver at position zero. */
    if (kept.length > 1 && kept[kept.length - 1].to - kept[kept.length - 1].from < OUTLINE_STROKE_MIN) {
        kept[kept.length - 2].to = kept.pop().to;
    }
    if (kept.length > 1 && kept[0].to - kept[0].from < OUTLINE_STROKE_MIN) {
        kept[1].from = kept.shift().from;
    }

    return kept.length ? kept : [{ from: 0, to: length }];
}

/**
 * Rebuilds one arc of a contour as its own path, sampled point by point.
 *
 * Sampling rather than slicing the original `d`: splitting Bézier commands at
 * arbitrary arc lengths means subdividing curves, whereas at this stroke width
 * a dense polyline is indistinguishable. Consecutive strokes are run a little
 * past their ends so their round caps meet instead of leaving a nick.
 *
 * A contour has one intrinsic direction, so following it blindly draws half the
 * letter upwards. Each stroke is emitted in the direction a hand would take it
 * instead — downwards, or left to right where it barely rises or falls.
 *
 * @param {SVGPathElement} source
 * @param {number} from
 * @param {number} to
 * @param {number} length  the contour's total length
 * @returns {string} an SVG path `d` attribute
 */
function strokePathData(source, from, to, length)
{
    var start = Math.max(0, from - (from > 0 ? OUTLINE_STROKE_OVERLAP : 0));
    var end = Math.min(length, to + (to < length ? OUTLINE_STROKE_OVERLAP : 0));
    var steps = Math.max(2, Math.ceil((end - start) / OUTLINE_SAMPLE_STEP));
    var points = [];
    var i;

    for (i = 0; i <= steps; i++) {
        points.push(source.getPointAtLength(start + (end - start) * i / steps));
    }

    var first = points[0];
    var last = points[points.length - 1];
    var drop = last.y - first.y;

    if (drop < -OUTLINE_DOWNWARD_EPS || (Math.abs(drop) <= OUTLINE_DOWNWARD_EPS && last.x < first.x)) {
        points.reverse();
    }

    var parts = [];
    for (i = 0; i < points.length; i++) {
        parts.push((i === 0 ? 'M' : 'L'), points[i].x.toFixed(3), points[i].y.toFixed(3));
    }

    return parts.join(' ');
}

/**
 * Creates every drawn layer for one glyph: the hatch passes, inserted beneath
 * it so the solid fill later covers them, and the outline above it. A glyph
 * with no `data-sketch-bands` gets a single band, exactly as before.
 *
 * @param {SVGPathElement} glyph
 * @param {SVGDefsElement} defs
 * @param {number} index  used for both the clip ids and the jitter seed
 * @returns {{outline: {strokes: SVGPathElement[], length: number}|null,
 *            bands: Array<{lines: SVGPathElement[], ink: number}>}}
 */
function buildGlyphLayers(glyph, defs, index)
{
    var box = glyph.getBBox();
    if (box.width <= 0 || box.height <= 0) {
        return { outline: null, bands: [] };
    }

    var glyphClipId = 'logo-scribble-clip-' + index;
    var clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', glyphClipId);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');

    var clipShape = document.createElementNS(SVG_NS, 'path');
    clipShape.setAttribute('d', glyph.getAttribute('d'));
    clip.appendChild(clipShape);
    defs.appendChild(clip);

    /* One generator per glyph, consumed band by band, keeps the whole hatch
       reproducible across loads. */
    var rand = seededRandom(index * 9973 + 7);
    var bands = readBands(glyph);
    var measured = measureBandInk(glyph, box, bands);

    return {
        outline: buildOutline(glyph, glyphClipId, index),
        bands: bands.map(function (band, k)
        {
            band.inkBox = measured[k].box;
            return {
                lines: buildBandLayer(glyph, box, glyphClipId, band,
                    glyphClipId + '-band-' + k, defs, rand),
                ink: measured[k].weight
            };
        })
    };
}

/**
 * Retracts a path's dash so it renders as undrawn, with transitions suppressed
 * so the retraction itself is never animated. The length is written inline
 * rather than through a CSS var so the transition's before-change style is the
 * real length instead of the stylesheet's placeholder.
 *
 * @param {SVGPathElement} path
 * @returns {number} the path's total length in user units
 */
function retractPath(path)
{
    var length = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = length + ' ' + length;
    path.style.strokeDashoffset = length;
    return length;
}

/**
 * Times a glyph's outline strokes: each takes a share of the outline's window
 * proportional to its own length, and the next sets off before the previous has
 * quite finished. The whole run still fits the window a single sweep would
 * have, so breaking a contour up changes its rhythm, not its duration.
 *
 * @param {{strokes: SVGPathElement[], length: number}|null} outline
 * @param {number} start
 * @param {number} outlineMs
 * @returns {Array<{stroke: SVGPathElement, start: number, ms: number}>}
 */
function planOutline(outline, start, outlineMs)
{
    if (!outline) {
        return [];
    }

    var lengths = outline.strokes.map(retractPath);
    var total = lengths.reduce(function (sum, n) { return sum + n; }, 0) || 1;

    var at = 0;
    var planned = lengths.map(function (len, i)
    {
        var share = len / total;
        var step = { stroke: outline.strokes[i], start: at, ms: share };
        at += share * OUTLINE_STROKE_LAG;
        return step;
    });

    /* Rescale so the last stroke lands exactly on the end of the window. */
    var last = planned[planned.length - 1];
    var span = last.start + last.ms;

    return planned.map(function (step)
    {
        return {
            stroke: step.stroke,
            start: start + outlineMs * step.start / span,
            ms: outlineMs * step.ms / span
        };
    });
}

/**
 * Plans one glyph's three beats — trace the outline, scribble the interior in,
 * then settle to a solid fill — and stages both of its paths as undrawn. How
 * far the shading trails the outline is rolled per glyph, so some letters are
 * blocked in before the pen goes round them.
 *
 * @param {SVGPathElement} glyph
 * @param {{outline: {strokes: SVGPathElement[], length: number}|null,
 *          bands: Array}} layers
 * @param {number} start  ms at which this glyph's outline begins
 * @param {number} index  glyph position, seeding this glyph's lead
 * @returns {{glyph: SVGPathElement, outline: Array, bands: Array,
 *            outlineMs: number, start: number, sketchEnd: number,
 *            fillStart: number, end: number}}
 */
function planGlyph(glyph, layers, start, index)
{
    var box = glyph.getBBox();
    var outlineMs = Math.min(DRAW_MAX_MS, Math.max(DRAW_MIN_MS,
        (layers.outline ? layers.outline.length : 0) * DRAW_MS_PER_UNIT));
    var outline = planOutline(layers.outline, start, outlineMs);

    /* The glyph gets one time budget however many passes it is split into, so
       banding a letter changes the rhythm of its shading without lengthening
       it. Each pass takes the share its measured ink earns. */
    var budget = Math.min(SCRIBBLE_MAX_MS, Math.max(SCRIBBLE_MIN_MS,
        SCRIBBLE_BASE_MS + box.width * box.height * SCRIBBLE_MS_PER_AREA));

    /* Its own stream, so changing how a glyph is timed never disturbs the
       geometry the hatch generator rolled from the other one. */
    var lead = SCRIBBLE_LEAD
        + (seededRandom(index * 7919 + 13)() - 0.5) * 2 * SCRIBBLE_LEAD_JITTER;

    /* Clamped at zero: a negative lead on the very first glyph would otherwise
       become a negative transition-delay, which CSS honours by starting the
       transition already part-way through — silently eating the sketch. */
    var cursor = Math.max(0, start + outlineMs * lead);
    var bands = [];

    layers.bands.forEach(function (layer, bandIndex)
    {
        var bandMs = Math.max(BAND_MIN_MS, budget * layer.ink);
        /* Where each pass starts, as a multiple of one pass's length. The
           closing pass hangs back further than the sketch passes do. */
        var offsets = layer.lines.map(function (unused, pass)
        {
            return pass === 0 ? 0
                : (pass < SKETCH_PASSES ? PASS_LAG : SOLID_PASS_LAG);
        });
        offsets.forEach(function (lag, pass)
        {
            offsets[pass] = lag + (pass > 0 ? offsets[pass - 1] : 0);
        });

        /* The band's passes share its budget: each is shortened so that the
           last one lands exactly on the band's end, whatever the lags. */
        var passMs = bandMs / (1 + offsets[offsets.length - 1]);

        if (bandIndex === 0) {
            /* Pull the whole sketch earlier by the silent part of its opening
               sweep, so SCRIBBLE_LEAD lines up the first visible mark with the
               outline rather than the pen's first move. */
            cursor = Math.max(0, cursor - (layer.lines.head || 0) * passMs);
        }

        layer.lines.forEach(function (line, pass)
        {
            bands.push({ line: line, start: cursor + passMs * offsets[pass], ms: passMs });
            retractPath(line);
        });

        cursor += bandMs * BAND_HANDOFF;
    });

    var last = bands[bands.length - 1];
    var sketchEnd = last ? last.start + last.ms : start + outlineMs;
    var fillStart = last
        ? last.start + last.ms * FILL_LEAD
        : start + outlineMs;

    return {
        glyph: glyph, outline: outline, bands: bands,
        outlineMs: outlineMs, start: start,
        sketchEnd: sketchEnd, fillStart: fillStart,
        end: Math.max(sketchEnd, fillStart + FILL_MS)
    };
}

/**
 * Releases a planned glyph: outline traces, each hatch pass shades its band in
 * turn, then the solid fill rises as the sketch strokes retire beneath it.
 *
 * @param {object} plan  as returned by planGlyph
 */
function runGlyph(plan)
{
    plan.glyph.style.transition =
        'fill-opacity ' + FILL_MS + 'ms ease ' + plan.fillStart + 'ms';
    plan.glyph.style.fillOpacity = '1';

    /* No stroke fade: the outline sits inside the glyph in the glyph's own
       colour, so the fill arriving underneath simply absorbs it. Fading it is
       what used to make the letterform twitch as it resolved. */
    plan.outline.forEach(function (step)
    {
        step.stroke.style.transition = 'stroke-dashoffset ' + step.ms
            + 'ms ' + DRAW_EASE + ' ' + step.start + 'ms';
        step.stroke.style.strokeDashoffset = '0';
    });

    plan.bands.forEach(function (band)
    {
        band.line.style.transition = [
            'stroke-dashoffset ' + band.ms + 'ms ' + SCRIBBLE_EASE + ' ' + band.start + 'ms',
            'opacity ' + FILL_MS + 'ms ease ' + plan.fillStart + 'ms'
        ].join(', ');
        band.line.style.strokeDashoffset = '0';
        band.line.style.opacity = '0';
    });
}

/**
 * Animates the Pi. mark as if hand-drawn: every glyph is traced in outline,
 * scribbled in with clipped hatching, then resolved to its solid fill. Glyphs
 * overlap, so the next letter starts while the previous is still filling.
 * Time: O(n) in glyph count | Space: O(n)
 *
 * @returns {number} ms from now until the last glyph has finished filling.
 */
function drawLogoMark()
{
    var mark = document.querySelector('.logo-mark');
    if (!mark) {
        return 0;
    }

    var glyphs = mark.querySelectorAll('.logo-glyph');
    if (reduceMotion) {
        mark.classList.add('is-drawn');
        return 0;
    }

    var defs = document.createElementNS(SVG_NS, 'defs');
    mark.insertBefore(defs, mark.firstChild);

    var start = DRAW_START_MS;
    var end = 0;
    var plans = [];

    /* Pass 1 — build the scribble layers, measure, and stage everything
       undrawn. Kept separate from pass 2 so the start state is flushed before
       any transition is attached; otherwise the flush animates the staging. */
    Array.prototype.forEach.call(glyphs, function (glyph, index)
    {
        var plan = planGlyph(glyph, buildGlyphLayers(glyph, defs, index), start, index);
        plans.push(plan);
        end = Math.max(end, plan.end);
        /* The next glyph picks up part-way through this one's shading, so its
           outline is being traced while the previous letter is still being
           filled in — overlapping, but never out of order. */
        start = plan.start + (plan.sketchEnd - plan.start) * GLYPH_HANDOFF;
    });

    void mark.getBoundingClientRect();  /* flush the start state */

    /* Pass 2 — attach the timings and let every beat run. */
    requestAnimationFrame(function ()
    {
        mark.classList.add('is-drawn');
        plans.forEach(runGlyph);
    });

    return end;
}

var logoDrawEnd = drawLogoMark();
delay = Math.max(delay, logoDrawEnd + TYPE_GAP_MS);
var parallaxEnabled = false;
var typingEnd = delay + word.length * interval;
setTimeout(function () {
    parallaxLayers = setupParallaxLayers();
    parallaxEnabled = true;
}, typingEnd);

/**
 * Hangs the two chrome fades off the end of the typewriter rather than fixed
 * CSS delays. The sketch is now strictly serial, so its length moves whenever
 * the scribble constants are retuned — anything hardcoded drifts out of step.
 * The stylesheet keeps its own delays as the no-JS fallback.
 */
(function syncIntroTiming()
{
    if (reduceMotion) {
        return;
    }

    var typingEnd = delay + word.length * interval;
    var connect = document.querySelector('.connect');
    var footer = document.querySelector('.footer');

    if (connect) {
        connect.style.animationDelay = Math.round(typingEnd + 150) + 'ms';
    }
    if (footer) {
        footer.style.animationDelay = Math.round(typingEnd + 350) + 'ms';
    }
})();

/* ── MOUSE GLOW ── */
var glow = document.createElement('div');
glow.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:1', 'pointer-events:none',
    'background:radial-gradient(circle 240px at 50% 50%, rgba(201,162,39,0.06) 0%, transparent 70%)',
    'opacity:0', 'transition:opacity 0.6s ease',
].join(';');
document.body.appendChild(glow);

/* Centred on the logo mark itself rather than the raw viewport centre — the
   stage's padding pulls the logo visually off true centre. */
var logoWrap = document.querySelector('.logo-wrap');
var logoRect = logoWrap ? logoWrap.getBoundingClientRect() : null;
var centerX = logoRect ? logoRect.left + logoRect.width / 2 : window.innerWidth / 2;
var centerY = logoRect ? logoRect.top + logoRect.height / 2 : window.innerHeight / 2;
var mouseX = centerX, mouseY = centerY;
var glowX = centerX, glowY = centerY;
var entered = true;

/* Glow opens centred behind the logo and holds there through the intro;
   only once the sequence has landed does it release to chase the cursor. */
var glowFollowing = false;
setTimeout(function () {
    glowFollowing = true;
}, typingEnd + 400);
glow.style.opacity = '1';

/* ── CURSOR POSITION ── */
var cursorEl2 = document.getElementById('cursor');
document.addEventListener('mousemove', function (e)
{
    cursorEl2.style.left = e.clientX + 'px';
    cursorEl2.style.top = e.clientY + 'px';
});
document.addEventListener('mouseenter', function ()
{
    cursorEl2.style.opacity = '1';
});
document.addEventListener('mouseleave', function ()
{
    cursorEl2.style.opacity = '0';
});

document.addEventListener('mousemove', function (e)
{
    mouseX = e.clientX; mouseY = e.clientY;
    if (!entered) { glow.style.opacity = '1'; entered = true; }
});
document.addEventListener('mouseleave', function ()
{
    glow.style.opacity = '0'; entered = false;
});

var GLOW_ALPHA_MAX = 0.11;   /* brightness when the cursor is at rest */
var GLOW_ALPHA_MIN = 0.04;   /* brightness floor once the cursor is moving fast */
var GLOW_ALPHA_INTRO = 0.08; /* fainter still while parked behind the logo, pre-follow */
var GLOW_SPEED_RANGE = 45;   /* lag (px) between cursor and glow at which alpha bottoms out */
var glowAlpha = GLOW_ALPHA_INTRO;

(function animateGlow()
{
    var targetX = glowFollowing ? mouseX : centerX;
    var targetY = glowFollowing ? mouseY : centerY;
    glowX += (targetX - glowX) * 0.06;
    glowY += (targetY - glowY) * 0.06;

    /* Distance the glow still has to close on its target doubles as a speed
       proxy: it stays near zero while the target is still (including the
       centred hold during the intro) and grows with how fast the cursor is
       outrunning the glow's own easing once it's released to follow it. */
    var speed = Math.hypot(targetX - glowX, targetY - glowY);
    var targetAlpha = glowFollowing
        ? GLOW_ALPHA_MAX - Math.min(speed / GLOW_SPEED_RANGE, 1) * (GLOW_ALPHA_MAX - GLOW_ALPHA_MIN)
        : GLOW_ALPHA_INTRO;
    glowAlpha += (targetAlpha - glowAlpha) * 0.1;

    glow.style.background =
        'radial-gradient(circle 240px at ' + glowX + 'px ' + glowY + 'px, rgba(201,162,39,' + glowAlpha.toFixed(3) + ') 0%, transparent 70%)';
    requestAnimationFrame(animateGlow);
})();

/* ── LOGO PARALLAX ──
   Not a single rigid shift: the mark is split into depth layers that drift at
   their own rate, so it reads as a few surfaces stacked at different heights
   rather than one flat image tracking the cursor. */
var PARALLAX_BASE_X = 6;          /* px at full tilt — the back layer's own reference */
var PARALLAX_BASE_Y = 4;
var PARALLAX_RATE_BACK = 0.55;    /* solid fill: furthest back, moves least */
var PARALLAX_RATE_FRONT = 1.0;    /* traced outline: nearest, separates visibly from the fill */
var PARALLAX_RATE_WORDMARK = 0.55; /* "Studios" reads flatter, further back than the mark */
var PARALLAX_RATE_SHADOW = 0.35;  /* cast opposite the tilt, like a fixed light source */
var PARALLAX_EASE = 0.06;

var markSvg = document.querySelector('.logo-mark');
var mainGroup = markSvg ? markSvg.querySelector('g') : null;
var logoPiEl = document.querySelector('.logo-pi');
var wordmarkEl = document.querySelector('.logo-studios');
var parallaxLayers = null;
var parallaxScale = 1;  /* SVG user units per rendered CSS px, recomputed on layout change */

/**
 * Splits the mark's already-drawn glyphs into three depth groups — fill,
 * outline, dot — so each can drift at its own rate. Safe only once the intro
 * has finished: the glyphs never overlap on screen, so reparenting them
 * changes nothing visually, but doing it mid-draw could disturb a running
 * transition.
 *
 * @returns {{back: SVGGElement, front: SVGGElement}|null}
 */
function setupParallaxLayers()
{
    if (!markSvg || !mainGroup) {
        return null;
    }

    var back = document.createElementNS(SVG_NS, 'g');
    var front = document.createElementNS(SVG_NS, 'g');
    /* Dimmed once it's a free-floating parallax layer rather than sitting
       flush on the fill — the separation reads as depth, not a mis-registered
       outline. */
    front.setAttribute('class', 'logo-parallax-front');
    mainGroup.appendChild(back);
    mainGroup.appendChild(front);

    /* The dot travels with the same two groups as every other glyph — it
       reads as one more letter in the mark's flow, not a separate floating
       accent. */
    Array.prototype.forEach.call(mainGroup.querySelectorAll('.logo-glyph'), function (glyph)
    {
        back.appendChild(glyph);
    });
    Array.prototype.forEach.call(mainGroup.querySelectorAll('.logo-outline'), function (stroke)
    {
        front.appendChild(stroke);
    });

    refreshParallaxScale();

    return { back: back, front: front };
}

/**
 * Recomputes user-units-per-CSS-px for the mark, so a requested px offset
 * lands on screen at the size actually asked for regardless of the SVG's
 * viewBox scale or how large it's currently rendered.
 */
function refreshParallaxScale()
{
    if (!markSvg) {
        return;
    }
    var rect = markSvg.getBoundingClientRect();
    if (rect.height > 0) {
        parallaxScale = markSvg.viewBox.baseVal.height / rect.height;
    }
}

/**
 * Moves one depth group by a px offset, converted into the SVG's own user
 * units via the cached scale.
 *
 * Set as a CSS transform, not the `transform` attribute: the attribute is a
 * presentation property that forces SVG geometry to be recomputed on layout,
 * off the compositor thread the wordmark's CSS transform already rides on.
 * Driving both through the same pipeline is what keeps them landing on the
 * same frame instead of drifting a beat apart under any main-thread load.
 *
 * @param {SVGGElement} group
 * @param {number} px
 * @param {number} py
 */
function setLayerOffset(group, px, py)
{
    group.style.transform = 'translate(' + (px * parallaxScale).toFixed(4)
        + 'px, ' + (py * parallaxScale).toFixed(4) + 'px)';
}

window.addEventListener('resize', refreshParallaxScale);

var targetDx = 0, targetDy = 0;
var currentDx = 0, currentDy = 0;

document.addEventListener('mousemove', function (e)
{
    if (!parallaxEnabled) {
        return;
    }

    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    targetDx = (e.clientX - cx) / cx;
    targetDy = (e.clientY - cy) / cy;
});
document.addEventListener('mouseleave', function ()
{
    targetDx = 0; targetDy = 0;
});

(function animateParallax()
{
    currentDx += (targetDx - currentDx) * PARALLAX_EASE;
    currentDy += (targetDy - currentDy) * PARALLAX_EASE;

    var px = currentDx * PARALLAX_BASE_X;
    var py = currentDy * PARALLAX_BASE_Y;

    if (parallaxLayers) {
        setLayerOffset(parallaxLayers.back, px * PARALLAX_RATE_BACK, py * PARALLAX_RATE_BACK);
        setLayerOffset(parallaxLayers.front, px * PARALLAX_RATE_FRONT, py * PARALLAX_RATE_FRONT);
    }
    if (wordmarkEl) {
        wordmarkEl.style.transform = 'translate(' + (px * PARALLAX_RATE_WORDMARK).toFixed(2)
            + 'px, ' + (py * PARALLAX_RATE_WORDMARK).toFixed(2) + 'px)';
    }
    if (logoPiEl) {
        logoPiEl.style.filter = 'drop-shadow(' + (-px * PARALLAX_RATE_SHADOW).toFixed(2) + 'px '
            + (2 - py * PARALLAX_RATE_SHADOW).toFixed(2) + 'px 10px rgba(0,0,0,0.3))';
    }

    requestAnimationFrame(animateParallax);
})();

setTimeout(function ()
{
    cursorEl.classList.add('visible'); /* show cursor before typing starts */

    var i = 0;
    var timer = setInterval(function ()
    {
        textEl.textContent = word.slice(0, i + 1);
        i++;
        if (i === word.length) {
            clearInterval(timer);
            cursorEl.classList.remove('visible');
            cursorEl.classList.add('blink'); /* switch to blinking once done */
        }
    }, interval);
}, delay);

if (bioLines.length > 0) {
    if ('IntersectionObserver' in window) {
        var bioObserver = new IntersectionObserver(function (entries, observer)
        {
            entries.forEach(function (entry)
            {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -8% 0px'
        });

        bioLines.forEach(function (bioLine)
        {
            bioObserver.observe(bioLine);
        });
    } else {
        bioLines.forEach(function (bioLine)
        {
            bioLine.classList.add('is-visible');
        });
    }
}