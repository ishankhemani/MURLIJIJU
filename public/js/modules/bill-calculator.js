/**
 * bill-calculator.js
 * 
 * Core calculation engine for the billing system.
 * 
 * FORMULAS:
 *   quantityQuintals   = quantityTons × 10
 *   totalBill          = quantityQuintals × ratePerQuintal
 *   totalCommission    = quantityQuintals × commissionPerQuintal
 * 
 * ROUNDING POLICY:
 *   - All intermediate calculations use full floating-point precision.
 *   - Final monetary amounts are rounded to 2 decimal places using
 *     "round half away from zero" (standard financial rounding).
 *   - quantityQuintals is stored as-is (supports fractional quintals).
 * 
 * GUARANTEES:
 *   - Never returns NaN or Infinity.
 *   - Never combines totalBill and totalCommission.
 *   - Never interprets commission as a percentage.
 *   - Validates all inputs before calculating.
 *   - Pure functions — no side effects, no network calls.
 */

// ─── Rounding ─────────────────────────────────────────────────────────────

/**
 * Round a number to the specified decimal places using
 * "round half away from zero" (standard financial rounding).
 * 
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function roundFinancial(value, decimals = 2) {
  if (!isFinite(value) || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ─── Core Calculation ──────────────────────────────────────────────────────

/**
 * Calculate all bill values from input fields.
 * 
 * @param {object} params
 * @param {number} params.quantityTons      - Quantity in tons (> 0)
 * @param {number} params.ratePerQuintal    - Rate per quintal (>= 0)
 * @param {number} params.commissionPerQuintal - Commission per quintal (>= 0)
 * 
 * @returns {object} Calculation result:
 *   {
 *     quantityTons:         number,
 *     quantityQuintals:     number,
 *     ratePerQuintal:       number,
 *     commissionPerQuintal: number,
 *     totalBill:            number,
 *     totalCommission:      number,
 *     valid:                boolean,
 *     errors:               string[]
 *   }
 */
export function calculateBill({ quantityTons, ratePerQuintal, commissionPerQuintal }) {
  const errors = [];

  // Parse to numbers safely
  const tons   = parseFloat(quantityTons);
  const rate   = parseFloat(ratePerQuintal);
  const comm   = parseFloat(commissionPerQuintal);

  // Validate
  if (isNaN(tons)  || !isFinite(tons)  || tons <= 0)  errors.push("quantityTons");
  if (isNaN(rate)  || !isFinite(rate)  || rate < 0)   errors.push("ratePerQuintal");
  if (isNaN(comm)  || !isFinite(comm)  || comm < 0)   errors.push("commissionPerQuintal");

  if (errors.length > 0) {
    return {
      quantityTons: isNaN(tons) ? 0 : Math.max(0, tons),
      quantityQuintals: 0,
      ratePerQuintal: isNaN(rate) ? 0 : Math.max(0, rate),
      commissionPerQuintal: isNaN(comm) ? 0 : Math.max(0, comm),
      totalBill: 0,
      totalCommission: 0,
      valid: false,
      errors
    };
  }

  // Core formulas
  const quantityQuintals    = tons * 10;
  const totalBillRaw        = quantityQuintals * rate;
  const totalCommissionRaw  = quantityQuintals * comm;

  // Apply financial rounding to final monetary values
  const totalBill       = roundFinancial(totalBillRaw);
  const totalCommission = roundFinancial(totalCommissionRaw);

  return {
    quantityTons: tons,
    quantityQuintals,
    ratePerQuintal: rate,
    commissionPerQuintal: comm,
    totalBill,
    totalCommission,
    valid: true,
    errors: []
  };
}

/**
 * Recalculate and validate a complete bill data object.
 * Used by the backend to verify frontend-submitted calculations.
 * 
 * @param {object} billData
 * @returns {{ recalculated: object, match: boolean, errors: string[] }}
 */
export function verifiBillCalculations(billData) {
  const result = calculateBill({
    quantityTons: billData.quantityTons,
    ratePerQuintal: billData.ratePerQuintal,
    commissionPerQuintal: billData.commissionPerQuintal
  });

  if (!result.valid) {
    return { recalculated: result, match: false, errors: result.errors };
  }

  // Compare calculated values to submitted values
  const qtyMatch  = Math.abs(result.quantityQuintals - billData.quantityQuintals) < 0.001;
  const billMatch = Math.abs(result.totalBill - billData.totalBill) < 0.01;
  const commMatch = Math.abs(result.totalCommission - billData.totalCommission) < 0.01;
  const match     = qtyMatch && billMatch && commMatch;

  return {
    recalculated: result,
    match,
    errors: match ? [] : ["Calculated values do not match submitted values"]
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────

/**
 * Run built-in test cases for the calculation engine.
 * Logs results to console. Returns true if all pass.
 * 
 * @returns {boolean}
 */
export function runCalculationTests() {
  const tests = [
    {
      name: "Test Case 1: Standard calculation",
      input: { quantityTons: 25, ratePerQuintal: 5000, commissionPerQuintal: 20 },
      expected: { quantityQuintals: 250, totalBill: 1250000, totalCommission: 5000 }
    },
    {
      name: "Test Case 2: Small quantity",
      input: { quantityTons: 1, ratePerQuintal: 2000, commissionPerQuintal: 10 },
      expected: { quantityQuintals: 10, totalBill: 20000, totalCommission: 100 }
    },
    {
      name: "Test Case 3: Fractional quantity",
      input: { quantityTons: 0.5, ratePerQuintal: 4000, commissionPerQuintal: 15 },
      expected: { quantityQuintals: 5, totalBill: 20000, totalCommission: 75 }
    },
    {
      name: "Test Case 4: Zero rate (valid — rate >= 0)",
      input: { quantityTons: 10, ratePerQuintal: 0, commissionPerQuintal: 20 },
      expected: { quantityQuintals: 100, totalBill: 0, totalCommission: 2000 },
      expectValid: true
    },
    {
      name: "Test Case 5: Zero commission (valid)",
      input: { quantityTons: 10, ratePerQuintal: 3000, commissionPerQuintal: 0 },
      expected: { quantityQuintals: 100, totalBill: 300000, totalCommission: 0 },
      expectValid: true
    },
    {
      name: "Test Case 6: Invalid — zero quantity",
      input: { quantityTons: 0, ratePerQuintal: 5000, commissionPerQuintal: 20 },
      expectValid: false
    },
    {
      name: "Test Case 7: Invalid — negative quantity",
      input: { quantityTons: -5, ratePerQuintal: 5000, commissionPerQuintal: 20 },
      expectValid: false
    },
    {
      name: "Test Case 8: Invalid — NaN quantity",
      input: { quantityTons: NaN, ratePerQuintal: 5000, commissionPerQuintal: 20 },
      expectValid: false
    },
    {
      name: "Test Case 9: Invalid — negative rate",
      input: { quantityTons: 10, ratePerQuintal: -100, commissionPerQuintal: 20 },
      expectValid: false
    },
    {
      name: "Test Case 10: Invalid — negative commission",
      input: { quantityTons: 10, ratePerQuintal: 5000, commissionPerQuintal: -5 },
      expectValid: false
    },
    {
      name: "Test Case 11: Large values",
      input: { quantityTons: 10000, ratePerQuintal: 10000, commissionPerQuintal: 100 },
      expected: { quantityQuintals: 100000, totalBill: 1000000000, totalCommission: 10000000 },
      expectValid: true
    },
    {
      name: "Test Case 12: Decimal quantities",
      input: { quantityTons: 0.75, ratePerQuintal: 4500, commissionPerQuintal: 25 },
      expected: { quantityQuintals: 7.5, totalBill: 33750, totalCommission: 187.5 },
      expectValid: true
    }
  ];

  let allPassed = true;
  let passed = 0;
  let failed = 0;

  console.group("🧮 Bill Calculator Test Suite");

  for (const test of tests) {
    const result = calculateBill(test.input);
    const expectValid = test.expectValid !== undefined ? test.expectValid : true;

    if (result.valid !== expectValid) {
      console.error(`❌ FAIL: ${test.name}`);
      console.error(`   Expected valid=${expectValid}, got valid=${result.valid}`);
      console.error(`   Result:`, result);
      allPassed = false;
      failed++;
      continue;
    }

    if (expectValid && test.expected) {
      const pass =
        Math.abs(result.quantityQuintals - test.expected.quantityQuintals) < 0.001 &&
        Math.abs(result.totalBill        - test.expected.totalBill)        < 0.01 &&
        Math.abs(result.totalCommission  - test.expected.totalCommission)  < 0.01;

      if (!pass) {
        console.error(`❌ FAIL: ${test.name}`);
        console.error(`   Expected:`, test.expected);
        console.error(`   Got:`, {
          quantityQuintals: result.quantityQuintals,
          totalBill: result.totalBill,
          totalCommission: result.totalCommission
        });
        allPassed = false;
        failed++;
      } else {
        console.log(`✅ PASS: ${test.name}`);
        passed++;
      }
    } else if (!expectValid) {
      console.log(`✅ PASS: ${test.name} (correctly rejected invalid input)`);
      passed++;
    } else {
      console.log(`✅ PASS: ${test.name}`);
      passed++;
    }
  }

  console.groupEnd();
  console.info(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

  return allPassed;
}
