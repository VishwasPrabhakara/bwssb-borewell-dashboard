/* ==========================================================================
   BBMP Borewell Dashboard - Quality Control Scoring & Ward Analytics Lenses
   ========================================================================== */

    const scaledSpecificCapacity = (scaledValue, rawValue) => {
      const scaled = Number(scaledValue);
      if (Number.isFinite(scaled)) return scaled;
      const raw = Number(rawValue);
      return Number.isFinite(raw) ? raw * 1000000 : null;
    };
    const isGroundwaterCriticalWard = (critical) => (
      critical?.groundwaterStatus === 'Critical'
      || critical?.dashboardMapCategory ===
        'Critical: Ward-average groundwater decline'
    );

    const isGroundwaterWatchWard = () => false;

    const isGroundwaterRiseWard = (critical) => (
      critical?.dashboardMapCategory === 'Confirmed groundwater rise'
      || critical?.dashboardMapCategory === 'Possible groundwater rise'
      || critical?.groundwaterDirection === 'Improving'
      || critical?.groundwaterDirection === 'Possible improvement'
      || critical?.groundwaterRiseOverride === 'Yes'
    );

    const isGroundwaterActionWard = (critical) => (
      isGroundwaterCriticalWard(critical)
      || isGroundwaterWatchWard(critical)
    );

    const isLinearMannKendallScreeningWard = () => false;

    const isOldCriticalNoGroundwaterWard = (critical) => (
      critical?.oldConsumptionNoGroundwaterData === 'Yes'
    );

    const hasNumericTrendValue = (value) => (
      value !== null
      && value !== undefined
      && String(value).trim() !== ''
      && String(value).trim().toLowerCase() !== 'null'
      && Number.isFinite(Number(value))
    );

    const groundwaterTrendPointCount = (critical = {}) => {
      const value = Number(
        critical?.pointCount
        ?? critical?.usableWeeklyValues
        ?? critical?.weeklyPointsUsed
        ?? 0
      );
      return Number.isFinite(value) ? value : 0;
    };

    const hasGroundwaterTrendEvidence = (critical) => (
      groundwaterTrendPointCount(critical) >= GROUNDWATER_MIN_SLOPE_WEEKS
      && (
        hasNumericTrendValue(critical?.senSlopeFtPerWeek)
        || hasNumericTrendValue(critical?.linearSlopeFtPerWeek)
      )
    );

    if (typeof groundwaterMethodOptions === 'undefined') {
      window.groundwaterMethodOptions = [
        { value: 'dashboard', label: 'Linear + Mann-Kendall with Review' },
        { value: 'linear', label: 'Linear only' },
        { value: 'theil', label: 'Theil-Sen only' },
        { value: 'mann', label: 'Mann-Kendall only' },
        { value: 'linear_theil', label: 'Linear + Theil-Sen' },
        { value: 'linear_mann', label: 'Linear + Mann-Kendall' },
        { value: 'theil_mann', label: 'Theil-Sen + Mann-Kendall' },
        { value: 'all_three', label: 'Linear + Theil-Sen + Mann-Kendall' }
      ];
    }

    if (typeof wardAnalysisLensOptions === 'undefined') {
      window.wardAnalysisLensOptions = [
        { value: 'groundwater', label: 'Groundwater Decline' },
        { value: 'overall', label: 'Common' },
        { value: 'volumetric_deficit', label: 'High Volumetric Deficit (ML)' },
        { value: 'extraction', label: 'High Extraction' },
        { value: 'pumping_stress', label: 'High Pumping Stress (Drawdown/m3)' },
        { value: 'consumption', label: 'Previous Consumption Criticality' },
        { value: 'specific_capacity', label: 'Low Specific Capacity' }
      ];
    }



    const wardAnalysisLensLabel = (value = wardAnalysisLens) => (
      wardAnalysisLensOptions.find((item) => item.value === value)?.label
      || wardAnalysisLensOptions[0].label
    );

    const groundwaterMethodLabel = (value = groundwaterMethodMode) => (
      groundwaterMethodOptions.find((item) => item.value === value)?.label
      || groundwaterMethodOptions[0].label
    );

    const isYes = (value) => String(value || '').trim().toLowerCase() === 'yes';

    const methodVotesForCritical = (critical = {}) => ({
      linear: isYes(critical.linearMethodCritical),
      theil: isYes(critical.theilSenMethodCritical),
      mann: isYes(critical.mannKendallMethodCritical)
    });

    const selectedMethodIsCritical = (critical = {}, mode = groundwaterMethodMode) => {
      const votes = methodVotesForCritical(critical);
      if (mode === 'dashboard') {
        return isYes(critical.dashboardAction) || isGroundwaterCriticalWard(critical);
      }
      if (mode === 'linear') return votes.linear;
      if (mode === 'theil') return votes.theil;
      if (mode === 'mann') return votes.mann;
      if (mode === 'linear_theil') return votes.linear && votes.theil;
      if (mode === 'linear_mann') {
        return isYes(critical.linearMannKendallCritical) || (votes.linear && votes.mann);
      }
      if (mode === 'theil_mann') {
        return isYes(critical.theilSenMannKendallCritical) || (votes.theil && votes.mann);
      }
      if (mode === 'all_three') return votes.linear && votes.theil && votes.mann;
      return votes.theil && votes.mann;
    };

    const initializeHighestCountGroundwaterMethod = () => {
      if (groundwaterMethodDefaultInitialized || !criticalGroundwaterByNo.size) return;
      let selected = groundwaterMethodOptions[0].value;
      let highestCount = -1;
      for (const option of groundwaterMethodOptions) {
        const count = Array.from(criticalGroundwaterByNo.values()).filter((critical) => (
          critical?.groundwaterRiseOverride !== 'Yes'
          && selectedMethodIsCritical(critical, option.value)
        )).length;
        if (count > highestCount) {
          highestCount = count;
          selected = option.value;
        }
      }
      groundwaterMethodMode = selected;
      groundwaterMethodDefaultInitialized = true;
    };

    const selectedMethodSlope = (critical = {}, mode = groundwaterMethodMode) => {
      const linear = Number(critical.linearSlopeFtPerWeek);
      const theil = Number(critical.senSlopeFtPerWeek);
      if (mode === 'dashboard') return Number.isFinite(linear) ? linear : theil;
      if (mode === 'theil' || mode === 'theil_mann') return theil;
      if (mode === 'linear' || mode === 'linear_mann') return linear;
      if (mode === 'linear_theil' || mode === 'all_three') {
        return Number.isFinite(theil) ? theil : linear;
      }
      return Number.isFinite(linear) ? linear : theil;
    };

    const overallCriticalLensFlags = (wardNo) => {
      const normalizedWardNo = normalizeWardNo(wardNo);
      const critical = criticalForWardNo(normalizedWardNo);
      const pumping = pumpingWardSummaryForNo(normalizedWardNo);
      const vd = wardVolumetricDeficit(normalizedWardNo);
      return {
        groundwater: wardStatusKey(critical) === 'critical',
        volumetric_deficit: vd.deficitMl >= 10.0,
        extraction: Boolean(pumping?.criticalByExtraction),
        pumping_stress: Boolean(pumping?.highNormalizedDrawdown),
        specific_capacity: Boolean(pumping?.criticalBySpecificCapacity)
      };
    };

    const overallLensCritical = (wardNo) => {
        const flags = overallCriticalLensFlags(wardNo);

        const activeCount =
            Object.values(flags).filter(Boolean).length;

        return activeCount >= commonLensCount;
    };

    const isSelectedGroundwaterStable = (critical = {}) => {
      return hasGroundwaterTrendEvidence(critical);
    };

    const criticalForSelectedMethod = (critical) => {
      if (!critical) return null;
      const hasTrendEvidence = hasGroundwaterTrendEvidence(critical);
      if (critical.groundwaterRiseOverride === 'Yes') {
        return {
          ...critical,
          groundwaterStatus: 'Normal',
          groundwaterDirection: critical.groundwaterDirection || 'Possible improvement',
          dashboardAction: 'No',
          dashboardMapCategory: critical.dashboardMapCategory === 'Confirmed groundwater rise'
            ? 'Confirmed groundwater rise'
            : 'Possible groundwater rise'
        };
      }
      const selectedCritical = selectedMethodIsCritical(critical);
      if (selectedCritical) {
        return {
          ...critical,
          groundwaterStatus: 'Critical',
          groundwaterDirection: 'Declining',
          dashboardAction: 'Yes',
          dashboardMapCategory: 'Critical: Ward-average groundwater decline',
          selectedGroundwaterMethod: groundwaterMethodLabel()
        };
      }
      if (isOldCriticalNoGroundwaterWard(critical)) {
        return {
          ...critical,
          groundwaterStatus: 'Insufficient data',
          groundwaterDirection: 'Not computed',
          dashboardAction: 'No',
          dashboardMapCategory: 'Insufficient groundwater data'
        };
      }
      const selectedStable = isSelectedGroundwaterStable(critical);
      return {
        ...critical,
        groundwaterStatus: hasTrendEvidence ? 'Normal' : 'Insufficient data',
        groundwaterDirection: hasTrendEvidence
          ? critical.groundwaterDirection === 'Improving' ? 'Improving' : selectedStable ? 'Stable' : 'Mixed / not classified'
          : 'Not computed',
        dashboardAction: 'No',
        dashboardMapCategory: !hasTrendEvidence
          ? 'Insufficient groundwater data'
          : critical.dashboardMapCategory === 'Confirmed groundwater rise'
          ? 'Confirmed groundwater rise'
          : selectedStable
          ? 'Stable groundwater trend'
          : 'Mixed / unclassified groundwater trend'
      };
    };

    const criticalForWardNo = (wardNo) => {
      const normalizedWardNo = normalizeWardNo(wardNo);
      const base = criticalGroundwaterByNo.get(normalizedWardNo);
      return criticalForSelectedMethod(base) || deriveCriticalForWardStatistic(normalizedWardNo, base);
    };

    const pumpingWardSummaryForNo = (wardNo) => (
      pumpingPerformanceWardSummaryByNo.get(normalizeWardNo(wardNo)) || null
    );

    const wardVolumetricDeficit = (wardNo) => {
      const normalizedWardNo = normalizeWardNo(wardNo);
      const critical = criticalForWardNo(normalizedWardNo);
      const indicators = wardIndicatorsByNo.get(normalizedWardNo);

      const rawMl = indicators?.volumetric_deficit_ml ?? indicators?.volumetricDeficitMl ?? critical?.volumetric_deficit_ml ?? critical?.volumetricDeficitMl;
      if (rawMl != null && Number.isFinite(Number(rawMl)) && Number(rawMl) > 0) {
        return {
          deficitMl: Number(rawMl),
          deficitM3: Number(indicators?.volumetric_deficit_m3 ?? indicators?.volumetricDeficitM3 ?? critical?.volumetric_deficit_m3 ?? Number(rawMl) * 1000),
          deficitTankers: Number(indicators?.volumetric_deficit_tankers ?? indicators?.volumetricDeficitTankers ?? critical?.volumetric_deficit_tankers ?? (Number(rawMl) * 1000) / 12),
          durationDays: Number(indicators?.record_duration_days ?? indicators?.recordDurationDays ?? critical?.record_duration_days ?? 60),
          category: indicators?.observation_period_category ?? indicators?.observationPeriodCategory ?? critical?.observation_period_category ?? 'Medium-term Trend (60-365 days)'
        };
      }

      const slopeFtPerWeek = Number(
        indicators?.waterLevelTrendFtPerWeek ??
        indicators?.water_level_trend_ft_per_week ??
        critical?.senSlopeFtPerWeek ??
        critical?.linearSlopeFtPerWeek ??
        critical?.waterLevelTrendFtPerWeek ??
        critical?.water_level_trend_ft_per_week ??
        (indicators?.waterLevelTrendFtPerMonth != null ? Number(indicators.waterLevelTrendFtPerMonth) / 4.345 : null) ??
        0
      );
      if (!Number.isFinite(slopeFtPerWeek) || slopeFtPerWeek <= 0) {
        return { deficitMl: 0, deficitM3: 0, deficitTankers: 0, durationDays: 0, category: 'Insufficient Data' };
      }

      const popItem = populationByWardNo.get(normalizedWardNo);
      const areaKm2 = Number(popItem?.areaKm2 ?? popItem?.area_km2 ?? 8.0);
      const pointCount = Number(critical?.usableWeeklyValues ?? critical?.pointCount ?? 8);
      const durationDays = Math.max(pointCount * 7, 30);

      const totalDropFt = slopeFtPerWeek * (durationDays / 7.0);
      const totalDropM = totalDropFt * 0.3048;
      const areaM2 = areaKm2 * 1000000.0;
      const specificYield = 0.02;

      const deficitM3 = areaM2 * totalDropM * specificYield;
      const deficitMl = deficitM3 / 1000.0;
      const deficitTankers = deficitM3 / 12.0;

      const category = durationDays < 60
        ? 'Short-term Observation (<60 days)'
        : durationDays <= 365
        ? 'Medium-term Trend (60-365 days)'
        : 'Multi-season Validated Trend (>365 days)';

      return {
        deficitMl,
        deficitM3,
        deficitTankers,
        durationDays,
        category
      };
    };

    const isPreviousConsumptionCriticalWard = (wardNo) => {
      const ward = criticalGroundwaterByNo.get(normalizeWardNo(wardNo));
      return isYes(ward?.previousCriticalWard) || isYes(ward?.oldConsumptionNoGroundwaterData);
    };

    const mapWardStatusKey = (wardNo) => {
      if (wardAnalysisLens === 'overall') {
        return overallLensCritical(wardNo) ? 'critical' : '';
      }
      if (wardAnalysisLens === 'consumption') {
        return isPreviousConsumptionCriticalWard(wardNo) ? 'critical' : '';
      }
      if (wardAnalysisLens === 'volumetric_deficit') {
        const vd = wardVolumetricDeficit(wardNo);
        return vd.deficitMl >= 10.0 ? 'critical' : vd.deficitMl > 0 ? 'stable' : '';
      }
      if (wardAnalysisLens === 'extraction') {
        const pumping = pumpingWardSummaryForNo(wardNo);
        if (!pumping) return '';
        return pumping.criticalByExtraction ? 'critical' : 'stable';
      }
      if (wardAnalysisLens === 'specific_capacity') {
        const pumping = pumpingWardSummaryForNo(wardNo);
        if (!pumping) return '';
        return pumping.criticalBySpecificCapacity ? 'critical' : 'stable';
      }
      if (wardAnalysisLens === 'pumping_stress') {
        const pumping = pumpingWardSummaryForNo(wardNo);
        if (!pumping) return '';
        return pumping.highNormalizedDrawdown ? 'critical' : 'stable';
      }
      return wardStatusKey(criticalForWardNo(wardNo));
    };

    const mapWardCategoryForNo = (wardNo) => {
      const pumping = pumpingWardSummaryForNo(wardNo);
      const critical = mapWardStatusKey(wardNo) === 'critical';
      if (wardAnalysisLens === 'overall') {
        const flags = overallCriticalLensFlags(wardNo);
        const count = Object.values(flags).filter(Boolean).length;

        return critical
          ? `Common across ${count}/5 lenses`
          : `Below selected common threshold (${count}/5)`;
      }
      if (wardAnalysisLens === 'consumption') {
        return critical ? 'Previous Consumption-Critical Ward' : 'Not critical under previous consumption method';
      }
      if (wardAnalysisLens === 'volumetric_deficit') {
        const vd = wardVolumetricDeficit(wardNo);
        return critical
          ? `Critical: Severe Volumetric Loss (${formatNumber(vd.deficitMl, 2)} ML)`
          : vd.deficitMl > 0
          ? `Low/Moderate Volumetric Deficit (${formatNumber(vd.deficitMl, 2)} ML)`
          : 'No groundwater deficit calculated';
      }
      if (wardAnalysisLens === 'extraction') {
        if (!pumping) return 'No valid pumping-session data';
        return critical ? 'Critical: High Estimated Extraction' : 'Below high-extraction threshold';
      }
      if (wardAnalysisLens === 'specific_capacity') {
        if (!pumping) return 'No valid specific-capacity sessions';
        return critical ? 'Critical: Low Specific Capacity' : 'Above low-performance threshold';
      }
      if (wardAnalysisLens === 'pumping_stress') {
        if (!pumping) return 'No valid pumping-session data';
        return critical ? 'Critical: High Drawdown per m3' : 'Below high pumping-stress threshold';
      }
      return wardMapCategory(criticalForWardNo(wardNo));
    };

    const mapWardReasonForNo = (wardNo) => {
      const pumping = pumpingWardSummaryForNo(wardNo);
      if (wardAnalysisLens === 'overall') {
        const flags = overallCriticalLensFlags(wardNo);
        const count = Object.values(flags).filter(Boolean).length;

        const active = [];

        if (flags.groundwater) {
          active.push('Groundwater Decline');
        }

        if (flags.volumetric_deficit) {
          active.push('Volumetric Deficit');
        }

        if (flags.extraction) {
          active.push('High Extraction');
        }

        if (flags.pumping_stress) {
          active.push('Pumping Stress');
        }

        if (flags.specific_capacity) {
          active.push('Low Specific Capacity');
        }

        return overallLensCritical(wardNo)
          ? `This ward is active in ${count}/5 analytical lenses and meets the selected Common threshold of at least ${commonLensCount}/5. Active lenses: ${active.join(', ')}.`
          : `This ward is active in ${count}/5 analytical lenses and does not meet the selected Common threshold of at least ${commonLensCount}/5. Active lenses: ${active.join(', ') || 'None'}.`;
      }
      if (wardAnalysisLens === 'consumption') {
        return isPreviousConsumptionCriticalWard(wardNo)
          ? 'This ward belongs to the original 60 wards identified by the earlier consumption-based assessment.'
          : 'This ward was not included in the original 60 consumption-critical wards.';
      }
      if (wardAnalysisLens === 'volumetric_deficit') {
        const vd = wardVolumetricDeficit(wardNo);
        const tankers = formatNumber(vd.deficitTankers, 0);
        return vd.deficitMl >= 10.0
          ? `Estimated groundwater storage loss is ${formatNumber(vd.deficitMl, 2)} ML (~${tankers} tankers) based on Specific Yield (Sy=0.02). Exceeds severe deficit threshold (10 ML).`
          : vd.deficitMl > 0
          ? `Estimated groundwater storage loss is ${formatNumber(vd.deficitMl, 2)} ML (~${tankers} tankers), which is below the severe deficit cutoff (10 ML).`
          : 'No water table decline detected for this ward.';
      }

      if (wardAnalysisLens === 'extraction') {
        if (!pumping) return 'No valid discharge, duration, and drawdown sessions are available.';
        return `Estimated pumped volume is ${formatNumber(pumping.totalPumpedVolumeM3, 0)} m3. The citywide high-extraction cutoff is ${formatNumber(pumpingPerformanceWardThresholds.extractionP75M3, 0)} m3.`;
      }
      if (wardAnalysisLens === 'specific_capacity') {
        if (!pumping) return 'No valid positive-duration, positive-drawdown pumping sessions are available.';
        return `Ward median specific capacity is ${formatNumber(pumping.medianSpecificCapacityScaled, 4)} x10^-6 m2/s. The citywide low-performance cutoff is ${formatNumber(pumpingPerformanceWardThresholds.specificCapacityP25Scaled, 4)} x10^-6 m2/s.`;
      }
      if (wardAnalysisLens === 'pumping_stress') {
        if (!pumping) return 'No valid discharge, duration, and drawdown sessions are available.';
        return `Ward median volume-normalized drawdown is ${formatNumber(pumping.medianNormalizedDrawdownFtPerM3, 2)} ft/m3. The citywide high-stress cutoff is ${formatNumber(pumpingPerformanceWardThresholds.normalizedDrawdownP75FtPerM3, 2)} ft/m3.`;
      }
      return criticalForWardNo(wardNo)?.updateReason || 'Groundwater status uses the selected cleaned weekly trend method.';
    };

    const mapLensCriticalColor = () => 'rgb(255, 0, 0)';

    const mapLensCriticalLabel = () => ({
      groundwater: 'Critical: GW Decline',
      overall: `Common (≥ ${commonLensCount}/5)`,
      volumetric_deficit: 'Critical: High Volumetric Loss',
      extraction: 'Critical: High Extraction',
      consumption: 'Previous Consumption Critical',
      specific_capacity: 'Critical: Low Specific Capacity',
      pumping_stress: 'Critical: High Drawdown per m3'
    }[wardAnalysisLens] || 'Critical ward');


    const wardStatusKey = (critical) => {
      if (isGroundwaterCriticalWard(critical)) return 'critical';
      if (isGroundwaterRiseWard(critical)) return 'rise';
      if (
        critical
        && critical.dashboardMapCategory === 'Stable groundwater trend'
        && isSelectedGroundwaterStable(critical)
      ) {
        return 'stable';
      }
      return '';
    };

    const wardMapCategory = (critical) => {
      if (!critical) return 'Not available';

      if (isGroundwaterCriticalWard(critical)) {
        return 'Critical: Groundwater Decline';
      }

      if (
        critical.dashboardMapCategory ===
        'Confirmed groundwater rise'
        || critical.groundwaterDirection === 'Improving'
      ) {
        return 'Confirmed Groundwater Rise';
      }

      if (
        critical.dashboardMapCategory ===
        'Possible groundwater rise'
        || critical.groundwaterDirection ===
          'Possible improvement'
      ) {
        return 'Possible Groundwater Rise';
      }

      if (
        critical.dashboardMapCategory ===
        'Insufficient groundwater data'
        || critical.groundwaterStatus ===
          'Insufficient data'
      ) {
        return 'Insufficient Groundwater Data';
      }

      if (
        critical.dashboardMapCategory ===
        'Stable groundwater trend'
      ) {
        return 'Stable Groundwater Trend';
      }

      if (isOldCriticalNoGroundwaterWard(critical)) {
        return 'Insufficient Groundwater Data';
      }

      return 'Mixed / Unclassified Groundwater Trend';
    };
    const hasValidSpecificCapacity = (capacity) => (
      Boolean(capacity)
      && Number(capacity.validSessions || 0) > 0
      && Number(capacity.uidCount || 0) > 0
      && Number.isFinite(Number(capacity.averageSpecificCapacityM2s ?? capacity.averageTransmissivityScaled))
    );
    const formatTrend = (value, unit, decimals = 2) => value == null ? '-' : `${formatNumber(value, decimals)} ${unit}`;
    const formatScore = (value) => value == null ? '-' : `${formatNumber(value, 1)} / 100`;
    const criticalReasonHtml = (critical) => {
      if (!critical) return '';

      const category = wardMapCategory(critical);

      const visibleCategories = [
        'Critical: Groundwater Decline'
      ];

      if (!visibleCategories.includes(category)) return '';

      const senSlope = formatTrend(
        critical.senSlopeFtPerWeek,
        'ft/week',
        2
      );

      const linearSlope = formatTrend(
        critical.linearSlopeFtPerWeek,
        'ft/week',
        2
      );

      const pValue =
        critical.mannKendallPValue == null
          ? '-'
          : formatNumber(
              critical.mannKendallPValue,
              4
            );

      const points = formatNumber(
        critical.pointCount ?? critical.usableWeeklyValues ?? 0
      );
      const levelConfig = wardLevelStatisticConfig();

      return `
        <div class="critical-reason ${
          category.startsWith('Warning')
            ? 'screening'
            : ''
        }">
          <strong>Why this ward is marked on the map</strong>

          <p>
            The map category is determined from the cleaned
            ${levelConfig.noteLabel} weekly groundwater-level trend.
          </p>

          <ul>
            <li>${levelConfig.metricPrefix} Theil-Sen slope: ${senSlope}.</li>
            <li>${levelConfig.metricPrefix} linear slope: ${linearSlope}.</li>
            <li>Mann-Kendall p-value: ${pValue}.</li>
            <li>Weekly ${levelConfig.noteLabel} points used: ${points}.</li>
          </ul>

          <p>
            Positive depth slope means groundwater is becoming deeper
            and indicates decline. Individual borewell trends are shown
            separately as supporting evidence.
          </p>
        </div>
      `;
    };
    const wardCategoryDisplay = (critical, trendShape = null) => {
      const category = wardMapCategory(critical);

      if (category === 'Critical: Groundwater Decline') {
        if (trendShape?.recent === 'rise') {
          return {
            category: 'Critical by full-period method; recent recovery observed',
            className: 'critical',
            explanation:
              'The selected full-period groundwater method still marks this ward as declining, but the recent 8-week trend indicates recovery. Treat it as a priority ward with improving recent evidence.'
          };
        }

        if (trendShape?.recent === 'stable') {
          return {
            category: 'Critical by full-period method; recent trend stable',
            className: 'critical',
            explanation:
              'The selected full-period groundwater method still marks this ward as declining, but the recent 8-week trend is mostly stable. Review the full trend and recent readings together.'
          };
        }
      }

      return { category, className: null, explanation: null };
    };

    const wardCategoryCardHtml = (critical, trendShape = null) => {
  const categoryDisplay = wardCategoryDisplay(critical, trendShape);
  const category = categoryDisplay.category;
  const levelConfig = wardLevelStatisticConfig();

  const categoryConfig = {
    'Critical: Groundwater Decline': {
      className: 'critical',
      explanation:
        `The cleaned ${levelConfig.noteLabel} weekly groundwater series shows a statistically significant decline.`
    },

    'Confirmed Groundwater Rise': {
      className: 'neutral',
      explanation:
        `The cleaned ${levelConfig.noteLabel} weekly groundwater series shows a statistically significant rise. Groundwater depth below the surface is decreasing.`
    },

    'Possible Groundwater Rise': {
      className: 'neutral',
      explanation:
        `The cleaned ${levelConfig.noteLabel} weekly groundwater series indicates a possible rise, but the trend is not statistically significant.`
    },

    'Stable Groundwater Trend': {
      className: 'neutral',
      explanation:
        `The cleaned ${levelConfig.noteLabel} groundwater slope is within the near-flat threshold, so this ward is treated as stable.`
    },

    'Mixed / Unclassified Groundwater Trend': {
      className: 'neutral',
      explanation:
        `The cleaned ${levelConfig.noteLabel} groundwater indicators do not meet the selected decline, rise, or near-flat stable criteria.`
    },

    'Insufficient Groundwater Data': {
      className: 'neutral',
      explanation:
        `There are not enough valid cleaned weekly ${levelConfig.noteLabel} groundwater values to calculate a reliable trend.`
    }
  };

  const config =
    categoryDisplay.explanation
      ? {
          className: categoryDisplay.className || 'neutral',
          explanation: categoryDisplay.explanation
        }
      :
    categoryConfig[category] ||
    categoryConfig['Mixed / Unclassified Groundwater Trend'];

  return `
    <section class="ward-category-card ${config.className}">
      <strong>${htmlEscape(category)}</strong>
      <p>${config.explanation}</p>
    </section>
  `;
};
    const selectedMapLensCategoryCardHtml = (wardNo, critical, trendShape = null) => {
      if (wardAnalysisLens === 'groundwater') return wardCategoryCardHtml(critical, trendShape);
      const isCritical = mapWardStatusKey(wardNo) === 'critical';
      return `
        <section class="ward-category-card ${isCritical ? 'critical' : 'neutral'}">
          <strong>${htmlEscape(mapWardCategoryForNo(wardNo))}</strong>
          <p><strong>${htmlEscape(wardAnalysisLensLabel())} lens.</strong> ${htmlEscape(mapWardReasonForNo(wardNo))}</p>
        </section>
      `;
    };
    const formatDateTime = (value) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    const rawWardNumber = (props = {}) => props.WARD_NO ?? props.ward_no ?? props.ward ?? props.WARD;
    const normalizeWardNo = (value) => {
      const number = Number(value);
      if (Number.isFinite(number)) return String(Math.trunc(number));
      return String(value ?? '').trim();
    };
    const normalizeWardName = (value) => String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    const canonicalWardName = (value) => normalizeWardName(value)
      .replace(/\bward\b/g, '')
      .replace(/\bnagara\b/g, 'nagar')
      .replace(/\bnagar\b/g, 'nagara')
      .replace(/\bvijnana\b/g, 'vignana')
      .replace(/\bvrishabhavathi\b/g, 'vrisabhavathi')
      .replace(/\bvrushabhavathi\b/g, 'vrisabhavathi')
      .replace(/\bchikkalasandra\b/g, 'chikkalsandra')
      .replace(/\bchikkallasandra\b/g, 'chikkalsandra')
      .replace(/\bkonanakunte\b/g, 'konankunte')
      .replace(/\bneelasandra\b/g, 'nilasandra')
      .replace(/\bmoodalapalya\b/g, 'mudalapalya')
      .replace(/\bshankara matha\b/g, 'shankar matt')
      .replace(/\blingarajapuram\b/g, 'lingarajapura')
      .replace(/\brajagopalanagara\b/g, 'rajagopal nagara')
      .replace(/\bdoddabommasandra\b/g, 'dodda bommasandra')
      .replace(/\bchowdeswari\b/g, 'chowdeshwari')
      .replace(/\batturu\b/g, 'attur')
      .replace(/\bhudi\b/g, 'hoodi')
      .replace(/\bjakkuru\b/g, 'jakkur')
      .replace(/\byeshwanthpura\b/g, 'yeshwanthpur')
      .replace(/\bbanasavadi\b/g, 'banasawadi')
      .replace(/\bhebbala\b/g, 'hebbal')
      .replace(/\bdomlur\b/g, 'dommalur')
      .replace(/\bchickpete\b/g, 'chikpet')
      .replace(/\bgovindaraja\b/g, 'govindraj')
      .replace(/\bnayandahalli\b/g, 'nayandanahalli')
      .replace(/\bchamrajapet\b/g, 'chamrajpet')
      .replace(/\bvishveshwara\b/g, 'vishweshra')
      .replace(/\bmarathahalli\b/g, 'marathalli')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+/g, '');
    const wardNumberFromSearch = (query) => {
      const trimmed = String(query ?? '').trim().toLowerCase();
      const wardMatch = trimmed.match(/^ward\s*(?:no\.?|number)?\s*(\d+(?:\.0+)?)$/);
      if (wardMatch) return normalizeWardNo(wardMatch[1]);
      if (/^\d+(?:\.0+)?$/.test(trimmed)) return normalizeWardNo(trimmed);
      return '';
    };
    const wardNumber = (props = {}) => normalizeWardNo(rawWardNumber(props));
    const wardName = (props = {}) => props.WARD_NAME || props.ward_name || props.name || props.NAME || 'Unknown ward';
    const wardQcForProps = (props = {}) => wardQcByNo.get(wardNumber(props)) || wardQcByName.get(normalizeWardName(wardName(props)));
    const wardIndicatorsForProps = (props = {}) => wardIndicatorsByNo.get(wardNumber(props)) || wardIndicatorsByName.get(normalizeWardName(wardName(props)));
    const wardWeeklyForProps = (props = {}) => wardWeeklyByNo.get(wardNumber(props));
    const populationForProps = (props = {}) => {
      const byNumber = populationByWardNo.get(wardNumber(props));
      if (byNumber) return byNumber;
      return populationByCanonicalName.get(canonicalWardName(wardName(props))) || null;
    };
    const consumptionForProps = (props = {}) => {
      const byWardNo = consumptionByWardNo.get(wardNumber(props));
      if (byWardNo) return byWardNo;
      const normalized = normalizeWardName(wardName(props));
      const canonical = canonicalWardName(wardName(props));
      const exact = consumptionByWardName.get(normalized) || consumptionByCanonicalName.get(canonical);
      if (exact) return exact;
      const fuzzy = consumptionRows.find((item) => {
        const itemName = canonicalWardName(item.wardName);
        return itemName && canonical && (itemName.includes(canonical) || canonical.includes(itemName));
      });
      if (fuzzy) return fuzzy;
      const wardTokens = new Set(normalized.split(' ').filter((token) => token.length > 2 && token !== 'ward'));
      return consumptionRows.find((item) => {
        const itemTokens = normalizeWardName(item.wardName).split(' ').filter((token) => token.length > 2 && token !== 'ward');
        const overlap = itemTokens.filter((token) => wardTokens.has(token)).length;
        return overlap >= Math.min(2, Math.max(1, wardTokens.size));
      }) || null;
    };
    const setSensorSectionsVisible = (visible) => {
      [
        els.sensorDetailGrid,
        els.sensorExportControls,
        els.timeRangeSection,
        els.waterChartBox
      ].forEach((element) => {
        if (element) element.style.display = visible ? '' : 'none';
      });
      if (els.dischargeChartBox) {
        els.dischargeChartBox.style.display = visible && currentDataSource !== 'vendor' ? '' : 'none';
      }
      if (els.wardDetailPanel) els.wardDetailPanel.style.display = visible ? 'none' : '';
    };
    const dropStatsForProps = (props = {}) => {
      const weekly = wardWeeklyForProps(props);
      return {
        avg: weekly?.avgDropPerDay ?? null,
        median: weekly?.medianDropPerDay ?? null,
        max: weekly?.maxDropPerDay ?? null,
        sensorCount: Number(weekly?.dropSensorCount || 0),
        allPositive: Boolean(weekly?.dropAllPositive)
      };
    };
    const neutralWardStyle = () => ({
      color: '#000000',
      weight: 3,
      opacity: 1,
      fill: true,
      fillColor: '#000000',
      fillOpacity: 0
    });
    const dimmedWardStyle = () => ({
      color: '#475569',
      weight: 1.5,
      opacity: 0.45,
      fill: true,
      fillColor: '#94a3b8',
      fillOpacity: 0.08
    });
    const focusedWardStyle = (base) => ({
      ...base,
      color: '#020617',
      weight: 5,
      opacity: 1,
      fillOpacity: Number(base.fillOpacity || 0) > 0 ? 1 : 0,
      className: 'ward-focused-shape'
    });
    const wardStyle = (feature) => {
      const featureWardNo = normalizeWardNo(wardNumber(feature?.properties || {}));
      const critical = criticalForWardNo(featureWardNo);
      const key = mapWardStatusKey(featureWardNo);
      const isFocused = focusedWardNo && featureWardNo === focusedWardNo;
      const shouldDim = (focusedWardNo && !isFocused) || (wardStatusFilter && key !== wardStatusFilter);
      if (shouldDim) return dimmedWardStyle();
      let style = neutralWardStyle();
      if (currentDataSource === 'kh' && key === 'critical') {
        style = {
          color: 'rgb(255, 0, 0)',
          weight: 2.5,
          opacity: 1,
          fill: true,
          fillColor: mapLensCriticalColor(),
          fillOpacity: 1
        };
      } else if (currentDataSource === 'kh' && wardAnalysisLens === 'groundwater' && isGroundwaterRiseWard(critical)) {
        style = {
          color: 'rgb(0, 255, 0)',
          weight: 2.5,
          opacity: 1,
          fill: true,
          fillColor: 'rgb(0, 255, 0)',
          fillOpacity: 1
        };
      } else if (currentDataSource === 'kh' && key === 'stable') {
        style = {
          color: 'rgb(255, 255, 0)',
          weight: 2.5,
          opacity: 0.95,
          fill: true,
          fillColor: 'rgb(255, 255, 0)',
          fillOpacity: 1
        };
      }
      return isFocused ? focusedWardStyle(style) : style;
    };
    const hasCoordinateValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
    const hasValidLocation = (sensor) => {
      if (!hasCoordinateValue(sensor.lat) || !hasCoordinateValue(sensor.lng)) return false;
      const lat = Number(sensor.lat);
      const lng = Number(sensor.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
    };

    function deriveCriticalForWardData(ward, base = null) {
      if (!ward) return base;

      const levelConfig = wardLevelStatisticConfig();
      const selectedWeekly = prepareWardWeeklyForStatistic(ward.weekly || [], levelConfig.key);
      const weeklyGroups = cleanWeeklyGroundwater(selectedWeekly);
      const cleanWeekly = weeklyGroups.cleaned.filter(hasUsableWeeklyLevel);
      const fit = weeklySlopeFit(cleanWeekly);
      const linearSlope = Number(fit.slopeFtPerWeek);
      const theilSlope = Number(fit.senSlopeFtPerWeek);
      const mk = Number(fit.mannKendallS);
      const pValue = Number(fit.mannKendallPValue);
      const pointCount = Number(fit.pointCount || 0);
      const hasSlopeWeeks = pointCount >= GROUNDWATER_MIN_SLOPE_WEEKS;
      const hasMannKendallWeeks = pointCount >= GROUNDWATER_MIN_MK_WEEKS && Number.isFinite(pValue) && Number.isFinite(mk);
      const linearCritical = hasSlopeWeeks
        && Number.isFinite(linearSlope)
        && linearSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK
        && hasMannKendallWeeks
        && mk > 0
        && pValue <= TREND_SIGNIFICANCE_ALPHA;
      const theilCritical = hasSlopeWeeks
        && Number.isFinite(theilSlope)
        && theilSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK
        && hasMannKendallWeeks
        && mk > 0
        && pValue <= TREND_SIGNIFICANCE_ALPHA;
      const linearMethodCritical = hasSlopeWeeks
        && Number.isFinite(linearSlope)
        && linearSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;
      const theilMethodCritical = hasSlopeWeeks
        && Number.isFinite(theilSlope)
        && theilSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;
      const mannKendallMethodCritical = hasMannKendallWeeks
        && mk > 0
        && pValue <= TREND_SIGNIFICANCE_ALPHA;
      const localCritical = {
        linearMethodCritical: linearMethodCritical ? 'Yes' : 'No',
        theilSenMethodCritical: theilMethodCritical ? 'Yes' : 'No',
        mannKendallMethodCritical: mannKendallMethodCritical ? 'Yes' : 'No',
        linearMannKendallCritical: linearCritical ? 'Yes' : 'No',
        theilSenMannKendallCritical: theilCritical ? 'Yes' : 'No',
        linearSlopeFtPerWeek: Number.isFinite(linearSlope) ? linearSlope : null,
        senSlopeFtPerWeek: Number.isFinite(theilSlope) ? theilSlope : null,
        pointCount
      };
      const selectedCritical = selectedMethodIsCritical(localCritical);
      const selectedSlope = selectedMethodSlope(localCritical);
      const selectedStable = hasSlopeWeeks;
      const selectedMethodName = groundwaterMethodLabel();
      const linearRise = Number.isFinite(linearSlope) && linearSlope < -LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;
      const significant = Number.isFinite(pValue) && pValue <= TREND_SIGNIFICANCE_ALPHA;
      const improving = hasSlopeWeeks && linearRise && (!hasMannKendallWeeks || mk < 0);
      const insufficient = !hasSlopeWeeks;
      const oldUnverified = base?.oldConsumptionNoGroundwaterData === 'Yes' && insufficient;
      const statLabel = levelConfig.noteLabel;
      let groundwaterStatus = selectedCritical ? 'Critical' : insufficient ? 'Insufficient data' : 'Normal';
      let groundwaterDirection = selectedCritical
        ? 'Declining'
        : improving
        ? significant ? 'Improving' : 'Possible improvement'
        : insufficient
        ? 'Not computed'
        : selectedStable ? 'Stable' : 'Mixed / not classified';
      let dashboardMapCategory = selectedCritical
        ? `Critical: ${levelConfig.metricPrefix} groundwater decline`
        : improving
        ? significant ? 'Confirmed groundwater rise' : 'Possible groundwater rise'
        : insufficient
        ? 'Insufficient groundwater data'
        : selectedStable ? 'Stable groundwater trend' : 'Mixed / unclassified groundwater trend';
      if (oldUnverified) {
        groundwaterStatus = 'Insufficient data';
        groundwaterDirection = 'Not computed';
        dashboardMapCategory = 'Insufficient groundwater data';
      }
      const reason = selectedCritical
        ? `Critical groundwater decline: selected level is ${statLabel}; selected method is ${selectedMethodName}; slope is ${formatNumber(selectedSlope, 2)} ft/week and Mann-Kendall p-value is ${Number.isFinite(pValue) ? formatNumber(pValue, 4) : '-'}.`
        : improving
        ? `${significant ? 'Confirmed' : 'Possible'} groundwater rise: selected level is ${statLabel}; the cleaned weekly graph has a negative linear slope.`
        : insufficient
        ? `Not enough plotted cleaned weekly ${statLabel} points are available. Points used: ${formatNumber(pointCount)}.`
        : selectedStable
        ? `Stable groundwater trend: selected level is ${statLabel}; enough weekly data exists and the selected method does not mark this ward as critical or rising.`
        : `Mixed groundwater trend: selected level is ${statLabel}; the cleaned weekly graph is neither near-flat, declining, nor improving under the selected rule.`;

      return {
        ...(base || {}),
        wardNo: ward.wardNo,
        wardName: ward.wardName,
        groundwaterStatus,
        groundwaterDirection,
        dashboardAction: selectedCritical ? 'Yes' : 'No',
        dashboardMapCategory,
        linearMannKendallCritical: linearCritical ? 'Yes' : 'No',
        theilSenMannKendallCritical: theilCritical ? 'Yes' : 'No',
        linearMethodCritical: linearMethodCritical ? 'Yes' : 'No',
        theilSenMethodCritical: theilMethodCritical ? 'Yes' : 'No',
        mannKendallMethodCritical: mannKendallMethodCritical ? 'Yes' : 'No',
        oldConsumptionNoGroundwaterData: oldUnverified ? 'Yes' : 'No',
        declineStrengthFtPerWeek: Number.isFinite(selectedSlope) ? selectedSlope : null,
        linearSlopeFtPerWeek: Number.isFinite(linearSlope) ? Number(linearSlope.toFixed(4)) : null,
        senSlopeFtPerWeek: Number.isFinite(theilSlope) ? Number(theilSlope.toFixed(4)) : null,
        mannKendallS: Number.isFinite(mk) ? mk : null,
        mannKendallPValue: Number.isFinite(pValue) ? pValue : null,
        pointCount,
        usableWeeklyValues: pointCount,
        updateReason: `${reason} Individual borewell trends are supporting evidence and do not override this ward-level classification.`
      };
    }

    function deriveCriticalForWardStatistic(wardNo, base = null) {
      const normalizedWardNo = normalizeWardNo(wardNo);
      const ward = focusedWardNo === normalizedWardNo && activeWardData
        ? activeWardData
        : wardWeeklyByNo.get(normalizedWardNo);
      return deriveCriticalForWardData(ward, base);
    }

    const renderCharts = () => {
      const pointGroups = cleanChartPointGroups(filteredPoints());
      const points = pointGroups.cleaned;
      const plotPoints = showGroundwaterOutliers ? pointGroups.all : pointGroups.cleaned;
      const cleanedSet = new Set(pointGroups.cleaned);
      const outlierSet = new Set(pointGroups.outliers);
      els.app.classList.toggle('chart-wide', plotPoints.length > 120);
      els.app.classList.toggle('nimblevision-mode', currentDataSource === 'vendor');
      if (els.toggleGroundwaterOutliers) {
        els.toggleGroundwaterOutliers.textContent = showGroundwaterOutliers
          ? `Hide outliers (${formatNumber(pointGroups.outliers.length)})`
          : `Show outliers (${formatNumber(pointGroups.outliers.length)})`;
        els.toggleGroundwaterOutliers.setAttribute('aria-pressed', showGroundwaterOutliers ? 'true' : 'false');
        els.toggleGroundwaterOutliers.disabled = !pointGroups.outliers.length;
      }
      refreshCycleConnectorButtons();
      const labels = plotPoints.map((point) => new Date(point.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }));
      const offLevels = plotPoints.filter((point) => cleanedSet.has(point)).map((point) => point.offLevel).filter((value) => Number.isFinite(value));
      const onLevels = plotPoints.filter((point) => cleanedSet.has(point)).map((point) => point.onLevel).filter((value) => Number.isFinite(value));
      const water = plotPoints.filter((point) => cleanedSet.has(point)).map((point) => point.waterLevel).filter((value) => Number.isFinite(value));
      const discharge = plotPoints.filter((point) => cleanedSet.has(point)).map((point) => point.discharge).filter((value) => Number.isFinite(value));
      const outlierLevels = showGroundwaterOutliers ? plotPoints.filter((point) => outlierSet.has(point)).map((point) => point.primary).filter((value) => Number.isFinite(value)) : [];
      const hasWaterChart = offLevels.length || onLevels.length || water.length || outlierLevels.length;

      const waterCanvas = document.getElementById('waterChart');
      const dischargeCanvas = document.getElementById('dischargeChart');
      if (els.detailPlotReadiness && selectedSensor) {
        if (!waterPoints.length) {
          els.detailPlotReadiness.textContent = 'No water-level rows';
        } else if (hasWaterChart) {
          const hiddenCount = pointGroups.outliers.length;
          els.detailPlotReadiness.textContent = hiddenCount
            ? `Plot-ready (${formatNumber(hiddenCount)} hidden)`
            : 'Plot-ready';
        } else {
          const flags = qcForSensor(selectedSensor)?.flags || [];
          const flagText = flags.length ? `: ${flags.join(', ')}` : '';
          els.detailPlotReadiness.textContent = `Not plot-ready${flagText}`;
        }
      }
      if (waterPoints.length && !hasWaterChart) {
        const flags = qcForSensor(selectedSensor)?.flags || [];
        const flagText = flags.length ? ` QC flags: ${flags.join(', ')}.` : '';
        els.waterEmpty.textContent = pointGroups.outliers.length
          ? `Not plotted because all ${formatNumber(pointGroups.outliers.length)} water-level point(s) in this range were removed by the plot cleaner.${flagText} Use "Show outliers" to inspect the hidden raw points.`
          : `Not plotted because fewer than 3 valid cleaned water-level readings remain for this range.${flagText}`;
      } else {
        els.waterEmpty.textContent = 'No water-level data for this borewell and range.';
      }
      els.waterEmpty.style.display = hasWaterChart ? 'none' : 'grid';
      waterCanvas.style.display = hasWaterChart ? 'block' : 'none';
      const showDischargeBox = currentDataSource !== 'vendor';
      els.dischargeChartBox.style.display = showDischargeBox ? '' : 'none';
      els.dischargeEmpty.style.display = showDischargeBox && discharge.length ? 'none' : 'grid';
      dischargeCanvas.style.display = showDischargeBox && discharge.length ? 'block' : 'none';

      if (offLevels.length || onLevels.length || outlierLevels.length) {
        waterChart = buildMultiChart('waterChart', waterChart, [], [
          {
            label: 'Water level path',
            data: cycleConnectorData(plotPoints, cleanedSet),
            borderColor: '#475569',
            borderDash: [6, 5],
            borderWidth: 2,
            pointStyle: 'line',
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: true,
            tension: 0
          },
          {
            label: 'Pump START level',
            data: sessionLevelPointData(plotPoints, cleanedSet, 'on'),
            borderColor: 'rgba(0,0,0,0)',
            pointBorderColor: '#15803d',
            pointBackgroundColor: '#dcfce7',
            pointStyle: 'triangle',
            pointBorderWidth: 2,
            borderWidth: 0,
            pointRadius: 5,
            pointHoverRadius: 8,
            showLine: false
          },
          {
            label: 'Pump END level',
            data: sessionLevelPointData(plotPoints, cleanedSet, 'off'),
            borderColor: 'rgba(0,0,0,0)',
            pointBorderColor: '#1d4ed8',
            pointBackgroundColor: '#dbeafe',
            pointStyle: 'rectRot',
            pointBorderWidth: 2,
            borderWidth: 0,
            pointRadius: 4,
            pointHoverRadius: 7,
            showLine: false
          },
          {
            label: 'Flagged outliers',
            data: levelPointData(plotPoints, outlierSet, 'primary'),
            borderColor: '#f59e0b',
            pointBorderColor: '#92400e',
            pointBackgroundColor: '#f59e0b',
            borderWidth: 0,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false
          }
        ], {
          reverseY: true,
          yTitle: 'Feet below surface',
          unit: 'ft',
          rotateXLabels: true,
          xType: 'linear-time'
        });
      } else if (water.length) {
        waterChart = buildMultiChart('waterChart', waterChart, labels, [
          {
            label: 'Water level',
            data: plotPoints.map((point) => cleanedSet.has(point) ? point.waterLevel : null),
            borderColor: '#244e9a',
            showLine: false
          },
          {
            label: 'Flagged outliers',
            data: plotPoints.map((point) => outlierSet.has(point) ? point.primary : null),
            borderColor: '#f59e0b',
            pointBorderColor: '#92400e',
            pointBackgroundColor: '#f59e0b',
            borderWidth: 0,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false
          }
        ], {
          reverseY: true,
          yTitle: 'Feet below surface',
          unit: 'ft',
          rotateXLabels: true
        });
      } else if (waterChart) {
        waterChart.destroy();
        waterChart = null;
      }

      if (showDischargeBox && discharge.length) {
        dischargeChart = buildChart('dischargeChart', dischargeChart, labels, plotPoints.map((point) => cleanedSet.has(point) ? point.discharge : null), 'Discharge', '#c77700', {
          yTitle: 'Discharge (L/min)',
          unit: 'L/min'
        });
      } else if (dischargeChart) {
        dischargeChart.destroy();
        dischargeChart = null;
      }
    };

    const refreshGroundwaterOutlierButtons = () => {
      const label = showGroundwaterOutliers ? 'Hide flagged outliers' : 'Show flagged outliers';
      document.querySelectorAll('[data-toggle-groundwater-outliers]').forEach((button) => {
        button.textContent = label;
        button.setAttribute('aria-pressed', showGroundwaterOutliers ? 'true' : 'false');
      });
    };
    const refreshCycleConnectorButtons = () => {
      const label = showCycleConnector ? 'Hide water level path' : 'Show water level path';
      if (els.toggleCycleConnector) {
        els.toggleCycleConnector.textContent = label;
        els.toggleCycleConnector.setAttribute('aria-pressed', showCycleConnector ? 'true' : 'false');
      }
      document.querySelectorAll('[data-toggle-cycle-connector]').forEach((button) => {
        button.textContent = label;
        button.setAttribute('aria-pressed', showCycleConnector ? 'true' : 'false');
      });
    };
    const cycleConnectorData = (points, cleanedSet) => {
      if (!showCycleConnector) return [];
      const stopTimestamp = (point) => new Date(point.stop_time || point.time).getTime();
      const startTimestamp = (point) => {
        const stop = stopTimestamp(point);
        const durationMin = Number(point.session_duration_min);
        return Number.isFinite(stop) && Number.isFinite(durationMin) && durationMin > 0
          ? stop - durationMin * 60000
          : stop;
      };
      const label = (timeMs, suffix = '') => `${new Date(timeMs).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })}${suffix ? ` ${suffix}` : ''}`;
      const sessions = (points || [])
        .filter((point) => cleanedSet.has(point) && Number.isFinite(point.offLevel) && Number.isFinite(point.onLevel) && Number.isFinite(stopTimestamp(point)))
        .sort((a, b) => stopTimestamp(a) - stopTimestamp(b));
      if (sessions.length) {
        return sessions.flatMap((point) => {
          const onX = startTimestamp(point);
          const offX = stopTimestamp(point);
          return [
            { x: onX, y: point.onLevel, label: label(onX, 'START') },
            { x: offX, y: point.offLevel, label: label(offX, 'END') }
          ];
        });
      }
      return (points || [])
        .filter((point) => cleanedSet.has(point) && Number.isFinite(point.primary) && Number.isFinite(stopTimestamp(point)))
        .sort((a, b) => stopTimestamp(a) - stopTimestamp(b))
        .map((point) => ({ x: stopTimestamp(point), y: point.primary, label: label(stopTimestamp(point)) }));
    };
    const sessionLevelPointData = (points, cleanedSet, semantic) => {
      const key = semantic === 'on' ? 'onLevel' : 'offLevel';
      return levelPointData(points, cleanedSet, key, semantic);
    };
    const levelPointData = (points, cleanedSet, key, semantic = '') => {
      const hasSessionPairs = ['offLevel', 'onLevel'].includes(key)
        && (points || []).some((point) => cleanedSet.has(point) && Number.isFinite(point.offLevel) && Number.isFinite(point.onLevel));
      return (points || [])
        .filter((point) => {
          if (!cleanedSet.has(point)) return false;
          if (hasSessionPairs && ['offLevel', 'onLevel'].includes(key)) {
            return Number.isFinite(point.offLevel) && Number.isFinite(point.onLevel);
          }
          return true;
        })
        .map((point) => {
          const stop = new Date(point.stop_time || point.time).getTime();
          const durationMin = Number(point.session_duration_min);
          const x = semantic === 'on' && hasSessionPairs && Number.isFinite(durationMin) && durationMin > 0
            ? stop - durationMin * 60000
            : stop;
          const y = Number(point[key]);
          return Number.isFinite(x) && Number.isFinite(y)
            ? { x, y, label: `${new Date(x).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${semantic ? ` ${semantic === 'on' ? 'START' : 'END'}` : ''}` }
            : { x, y: null };
        });
    };
    const redrawGroundwaterCharts = () => {
      renderCharts();
      if (activeWardData) renderWardDetailCharts(activeWardData, activeSpecificCapacityData);
      refreshGroundwaterOutlierButtons();
      refreshCycleConnectorButtons();
      refreshFullscreenChart();
    };

    const selectSensor = async (sensor, moveMap) => {
      const currentSelectionSequence = ++selectionSequence;

      selectedSensor = sensor;
      focusedWardNo = '';
      activeWardData = null;
      activeSpecificCapacityData = null;
      activeWardProps = null;
      activeWardSensors = [];
      waterPoints = [];

      map.closePopup();

      updateClearSelectionButton();
      refreshWardPopups();
      renderSensors();
      els.app?.classList.remove('critical-ward-selected', 'screening-ward-selected', 'unverified-ward-selected');
      setSensorSectionsVisible(true);

      els.app?.classList.remove('right-collapsed');
      if (window.innerWidth < 1700 && !els.app?.classList.contains('left-collapsed')) {
        els.app?.classList.add('left-collapsed');
        if (els.app) els.app.dataset.autoCollapsedLeft = 'true';
        if (els.toggleLeft) els.toggleLeft.textContent = '>';
      }
      if (els.toggleRight) {
        els.toggleRight.textContent = '›';
        els.toggleRight.title = 'Collapse details panel';
        els.toggleRight.setAttribute('aria-label', els.toggleRight.title);
      }

      if (els.detailTitle) els.detailTitle.textContent = sensor.uid;
      if (els.detailSubhead) {
        els.detailSubhead.textContent = sensor.hasData
          ? `Water-level history loaded from the ${sourceDisplayName()} data source.`
          : `This borewell has no water-level rows in the ${sourceDisplayName()} data source.`;
      }
      if (els.detailUid) els.detailUid.textContent = sensor.uid;
      if (els.detailWardNo) els.detailWardNo.textContent = sensor.wardNo || 'Not matched';
      if (els.detailWardName) els.detailWardName.textContent = sensor.wardName || 'Not matched';
      if (els.detailMotorHp) els.detailMotorHp.textContent = formatMotorHp(sensor.motorHp);
      if (els.detailBorewellDepth) els.detailBorewellDepth.textContent = formatDepth(sensor.borewellDepth);
      if (els.detailLatLon) {
        els.detailLatLon.textContent = hasValidLocation(sensor)
          ? `${Number(sensor.lat).toFixed(6)}, ${Number(sensor.lng).toFixed(6)}`
          : 'Location missing';
      }
      if (els.detailFirstData) els.detailFirstData.textContent = formatDateTime(sensor.firstDataAt);
      if (els.detailLastData) els.detailLastData.textContent = formatDateTime(sensor.lastDataAt);
      if (els.detailReadings) els.detailReadings.textContent = formatNumber(sensor.totalReadings || 0);
      if (els.detailDataType) els.detailDataType.textContent = dataCategoryLabels[sensor.dataCategory || 'none'] || dataCategoryLabels.none;
      const qc = qcForSensor(sensor);
      if (els.detailQcStatus) els.detailQcStatus.innerHTML = qc ? qcBadgeHtml(qc.qcStatus) : '-';
      if (els.detailQcScore) els.detailQcScore.textContent = qc ? `${formatNumber(qc.overallQcScore || 0, 1)} / 100` : '-';
      if (els.detailPlotReadiness) els.detailPlotReadiness.textContent = sensor.hasData ? 'Checking plot...' : 'No water-level rows';
      if (els.detailQcFlags) els.detailQcFlags.textContent = qc?.flags?.length ? qc.flags.join(', ') : (qc ? 'None' : '-');


      if (moveMap && hasValidLocation(sensor)) {
        map.setView([Number(sensor.lat), Number(sensor.lng)], Math.max(map.getZoom(), 15), { animate: true });
        sensor.marker?.openPopup();
      }

      setTimeout(() => {
        map.invalidateSize();
        waterChart?.resize();
        dischargeChart?.resize();
      }, 250);

      renderList(filteredSensors());

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/water-level?uid=${encodeURIComponent(sensor.uid)}&${sourceQuery()}`
        );

        const payload = response.ok
          ? await response.json()
          : { points: [] };

        if (
          currentSelectionSequence !== selectionSequence ||
          selectedSensor?.uid !== sensor.uid
        ) {
          return;
        }

        waterPoints = payload.points || [];
      } catch (error) {
        if (currentSelectionSequence !== selectionSequence) return;

        waterPoints = [];
        showToast(`Could not load water-level data for ${sensor.uid}`);
      }

      if (
        currentSelectionSequence !== selectionSequence ||
        selectedSensor?.uid !== sensor.uid
      ) {
        return;
      }

      renderCharts();
    };

    const wardMetric = (label, value, className = '') => `
      <div class="ward-metric ${className}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
    const formatConsumption = (value) => value == null ? '-' : `${formatNumber(value, 1)} ML`;
    const formatConnections = (value) => value == null ? '-' : formatNumber(value);
    const projectedPopulationForYear = (imported, year = 2026) => {
      if (!imported) return null;
      const direct = Number(imported[`projectedPopulation${year}`]);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const base = Number(imported.population2011);
      const cagr = Number(imported.cagr2001To2011);
      if (Number.isFinite(base) && base > 0 && Number.isFinite(cagr)) {
        const projected = base * ((1 + cagr) ** (year - 2011));
        return Number.isFinite(projected) && projected > 0 ? projected : null;
      }
      return null;
    };
    const wardPopulation = (props = {}, year = 2026, consumption = null) => {
      const consumptionPopulation = consumption?.wardName
        ? populationByCanonicalName.get(canonicalWardName(consumption.wardName))
        : null;
      const imported = consumptionPopulation || populationForProps(props);
      const projected = projectedPopulationForYear(imported, year);
      if (projected) return projected;
      return Number(props.POP_TOTAL ?? props.pop_total ?? props.population ?? props.POPULATION);
    };
    const consumptionTableHtml = (props, consumption) => {
      const rows = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
        year,
        consumption: consumption?.[`consumption${year}Ml`],
        months: consumption?.[`months${year}`],
        connections: consumption?.[`connections${year}`],
        perConnection: consumption?.[`consumptionPerConnection${year}`]
      }));
      const rowHtml = rows.map((row) => {
        const population = wardPopulation(props, row.year, consumption);
        const daysCovered = Number(row.months) === 12 ? 365 : Number(row.months) > 0 ? Number(row.months) * 30.4375 : null;
        const lpcd = Number.isFinite(Number(row.consumption)) && Number.isFinite(population) && population > 0 && daysCovered
          ? (Number(row.consumption) * 1000000) / population / daysCovered
          : null;
        return `
          <tr>
            <td>${row.year}</td>
            <td>${formatConsumption(row.consumption)}</td>
            <td>${formatNumber(row.months || 0)}</td>
            <td>${formatConnections(row.connections)}</td>
            <td>${formatConsumption(row.perConnection)}</td>
            <td>${Number.isFinite(population) ? formatNumber(population) : '-'}</td>
            <td>${lpcd == null ? '-' : `${formatNumber(lpcd, 1)} LPCD`}</td>
          </tr>
        `;
      }).join('');
      return `
        <section class="ward-explain">
          <h3>Consumption</h3>
          <div class="ward-table-scroll">
            <table class="ward-consumption-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Consumption</th>
                  <th>Months</th>
                  <th>Connections</th>
                  <th>Cons/Conn</th>
                  <th>Population</th>
                  <th>LPCD</th>
                </tr>
              </thead>
              <tbody>${rowHtml}</tbody>
            </table>
          </div>
          <p class="ward-table-note">Formula: LPCD = (Consumption in ML × 1,000,000) ÷ (Population × Days covered). Days covered = Months available × 30.4375.</p>
        </section>
      `;
    };

    const clearWardInlineCharts = () => {
      wardInlineCharts.forEach((chart) => chart.destroy());
      wardInlineCharts = [];
    };

    const monthAxisLabel = (label) => {
      const text = String(label || '');
      const match = text.match(/^([A-Za-z]{3})(?:-\d{2})?\s+W(\d)$/i);
      if (!match) return text;
      return `${match[1]} W${match[2]}`;
    };
    const shortDateTimeLabel = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value || '').replace(/^\d{4}-/, '').slice(0, 11);
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', '');
    };
    const weeklySlopeFit = (weekly = []) => {
      const points = weekly
        .filter(hasUsableWeeklyLevel)
        .map((point, index) => ({
          x: Number.isFinite(Number(point._xIndex)) ? Number(point._xIndex) : index,
          label: point.label,
          y: Number(point.averageLevel)
        }))
        .filter((point) => Number.isFinite(point.y));
      if (points.length < 2) {
        return {
          slopeFtPerWeek: null,
          slopeFtPerDay: null,
          r2: null,
          senSlopeFtPerWeek: null,
          senSlopeFtPerDay: null,
          mannKendallS: null,
          mannKendallZ: null,
          mannKendallPValue: null,
          mannKendallTrend: 'Not computed',
          trendData: weekly.map(() => null),
          pointCount: points.length
        };
      }
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
      if (!denominator) {
        return {
          slopeFtPerWeek: null,
          slopeFtPerDay: null,
          r2: null,
          senSlopeFtPerWeek: null,
          senSlopeFtPerDay: null,
          mannKendallS: null,
          mannKendallZ: null,
          mannKendallPValue: null,
          mannKendallTrend: 'Not computed',
          trendData: weekly.map(() => null),
          pointCount: points.length
        };
      }
      const slopeFtPerWeek = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
      const intercept = meanY - (slopeFtPerWeek * meanX);
      const totalSquares = points.reduce((sum, point) => sum + ((point.y - meanY) ** 2), 0);
      const residualSquares = points.reduce((sum, point) => {
        const expected = intercept + (slopeFtPerWeek * point.x);
        return sum + ((point.y - expected) ** 2);
      }, 0);
      const validIndexes = new Set(points.map((point) => point.x));
      const pairSlopes = [];
      let mannKendallS = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[j].x - points[i].x;
          const dy = points[j].y - points[i].y;
          if (dx > 0) pairSlopes.push(dy / dx);
          mannKendallS += dy > 0 ? 1 : dy < 0 ? -1 : 0;
        }
      }
      const sortedSlopes = pairSlopes.slice().sort((a, b) => a - b);
      const senSlope = sortedSlopes.length
        ? sortedSlopes.length % 2
          ? sortedSlopes[Math.floor(sortedSlopes.length / 2)]
          : (sortedSlopes[(sortedSlopes.length / 2) - 1] + sortedSlopes[sortedSlopes.length / 2]) / 2
        : null;
      const senIntercept = Number.isFinite(senSlope)
        ? medianValue(points.map((point) => point.y - (senSlope * point.x)))
        : null;
      const tieCounts = new Map();
      points.forEach((point) => {
        const key = String(Number(point.y).toFixed(6));
        tieCounts.set(key, (tieCounts.get(key) || 0) + 1);
      });
      const tieAdjustment = Array.from(tieCounts.values())
        .filter((count) => count > 1)
        .reduce((sum, count) => sum + count * (count - 1) * (2 * count + 5), 0);
      const variance = (points.length * (points.length - 1) * ((2 * points.length) + 5) - tieAdjustment) / 18;
      const mkZ = variance > 0
        ? mannKendallS > 0 ? (mannKendallS - 1) / Math.sqrt(variance) : mannKendallS < 0 ? (mannKendallS + 1) / Math.sqrt(variance) : 0
        : null;
      const normalCdf = (value) => {
        const sign = value < 0 ? -1 : 1;
        const x = Math.abs(value) / Math.sqrt(2);
        const t = 1 / (1 + 0.3275911 * x);
        const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return 0.5 * (1 + sign * erf);
      };
      const mkP = Number.isFinite(mkZ) ? 2 * (1 - normalCdf(Math.abs(mkZ))) : null;
      return {
        slopeFtPerWeek,
        slopeFtPerDay: slopeFtPerWeek / 7,
        r2: totalSquares > 0 ? 1 - (residualSquares / totalSquares) : null,
        senSlopeFtPerWeek: senSlope,
        senSlopeFtPerDay: Number.isFinite(senSlope) ? senSlope / 7 : null,
        mannKendallS,
        mannKendallZ: mkZ,
        mannKendallPValue: mkP,
        mannKendallTrend: mannKendallS > 0 ? 'Increasing depth' : mannKendallS < 0 ? 'Decreasing depth' : 'No monotonic trend',
        trendData: weekly.map((point, index) => {
          const x = Number.isFinite(Number(point._xIndex)) ? Number(point._xIndex) : index;
          const predicted = intercept + (slopeFtPerWeek * x);
          return validIndexes.has(x) ? predicted : null;
        }),
        senTrendData: weekly.map((point, index) => {
          const x = Number.isFinite(Number(point._xIndex)) ? Number(point._xIndex) : index;
          return validIndexes.has(x) && Number.isFinite(senIntercept) ? senIntercept + (senSlope * x) : null;
        }),
        pointCount: points.length
      };
    };
    const slopeClass = (slope) => Number(slope) > 0 ? 'bad' : Number(slope) < 0 ? 'good' : '';
    const slopeLabel = (slope) => {
        if (!Number.isFinite(Number(slope))) return 'Not computed';
        if (Number(slope) > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK) return 'Declining';
        if (Number(slope) < -LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK) return 'Improving';
        return 'Mostly stable';
      };
    const recentWeeklyFit = (weekly = [], windowPoints = 8) => {
      const points = weekly.filter(hasUsableWeeklyLevel);
      return weeklySlopeFit(points.slice(-windowPoints));
    };
    const trendDirectionFromSlope = (slope) => {
      const value = Number(slope);
      if (!Number.isFinite(value)) return 'unknown';
      if (value > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK) return 'decline';
      if (value < -LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK) return 'rise';
      return 'stable';
    };
    const trendShapeSummary = (fullFit, recentFit) => {
      const full = trendDirectionFromSlope(fullFit?.senSlopeFtPerWeek);
      const recent = trendDirectionFromSlope(recentFit?.senSlopeFtPerWeek);
      const r2 = Number(fullFit?.r2);
      const weakLinear = Number.isFinite(r2) && r2 < 0.25;
      let label = 'Mixed / unstable trend';
      let note = 'The full-period straight-line fit is weak or the trend changes direction, so recent trend should be checked before action.';
      if (full === 'decline' && recent === 'decline') {
        label = 'Consistent decline';
        note = 'Both full-period and recent trend indicate groundwater depth is increasing.';
      } else if (full === 'rise' && recent === 'rise') {
        label = 'Consistent rise';
        note = 'Both full-period and recent trend indicate groundwater depth is decreasing.';
      } else if (full === 'decline' && recent === 'rise') {
        label = 'Reversal: decline then recovery';
        note = 'The full-period trend indicates decline, but the recent weeks indicate recovery.';
      } else if (full === 'rise' && recent === 'decline') {
        label = 'Reversal: recovery then decline';
        note = 'The full-period trend indicates recovery, but the recent weeks indicate fresh decline.';
      } else if (recent === 'decline') {
        label = 'Recent decline';
        note = 'The full-period trend is mixed/stable, but recent weeks indicate groundwater depth is increasing.';
      } else if (recent === 'rise') {
        label = 'Recent rise';
        note = 'The full-period trend is mixed/stable, but recent weeks indicate groundwater depth is decreasing.';
      } else if (full === 'stable' && recent === 'stable') {
        label = 'Mostly stable';
        note = 'Both full-period and recent slopes are within the stable threshold.';
      }
      if (weakLinear) {
        note += ` Linear R2 is ${formatNumber(r2, 2)}, so a single straight line should be treated only as a rough summary.`;
      }
      return { label, note, full, recent, weakLinear };
    };
    const trendShapeForWardData = (wardData) => {
      const levelConfig = wardLevelStatisticConfig();
      const selectedWardWeekly = prepareWardWeeklyForStatistic(
        wardData?.weekly || [],
        levelConfig.key
      );
      const weeklyCleanPreview = cleanWeeklyGroundwater(selectedWardWeekly);
      const cleanWeeklyPoints = weeklyCleanPreview.cleaned.filter(hasUsableWeeklyLevel);
      const slopeFit = weeklySlopeFit(cleanWeeklyPoints);
      const recentFit = recentWeeklyFit(cleanWeeklyPoints, 8);
      return trendShapeSummary(slopeFit, recentFit);
    };
    const wardDetailSubheadText = (critical, wardData = null) => {
      if (wardAnalysisLens !== 'groundwater') {
        const selectedWardNo = activeWardProps ? wardNumber(activeWardProps) : critical?.wardNo;
        return `${mapWardCategoryForNo(selectedWardNo)}: ${mapWardReasonForNo(selectedWardNo)}`;
      }
      if (!critical || wardMapCategory(critical) === 'Not current groundwater action') {
        return `GOOD sensor levels from ${sourceDisplayName()} data using all available cleaned records.`;
      }

      const trendShape = wardData ? trendShapeForWardData(wardData) : null;
      const display = wardCategoryDisplay(critical, trendShape);
      if (display.category.includes('recent recovery observed')) {
        return `${display.category}: full-period method is still critical, but recent weeks show recovery.`;
      }
      if (display.category.includes('recent trend stable')) {
        return `${display.category}: full-period method is still critical, but recent weeks are stable.`;
      }
      return `${display.category}: selected official groundwater method controls this ward category.`;
    };
     const plottedGroundwaterTrend = (fit) => {
        const rawSenSlope = fit?.senSlopeFtPerWeek;
        const rawLinearSlope = fit?.slopeFtPerWeek;
        const rawMannKendallS = fit?.mannKendallS;
        const rawPValue = fit?.mannKendallPValue;

        const pointCount = Number(fit?.pointCount || 0);

        const hasLinearSlope =
          rawLinearSlope !== null &&
          rawLinearSlope !== undefined &&
          Number.isFinite(Number(rawLinearSlope));

        const mannKendallS =
          rawMannKendallS !== null &&
          rawMannKendallS !== undefined &&
          Number.isFinite(Number(rawMannKendallS))
            ? Number(rawMannKendallS)
            : null;

        const pValue =
          rawPValue !== null &&
          rawPValue !== undefined &&
          Number.isFinite(Number(rawPValue))
            ? Number(rawPValue)
            : null;

        if (
          pointCount < 8 ||
          !hasLinearSlope ||
          mannKendallS === null ||
          pValue === null
        ) {
          return {
            label: 'Insufficient data',
            className: ''
          };
        }

        const linearSlope = Number(rawLinearSlope);

        const linearDeclining =
          linearSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;

        const linearImproving =
          linearSlope < -LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;

        const significant =
          pValue !== null &&
          pValue <= TREND_SIGNIFICANCE_ALPHA;

        if (
          linearDeclining &&
          mannKendallS > 0
        ) {
          return {
            label: significant
              ? 'Confirmed groundwater decline'
              : 'Groundwater decline review',
            className: 'bad'
          };
        }

        if (
          linearImproving &&
          mannKendallS < 0
        ) {
          return {
            label: significant
              ? 'Confirmed groundwater rise'
              : 'Possible groundwater rise',
            className: 'good'
          };
        }

        if (linearDeclining) {
          return {
            label: 'Groundwater decline review',
            className: 'bad'
          };
        }

        if (linearImproving) {
          return {
            label: 'Linear trend indicates possible rise',
            className: 'good'
          };
        }

        return {
          label: 'Mostly stable',
          className: ''
        };
      };

      const borewellAgreementSummary = (critical) => {
        const classifiedCount = Number(
          critical?.classifiedSensorCount || 0
        );

        const confirmedDecliningCount = Number(
          critical?.confirmedDecliningSensorCount || 0
        );

        const decliningPercent = classifiedCount > 0
          ? (confirmedDecliningCount / classifiedCount) * 100
          : null;

        const rawMedianSlope =
          critical?.medianSensorTheilSenSlopeFtPerWeek;

        const medianSensorSlope =
          rawMedianSlope !== null &&
          rawMedianSlope !== undefined &&
          Number.isFinite(Number(rawMedianSlope))
            ? Number(rawMedianSlope)
            : null;

        const hasMinimumSensors = classifiedCount >= 2;

        const hasMajorityDeclining =
          decliningPercent !== null &&
          decliningPercent >= 50;

        const hasPositiveMedianSlope =
          medianSensorSlope !== null &&
          medianSensorSlope >
            LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;

        let label = 'Insufficient individual-borewell evidence';
        let className = '';

        if (
          hasMinimumSensors &&
          hasMajorityDeclining &&
          hasPositiveMedianSlope
        ) {
          label = 'Majority agreement indicates groundwater decline';
          className = 'bad';
        } else if (
          classifiedCount > 0 &&
          confirmedDecliningCount > 0
        ) {
          label = 'Some borewells show confirmed decline';
          className = 'bad';
        } else if (classifiedCount > 0) {
          label = 'No majority decline among classifiable borewells';
          className = 'good';
        }

        return {
          classifiedCount,
          confirmedDecliningCount,
          decliningPercent,
          medianSensorSlope,
          label,
          className
        };
      };
     const buildLocalCriticalGroundwater = (
  wardWeeklyPayload = { wards: [] }
) => {
  const candidates = (wardWeeklyPayload.wards || []).map((ward) => {
    const fit = weeklySlopeFit(ward.weekly || []);

    const sen = Number(fit.senSlopeFtPerWeek);
    const linear = Number(fit.slopeFtPerWeek);
    const mk = Number(fit.mannKendallS);
    const pValue = Number(fit.mannKendallPValue);
    const pointCount = Number(fit.pointCount || 0);

    const enoughData =
      pointCount >= GROUNDWATER_MIN_SLOPE_WEEKS &&
      Number.isFinite(sen) &&
      Number.isFinite(linear) &&
      Number.isFinite(mk) &&
      Number.isFinite(pValue);

    const linearDecline =
      linear > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;

    const linearRise =
      linear < -LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK;

    const significant =
      pValue <= TREND_SIGNIFICANCE_ALPHA;

    let groundwaterStatus = 'Normal';
    let groundwaterDirection = 'Stable / mixed';
    let dashboardMapCategory =
      'Stable / mixed groundwater trend';
    let dashboardAction = 'No';

    if (!enoughData) {
      groundwaterStatus = 'Insufficient data';
      groundwaterDirection = 'Not computed';
      dashboardMapCategory =
        'Insufficient groundwater data';
    } else if (
      linearDecline &&
      mk > 0 &&
      significant
    ) {
      groundwaterStatus = 'Critical';
      groundwaterDirection = 'Declining';
      dashboardMapCategory =
        'Critical: Ward-average groundwater decline';
      dashboardAction = 'Yes';
    } else if (
      linearDecline &&
      mk > 0
    ) {
      groundwaterStatus = 'Normal';
      groundwaterDirection = 'Stable / mixed';
      dashboardMapCategory =
        'Stable / mixed groundwater trend';
      dashboardAction = 'No';
    } else if (
      linearRise &&
      mk < 0 &&
      significant
    ) {
      groundwaterDirection = 'Improving';
      dashboardMapCategory =
        'Confirmed groundwater rise';
    } else if (
      linearRise &&
      mk < 0
    ) {
      groundwaterDirection =
        'Possible improvement';
      dashboardMapCategory =
        'Possible groundwater rise';
    }

    return {
      wardNo: ward.wardNo,
      wardName: ward.wardName,
      groundwaterStatus,
      groundwaterDirection,
      dashboardAction,
      dashboardMapCategory,

      declineStrengthFtPerWeek:
        Number.isFinite(linear) ? linear : null,

      linearSlopeFtPerWeek:
        Number.isFinite(linear)
          ? Number(linear.toFixed(4))
          : null,

      senSlopeFtPerWeek:
        Number.isFinite(sen)
          ? Number(sen.toFixed(4))
          : null,

      mannKendallS:
        Number.isFinite(mk) ? mk : null,

      mannKendallPValue:
        Number.isFinite(pValue)
          ? pValue
          : null,

      pointCount
    };
  });

  return { wards: candidates };
};
    const mergeCriticalGroundwaterWithWeekly = (
      wardWeeklyPayload = { wards: [] },
      criticalApiPayload = { wards: [] }
    ) => {
      if (currentDataSource !== 'kh') return { wards: [] };

      const localPayload = buildLocalCriticalGroundwater(wardWeeklyPayload);
      const apiByWard = new Map((criticalApiPayload?.wards || []).map((item) => [
        normalizeWardNo(item.wardNo),
        item
      ]));
      const localWardNos = new Set();

      const wards = (localPayload.wards || []).map((localRow) => {
        const wardNo = normalizeWardNo(localRow.wardNo);
        localWardNos.add(wardNo);
        const apiRow = apiByWard.get(wardNo) || {};
        const linearSlope = Number(localRow.linearSlopeFtPerWeek);
        const theilSlope = Number(localRow.senSlopeFtPerWeek);
        const mk = Number(localRow.mannKendallS);
        const pValue = Number(localRow.mannKendallPValue);
        const pointCount = Number(localRow.pointCount || 0);
        const hasSlopeWeeks = pointCount >= GROUNDWATER_MIN_SLOPE_WEEKS;
        const hasMannKendallWeeks = pointCount >= GROUNDWATER_MIN_MK_WEEKS && Number.isFinite(pValue) && Number.isFinite(mk);
        const linearCritical = hasSlopeWeeks && hasMannKendallWeeks && Number.isFinite(linearSlope) && linearSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK && mk > 0 && pValue <= TREND_SIGNIFICANCE_ALPHA;
        const theilCritical = hasSlopeWeeks && hasMannKendallWeeks && Number.isFinite(theilSlope) && theilSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK && mk > 0 && pValue <= TREND_SIGNIFICANCE_ALPHA;
        const officialLinearCritical = linearCritical;
        const officialTheilCritical = theilCritical;
        const fallbackCritical = {
          linearMethodCritical: hasSlopeWeeks && Number.isFinite(linearSlope) && linearSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK ? 'Yes' : 'No',
          theilSenMethodCritical: hasSlopeWeeks && Number.isFinite(theilSlope) && theilSlope > LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK ? 'Yes' : 'No',
          mannKendallMethodCritical: hasMannKendallWeeks && mk > 0 && pValue <= TREND_SIGNIFICANCE_ALPHA ? 'Yes' : 'No',
          linearMannKendallCritical: officialLinearCritical ? 'Yes' : 'No',
          theilSenMannKendallCritical: officialTheilCritical ? 'Yes' : 'No',
          linearSlopeFtPerWeek: Number.isFinite(linearSlope) ? linearSlope : null,
          senSlopeFtPerWeek: Number.isFinite(theilSlope) ? theilSlope : null,
          pointCount
        };
        const selectedCritical = selectedMethodIsCritical(fallbackCritical);
        const selectedSlope = selectedMethodSlope(fallbackCritical);
        const selectedStable = hasSlopeWeeks;
        const selectedMethodName = groundwaterMethodLabel();
        const groundwaterStatus = selectedCritical
          ? 'Critical'
          : localRow.groundwaterStatus === 'Insufficient data'
          ? 'Insufficient data'
          : 'Normal';
        const groundwaterDirection = selectedCritical
          ? 'Declining'
          : localRow.groundwaterDirection === 'Improving'
          ? 'Improving'
          : localRow.groundwaterDirection === 'Possible improvement'
          ? 'Possible improvement'
          : localRow.groundwaterStatus === 'Insufficient data'
          ? 'Not computed'
          : selectedStable ? 'Stable' : 'Mixed / not classified';
        const dashboardMapCategory = selectedCritical
          ? 'Critical: Ward-average groundwater decline'
          : localRow.dashboardMapCategory === 'Confirmed groundwater rise'
          ? 'Confirmed groundwater rise'
          : localRow.dashboardMapCategory === 'Possible groundwater rise'
          ? 'Possible groundwater rise'
          : localRow.groundwaterStatus === 'Insufficient data'
          ? 'Insufficient groundwater data'
          : selectedStable ? 'Stable groundwater trend' : 'Mixed / unclassified groundwater trend';
        const reason = selectedCritical
          ? `Critical groundwater decline: selected method is ${selectedMethodName}; slope is ${formatNumber(selectedSlope, 2)} ft/week and Mann-Kendall p-value is ${Number.isFinite(pValue) ? formatNumber(pValue, 4) : '-'}.`
          : localRow.groundwaterDirection === 'Improving'
          ? `Confirmed groundwater rise: the plotted cleaned ward-average weekly graph has a negative linear slope and statistically significant Mann-Kendall trend.`
          : localRow.groundwaterDirection === 'Possible improvement'
          ? `Possible groundwater rise: the plotted cleaned ward-average weekly graph has a negative linear slope, but Mann-Kendall is not statistically significant.`
          : localRow.groundwaterStatus === 'Insufficient data'
          ? `Not enough plotted cleaned weekly ward-average points are available. Points used: ${formatNumber(pointCount)}.`
          : selectedStable
          ? `Stable groundwater trend: enough plotted weekly ward-average points exist and the selected method does not mark this ward as critical or rising.`
          : `Mixed groundwater trend: the plotted cleaned weekly graph is neither near-flat, declining, nor improving under the selected rule.`;

        return {
          ...apiRow,
          ...localRow,
          groundwaterStatus,
          groundwaterDirection,
          dashboardAction: selectedCritical ? 'Yes' : 'No',
          dashboardMapCategory,
          linearMannKendallCritical: officialLinearCritical ? 'Yes' : 'No',
          theilSenMannKendallCritical: officialTheilCritical ? 'Yes' : 'No',
          linearMethodCritical: fallbackCritical.linearMethodCritical,
          theilSenMethodCritical: fallbackCritical.theilSenMethodCritical,
          mannKendallMethodCritical: fallbackCritical.mannKendallMethodCritical,
          previousCriticalWard: apiRow.previousCriticalWard || localRow.previousCriticalWard || 'No',
          previousCriticalWardName: apiRow.previousCriticalWardName || localRow.previousCriticalWardName || '',
          oldConsumptionNoGroundwaterData: apiRow.oldConsumptionNoGroundwaterData === 'Yes' && localRow.groundwaterStatus === 'Insufficient data' ? 'Yes' : 'No',
          classifiedSensorCount: apiRow.classifiedSensorCount ?? localRow.classifiedSensorCount,
          decliningSensorCount: apiRow.decliningSensorCount ?? localRow.decliningSensorCount,
          confirmedDecliningSensorCount: apiRow.confirmedDecliningSensorCount ?? localRow.confirmedDecliningSensorCount,
          improvingSensorCount: apiRow.improvingSensorCount ?? localRow.improvingSensorCount,
          decliningSensorPercent: apiRow.decliningSensorPercent ?? localRow.decliningSensorPercent,
          confirmedDecliningSensorPercent: apiRow.confirmedDecliningSensorPercent ?? localRow.confirmedDecliningSensorPercent,
          medianSensorTheilSenSlopeFtPerWeek: apiRow.medianSensorTheilSenSlopeFtPerWeek ?? localRow.medianSensorTheilSenSlopeFtPerWeek,
          usableWeeklyValues: pointCount,
          updateReason: `${reason} Individual borewell trends are supporting evidence and do not override this ward-average classification.`
        };
      });

      for (const apiRow of criticalApiPayload?.wards || []) {
        const wardNo = normalizeWardNo(apiRow.wardNo);
        if (!localWardNos.has(wardNo) && apiRow.oldConsumptionNoGroundwaterData === 'Yes') {
          wards.push(apiRow);
        }
      }

      return { ...criticalApiPayload, wards };
    };
    const indexedTrendFit = (values = [], times = []) => {
      const validTimes = times.map((time) => new Date(time).getTime());
      const firstTime = validTimes.find(Number.isFinite);
      const points = values
        .map((value, index) => ({
          x: Number.isFinite(validTimes[index]) && Number.isFinite(firstTime)
            ? (validTimes[index] - firstTime) / 86400000
            : index,
          index,
          y: value === null || value === undefined || value === '' ? Number.NaN : Number(value)
        }))
        .filter((point) => Number.isFinite(point.y));
      if (points.length < 2) {
        return {
          slope: null,
          senSlope: null,
          mannKendallS: null,
          mannKendallPValue: null,
          trendData: values.map(() => null),
          pointCount: points.length
        };
      }
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
      if (!denominator) {
        return {
          slope: null,
          senSlope: null,
          mannKendallS: null,
          mannKendallPValue: null,
          trendData: values.map(() => null),
          pointCount: points.length
        };
      }
      const slope = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
      const intercept = meanY - slope * meanX;
      const totalSquares = points.reduce((sum, point) => sum + ((point.y - meanY) ** 2), 0);
      const residualSquares = points.reduce((sum, point) => sum + ((point.y - (intercept + slope * point.x)) ** 2), 0);
      const pointByIndex = new Map(points.map((point) => [point.index, point]));
      const pairSlopes = [];
      let mannKendallS = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[j].x - points[i].x;
          const dy = points[j].y - points[i].y;
          if (dx > 0) pairSlopes.push(dy / dx);
          mannKendallS += dy > 0 ? 1 : dy < 0 ? -1 : 0;
        }
      }
      const sortedSlopes = pairSlopes.slice().sort((a, b) => a - b);
      const senSlope = sortedSlopes.length
        ? sortedSlopes.length % 2
          ? sortedSlopes[Math.floor(sortedSlopes.length / 2)]
          : (sortedSlopes[(sortedSlopes.length / 2) - 1] + sortedSlopes[sortedSlopes.length / 2]) / 2
        : null;
      const senIntercept = Number.isFinite(senSlope)
        ? medianValue(points.map((point) => point.y - (senSlope * point.x)))
        : null;
      const variance = (points.length * (points.length - 1) * ((2 * points.length) + 5)) / 18;
      const mkZ = variance > 0
        ? mannKendallS > 0 ? (mannKendallS - 1) / Math.sqrt(variance) : mannKendallS < 0 ? (mannKendallS + 1) / Math.sqrt(variance) : 0
        : null;
      const normalCdf = (value) => {
        const sign = value < 0 ? -1 : 1;
        const x = Math.abs(value) / Math.sqrt(2);
        const t = 1 / (1 + 0.3275911 * x);
        const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return 0.5 * (1 + sign * erf);
      };
      const mkP = Number.isFinite(mkZ) ? 2 * (1 - normalCdf(Math.abs(mkZ))) : null;
      return {
        slope,
        senSlope,
        mannKendallS,
        mannKendallPValue: mkP,
        linearR2: totalSquares > 0 ? 1 - (residualSquares / totalSquares) : null,
        trendData: values.map((_, index) => pointByIndex.has(index) && Number.isFinite(senIntercept)
          ? senIntercept + (senSlope * pointByIndex.get(index).x)
          : null),
        pointCount: points.length,
        spanDays: points.length > 1 ? points[points.length - 1].x - points[0].x : 0
      };
    };
    const performanceTrendLabel = (fit, median, inverseMode = false) => {
      if (!fit || fit.pointCount < 5 || Number(fit.spanDays) < 14 || !Number.isFinite(Number(fit.senSlope)) || !Number.isFinite(Number(median)) || Number(median) <= 0) {
        return 'Insufficient temporal data';
      }
      const percentPerMonth = (Number(fit.senSlope) * 30.4375 / Number(median)) * 100;
      if (Math.abs(percentPerMonth) < 5) return 'Stable';
      const worsening = inverseMode ? percentPerMonth > 0 : percentPerMonth < 0;
      const significant = Number(fit.mannKendallPValue) <= TREND_SIGNIFICANCE_ALPHA;
      if (significant) return worsening ? 'Confirmed worsening' : 'Confirmed improving';
      return worsening ? 'Possible worsening' : 'Possible improving';
    };
    const capacityOutlierBounds = (values = []) => {
      const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (sorted.length < 4) return null;
      const q1 = medianValue(sorted.slice(0, Math.floor(sorted.length / 2)));
      const q3 = medianValue(sorted.slice(Math.ceil(sorted.length / 2)));
      const iqr = q3 - q1;
      if (!Number.isFinite(iqr) || iqr <= 0) return null;
      return { lower: q1 - (1.5 * iqr), upper: q3 + (1.5 * iqr) };
    };
    const cleanedCapacitySeries = (sessions = [], inverseMode = false) => {
      const rows = sessions.map((session) => ({
        session,
        value: inverseMode
          ? Number(session.inverseSpecificCapacitySPerM2)
          : scaledSpecificCapacity(session.transmissivityScaled, session.specificCapacityM2s)
      }));
      const bounds = capacityOutlierBounds(rows.map((row) => row.value));
      return rows.map((row) => {
        const isOutlier = bounds && Number.isFinite(row.value) && (row.value < bounds.lower || row.value > bounds.upper);
        return { ...row, isOutlier };
      });
    };
    const capacityTrendSummary = (sessions = [], inverseMode = false) => {
      const rows = cleanedCapacitySeries(sessions, inverseMode);
      const daily = new Map();
      rows.filter((row) => !row.isOutlier && Number.isFinite(row.value)).forEach((row) => {
        const time = row.session.time || row.session.date || row.session.label;
        const date = new Date(time);
        if (Number.isNaN(date.getTime())) return;
        const key = date.toISOString().slice(0, 10);
        if (!daily.has(key)) daily.set(key, []);
        daily.get(key).push(row.value);
      });
      const dailyRows = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const values = dailyRows.map(([, items]) => medianValue(items));
      const times = dailyRows.map(([day]) => day);
      const fit = indexedTrendFit(values, times);
      const seriesMedian = medianValue(values);
      return {
        fit,
        outlierCount: rows.filter((row) => row.isOutlier).length,
        dailyPointCount: dailyRows.length,
        percentPerMonth: Number.isFinite(Number(fit.senSlope)) && Number(seriesMedian) > 0
          ? (Number(fit.senSlope) * 30.4375 / Number(seriesMedian)) * 100
          : null,
        trend: performanceTrendLabel(fit, seriesMedian, inverseMode)
      };
    };
    const percentileValue = (values = [], percentile = 0.5) => {
      const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!sorted.length) return null;
      const position = (sorted.length - 1) * percentile;
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      if (lower === upper) return sorted[lower];
      return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
    };
    const jacobDischargeFit = (sessions = []) => {
      const points = sessions.map((session) => ({
        x: Number(session.lowestDischargeM3s) * 60000,
        inverse: Number(session.inverseSpecificCapacitySPerM2)
      })).filter((point) => Number.isFinite(point.x) && point.x > 0 && Number.isFinite(point.inverse) && point.inverse > 0);
      if (points.length < 3) return null;
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const meanY = points.reduce((sum, point) => sum + point.inverse, 0) / points.length;
      const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
      if (!denominator) return null;
      const c = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.inverse - meanY)), 0) / denominator;
      const b = meanY - (c * meanX);
      const totalSquares = points.reduce((sum, point) => sum + ((point.inverse - meanY) ** 2), 0);
      const residualSquares = points.reduce((sum, point) => sum + ((point.inverse - (b + c * point.x)) ** 2), 0);
      return {
        b,
        c,
        r2: totalSquares > 0 ? 1 - (residualSquares / totalSquares) : null,
        points: points.slice().sort((a, bPoint) => a.x - bPoint.x)
      };
    };
    const percentileClass = (value, lowCut, highCut, inverseMode = false) => {
      const number = Number(value);
      if (!Number.isFinite(number) || !Number.isFinite(Number(lowCut)) || !Number.isFinite(Number(highCut))) return 'Not computed';
      if (inverseMode) {
        if (number >= highCut) return 'Low performance';
        if (number <= lowCut) return 'High performance';
        return 'Medium performance';
      }
      if (number >= highCut) return 'High performance';
      if (number <= lowCut) return 'Low performance';
      return 'Medium performance';
    };

    function verifyLensCounts() {
    const report = {
        groundwater: 0,
        volumetric_deficit: 0,
        extraction: 0,
        pumping_stress: 0,
        specific_capacity: 0,
        common: {}
    };

    for (let n = 1; n <= 5; n++) {
        report.common[n] = 0;
    }

    const wardDetails = [];

    for (const wardNo of wardIndicatorsByNo.keys()) {

        const flags = overallCriticalLensFlags(wardNo);

        const activeCount = Object.values(flags).filter(Boolean).length;

        if (flags.groundwater) report.groundwater++;
        if (flags.volumetric_deficit) report.volumetric_deficit++;
        if (flags.extraction) report.extraction++;
        if (flags.pumping_stress) report.pumping_stress++;
        if (flags.specific_capacity) report.specific_capacity++;

        for (let n = 1; n <= 5; n++) {
            if (activeCount >= n)
                report.common[n]++;
        }

        wardDetails.push({
            wardNo,
            activeCount,
            ...flags
        });
    }

    console.log("========== LENS SUMMARY ==========");
    console.table(report);

    console.log("========== WARD DETAILS ==========");
    console.table(wardDetails);

    return { report, wardDetails };
}

function verifyDashboardCounts() {

    let actualDisplayed = 0;

    wardLayers.forEach(layer => {

        const wardNo = wardNumber(layer.feature.properties);

        if (mapWardStatusKey(wardNo) === "critical")
            actualDisplayed++;

    });

    console.log("Dashboard Critical =", actualDisplayed);

    return actualDisplayed;
}

function compareCurrentLens() {

    let calculated = 0;

    for (const wardNo of wardIndicatorsByNo.keys()) {

        if (mapWardStatusKey(wardNo) === "critical")
            calculated++;

    }

    const displayed = verifyDashboardCounts();

    console.log("Calculated =", calculated);
    console.log("Displayed  =", displayed);

    if (calculated === displayed)
        console.log("✅ MATCH");
    else
        console.error("❌ MISMATCH");
}

function verifyCommonSelector() {

    for (let threshold = 1; threshold <= 5; threshold++) {

        let count = 0;

        const wards = [];

        for (const wardNo of wardIndicatorsByNo.keys()) {

            const flags = overallCriticalLensFlags(wardNo);

            const active =
                Object.values(flags).filter(Boolean).length;

            if (active >= threshold) {

                count++;

                wards.push({
                    wardNo,
                    active,
                    flags
                });

            }

        }

        console.group(`Common >= ${threshold}`);

        console.log("Count =", count);

        console.table(wards);

        console.groupEnd();

    }

}

/* ==========================================================================
   DASHBOARD AUDIT TOOL
   Run from browser console:
   runDashboardAudit();
   ========================================================================== */

function runDashboardAudit() {

    console.clear();

    console.log("==========================================================");
    console.log("           BBMP BOREWELL DASHBOARD AUDIT");
    console.log("==========================================================");

    const summary = {
        groundwater: 0,
        volumetric_deficit: 0,
        extraction: 0,
        pumping_stress: 0,
        specific_capacity: 0,
        common1: 0,
        common2: 0,
        common3: 0,
        common4: 0,
        common5: 0
    };

    const wardTable = [];

    let displayedCritical = 0;

    const wardNumbers = new Set();

    /* Every ward actually drawn on the dashboard */
    wardFeatures.forEach((feature) => {
        const wn = normalizeWardNo(
            wardNumber(feature?.properties || {})
        );

        if (wn) {
            wardNumbers.add(wn);
        }
    });

    /* Also include any API/data wards not present in the shapefile */
    wardIndicatorsByNo.forEach((_, k) =>
        wardNumbers.add(normalizeWardNo(k))
    );

    criticalGroundwaterByNo.forEach((_, k) =>
        wardNumbers.add(normalizeWardNo(k))
    );

    pumpingPerformanceWardSummaryByNo.forEach((_, k) =>
        wardNumbers.add(normalizeWardNo(k))
    );

    for (const wardNo of wardNumbers) {

        const flags = overallCriticalLensFlags(wardNo);

        const active =
            Object.values(flags).filter(Boolean).length;

        if (flags.groundwater) summary.groundwater++;
        if (flags.volumetric_deficit) summary.volumetric_deficit++;
        if (flags.extraction) summary.extraction++;
        if (flags.pumping_stress) summary.pumping_stress++;
        if (flags.specific_capacity) summary.specific_capacity++;

        if (active >= 1) summary.common1++;
        if (active >= 2) summary.common2++;
        if (active >= 3) summary.common3++;
        if (active >= 4) summary.common4++;
        if (active >= 5) summary.common5++;

        const feature = wardFeatures.find(
            f => normalizeWardNo(wardNumber(f?.properties || {})) === wardNo
        );

        const wardNameText = feature
            ? wardName(feature.properties)
            : (
                criticalGroundwaterByNo.get(wardNo)?.wardName ||
                wardIndicatorsByNo.get(wardNo)?.wardName ||
                pumpingPerformanceWardSummaryByNo.get(wardNo)?.wardName ||
                ""
              );

        wardTable.push({

            Ward_No: wardNo,

            Ward_Name: wardNameText,

            Groundwater: flags.groundwater,

            Volumetric_Deficit: flags.volumetric_deficit,

            Extraction: flags.extraction,

            Pumping_Stress: flags.pumping_stress,

            Specific_Capacity: flags.specific_capacity,

            Total_Lenses: active,

            Dashboard_Critical:
                mapWardStatusKey(wardNo) === "critical",

            Dashboard_Category:
                mapWardCategoryForNo(wardNo)

        });

    }

    wardLayers.forEach(layer => {

          if (!layer.feature || !layer.feature.properties) return;

          const wn = normalizeWardNo(
              wardNumber(layer.feature.properties)
          );

          if (mapWardStatusKey(wn) === "critical")
              displayedCritical++;

      });

    console.log("");
    console.log("================== SUMMARY ==================");

    console.table([{

        Groundwater: summary.groundwater,

        Volumetric_Deficit: summary.volumetric_deficit,

        Extraction: summary.extraction,

        Pumping_Stress: summary.pumping_stress,

        Specific_Capacity: summary.specific_capacity,

        "Common >=1": summary.common1,

        "Common >=2": summary.common2,

        "Common >=3": summary.common3,

        "Common >=4": summary.common4,

        "Common >=5": summary.common5,

        Dashboard_Current:
            wardTable.filter(r => r.Dashboard_Critical).length,

        Drawn_On_Map:
            displayedCritical

    }]);

    console.log("");
    console.log("================== WARD TABLE ==================");

    console.table(
        wardTable.sort((a,b)=>{

            if(b.Total_Lenses!==a.Total_Lenses)
                return b.Total_Lenses-a.Total_Lenses;

            return Number(a.Ward_No)-Number(b.Ward_No);

        })
    );

    const mismatch =
      wardAnalysisLens === 'overall'
          ? wardTable.filter((r) => {
              const expected =
                  r.Total_Lenses >= commonLensCount;

              return expected !== r.Dashboard_Critical;
          })
          : [];

    console.log("");
    console.log("================== MISMATCHS ==================");

    if(mismatch.length===0){

        console.log("✅ No mismatches found.");

    }
    else{

        console.warn("❌ Mismatches Found");

        console.table(mismatch);

    }

    console.log("");
    console.log("================== COMMON GROUPS ==================");

    for(let i=5;i>=1;i--){

        const rows=wardTable.filter(r=>r.Total_Lenses>=i);

        console.group(`Common >= ${i} (${rows.length})`);

        console.table(rows);

        console.groupEnd();

    }

    console.log("");
    console.log("==========================================================");
    console.log("Audit Complete");
    console.log("==========================================================");

    return {

        summary,

        wards:wardTable,

        mismatch

    };

}

window.runDashboardAudit = runDashboardAudit;
window.verifyLensCounts = verifyLensCounts;
window.verifyDashboardCounts = verifyDashboardCounts;
window.compareCurrentLens = compareCurrentLens;
window.verifyCommonSelector = verifyCommonSelector;
