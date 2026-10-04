/**
 * TI-84 CE Statistical Math — pure computation, zero dependencies.
 * Module 3 of the native stat calculator reimplementation.
 *
 * All functions match TI-84 Plus CE output to ~10 significant digits.
 */
(function () {
  'use strict';

  // ───────────────────────────────────────────────
  //  Internal helpers
  // ───────────────────────────────────────────────

  var LN_SQRT_2PI = 0.9189385332046727; // ln(sqrt(2*pi))
  var SQRT2 = Math.sqrt(2);
  var MAX_ITER = 300;
  var EPS = 1e-14;

  /** Log-gamma via Lanczos approximation (g=7, n=9). */
  function lnGamma(x) {
    if (x <= 0 && x === Math.floor(x)) return Infinity;
    if (x < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
    }
    x -= 1;
    var g = 7;
    var c = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];
    var sum = c[0];
    for (var i = 1; i < g + 2; i++) {
      sum += c[i] / (x + i);
    }
    var t = x + g + 0.5;
    return LN_SQRT_2PI + (x + 0.5) * Math.log(t) - t + Math.log(sum);
  }

  /**
   * Regularized incomplete beta I_x(a, b) via Lentz continued fraction.
   * Uses the standard CF expansion (DLMF 8.17.22).
   */
  function betaIncomplete(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use symmetry when x > (a+1)/(a+b+2) for faster convergence.
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - betaIncomplete(1 - x, b, a);
    }

    var lnPre = a * Math.log(x) + b * Math.log(1 - x)
      - Math.log(a)
      - lnBeta(a, b);
    var pre = Math.exp(lnPre);

    // Lentz's method for the CF
    var TINY = 1e-30;
    var f = 1 + cfTermBeta(1, x, a, b);
    if (Math.abs(f) < TINY) f = TINY;
    var C = f;
    var D = 0;

    for (var m = 1; m <= MAX_ITER; m++) {
      // Even term: d_{2m}
      var d = cfTermBeta(2 * m, x, a, b);
      D = 1 + d * D;
      if (Math.abs(D) < TINY) D = TINY;
      D = 1 / D;
      C = 1 + d / C;
      if (Math.abs(C) < TINY) C = TINY;
      f *= C * D;

      // Odd term: d_{2m+1}
      d = cfTermBeta(2 * m + 1, x, a, b);
      D = 1 + d * D;
      if (Math.abs(D) < TINY) D = TINY;
      D = 1 / D;
      C = 1 + d / C;
      if (Math.abs(C) < TINY) C = TINY;
      var delta = C * D;
      f *= delta;

      if (Math.abs(delta - 1) < EPS) break;
    }

    return pre * f;
  }

  function cfTermBeta(n, x, a, b) {
    // CF coefficients for I_x(a,b): alternating numerator terms
    if (n === 1) {
      return 1; // first numerator is 1 in modified Lentz
    }
    var m;
    if (n % 2 === 0) {
      m = n / 2;
      return (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    } else {
      m = (n - 1) / 2;
      return -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    }
  }

  /**
   * Regularized incomplete beta using the direct CF from NR (6.4).
   * betacf gives the continued fraction, then we multiply by the prefactor.
   */
  function regIncBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use symmetry for better convergence
    if (x > (a + 1) / (a + b + 2)) {
      return 1 - regIncBeta(b, a, 1 - x);
    }

    var lnPre = lnGamma(a + b) - lnGamma(a) - lnGamma(b)
      + a * Math.log(x) + b * Math.log(1 - x);

    var cf = betaCF(a, b, x);
    return Math.exp(lnPre) * cf / a;
  }

  /** Continued fraction for incomplete beta (Numerical Recipes). */
  function betaCF(a, b, x) {
    var TINY = 1e-30;
    var qab = a + b;
    var qap = a + 1;
    var qam = a - 1;
    var c = 1;
    var d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    var h = d;

    for (var m = 1; m <= MAX_ITER; m++) {
      var m2 = 2 * m;
      // Even step
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      h *= d * c;

      // Odd step
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var delta = d * c;
      h *= delta;

      if (Math.abs(delta - 1) < EPS) break;
    }
    return h;
  }

  function lnBeta(a, b) {
    return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  }

  /**
   * Regularized lower incomplete gamma P(a, x) = gamma(a,x) / Gamma(a).
   * Uses series expansion for x < a+1, CF otherwise.
   */
  function regGammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      return gammaSeries(a, x);
    }
    return 1 - gammaCF(a, x);
  }

  /** Series expansion for P(a,x). */
  function gammaSeries(a, x) {
    var lnPre = a * Math.log(x) - x - lnGamma(a);
    var sum = 1 / a;
    var term = 1 / a;
    for (var n = 1; n <= MAX_ITER; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(lnPre);
  }

  /** Continued fraction for Q(a,x) = 1 - P(a,x). */
  function gammaCF(a, x) {
    var lnPre = a * Math.log(x) - x - lnGamma(a);
    var TINY = 1e-30;
    var b = x + 1 - a;
    var c = 1 / TINY;
    var d = 1 / b;
    var h = d;

    for (var i = 1; i <= MAX_ITER; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      var delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < EPS) break;
    }
    return Math.exp(lnPre) * h;
  }

  // ───────────────────────────────────────────────
  //  Standard Normal CDF  (Phi)
  //  Rational approximation — Cody (1969) / Hart.
  //  Matches 15+ significant digits.
  // ───────────────────────────────────────────────

  /**
   * Standard normal CDF Phi(x) = P(Z <= x).
   * Uses Cody's rational approximation (3 regions).
   */
  function phi(x) {
    var a1 = [
      3.2091780377036226e-1,
      -3.5658378083987394e-1,
      1.7814779316112955e-1,
      -4.4634113436071804e-2,
      7.1350030677498883e-3,
      -1.0672174901186886e-3,
      -2.1988170032498701e-4,
      -2.2135020839498045e-5
    ];
    var b1 = [
      0, // placeholder — not used for index 0
      -2.4416749009498698e-1,
      2.2166889464736655e-2,
      3.5435559233498702e-4
    ];

    // Use the erfc-based approach for full precision.
    // erfcc(x) = erfc(x/sqrt(2))/2 for x >= 0
    // Phi(x) = 1 - erfcc(x) for x >= 0, erfcc(-x) for x < 0

    return 0.5 * erfc(-x / SQRT2);
  }

  /**
   * Complementary error function erfc(x) with high precision.
   * Rational approximation from Cody (1969), three regions.
   */
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);

    // Region 1: |x| <= 0.5 — use erf series then 1 - erf
    if (x <= 0.5) return 1 - erf(x);

    // Region 2: 0.5 < x <= 4 — rational approximation for erfc
    if (x <= 4) {
      var p = [
        2.15311535474403846e-8,
        5.64188496988670089e-1,
        8.88314979438837594e0,
        6.61191906371416295e1,
        2.98635138197400131e2,
        8.81952221241769090e2,
        1.71204761263407058e3,
        2.05107837782607147e3,
        1.23033935479799725e3
      ];
      var q = [
        1.00000000000000000e0,
        1.57449261004556579e1,
        1.17693950891312499e2,
        5.37181101862009858e2,
        1.62138957456669019e3,
        3.29079923573345963e3,
        4.36261909014324716e3,
        3.43936767414372164e3,
        1.23033935480374942e3
      ];
      var num = p[0];
      for (var i = 1; i < p.length; i++) num = num * x + p[i];
      var den = q[0];
      for (var j = 1; j < q.length; j++) den = den * x + q[j];
      return Math.exp(-x * x) * num / den;
    }

    // Region 3: x > 4 — asymptotic expansion
    var p2 = [
      -2.99610707703542174e-3,
      -4.94730910623250360e-2,
      -2.26956593539686251e-1,
      -2.78661308609647788e-1,
      -2.23192459734184686e-2
    ];
    var q2 = [
      9.99920328396141768e-1,
      1.49595988816576055e1,
      4.76190270655955044e1,
      3.33717897516696923e1,
      1.00000000000000000e0 // not used but keeps alignment
    ];
    var y = 1 / (x * x);
    var num2 = p2[0];
    for (var k = 1; k < p2.length; k++) num2 = num2 * y + p2[k];
    var den2 = q2[0];
    for (var l = 1; l < q2.length - 1; l++) den2 = den2 * y + q2[l];
    var result = Math.exp(-x * x) * (1 / Math.sqrt(Math.PI) + y * num2 / den2) / x;
    return result;
  }

  /**
   * Error function erf(x) via Taylor series.
   * erf(x) = (2/sqrt(pi)) * sum_{n=0}^{inf} (-1)^n * x^{2n+1} / (n! * (2n+1))
   * Converges fast for |x| <= 0.5; good enough for the erfc handoff.
   */
  function erf(x) {
    var TWO_OVER_SQRTPI = 2 / Math.sqrt(Math.PI);
    var sum = x;         // first term: x
    var term = x;
    var x2 = x * x;
    for (var n = 1; n <= 50; n++) {
      term *= -x2 / n;
      var contrib = term / (2 * n + 1);
      sum += contrib;
      if (Math.abs(contrib) < Math.abs(sum) * 1e-16) break;
    }
    return TWO_OVER_SQRTPI * sum;
  }

  // ───────────────────────────────────────────────
  //  Inverse Normal (Phi^{-1})
  //  Rational approximation from Peter Acklam (2000).
  //  Accurate to ~1.15e-9; refined with one Newton step.
  // ───────────────────────────────────────────────

  function phiInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    // Coefficients for rational approximation
    var a = [
      -3.969683028665376e1,
      2.209460984245205e2,
      -2.759285104469687e2,
      1.383577518672690e2,
      -3.066479806614716e1,
      2.506628277459239e0
    ];
    var b = [
      -5.447609879822406e1,
      1.615858368580409e2,
      -1.556989798598866e2,
      6.680131188771972e1,
      -1.328068155288572e1
    ];
    var c = [
      -7.784894002430293e-3,
      -3.223964580411365e-1,
      -2.400758277161838e0,
      -2.549732539343734e0,
      4.374664141464968e0,
      2.938163982698783e0
    ];
    var d = [
      7.784695709041462e-3,
      3.224671290700398e-1,
      2.445134137142996e0,
      3.754408661907416e0
    ];

    var pLow = 0.02425;
    var pHigh = 1 - pLow;
    var r, x;

    if (p < pLow) {
      // Left tail
      r = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
        ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
    } else if (p <= pHigh) {
      // Central region
      r = p - 0.5;
      var r2 = r * r;
      x = (((((a[0] * r2 + a[1]) * r2 + a[2]) * r2 + a[3]) * r2 + a[4]) * r2 + a[5]) * r /
        (((((b[0] * r2 + b[1]) * r2 + b[2]) * r2 + b[3]) * r2 + b[4]) * r2 + 1);
    } else {
      // Right tail
      r = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
        ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
    }

    // One Newton-Raphson refinement step for extra precision
    var e = phi(x) - p;
    var u = e * Math.sqrt(2 * Math.PI) * Math.exp(0.5 * x * x);
    x = x - u;

    // Second refinement
    e = phi(x) - p;
    u = e * Math.sqrt(2 * Math.PI) * Math.exp(0.5 * x * x);
    x = x - u;

    return x;
  }

  // ───────────────────────────────────────────────
  //  t-distribution CDF via regularized incomplete beta
  // ───────────────────────────────────────────────

  function tCDF(t, df) {
    if (df <= 0) return NaN;
    var x = df / (df + t * t);
    var ib = regIncBeta(df / 2, 0.5, x);
    if (t >= 0) {
      return 1 - 0.5 * ib;
    }
    return 0.5 * ib;
  }

  /** Two-tailed t p-value: P(|T| > |t|). */
  function tPValue(t, df, alt) {
    if (alt === '>' || alt === '\u003E') {
      return 1 - tCDF(t, df);
    }
    if (alt === '<' || alt === '\u003C') {
      return tCDF(t, df);
    }
    // two-tailed
    var p = 2 * (1 - tCDF(Math.abs(t), df));
    return p;
  }

  /** Inverse t via bisection + Newton refinement. */
  function tInv(area, df) {
    // Use bisection to find t such that tCDF(t, df) = area
    var lo = -1000;
    var hi = 1000;
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (tCDF(mid, df) < area) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  // ───────────────────────────────────────────────
  //  Chi-square CDF via regularized incomplete gamma
  // ───────────────────────────────────────────────

  function chi2CDF(x, df) {
    if (x <= 0) return 0;
    return regGammaP(df / 2, x / 2);
  }

  // ───────────────────────────────────────────────
  //  Combinatorics
  // ───────────────────────────────────────────────

  /** Log of n choose k. */
  function lnChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
  }

  // ───────────────────────────────────────────────
  //  Expand data with frequencies
  // ───────────────────────────────────────────────

  function expandFreq(data, freq) {
    if (!freq) return data.slice();
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var f = freq[i] || 0;
      for (var j = 0; j < f; j++) out.push(data[i]);
    }
    return out;
  }

  // ───────────────────────────────────────────────
  //  TI-84 Quartile method ("include median" in both halves for odd n)
  //  For odd n: median = middle value.
  //  Q1 = median of lower half INCLUDING the median.
  //  Q3 = median of upper half INCLUDING the median.
  //  For even n: median = avg of two middle values.
  //  Q1 = median of lower half, Q3 = median of upper half.
  // ───────────────────────────────────────────────

  function medianOfSorted(arr, lo, hi) {
    // lo inclusive, hi exclusive
    var len = hi - lo;
    if (len === 0) return NaN;
    var mid = lo + Math.floor(len / 2);
    if (len % 2 === 1) return arr[mid];
    return (arr[mid - 1] + arr[mid]) / 2;
  }

  // ───────────────────────────────────────────────
  //  Public API
  // ───────────────────────────────────────────────

  function oneVarStats(data, freq) {
    var expanded = expandFreq(data, freq);
    var n = expanded.length;
    if (n === 0) return null;

    var sumX = 0;
    var sumX2 = 0;
    for (var i = 0; i < n; i++) {
      sumX += expanded[i];
      sumX2 += expanded[i] * expanded[i];
    }
    var xbar = sumX / n;

    // Sample std dev (Sx) and population std dev (sigmaX)
    var ssq = 0;
    for (var j = 0; j < n; j++) {
      var d = expanded[j] - xbar;
      ssq += d * d;
    }
    var Sx = n > 1 ? Math.sqrt(ssq / (n - 1)) : 0;
    var sigmaX = Math.sqrt(ssq / n);

    // Sort for five-number summary
    var sorted = expanded.slice().sort(function (a, b) { return a - b; });
    var minX = sorted[0];
    var maxX = sorted[n - 1];
    var Med = medianOfSorted(sorted, 0, n);

    // TI quartile method: include median in both halves for odd n
    var midIdx = Math.floor(n / 2);
    var Q1, Q3;
    if (n % 2 === 1) {
      // Odd: include the median element in both halves
      Q1 = medianOfSorted(sorted, 0, midIdx + 1);
      Q3 = medianOfSorted(sorted, midIdx, n);
    } else {
      // Even: split exactly in half
      Q1 = medianOfSorted(sorted, 0, midIdx);
      Q3 = medianOfSorted(sorted, midIdx, n);
    }

    return {
      xbar: xbar,
      sumX: sumX,
      sumX2: sumX2,
      Sx: Sx,
      sigmaX: sigmaX,
      n: n,
      minX: minX,
      Q1: Q1,
      Med: Med,
      Q3: Q3,
      maxX: maxX
    };
  }

  function normalcdf(lower, upper, mu, sigma) {
    if (mu === undefined) mu = 0;
    if (sigma === undefined) sigma = 1;
    var zLo = (lower - mu) / sigma;
    var zHi = (upper - mu) / sigma;
    return phi(zHi) - phi(zLo);
  }

  function invNorm(area, mu, sigma, tail) {
    if (mu === undefined) mu = 0;
    if (sigma === undefined) sigma = 1;
    if (!tail) tail = 'LEFT';

    var z;
    tail = tail.toUpperCase();

    if (tail === 'LEFT') {
      z = phiInv(area);
    } else if (tail === 'RIGHT') {
      z = phiInv(1 - area);
    } else if (tail === 'CENTER') {
      // Center: area is in the middle, symmetric about 0.
      // Tail area on each side = (1 - area) / 2.
      var tailArea = (1 - area) / 2;
      z = phiInv(1 - tailArea);
      // Return the positive boundary (TI shows the positive z for CENTER).
      // Actually TI returns the negative boundary first... let's return both
      // but TI invNorm CENTER returns the lower bound (negative value).
      // TI-84: invNorm(area, mu, sigma, CENTER) returns the LOWER boundary.
      z = -z; // lower boundary
    } else {
      z = phiInv(area);
    }

    return mu + sigma * z;
  }

  function tTest(mu0, xbar, Sx, n, alternative) {
    if (!alternative) alternative = '\u2260'; // ≠
    var se = Sx / Math.sqrt(n);
    var t = (xbar - mu0) / se;
    var df = n - 1;
    var p = tPValue(t, df, alternative);

    return { t: t, p: p, df: df, xbar: xbar, Sx: Sx, n: n };
  }

  function tInterval(xbar, Sx, n, cLevel) {
    if (cLevel === undefined) cLevel = 0.95;
    var df = n - 1;
    var alpha = 1 - cLevel;
    var tStar = tInv(1 - alpha / 2, df);
    var ME = tStar * Sx / Math.sqrt(n);
    return {
      lower: xbar - ME,
      upper: xbar + ME,
      xbar: xbar,
      Sx: Sx,
      n: n,
      df: df,
      ME: ME
    };
  }

  function twoSampTTest(x1, s1, n1, x2, s2, n2, alt, pooled) {
    if (!alt) alt = '\u2260';
    var t, df, se;

    if (pooled) {
      var sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
      se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
      df = n1 + n2 - 2;
    } else {
      // Welch's t-test
      var v1 = s1 * s1 / n1;
      var v2 = s2 * s2 / n2;
      se = Math.sqrt(v1 + v2);
      // Satterthwaite df
      var num = (v1 + v2) * (v1 + v2);
      var den = (v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1);
      df = num / den;
    }

    t = (x1 - x2) / se;
    var p = tPValue(t, df, alt);

    return {
      t: t, p: p, df: df,
      x1: x1, x2: x2, Sx1: s1, Sx2: s2, n1: n1, n2: n2
    };
  }

  function twoSampTInt(x1, s1, n1, x2, s2, n2, cLevel, pooled) {
    if (cLevel === undefined) cLevel = 0.95;
    var df, se;

    if (pooled) {
      var sp2 = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
      se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
      df = n1 + n2 - 2;
    } else {
      var v1 = s1 * s1 / n1;
      var v2 = s2 * s2 / n2;
      se = Math.sqrt(v1 + v2);
      var num = (v1 + v2) * (v1 + v2);
      var den = (v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1);
      df = num / den;
    }

    var alpha = 1 - cLevel;
    var tStar = tInv(1 - alpha / 2, df);
    var ME = tStar * se;
    var diff = x1 - x2;

    return {
      lower: diff - ME,
      upper: diff + ME,
      df: df,
      x1: x1, x2: x2, Sx1: s1, Sx2: s2, n1: n1, n2: n2,
      ME: ME
    };
  }

  function onePropZTest(p0, x, n, alternative) {
    if (!alternative) alternative = '\u2260';
    var pHat = x / n;
    var se = Math.sqrt(p0 * (1 - p0) / n);
    var z = (pHat - p0) / se;
    var p;

    if (alternative === '>' || alternative === '>p\u2080' || alternative === '>p₀') {
      p = 1 - phi(z);
    } else if (alternative === '<' || alternative === '<p\u2080' || alternative === '<p₀') {
      p = phi(z);
    } else {
      // two-tailed: ≠
      p = 2 * (1 - phi(Math.abs(z)));
    }

    return { z: z, p: p, pHat: pHat, n: n };
  }

  function onePropZInt(x, n, cLevel) {
    if (cLevel === undefined) cLevel = 0.95;
    var pHat = x / n;
    var alpha = 1 - cLevel;
    var zStar = phiInv(1 - alpha / 2);
    var ME = zStar * Math.sqrt(pHat * (1 - pHat) / n);
    return {
      lower: pHat - ME,
      upper: pHat + ME,
      pHat: pHat,
      n: n,
      ME: ME
    };
  }

  function twoPropZTest(x1, n1, x2, n2, alternative) {
    if (!alternative) alternative = '\u2260';
    var pHat1 = x1 / n1;
    var pHat2 = x2 / n2;
    var pHatPooled = (x1 + x2) / (n1 + n2);
    var se = Math.sqrt(pHatPooled * (1 - pHatPooled) * (1 / n1 + 1 / n2));
    var z = (pHat1 - pHat2) / se;
    var p;

    if (alternative === '>' || alternative === '>p\u2082' || alternative === '>pâ‚‚') {
      p = 1 - phi(z);
    } else if (alternative === '<' || alternative === '<p\u2082' || alternative === '<pâ‚‚') {
      p = phi(z);
    } else {
      p = 2 * (1 - phi(Math.abs(z)));
    }

    return {
      z: z,
      p: p,
      pHat1: pHat1,
      pHat2: pHat2,
      pHatPooled: pHatPooled,
      n1: n1,
      n2: n2
    };
  }

  function twoPropZInt(x1, n1, x2, n2, cLevel) {
    if (cLevel === undefined) cLevel = 0.95;
    var pHat1 = x1 / n1;
    var pHat2 = x2 / n2;
    var alpha = 1 - cLevel;
    var zStar = phiInv(1 - alpha / 2);
    var se = Math.sqrt(
      pHat1 * (1 - pHat1) / n1 +
      pHat2 * (1 - pHat2) / n2
    );
    var ME = zStar * se;
    var diff = pHat1 - pHat2;

    return {
      lower: diff - ME,
      upper: diff + ME,
      pHat1: pHat1,
      pHat2: pHat2,
      n1: n1,
      n2: n2,
      ME: ME
    };
  }

  function chi2GOFTest(observed, expected, df) {
    var chi2 = 0;
    for (var i = 0; i < observed.length; i++) {
      var diff = observed[i] - expected[i];
      chi2 += (diff * diff) / expected[i];
    }
    var p = 1 - chi2CDF(chi2, df);
    return { chi2: chi2, p: p, df: df };
  }

  function chi2Test(observedMatrix, expectedMatrix) {
    var rows = observedMatrix.length;
    var cols = observedMatrix[0].length;

    // If expectedMatrix not provided, compute from observedMatrix
    var expected;
    if (!expectedMatrix) {
      // Compute row totals, column totals, grand total
      var rowTotals = [];
      var colTotals = new Array(cols).fill(0);
      var grand = 0;
      for (var i = 0; i < rows; i++) {
        var rSum = 0;
        for (var j = 0; j < cols; j++) {
          rSum += observedMatrix[i][j];
          colTotals[j] += observedMatrix[i][j];
        }
        rowTotals.push(rSum);
        grand += rSum;
      }
      expected = [];
      for (var ii = 0; ii < rows; ii++) {
        expected.push([]);
        for (var jj = 0; jj < cols; jj++) {
          expected[ii].push(rowTotals[ii] * colTotals[jj] / grand);
        }
      }
    } else {
      expected = expectedMatrix;
    }

    var chi2 = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var d = observedMatrix[r][c] - expected[r][c];
        chi2 += (d * d) / expected[r][c];
      }
    }

    var df = (rows - 1) * (cols - 1);
    var p = 1 - chi2CDF(chi2, df);

    return { chi2: chi2, p: p, df: df, expected: expected };
  }

  function linReg(xList, yList, freq) {
    var xs = freq ? expandFreq(xList, freq) : xList;
    var ys = freq ? expandFreq(yList, freq) : yList;
    var n = xs.length;

    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (var i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
      sumXY += xs[i] * ys[i];
      sumX2 += xs[i] * xs[i];
      sumY2 += ys[i] * ys[i];
    }

    var xbar = sumX / n;
    var ybar = sumY / n;
    var Sxx = sumX2 - n * xbar * xbar;
    var Syy = sumY2 - n * ybar * ybar;
    var Sxy = sumXY - n * xbar * ybar;

    var b = Sxy / Sxx;
    var a = ybar - b * xbar;
    var r = Sxy / Math.sqrt(Sxx * Syy);
    var r2 = r * r;

    var residuals = [];
    for (var j = 0; j < n; j++) {
      residuals.push(ys[j] - (a + b * xs[j]));
    }

    return { a: a, b: b, r: r, r2: r2, residuals: residuals, n: n, Sxx: Sxx, Syy: Syy, Sxy: Sxy, xbar: xbar, ybar: ybar };
  }

  function linRegTTest(xList, yList, freq, alternative) {
    if (!alternative) alternative = '\u2260';
    var reg = linReg(xList, yList, freq);
    var n = reg.n;
    var df = n - 2;

    // Standard error of residuals
    var SSE = 0;
    for (var i = 0; i < reg.residuals.length; i++) {
      SSE += reg.residuals[i] * reg.residuals[i];
    }
    var s = Math.sqrt(SSE / df);

    // Standard error of b
    var SEb = s / Math.sqrt(reg.Sxx);
    var t = reg.b / SEb;
    var p = tPValue(t, df, alternative);

    return {
      t: t, p: p, df: df,
      a: reg.a, b: reg.b, s: s,
      r2: reg.r2, r: reg.r
    };
  }

  function linRegTInt(xList, yList, freq, cLevel) {
    if (cLevel === undefined) cLevel = 0.95;
    var reg = linReg(xList, yList, freq);
    var n = reg.n;
    var df = n - 2;

    var SSE = 0;
    for (var i = 0; i < reg.residuals.length; i++) {
      SSE += reg.residuals[i] * reg.residuals[i];
    }
    var s = Math.sqrt(SSE / df);
    var SEb = s / Math.sqrt(reg.Sxx);

    var alpha = 1 - cLevel;
    var tStar = tInv(1 - alpha / 2, df);
    var ME = tStar * SEb;

    return {
      lower: reg.b - ME,
      upper: reg.b + ME,
      b: reg.b, df: df, s: s,
      r2: reg.r2, r: reg.r
    };
  }

  function binompdf(trials, p, x) {
    if (x < 0 || x > trials) return 0;
    return Math.exp(lnChoose(trials, x) + x * Math.log(p) + (trials - x) * Math.log(1 - p));
  }

  function binomcdf(trials, p, x) {
    var sum = 0;
    var xInt = Math.floor(x);
    for (var k = 0; k <= xInt; k++) {
      sum += binompdf(trials, p, k);
    }
    return sum;
  }

  function geometpdf(p, x) {
    if (x < 1 || x !== Math.floor(x)) return 0;
    return p * Math.pow(1 - p, x - 1);
  }

  function geometcdf(p, x) {
    if (x < 1) return 0;
    return 1 - Math.pow(1 - p, Math.floor(x));
  }

  // ───────────────────────────────────────────────
  //  TI-84 Number Formatting
  // ───────────────────────────────────────────────

  function formatTI(value) {
    if (typeof value !== 'number' || isNaN(value)) return 'ERR';
    if (!isFinite(value)) return value > 0 ? '9.999999999E99' : '-9.999999999E99';
    if (value === 0) return '0';

    var abs = Math.abs(value);
    var sign = value < 0 ? '-' : '';

    // Use scientific notation for very large or very small numbers
    var useSci = abs >= 1e10 || (abs < 0.001 && abs > 0);

    if (useSci) {
      // Format in scientific notation with up to 10 significant digits
      var exp = Math.floor(Math.log10(abs));
      var mantissa = abs / Math.pow(10, exp);
      // Round to 10 significant digits (mantissa has 1 digit before decimal)
      var mantissaStr = mantissa.toPrecision(10);
      // Strip trailing zeros after decimal
      if (mantissaStr.indexOf('.') !== -1) {
        mantissaStr = mantissaStr.replace(/0+$/, '');
        mantissaStr = mantissaStr.replace(/\.$/, '');
      }
      return sign + mantissaStr + 'E' + exp;
    }

    // Fixed notation: up to 10 significant digits total
    var str = abs.toPrecision(10);

    // Remove trailing zeros after the decimal point
    if (str.indexOf('.') !== -1) {
      str = str.replace(/0+$/, '');
      str = str.replace(/\.$/, '');
    }

    // Remove leading zeros from toPrecision artifacts like "0.001..."
    // (toPrecision can sometimes give scientific notation for small numbers)
    if (str.indexOf('e') !== -1 || str.indexOf('E') !== -1) {
      // If toPrecision gave us scientific, reformat
      var v = parseFloat(str);
      var e = Math.floor(Math.log10(Math.abs(v)));
      var m = Math.abs(v) / Math.pow(10, e);
      var ms = m.toPrecision(10).replace(/0+$/, '').replace(/\.$/, '');
      return sign + ms + 'E' + e;
    }

    return sign + str;
  }

  // ───────────────────────────────────────────────
  //  Export
  // ───────────────────────────────────────────────

  var StatMath = {
    // Core stats
    oneVarStats: oneVarStats,
    linReg: linReg,

    // Distributions
    normalcdf: normalcdf,
    invNorm: invNorm,
    binompdf: binompdf,
    binomcdf: binomcdf,
    geometpdf: geometpdf,
    geometcdf: geometcdf,

    // Inference — t
    tTest: tTest,
    tInterval: tInterval,
    twoSampTTest: twoSampTTest,
    twoSampTInt: twoSampTInt,

    // Inference — z (proportions)
    onePropZTest: onePropZTest,
    onePropZInt: onePropZInt,
    twoPropZTest: twoPropZTest,
    twoPropZInt: twoPropZInt,

    // Chi-square
    chi2GOFTest: chi2GOFTest,
    chi2Test: chi2Test,

    // Regression inference
    linRegTTest: linRegTTest,
    linRegTInt: linRegTInt,

    // Formatting
    formatTI: formatTI,

    // Exposed internals (useful for testing / advanced use)
    _phi: phi,
    _phiInv: phiInv,
    _tCDF: tCDF,
    _chi2CDF: chi2CDF,
    _lnGamma: lnGamma,
    _regIncBeta: regIncBeta,
    _regGammaP: regGammaP
  };

  if (typeof window !== 'undefined') {
    window.TI84StatMath = StatMath;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatMath;
  }
})();
