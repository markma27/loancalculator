// Dark mode toggle functionality
const darkModeToggle = document.getElementById('darkModeToggle');
const html = document.documentElement;

// Set default date to today
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    document.getElementById('startingDate').value = formattedDate;
});

// Format loan amount input
const loanAmountInput = document.getElementById('loanAmount');
const repaymentAmountInput = document.getElementById('repaymentAmount');
const residualPaymentInput = document.getElementById('residualPayment');

// Function to format number with commas
function formatInputWithCommas(element) {
    // Remove any non-digit characters
    let value = element.value.replace(/[^\d]/g, '');
    // Format with commas
    if (value) {
        value = parseInt(value).toLocaleString('en-US');
    }
    element.value = value;
}

// Add event listeners for all amount inputs
[loanAmountInput, repaymentAmountInput, residualPaymentInput].forEach(input => {
    input.addEventListener('input', function(e) {
        formatInputWithCommas(this);
    });
});

// Check for saved dark mode preference
if (localStorage.getItem('darkMode') === 'true') {
    darkModeToggle.checked = true;
    html.classList.add('dark');
}

// Listen for changes to the toggle
darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
    } else {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
    }
});

// Loan calculation functions
function calculateInterestRate(loanAmount, term, payment, frequency, residual = 0, isInterestOnly = false) {
    // For interest-only loans, the calculation is simpler since payment = loanAmount * (rate/periodsPerYear)
    if (isInterestOnly) {
        const periodsPerYear = getPeriodsPerYear(frequency);
        // Solve for rate: payment = loanAmount * (rate/periodsPerYear)
        // rate = (payment * periodsPerYear) / loanAmount
        const annualRate = (payment * periodsPerYear) / loanAmount * 100;
        if (annualRate <= 0 || annualRate > 100) {
            throw new Error('Calculated interest rate is outside valid range');
        }
        return annualRate;
    }

    // Binary search method to find interest rate for regular loans
    let left = 0;  // 0%
    let right = 100;  // 100%
    const tolerance = 0.0001;
    const maxIterations = 100;
    let iterations = 0;

    while (iterations < maxIterations) {
        const mid = (left + right) / 2;
        const rateAsDecimal = mid / 100;
        
        const calculatedPayment = calculatePayment(loanAmount, rateAsDecimal, term, frequency, residual);
        
        if (Math.abs(calculatedPayment - payment) < tolerance) {
            return mid;
        }
        
        if (calculatedPayment > payment) {
            right = mid;
        } else {
            left = mid;
        }
        
        // If the range becomes too small, we've found our best approximation
        if (right - left < tolerance) {
            return mid;
        }
        
        iterations++;
    }
    
    throw new Error('Could not find a valid interest rate');
}

function calculatePayment(loanAmount, rate, term, frequency, residual = 0) {
    const periodsPerYear = getPeriodsPerYear(frequency);
    const totalPeriods = term * periodsPerYear;
    const periodicRate = rate / periodsPerYear;

    // Handle 0% interest rate
    if (rate === 0) {
        return (loanAmount - residual) / totalPeriods;
    }

    // Calculate payment with residual
    if (residual > 0) {
        const residualPresentValue = residual / Math.pow(1 + periodicRate, totalPeriods);
        const effectivePrincipal = loanAmount - residualPresentValue;
        return (effectivePrincipal * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / 
               (Math.pow(1 + periodicRate, totalPeriods) - 1);
    }

    // Standard payment calculation
    return (loanAmount * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / 
           (Math.pow(1 + periodicRate, totalPeriods) - 1);
}

function calculatePaymentDerivative(loanAmount, rate, term, frequency) {
    const periodsPerYear = getPeriodsPerYear(frequency);
    const totalPeriods = term * periodsPerYear;
    const periodicRate = rate / periodsPerYear;

    const term1 = loanAmount * Math.pow(1 + periodicRate, totalPeriods);
    const term2 = (totalPeriods * periodicRate + 1) / Math.pow(1 + periodicRate, totalPeriods);
    const term3 = totalPeriods * loanAmount * periodicRate * Math.pow(1 + periodicRate, totalPeriods - 1);
    const denominator = Math.pow(Math.pow(1 + periodicRate, totalPeriods) - 1, 2);

    return (term1 * term2 - term3) / denominator;
}

function getPeriodsPerYear(frequency) {
    switch (frequency) {
        case 'weekly': return 52;
        case 'fortnightly': return 26;
        case 'monthly': return 12;
        case 'yearly': return 1;
        default: return 12;
    }
}

// Add this function to calculate financial year
function getFinancialYear(date, fyEndMonth) {
    const month = date.getMonth() + 1; // JavaScript months are 0-based
    const year = date.getFullYear();
    
    if (fyEndMonth === 12) {
        return year.toString();
    } else {
        // For June financial year
        return month > 6 ? `${year}-${(year + 1).toString().slice(2)}` : `${year - 1}-${year.toString().slice(2)}`;
    }
}

// Update the generateSchedule function to handle yearly payments
function generateSchedule(loanAmount, term, payment, rate, frequency, residual = 0, startingDate = new Date(), fyEndMonth = 6, isInterestOnly = false) {
    const periodsPerYear = getPeriodsPerYear(frequency);
    const totalPeriods = term * periodsPerYear;
    const periodicRate = rate / periodsPerYear;
    let balance = loanAmount;
    const schedule = [];
    let currentDate = new Date(startingDate);

    // Add initial row (payment #0) to show loan setup
    schedule.push({
        paymentNumber: 0,
        date: new Date(currentDate),
        financialYear: getFinancialYear(currentDate, fyEndMonth),
        openingBalance: 0,
        principal: 0,
        interest: 0,
        repayment: 0,
        closingBalance: loanAmount
    });

    // Check if starting on last day of month
    const isLastDayOfMonth = currentDate.getDate() === new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    // Advance the date for the first payment based on frequency
    if (frequency === 'yearly') {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
    } else if (frequency === 'monthly') {
        if (isLastDayOfMonth) {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
        } else {
            const targetDay = currentDate.getDate();
            currentDate.setMonth(currentDate.getMonth() + 1);
            const lastDayOfNewMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            if (targetDay > lastDayOfNewMonth) {
                currentDate.setDate(lastDayOfNewMonth);
            } else {
                currentDate.setDate(targetDay);
            }
        }
    } else {
        currentDate.setDate(currentDate.getDate() + (frequency === 'weekly' ? 7 : 14));
    }

    // For interest-only loans, principal is only paid at the end
    if (isInterestOnly) {
        for (let i = 1; i <= totalPeriods; i++) {
            const interest = balance * periodicRate;
            let principal = 0;
            let finalPayment = interest;

            // On the last payment, pay the full principal plus interest
            if (i === totalPeriods) {
                principal = balance;
                finalPayment = principal + interest;
            }

            const newBalance = balance - principal;

            schedule.push({
                paymentNumber: i,
                date: new Date(currentDate),
                financialYear: getFinancialYear(currentDate, fyEndMonth),
                openingBalance: balance,
                principal: principal,
                interest: interest,
                repayment: finalPayment,
                closingBalance: newBalance
            });

            balance = newBalance;

            // Update date based on frequency
            if (frequency === 'yearly') {
                currentDate.setFullYear(currentDate.getFullYear() + 1);
            } else if (frequency === 'monthly') {
                if (isLastDayOfMonth) {
                    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
                } else {
                    const targetDay = currentDate.getDate();
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    const lastDayOfNewMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                    if (targetDay > lastDayOfNewMonth) {
                        currentDate.setDate(lastDayOfNewMonth);
                    } else {
                        currentDate.setDate(targetDay);
                    }
                }
            } else {
                currentDate.setDate(currentDate.getDate() + (frequency === 'weekly' ? 7 : 14));
            }
        }
        return schedule;
    }

    // Regular loan amortization schedule
    // First, check if the loan will be paid off early (ignoring residual)
    let willPayOffEarly = false;
    let earlyPayoffPeriod = 0;
    let tempBalance = loanAmount;
    
    for (let i = 1; i <= totalPeriods; i++) {
        const tempInterest = tempBalance * periodicRate;
        let tempPrincipal = payment - tempInterest;
        
        if (tempPrincipal >= tempBalance) {
            willPayOffEarly = true;
            earlyPayoffPeriod = i;
            break;
        }
        tempBalance -= tempPrincipal;
    }

    // If will pay off early, ignore residual
    if (willPayOffEarly) {
        residual = 0;
    }

    // Reset balance for actual schedule generation
    balance = loanAmount;

    for (let i = 1; i <= totalPeriods; i++) {
        const interest = balance * periodicRate;
        let principal = payment - interest;
        let finalPayment = payment;

        // If this is the last scheduled payment
        if (i === totalPeriods) {
            if (residual > 0) {
                // Adjust principal to leave exactly the residual amount
                principal = Math.max(0, balance - residual);
                finalPayment = principal + interest;
            } else {
                // No residual - pay off remaining balance
                principal = balance;
                finalPayment = principal + interest;
            }
        } else if (principal > balance - residual) {
            // For non-final payments, ensure we don't go below residual amount
            principal = Math.max(0, balance - residual);
            finalPayment = principal + interest;
        }

        const newBalance = balance - principal;

        schedule.push({
            paymentNumber: i,
            date: new Date(currentDate),
            financialYear: getFinancialYear(currentDate, fyEndMonth),
            openingBalance: balance,
            principal: principal,
            interest: interest,
            repayment: finalPayment,
            closingBalance: newBalance
        });

        balance = newBalance;

        // If loan is fully paid (and no residual), break the loop
        if (balance <= residual) {
            break;
        }

        // Update date based on frequency
        if (frequency === 'yearly') {
            currentDate.setFullYear(currentDate.getFullYear() + 1);
        } else if (frequency === 'monthly') {
            if (isLastDayOfMonth) {
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
            } else {
                const targetDay = currentDate.getDate();
                currentDate.setMonth(currentDate.getMonth() + 1);
                const lastDayOfNewMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                if (targetDay > lastDayOfNewMonth) {
                    currentDate.setDate(lastDayOfNewMonth);
                } else {
                    currentDate.setDate(targetDay);
                }
            }
        } else {
            currentDate.setDate(currentDate.getDate() + (frequency === 'weekly' ? 7 : 14));
        }
    }

    // Add final payment if there's a residual value
    if (residual > 0 && balance > 0) {
        const finalInterest = balance * periodicRate;
        const finalPrincipal = balance;
        const finalPayment = finalPrincipal + finalInterest;

        schedule.push({
            paymentNumber: schedule.length,
            date: new Date(currentDate),
            financialYear: getFinancialYear(currentDate, fyEndMonth),
            openingBalance: balance,
            principal: finalPrincipal,
            interest: finalInterest,
            repayment: finalPayment,
            closingBalance: 0
        });
    }

    return schedule;
}

// Loan calculation functions
function calculatePaymentAmount(loanAmount, rate, term, frequency, residual = 0, isInterestOnly = false) {
    const periodsPerYear = getPeriodsPerYear(frequency);
    const totalPeriods = term * periodsPerYear;
    const periodicRate = rate / periodsPerYear;

    // For interest-only loans, payment is just the periodic interest
    if (isInterestOnly) {
        return loanAmount * periodicRate;
    }

    // Handle 0% interest rate
    if (rate === 0) {
        return (loanAmount - residual) / totalPeriods;
    }

    // Calculate payment with residual
    if (residual > 0) {
        const residualPresentValue = residual / Math.pow(1 + periodicRate, totalPeriods);
        const effectivePrincipal = loanAmount - residualPresentValue;
        return (effectivePrincipal * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / 
               (Math.pow(1 + periodicRate, totalPeriods) - 1);
    }

    // Standard payment calculation
    return (loanAmount * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / 
           (Math.pow(1 + periodicRate, totalPeriods) - 1);
}

// Add validation functions
function validateInputs() {
    // Get all input values
    const loanAmount = parseFloat(document.getElementById('loanAmount').value.replace(/,/g, ''));
    const term = parseFloat(document.getElementById('loanTerm').value);
    const paymentInput = document.getElementById('repaymentAmount').value.trim();
    const interestRateInput = document.getElementById('interestRate').value.trim();
    const residualPayment = document.getElementById('residualPayment').value.trim();
    const frequency = document.getElementById('repaymentFrequency').value;

    // Validate loan amount
    if (isNaN(loanAmount) || loanAmount <= 0) {
        alert('Please enter a valid positive loan amount');
        return false;
    }

    // Validate loan term
    if (isNaN(term) || term <= 0 || term > 100) {
        alert('Please enter a valid loan term between 1 and 100 years');
        return false;
    }

    // Validate repayment amount if provided
    if (paymentInput !== '' && paymentInput.toLowerCase() !== 'unknown') {
        const payment = parseFloat(paymentInput.replace(/,/g, ''));
        if (isNaN(payment) || payment < 0) {
            alert('Repayment amount must be a positive number or left blank');
            return false;
        }

        // If both payment and interest rate are provided, validate that payment covers interest
        if (interestRateInput !== '' && interestRateInput.toLowerCase() !== 'unknown') {
            const rate = parseFloat(interestRateInput) / 100;
            const periodsPerYear = getPeriodsPerYear(frequency);
            const periodicRate = rate / periodsPerYear;
            const minimumPayment = loanAmount * periodicRate;

            if (payment <= minimumPayment) {
                alert(`Repayment amount must be greater than the periodic interest payment of $${formatNumber(minimumPayment)}.\nWith the current interest rate of ${(rate * 100).toFixed(2)}%, the minimum repayment needed to reduce the principal is $${formatNumber(minimumPayment + 0.01)}.`);
                return false;
            }
        }
    }

    // Validate interest rate if provided
    if (interestRateInput !== '' && interestRateInput.toLowerCase() !== 'unknown') {
        const rate = parseFloat(interestRateInput);
        if (isNaN(rate) || rate < 0) {
            alert('Interest rate cannot be negative');
            return false;
        }
    }

    // Validate residual payment if provided
    if (residualPayment !== '') {
        const residual = parseFloat(residualPayment.replace(/,/g, ''));
        if (isNaN(residual) || residual < 0) {
            alert('Residual payment must be a positive number or left blank');
            return false;
        }
        // Check if residual is less than loan amount
        if (residual >= loanAmount) {
            alert('Residual payment must be less than the loan amount');
            return false;
        }
    }

    return true;
}

// Add input event listeners for formatting
document.getElementById('loanAmount').addEventListener('input', function(e) {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value !== '') {
        value = parseFloat(value).toLocaleString('en-US', {
            maximumFractionDigits: 2,
            useGrouping: true
        });
    }
    e.target.value = value;
});

document.getElementById('repaymentAmount').addEventListener('input', function(e) {
    if (e.target.value.toLowerCase() !== 'unknown') {
        let value = e.target.value.replace(/[^0-9.]/g, '');
        if (value !== '') {
            value = parseFloat(value).toLocaleString('en-US', {
                maximumFractionDigits: 2,
                useGrouping: true
            });
        }
        e.target.value = value;
    }
});

document.getElementById('residualPayment').addEventListener('input', function(e) {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value !== '') {
        value = parseFloat(value).toLocaleString('en-US', {
            maximumFractionDigits: 2,
            useGrouping: true
        });
    }
    e.target.value = value;
});

document.getElementById('interestRate').addEventListener('input', function(e) {
    if (e.target.value.toLowerCase() !== 'unknown') {
        // Allow any non-negative number
        let value = e.target.value;
        
        // Remove any non-digit or non-decimal characters
        value = value.replace(/[^\d.]/g, '');
        
        // Ensure only one decimal point
        const decimalPoints = value.match(/\./g);
        if (decimalPoints && decimalPoints.length > 1) {
            value = value.substring(0, value.lastIndexOf('.'));
        }

        e.target.value = value;
    }
});

// Update the generate schedule event listener
document.getElementById('generateSchedule').addEventListener('click', () => {
    if (!validateInputs()) {
        return;
    }

    const loanAmount = parseFloat(document.getElementById('loanAmount').value.replace(/,/g, ''));
    const term = parseFloat(document.getElementById('loanTerm').value);
    const paymentInput = document.getElementById('repaymentAmount').value.trim();
    const frequency = document.getElementById('repaymentFrequency').value;
    const interestRateInput = document.getElementById('interestRate').value.trim();
    const residualPayment = parseFloat(document.getElementById('residualPayment').value.replace(/,/g, '')) || 0;
    const startingDate = document.getElementById('startingDate').value ? new Date(document.getElementById('startingDate').value) : new Date();
    const fyEndMonth = parseInt(document.getElementById('fyEndMonth').value);
    const isInterestOnly = document.getElementById('interestOnly').value === 'yes';

    let rate, payment;

    // Handle interest rate calculation or validation
    if (interestRateInput === '' || interestRateInput.toLowerCase() === 'unknown') {
        if (paymentInput === '' || paymentInput.toLowerCase() === 'unknown') {
            alert('Either Interest Rate or Repayment Amount must be provided');
            return;
        }
        payment = parseFloat(paymentInput.replace(/,/g, ''));
        try {
            rate = calculateInterestRate(loanAmount, term, payment, frequency, residualPayment, isInterestOnly);
            document.getElementById('interestRate').value = rate.toFixed(4);
        } catch (error) {
            alert('Could not calculate interest rate. Please check your inputs.');
            return;
        }
    } else {
        rate = parseFloat(interestRateInput);
        if (paymentInput === '' || paymentInput.toLowerCase() === 'unknown') {
            // Calculate payment amount
            payment = calculatePaymentAmount(loanAmount, rate/100, term, frequency, residualPayment, isInterestOnly);
            document.getElementById('repaymentAmount').value = payment.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        } else {
            payment = parseFloat(paymentInput.replace(/,/g, ''));
        }
    }

    const schedule = generateSchedule(loanAmount, term, payment, rate/100, frequency, residualPayment, startingDate, fyEndMonth, isInterestOnly);
    displaySchedule(schedule);
});

// Add function to generate financial year summary
function generateFinancialYearSummary(schedule) {
    const summary = {};
    
    // Skip payment #0 (initial row) as it has no payments
    for (let i = 1; i < schedule.length; i++) {
        const row = schedule[i];
        const fy = row.financialYear;
        
        if (!summary[fy]) {
            summary[fy] = {
                principal: 0,
                interest: 0,
                repayment: 0
            };
        }
        
        summary[fy].principal += row.principal;
        summary[fy].interest += row.interest;
        summary[fy].repayment += row.repayment;
    }
    
    return Object.entries(summary).map(([fy, totals]) => ({
        financialYear: fy,
        ...totals
    }));
}

// Add function to generate journal entries
function generateJournalEntries(schedule) {
    const entries = [];
    
    // Calculate total interest and total repayment
    const totals = schedule.reduce((acc, row) => {
        if (row.paymentNumber > 0) { // Skip initial row
            acc.interest += row.interest;
            acc.repayment += row.repayment;
        }
        return acc;
    }, { interest: 0, repayment: 0 });

    // Get current financial year
    const initialRow = schedule[0];
    const fyEndMonth = parseInt(document.getElementById('fyEndMonth').value);
    const currentFY = getFinancialYear(initialRow.date, fyEndMonth);
    
    // Calculate current portion (amounts due in current financial year)
    const currentPortions = schedule.reduce((acc, row) => {
        if (row.paymentNumber > 0 && row.financialYear === currentFY) {
            acc.repayment += row.repayment;
            acc.interest += row.interest;
        }
        return acc;
    }, { repayment: 0, interest: 0 });

    // Calculate non-current portions (total minus current)
    const nonCurrentPortions = {
        repayment: totals.repayment - currentPortions.repayment,
        interest: totals.interest - currentPortions.interest
    };

    // Initial recognition - Day 0
    entries.push({
        date: initialRow.date,
        description: 'Initial recognition of hire purchase',
        entries: [
            { account: 'Fixed Asset', debit: initialRow.closingBalance, credit: 0 },
            { account: 'Unexpired Interest - Current', debit: currentPortions.interest, credit: 0 },
            { account: 'Unexpired Interest - Non-current', debit: nonCurrentPortions.interest, credit: 0 },
            { account: 'HP Liability - Current', debit: 0, credit: currentPortions.repayment },
            { account: 'HP Liability - Non-current', debit: 0, credit: nonCurrentPortions.repayment }
        ]
    });
    
    // Skip payment #0 (initial row) and process each payment
    for (let i = 1; i < schedule.length; i++) {
        const row = schedule[i];
        
        // Combined interest and payment entry
        if (row.repayment > 0) {
            entries.push({
                date: row.date,
                description: 'HP payment and interest recognition',
                entries: [
                    { account: 'HP Liability - Current', debit: row.repayment, credit: 0 },
                    { account: 'Interest Expense', debit: row.interest, credit: 0 },
                    { account: 'Unexpired Interest - Current', debit: 0, credit: row.interest },
                    { account: 'Bank/Cash', debit: 0, credit: row.repayment }
                ]
            });
        }

        // If this is the last payment of the financial year, add reclassification entry
        if (i < schedule.length - 1 && 
            row.financialYear !== schedule[i + 1].financialYear && 
            schedule[i + 1].financialYear !== '') {
            
            // Calculate next year's portions
            const nextYearPortions = schedule.slice(i + 1).reduce((acc, futureRow) => {
                if (futureRow.financialYear === schedule[i + 1].financialYear) {
                    acc.repayment += futureRow.repayment;
                    acc.interest += futureRow.interest;
                }
                return acc;
            }, { repayment: 0, interest: 0 });

            if (nextYearPortions.repayment > 0 || nextYearPortions.interest > 0) {
                entries.push({
                    date: row.date,
                    description: 'Reclassification of HP liability and unexpired interest',
                    entries: [
                        { account: 'HP Liability - Non-current', debit: nextYearPortions.repayment, credit: 0 },
                        { account: 'Unexpired Interest - Non-current', debit: 0, credit: nextYearPortions.interest },
                        { account: 'HP Liability - Current', debit: 0, credit: nextYearPortions.repayment },
                        { account: 'Unexpired Interest - Current', debit: nextYearPortions.interest, credit: 0 }
                    ]
                });
            }
        }
    }
    
    return entries;
}

// Add button click handlers
document.getElementById('showAmortisation').addEventListener('click', function() {
    showSection('amortisation');
    updateButtonStyles(this);
});

document.getElementById('showFYSummary').addEventListener('click', function() {
    showSection('fySummary');
    updateButtonStyles(this);
});

document.getElementById('showJournalEntries').addEventListener('click', function() {
    showSection('journalEntries');
    updateButtonStyles(this);
});

document.getElementById('showBalanceSheet').addEventListener('click', function() {
    showSection('balanceSheet');
    updateButtonStyles(this);
});

function updateButtonStyles(activeButton) {
    // Reset all buttons to gray
    document.querySelectorAll('#scheduleContainer button').forEach(button => {
        button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        button.classList.add('bg-gray-600', 'hover:bg-gray-700');
    });
    
    // Set active button to blue
    activeButton.classList.remove('bg-gray-600', 'hover:bg-gray-700');
    activeButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
}

function showSection(section) {
    // Hide all sections
    document.getElementById('amortisationSection').classList.add('hidden');
    document.getElementById('fySummarySection').classList.add('hidden');
    document.getElementById('journalEntriesSection').classList.add('hidden');
    document.getElementById('balanceSheetSection').classList.add('hidden');
    
    // Show selected section
    switch(section) {
        case 'amortisation':
            document.getElementById('amortisationSection').classList.remove('hidden');
            break;
        case 'fySummary':
            document.getElementById('fySummarySection').classList.remove('hidden');
            break;
        case 'journalEntries':
            document.getElementById('journalEntriesSection').classList.remove('hidden');
            break;
        case 'balanceSheet':
            document.getElementById('balanceSheetSection').classList.remove('hidden');
            break;
    }
}

// Store the current schedule data globally
let currentSchedule = null;

// Update displaySchedule to store the schedule
function displaySchedule(schedule) {
    currentSchedule = schedule; // Store the schedule
    const container = document.getElementById('scheduleContainer');
    container.classList.remove('hidden');
    
    // Display amortisation schedule
    displayAmortisationSchedule(schedule);
    
    // Display financial year summary
    displayFinancialYearSummary(generateFinancialYearSummary(schedule));
    
    // Display journal entries
    displayJournalEntries(generateJournalEntries(schedule));
    
    // Display balance sheet
    displayBalanceSheet(generateBalanceSheet(schedule));
    
    // Show amortisation section by default
    showSection('amortisation');
    updateButtonStyles(document.getElementById('showAmortisation'));
}

function displayAmortisationSchedule(schedule) {
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = '';

    // Calculate totals
    const totals = schedule.reduce((acc, row) => {
        acc.principal += row.principal;
        acc.interest += row.interest;
        acc.repayment += row.repayment;
        return acc;
    }, { principal: 0, interest: 0, repayment: 0 });

    // Update summary section
    document.getElementById('totalPrincipal').textContent = Math.abs(totals.principal) < 0.001 ? "-" : `$${formatNumber(totals.principal)}`;
    document.getElementById('totalInterest').textContent = Math.abs(totals.interest) < 0.001 ? "-" : `$${formatNumber(totals.interest)}`;
    document.getElementById('totalRepayment').textContent = Math.abs(totals.repayment) < 0.001 ? "-" : `$${formatNumber(totals.repayment)}`;

    // Display schedule rows
    schedule.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${row.paymentNumber}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${formatDate(row.date)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${row.financialYear}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.openingBalance) < 0.001 ? "-" : `$${formatNumber(row.openingBalance)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.principal) < 0.001 ? "-" : `$${formatNumber(row.principal)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.interest) < 0.001 ? "-" : `$${formatNumber(row.interest)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.repayment) < 0.001 ? "-" : `$${formatNumber(row.repayment)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.closingBalance) < 0.001 ? "-" : `$${formatNumber(row.closingBalance)}`}</td>
        `;
        tbody.appendChild(tr);
    });
}

function displayFinancialYearSummary(fySummary) {
    const tbody = document.getElementById('fySummaryTableBody');
    tbody.innerHTML = '';
    
    // Calculate totals
    const totals = fySummary.reduce((acc, row) => {
        acc.principal += row.principal;
        acc.interest += row.interest;
        acc.repayment += row.repayment;
        return acc;
    }, { principal: 0, interest: 0, repayment: 0 });

    // Update summary section
    document.getElementById('fyTotalPrincipal').textContent = Math.abs(totals.principal) < 0.001 ? "-" : `$${formatNumber(totals.principal)}`;
    document.getElementById('fyTotalInterest').textContent = Math.abs(totals.interest) < 0.001 ? "-" : `$${formatNumber(totals.interest)}`;
    document.getElementById('fyTotalRepayment').textContent = Math.abs(totals.repayment) < 0.001 ? "-" : `$${formatNumber(totals.repayment)}`;
    
    fySummary.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${row.financialYear}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.principal) < 0.001 ? "-" : `$${formatNumber(row.principal)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.interest) < 0.001 ? "-" : `$${formatNumber(row.interest)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${Math.abs(row.repayment) < 0.001 ? "-" : `$${formatNumber(row.repayment)}`}</td>
        `;
        tbody.appendChild(tr);
    });
}

function displayJournalEntries(entries) {
    const tbody = document.getElementById('journalEntriesTableBody');
    tbody.innerHTML = '';
    
    // Add header row with right-aligned Debit and Credit columns
    const thead = document.getElementById('journalEntriesTableHead');
    thead.innerHTML = `
        <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Date</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Description</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Account</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Debit</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Credit</th>
        </tr>
    `;
    
    entries.forEach(entry => {
        // Add date and description row
        const descRow = document.createElement('tr');
        descRow.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${formatDate(entry.date)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-300">${entry.description}</td>
            <td class="px-6 py-4"></td>
            <td class="px-6 py-4"></td>
            <td class="px-6 py-4"></td>
        `;
        tbody.appendChild(descRow);
        
        // Add individual debit/credit entries
        entry.entries.forEach(line => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-2"></td>
                <td class="px-6 py-2"></td>
                <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${line.account}</td>
                <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${line.debit > 0 ? `$${formatNumber(line.debit)}` : '-'}</td>
                <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${line.credit > 0 ? `$${formatNumber(line.credit)}` : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
        
        // Add a blank row after each entry for better readability
        const spacerRow = document.createElement('tr');
        spacerRow.innerHTML = '<td colspan="5" class="h-4"></td>';
        tbody.appendChild(spacerRow);
    });
}

function formatDate(date) {
    return date.toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatNumber(number) {
    // Handle zero or very small numbers (floating point precision issues)
    if (Math.abs(number) < 0.001) {
        return "-";
    }
    return number.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Function to download amortisation schedule
document.getElementById('downloadExcel').addEventListener('click', () => {
    if (!currentSchedule) return;
    
    const data = currentSchedule.map(row => [
        row.paymentNumber,
        formatDate(row.date),
        row.financialYear,
        row.openingBalance,
        row.principal,
        row.interest,
        row.repayment,
        row.closingBalance
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
        ['Payment #', 'Date', 'Financial Year', 'Opening Balance', 'Principal', 'Interest', 'Repayment', 'Closing Balance'],
        ...data
    ]);

    formatExcelSheet(ws, {
        numberCols: [0],
        currencyCols: [3, 4, 5, 6, 7]
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Amortisation Schedule');
    XLSX.writeFile(wb, 'amortisation_schedule.xlsx');
});

// Function to download financial year summary
document.getElementById('downloadFYSummary').addEventListener('click', () => {
    if (!currentSchedule) return;
    
    const fySummary = generateFinancialYearSummary(currentSchedule);
    const data = fySummary.map(row => [
        row.financialYear,
        row.principal,
        row.interest,
        row.repayment
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
        ['Financial Year', 'Principal Paid', 'Interest Paid', 'Total Repayment'],
        ...data
    ]);

    formatExcelSheet(ws, {
        currencyCols: [1, 2, 3]
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Financial Year Summary');
    XLSX.writeFile(wb, 'financial_year_summary.xlsx');
});

// Function to download journal entries
document.getElementById('downloadJournalEntries').addEventListener('click', () => {
    if (!currentSchedule) return;
    
    const journalEntries = generateJournalEntries(currentSchedule);
    const data = [];
    
    journalEntries.forEach(entry => {
        // Add description row
        data.push([
            formatDate(entry.date),
            entry.description,
            '',
            '',
            ''
        ]);
        
        // Add entry details
        entry.entries.forEach(line => {
            data.push([
                '',
                '',
                line.account,
                line.debit || '',
                line.credit || ''
            ]);
        });
        
        // Add blank row for spacing
        data.push(['', '', '', '', '']);
    });

    const ws = XLSX.utils.aoa_to_sheet([
        ['Date', 'Description', 'Account', 'Debit', 'Credit'],
        ...data
    ]);

    formatExcelSheet(ws, {
        currencyCols: [3, 4]
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Journal Entries');
    XLSX.writeFile(wb, 'journal_entries.xlsx');
});

// Helper function to format Excel sheets
function formatExcelSheet(ws, options = {}) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    const numFmt = '$#,##0.00';
    
    for(let C = 0; C <= range.e.c; C++) {
        ws['!cols'] = ws['!cols'] || [];
        ws['!cols'][C] = { wch: 20 };
        
        for(let R = 2; R <= range.e.r + 1; R++) {
            const cell_address = XLSX.utils.encode_cell({r: R-1, c: C});
            if (!ws[cell_address] || !ws[cell_address].v) continue;
            
            if (options.numberCols && options.numberCols.includes(C)) {
                ws[cell_address].z = '0';
            } else if (options.currencyCols && options.currencyCols.includes(C)) {
                ws[cell_address].z = numFmt;
            }
        }
    }
}

// Add function to generate balance sheet data
function generateBalanceSheet(schedule) {
    const balanceSheet = {};
    const fyEndMonth = parseInt(document.getElementById('fyEndMonth').value);
    
    // Initialize balances for each account
    let currentUnexpiredInterest = 0;
    let nonCurrentUnexpiredInterest = 0;
    let currentHPLiability = 0;
    let nonCurrentHPLiability = 0;

    // Process initial recognition
    const initialEntry = generateJournalEntries(schedule)[0];
    initialEntry.entries.forEach(line => {
        switch(line.account) {
            case 'Unexpired Interest - Current':
                currentUnexpiredInterest = line.debit;
                break;
            case 'Unexpired Interest - Non-current':
                nonCurrentUnexpiredInterest = line.debit;
                break;
            case 'HP Liability - Current':
                currentHPLiability = line.credit;
                break;
            case 'HP Liability - Non-current':
                nonCurrentHPLiability = line.credit;
                break;
        }
    });

    // Get all unique months from the schedule
    const months = schedule.map(row => {
        const date = new Date(row.date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }).filter((value, index, self) => self.indexOf(value) === index);

    // For each month, calculate closing balances
    months.forEach(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const lastDayOfMonth = new Date(year, month, 0);

        // Get all entries up to this month
        const monthEntries = generateJournalEntries(schedule).filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate <= lastDayOfMonth;
        });

        // Reset balances for this month
        currentUnexpiredInterest = 0;
        nonCurrentUnexpiredInterest = 0;
        currentHPLiability = 0;
        nonCurrentHPLiability = 0;

        // Process all entries up to this month
        monthEntries.forEach(entry => {
            entry.entries.forEach(line => {
                switch(line.account) {
                    case 'Unexpired Interest - Current':
                        currentUnexpiredInterest += (line.debit || 0) - (line.credit || 0);
                        break;
                    case 'Unexpired Interest - Non-current':
                        nonCurrentUnexpiredInterest += (line.debit || 0) - (line.credit || 0);
                        break;
                    case 'HP Liability - Current':
                        currentHPLiability += (line.credit || 0) - (line.debit || 0);
                        break;
                    case 'HP Liability - Non-current':
                        nonCurrentHPLiability += (line.credit || 0) - (line.debit || 0);
                        break;
                }
            });
        });

        // Store balances for this month
        const date = new Date(year, month - 1);
        const financialYear = getFinancialYear(date, fyEndMonth);
        const monthName = date.toLocaleString('default', { month: 'short' });
        
        balanceSheet[monthKey] = {
            financialYear,
            monthDisplay: `${monthName} ${year}`,
            unexpiredInterestCurrent: currentUnexpiredInterest,
            unexpiredInterestNonCurrent: nonCurrentUnexpiredInterest,
            hpLiabilityCurrent: currentHPLiability,
            hpLiabilityNonCurrent: nonCurrentHPLiability
        };
    });

    return Object.entries(balanceSheet).map(([monthKey, balances]) => ({
        monthKey,
        ...balances
    })).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// Update function to display balance sheet
function displayBalanceSheet(balanceSheet) {
    const tbody = document.getElementById('balanceSheetTableBody');
    tbody.innerHTML = '';
    
    let currentFY = '';
    
    balanceSheet.forEach(row => {
        // Add financial year separator if it's a new financial year
        if (row.financialYear !== currentFY) {
            currentFY = row.financialYear;
            const separatorRow = document.createElement('tr');
            separatorRow.innerHTML = `
                <td colspan="5" class="px-6 py-3 bg-gray-100 dark:bg-gray-700 font-semibold text-gray-900 dark:text-gray-300">
                    Financial Year: ${currentFY}
                </td>
            `;
            tbody.appendChild(separatorRow);
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${row.monthDisplay}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${Math.abs(row.unexpiredInterestCurrent) < 0.001 ? "-" : `$${formatNumber(row.unexpiredInterestCurrent)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${Math.abs(row.unexpiredInterestNonCurrent) < 0.001 ? "-" : `$${formatNumber(row.unexpiredInterestNonCurrent)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${Math.abs(row.hpLiabilityCurrent) < 0.001 ? "-" : `$${formatNumber(row.hpLiabilityCurrent)}`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300 text-right">${Math.abs(row.hpLiabilityNonCurrent) < 0.001 ? "-" : `$${formatNumber(row.hpLiabilityNonCurrent)}`}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Update the Excel download function for balance sheet
document.getElementById('downloadBalanceSheet').addEventListener('click', () => {
    if (!currentSchedule) return;
    
    const balanceSheet = generateBalanceSheet(currentSchedule);
    const data = balanceSheet.map(row => [
        row.monthDisplay,
        row.unexpiredInterestCurrent,
        row.unexpiredInterestNonCurrent,
        row.hpLiabilityCurrent,
        row.hpLiabilityNonCurrent
    ]);

    const ws = XLSX.utils.aoa_to_sheet([
        ['Month', 'Unexpired Interest - Current', 'Unexpired Interest - Non-current', 'HP Liability - Current', 'HP Liability - Non-current'],
        ...data
    ]);

    formatExcelSheet(ws, {
        currencyCols: [1, 2, 3, 4]
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    XLSX.writeFile(wb, 'balance_sheet.xlsx');
}); 