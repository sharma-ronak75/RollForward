'use strict';

const UI_TIMINGS = Object.freeze({
    toastDurationMs: 4_200,
    filterDebounceMs: 200,
    progressCompletionMs: 700,
    countUpAnimationMs: 900,
    rippleDurationMs: 700,
    sparkDurationMs: 650,
    confettiSecondBurstDelayMs: 380,
    modalClosingMs: 260,
    modalCloseCallbackMs: 120,
    processingReducedMotionMs: 200,
    processingDurationMs: 1_700,
});

const UI_LIMITS = Object.freeze({
    minimumDonationQuantity: 1,
    maximumDonationQuantity: 50,
    maximumItemsPerPledge: 10,
    adminDonationChartDays: 14,
    maximumStaggerIndex: 12,
    sparkCount: 9,
    maxDevicePixelRatio: 2,
    primaryConfettiCount: 150,
    secondaryConfettiCount: 70,
    maximumConfettiAgeFrames: 330,
    confettiFadeFrames: 70,
    maximumCelebrationLines: 5,
    celebrationSparkCount: 14,
    defaultFontSizePx: 17,
    minimumFontSizePx: 14,
    maximumFontSizePx: 24,
    fontSizeStepPx: 2,
});

const UI_GEOMETRY = Object.freeze({
    avatarHueMultiplier: 47,
    hueDegrees: 360,
    wheelSpokeCount: 16,
    wheelRadius: 45,
});

const EFFECTS = Object.freeze({
    sparkMinimumDistancePx: 28,
    sparkDistanceRangePx: 28,
    confettiPieceMinimumWidthPx: 6,
    confettiPieceWidthRangePx: 7,
    confettiPieceMinimumHeightPx: 4,
    confettiPieceHeightRangePx: 5,
    confettiGravity: 0.32,
    confettiFriction: 0.991,
    confettiWobbleSpeed: 0.08,
    confettiWobbleDistance: 0.6,
});

// Payment QR settings. Replace upiId with the real UPI ID (VPA) that receives donations.
const PAYMENT = Object.freeze({
    upiId: 'rollforward@upi',
    payeeName: 'Roll Forward',
    // Placeholder verification: pressing Space marks the payment as received.
    // Remove this once real payment verification is wired in.
    simulateWithSpace: true,
});
