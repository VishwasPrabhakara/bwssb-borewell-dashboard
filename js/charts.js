/* ==========================================================================
   BWSSB Borewell Dashboard - Chart.js Visualization Engine & Fullscreen Handler
   ========================================================================== */

    const renderWardLineChart = (canvas, labels, datasets, options = {}) => {
      const decimals = options.unit === 'm2/s' || options.unit === 'x10^-6 m2/s' ? 4 : options.unit === 's/m2' ? 0 : 2;
      const chartValue = (value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const y = Number(value.y);
          return Number.isFinite(y) ? { ...value, y: Number(y.toFixed(decimals)) } : { ...value, y: null };
        }
        return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(Number(value).toFixed(decimals)) : null;
      };
      const tooltipDecimals = options.unit === 'm2/s' || options.unit === 'x10^-6 m2/s' ? 4 : options.unit === 's/m2' ? 0 : 2;
      const rotateLabels = Boolean(options.rotateXLabels) || (options.autoRotateXLabels && labels.length > 10);
      const chart = new Chart(canvas, {
        type: options.chartType || 'line',
        data: {
          labels,
          datasets: datasets.map((dataset) => ({
            ...dataset,
            data: (dataset.data || []).map(chartValue),
            backgroundColor: dataset.borderColor + '22',
            borderWidth: dataset.borderWidth ?? 2,
            borderDash: dataset.borderDash ?? [],
            pointRadius: dataset.pointRadius ?? 3,
            pointHoverRadius: dataset.pointHoverRadius ?? 4,
            showLine: dataset.showLine ?? options.showLine ?? true,
            tension: 0,
            spanGaps: dataset.spanGaps ?? false
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: options.xType === 'linear-time' ? 'linear' : options.xType || 'category',
              title: { display: Boolean(options.xTitle), text: options.xTitle || '' },
              ticks: {
                minRotation: rotateLabels ? 90 : 0,
                maxRotation: rotateLabels ? 90 : 0,
                autoSkip: Boolean(options.autoSkipXLabels),
                maxTicksLimit: options.maxTicksLimit || 12,
                callback(value) {
                  if (options.xType === 'linear-time') {
                    return new Date(Number(value)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                  }
                  if (options.xType === 'linear') return Number(value).toFixed(options.xDecimals ?? 2);
                  if (options.xType === 'logarithmic') return formatNumber(value, 0);
                  return monthAxisLabel(this.getLabelForValue(value));
                }
              }
            },
            y: {
              reverse: options.reverseY ?? true,
              title: { display: true, text: options.yTitle || 'Feet below surface' }
            },
            ...(options.secondAxis ? {
              y1: {
                position: 'right',
                grid: { drawOnChartArea: false },
                title: { display: true, text: options.secondAxis }
              }
            } : {})
          },
          layout: {
            padding: { bottom: options.bottomPadding || (rotateLabels ? 24 : 8) }
          },
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: {
              display: true,
              labels: {
                usePointStyle: true,
                boxWidth: 16,
                boxHeight: 10
              }
            },
            tooltip: {
              callbacks: {
                title(context) {
                  if (options.xType === 'linear-time') {
                    const raw = context[0]?.raw || {};
                    return raw.label || new Date(Number(raw.x)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                  }
                  if (options.xType === 'linear' || options.xType === 'logarithmic') {
                    const raw = context[0]?.raw || {};
                    return raw.label || `${options.xTitle || 'X'}: ${formatNumber(raw.x, options.xDecimals ?? 2)}`;
                  }
                  return context[0]?.label || '';
                },
                label(context) {
                  const value = context.parsed.y;
                  const unit = context.dataset.unit || options.unit || 'ft';
                  return Number.isFinite(value) ? `${context.dataset.label}: ${value.toFixed(tooltipDecimals)} ${unit}` : `${context.dataset.label}: N/A`;
                }
              }
            }
          }
        }
      });
      wardInlineCharts.push(chart);
      return chart;
    };

    const buildWardDetailHtml = (props, wardData, localWardSensors, specificCapacityData = null) => {
      const count = props._sensorCount || 0;
      const goodSensors = wardData ? (wardData.goodSensors || 0) : localWardSensors.filter((sensor) => qcStatusForSensor(sensor) === 'GOOD').length;
      const omittedGoodUids = wardData?.noWeeklyDataUids || [];
      const notUsable = Math.max(count - goodSensors, 0);
      const goodPercent = count ? `${formatNumber((goodSensors / count) * 100, 1)}%` : '-';
      const avgDrop = wardData?.avgDropPerDay;
      const medianDrop = wardData?.medianDropPerDay;
      const maxDrop = wardData?.maxDropPerDay;
      const criticalGw = criticalForWardNo(wardNumber(props));
      const wardLevelConfig = wardLevelStatisticConfig();
      const selectedWardWeekly = prepareWardWeeklyForStatistic(wardData?.weekly || [], wardLevelConfig.key);
      const weeklyCleanPreview = cleanWeeklyGroundwater(selectedWardWeekly);
      const cleanWeeklyPoints = weeklyCleanPreview.cleaned.filter(hasUsableWeeklyLevel);
      const slopeFit = weeklySlopeFit(cleanWeeklyPoints);
      const recentFit = recentWeeklyFit(cleanWeeklyPoints, 8);
      const trendShape = trendShapeSummary(slopeFit, recentFit);
      const plottedTrend = plottedGroundwaterTrend(slopeFit);
      const borewellSummary = borewellAgreementSummary(criticalGw);
      const allDropStatsPositive = Boolean(wardData?.dropAllPositive);
      const dropClass = Number(avgDrop) > 0 ? 'bad' : Number(avgDrop) < 0 ? 'good' : '';
      const hasWardWeeklyData = cleanWeeklyPoints.length >= 2;
      const rainfall = wardData?.rainfall || null;
      const rainfallYears = Array.isArray(rainfall?.yearTotals) ? rainfall.yearTotals : [];
      const rainfallSource = rainfall?.source === 'CHIRPS' ? 'CHIRPS' : rainfall?.source === 'NASA_POWER' ? 'NASA POWER' : 'Rainfall';
      const rainfallYearText = rainfallYears.length
        ? rainfallYears.map((item) => `${htmlEscape(item.year)}: ${formatNumber(item.rainfallMm, 1)} mm`).join('<br>')
        : '';
      const rainfallMetrics = rainfall ? `
        ${wardMetric(`Total ${rainfallSource} Rainfall`, `${formatNumber(rainfall.totalRainfallMm, 1)} mm`)}
        ${wardMetric(`${new Date().getFullYear()} Rainfall Till Date`, `${formatNumber(rainfall.currentYearRainfallMm, 1)} mm`)}
        ${wardMetric('Rainfall Data Period', `${formatDateTime(rainfall.firstRainfallDate).split(',')[0]} to ${formatDateTime(rainfall.lastRainfallDate).split(',')[0]}`)}
        ${rainfallYearText ? wardMetric('Year-wise Rainfall', rainfallYearText) : ''}
      ` : '';
      const weeklyOutlierNote = weeklyCleanPreview.outliers.length
        ? `<div class="ward-note">${formatNumber(weeklyCleanPreview.outliers.length)} weekly groundwater point(s) were hidden because they were invalid, negative/zero, or isolated unrealistic jumps compared with neighbouring weeks.</div>`
        : '';
      const dropNote = goodSensors > 0 && avgDrop == null && medianDrop == null && maxDrop == null
        ? '<div class="ward-note">Drop/day is blank because the GOOD sensors in this ward do not have at least two successive weekly values to compare.</div>'
        : '';
      const sensorPanels = (wardData?.sensors || []).map((sensor, index) => `
        <details class="uid-chart-card">
          <summary>
            <span>${sensor.uid}</span>
            <small>${htmlEscape(sensor.groundwaterTrend?.classification || 'Not computed')} | ${formatTrend(sensor.groundwaterTrend?.theilSenSlopeFtPerWeek, 'ft/week', 2)}</small>
          </summary>
          <div class="ward-summary-grid compact">
            ${wardMetric('Groundwater Classification', sensor.groundwaterTrend?.classification || 'Not computed', sensor.groundwaterTrend?.classification === 'Declining' ? 'bad' : sensor.groundwaterTrend?.classification === 'Improving' ? 'good' : '')}
            ${wardMetric('Theil-Sen Rate', formatTrend(sensor.groundwaterTrend?.theilSenSlopeFtPerWeek, 'ft/week', 2), slopeClass(sensor.groundwaterTrend?.theilSenSlopeFtPerWeek))}
            ${wardMetric('Mann-Kendall p-value', sensor.groundwaterTrend?.mannKendallPValue == null ? '-' : formatNumber(sensor.groundwaterTrend.mannKendallPValue, 3))}
            ${wardMetric('Weekly Values Used', formatNumber(sensor.groundwaterTrend?.usableWeeklyValues || 0))}
          </div>
          ${sensor.dropPerDay == null ? '<p class="uid-note">Drop/day is blank because this UID has fewer than two valid weekly values to compare.</p>' : ''}
          ${(sensor.dailyLevels || []).length || (sensor.points || []).length ? `
            <div class="uid-mode-tabs" data-uid-index="${index}">
              <button type="button" class="active" data-mode="daily-level">Daily levels</button>
              <button type="button" data-mode="weekly-level">Weekly levels</button>
              <button type="button" data-mode="daily-drop">Daily drop</button>
              <button type="button" data-mode="weekly-drop">Weekly drop</button>
            </div>
            <div class="uid-range-tabs" data-uid-index="${index}">
              <button type="button" class="active" data-range="week">Last Week</button>
              <button type="button" data-range="month">Last Month</button>
              <button type="button" data-range="three">3 Months</button>
              <button type="button" data-range="all">All Time</button>
            </div>
            <div class="uid-outlier-tabs" data-uid-index="${index}">
              <button type="button" data-toggle-groundwater-outliers>Show flagged outliers</button>
              <button type="button" data-toggle-cycle-connector>Hide water level path</button>
            </div>
            <div class="mini-chart-wrap">
              <button class="mini-chart-expand chart-expand" data-chart-id="uidModeChart${index}" data-chart-title="UID ${sensor.uid}" type="button">Expand</button>
              <canvas id="uidModeChart${index}"></canvas>
              <div class="mini-chart-empty" id="uidModeEmpty${index}" style="display:none"></div>
            </div>
          ` : '<div class="ward-note uid-note">This GOOD QC sensor is listed, but it has no valid levels to plot after removing zero readings and outliers.</div>'}
        </details>
      `).join('');
      const omittedNote = omittedGoodUids.length
        ? `<div class="ward-note">${omittedGoodUids.length} sensor(s) passed QC but are excluded from GOOD Sensors because they have no valid cleaned groundwater levels to plot after removing zero readings and outliers: ${omittedGoodUids.join(', ')}</div>`
        : '';
      const capacitySensors = specificCapacityData?.sensors || [];
      const capacityWard = specificCapacityData?.ward || {};
      const capacityDiagnostics = specificCapacityData?.diagnostics || {};
      const capacityAnalyses = new Map(capacitySensors.map((sensor) => [
        String(sensor.uid),
        {
          specific: capacityTrendSummary(sensor.sessions || [], false),
          inverse: capacityTrendSummary(sensor.sessions || [], true)
        }
      ]));
      const capacitySpecificValues = capacitySensors
        .map((sensor) => scaledSpecificCapacity(sensor.averageTransmissivityScaled, sensor.averageSpecificCapacityM2s))
        .filter(Number.isFinite);
      const capacityInverseValues = capacitySensors
        .map((sensor) => Number(sensor.averageInverseSpecificCapacitySPerM2))
        .filter(Number.isFinite);
      const specificLowCut = percentileValue(capacitySpecificValues, 0.33);
      const specificHighCut = percentileValue(capacitySpecificValues, 0.66);
      const inverseLowCut = percentileValue(capacityInverseValues, 0.33);
      const inverseHighCut = percentileValue(capacityInverseValues, 0.66);
      const lowSpecificSensors = capacitySensors.filter((sensor) => (
        percentileClass(scaledSpecificCapacity(sensor.averageTransmissivityScaled, sensor.averageSpecificCapacityM2s), specificLowCut, specificHighCut) === 'Low performance'
      ));
      const highInverseSensors = capacitySensors.filter((sensor) => (
        percentileClass(Number(sensor.averageInverseSpecificCapacitySPerM2), inverseLowCut, inverseHighCut, true) === 'Low performance'
      ));
      const lowSpecificUidSet = new Set(lowSpecificSensors.map((sensor) => String(sensor.uid)));
      const highInverseUidSet = new Set(highInverseSensors.map((sensor) => String(sensor.uid)));
      const worseningCapacitySensors = capacitySensors.filter((sensor) => {
        const analysis = capacityAnalyses.get(String(sensor.uid));
        return analysis?.specific.trend === 'Confirmed worsening' || analysis?.inverse.trend === 'Confirmed worsening';
      });
      const capacityTrendEligibleSensors = capacitySensors.filter((sensor) => (
        capacityAnalyses.get(String(sensor.uid))?.specific.trend !== 'Insufficient temporal data'
      ));
      const medianCapacityChangePercentMonth = medianValue(capacityTrendEligibleSensors
        .map((sensor) => capacityAnalyses.get(String(sensor.uid))?.specific.percentPerMonth)
        .filter(Number.isFinite));
      const wardCapacityStatus = capacityTrendEligibleSensors.length < 2
        ? 'Insufficient temporal data'
        : worseningCapacitySensors.length / capacityTrendEligibleSensors.length >= 0.5
          && Number(medianCapacityChangePercentMonth) <= -5
          ? 'Needs attention'
          : 'Stable / mixed';
      const worseningCapacityUidSet = new Set(worseningCapacitySensors.map((sensor) => String(sensor.uid)));
      const attentionUidSet = new Set([...lowSpecificUidSet, ...highInverseUidSet, ...worseningCapacityUidSet]);
      const uidChipList = (items, dangerSet = new Set()) => items.length
        ? `<div class="uid-list capacity-uid-list">${items.map((sensor) => {
          const uid = String(sensor.uid);
          return `<span class="${dangerSet.has(uid) ? 'danger' : ''}">${htmlEscape(uid)}</span>`;
        }).join('')}</div>`
        : '<span class="muted-inline">None</span>';
      const lowSpecificCount = lowSpecificSensors.length;
      const highInverseCount = highInverseSensors.length;
      const skippedCapacityReasons = (capacityDiagnostics.skippedSensors || []).slice(0, 5)
        .map((item) => `${htmlEscape(item.uid || '-')}: ${htmlEscape(item.reason || 'No valid pumping session')}`)
        .join('<br>');
      const capacityMissingNote = !specificCapacityData
        ? '<div class="ward-note">Specific capacity data has not loaded for this ward yet. This does not mean there are no sessions. Refresh the ward or reopen it after the API finishes loading.</div>'
        : specificCapacityData?.deferred
        ? '<div class="ward-note deferred-analysis-note">Specific-capacity session charts are loaded only when this tab is opened, keeping the map and ward overview responsive.</div>'
        : specificCapacityData?.loadError
        ? `<div class="ward-note">Specific capacity sessions could not be loaded from the API for this ward. This does not mean there are no sessions; it means the ward-specific capacity endpoint failed or is temporarily unavailable. Try refreshing after a few minutes, or use the Ward Excel download if it is available.<br><br>${htmlEscape(specificCapacityData.loadError)}</div>`
        : capacitySensors.length
        ? (Number(capacityDiagnostics.sensorsWithoutValidSpecificCapacity || 0) > 0
          ? `<div class="ward-note">${formatNumber(capacityDiagnostics.sensorsWithoutValidSpecificCapacity)} sensor(s) in this ward have both water-level and discharge data, but were not used because no valid pumping session was found with positive duration, positive drawdown, and discharge inside the pumping period.${skippedCapacityReasons ? `<br><br>${skippedCapacityReasons}` : ''}</div>`
          : '')
        : (Number(capacityDiagnostics.candidateSensorsWithWaterAndDischarge || 0) > 0
        ? `<div class="ward-note">This ward has ${formatNumber(capacityDiagnostics.candidateSensorsWithWaterAndDischarge)} sensor(s) with both water-level and discharge data, but specific capacity cannot be calculated because no valid KH pump START-to-END cycle was found with positive duration, positive drawdown, and discharge during the pumping period.${skippedCapacityReasons ? `<br><br>${skippedCapacityReasons}` : ''}</div>`
          : '<div class="ward-note">Specific capacity is not available in the API response for this ward. This may be an API/cache issue if the downloaded Excel shows valid sessions.</div>');
      const capacityPanels = capacitySensors.map((sensor, index) => {
        const uid = String(sensor.uid);
        const isLowSpecificUid = lowSpecificUidSet.has(uid);
        const isHighInverseUid = highInverseUidSet.has(uid);
        const isAttentionUid = attentionUidSet.has(uid);
        return `
        <details class="uid-chart-card ${isAttentionUid ? 'capacity-alert' : ''} ${isLowSpecificUid ? 'specific-low-alert' : ''} ${isHighInverseUid ? 'inverse-high-alert' : ''}" ${index === 0 ? 'open' : ''}>
          <summary>
            <span>${htmlEscape(uid)}${isLowSpecificUid ? '<em class="uid-alert-label">Low Specific Capacity</em>' : ''}${isHighInverseUid ? '<em class="uid-alert-label inverse">High Inverse</em>' : ''}</span>
            <small>Avg ${formatNumber(scaledSpecificCapacity(sensor.averageTransmissivityScaled, sensor.averageSpecificCapacityM2s), 4)} | Pump ${formatNumber(sensor.averagePumpingMinutesPerDay, 1)} min/day</small>
          </summary>
          <div class="ward-summary-grid compact">
            ${wardMetric('Average Specific Capacity', formatNumber(scaledSpecificCapacity(sensor.averageTransmissivityScaled, sensor.averageSpecificCapacityM2s), 4))}
            ${wardMetric('Maximum Specific Capacity', formatNumber(scaledSpecificCapacity(sensor.maxTransmissivityScaled, sensor.maxSpecificCapacityM2s), 4))}
            ${wardMetric('Average Inverse Specific Capacity', `${formatNumber(sensor.averageInverseSpecificCapacitySPerM2, 0)} s/m2`)}
            ${wardMetric('Specific Capacity Class (within ward)', percentileClass(scaledSpecificCapacity(sensor.averageTransmissivityScaled, sensor.averageSpecificCapacityM2s), specificLowCut, specificHighCut))}
            ${wardMetric('Inverse Class (within ward)', percentileClass(Number(sensor.averageInverseSpecificCapacitySPerM2), inverseLowCut, inverseHighCut, true))}
            ${wardMetric('Avg Pump/day', `${formatNumber(sensor.averagePumpingMinutesPerDay, 1)} min`)}
            ${wardMetric('Max Pump/day', `${formatNumber(sensor.maxPumpingMinutesPerDay, 1)} min`)}
            ${wardMetric('Specific Capacity Trend', capacityAnalyses.get(String(sensor.uid))?.specific.trend || 'Not computed')}
            ${wardMetric('Specific Capacity Theil-Sen Rate', capacityAnalyses.get(String(sensor.uid))?.specific.percentPerMonth == null ? '-' : `${formatNumber(capacityAnalyses.get(String(sensor.uid))?.specific.percentPerMonth, 1)}%/month`)}
            ${wardMetric('Specific Capacity MK p-value', capacityAnalyses.get(String(sensor.uid))?.specific.fit.mannKendallPValue == null ? '-' : formatNumber(capacityAnalyses.get(String(sensor.uid))?.specific.fit.mannKendallPValue, 3))}
            ${wardMetric('Specific Capacity Outliers', formatNumber(capacityAnalyses.get(String(sensor.uid))?.specific.outlierCount || 0))}
            ${wardMetric('Inverse Specific Capacity Trend', capacityAnalyses.get(String(sensor.uid))?.inverse.trend || 'Not computed')}
            ${wardMetric('Inverse Specific Capacity Outliers', formatNumber(capacityAnalyses.get(String(sensor.uid))?.inverse.outlierCount || 0))}
          </div>
          <div class="analysis-hint">
            <span>Specific capacity up = improving</span>
            <span>Inverse specific capacity up = worsening</span>
            <span>Time trend is fitted from the data, not manually drawn. R2 is used to judge how well a straight trend represents the points; Jacob curves are shown only for discharge diagnostic plots.</span>
          </div>
          <div class="uid-mode-tabs sc-toggle" data-sc-index="${index}">
            <button type="button" class="active" data-sc-mode="specific">Specific Capacity</button>
            <button type="button" data-sc-mode="inverse">Inverse Specific Capacity</button>
            <button type="button" data-sc-mode="discharge">SC vs Discharge</button>
            <button type="button" data-sc-mode="inverse-discharge">Inverse vs Discharge</button>
            <button type="button" data-sc-mode="duration">SC vs Pumping Time</button>
          </div>
          <div class="uid-range-tabs sc-range-tabs" data-sc-index="${index}">
            <button type="button" class="active" data-range="week">Last Week</button>
            <button type="button" data-range="month">Last Month</button>
            <button type="button" data-range="three">3 Months</button>
            <button type="button" data-range="all">All Time</button>
          </div>
          <div class="mini-chart-wrap">
            <button class="mini-chart-expand chart-expand" data-chart-id="uidSpecificCapacityChart${index}" data-chart-title="UID ${sensor.uid} Specific Capacity" type="button">Expand</button>
            <canvas id="uidSpecificCapacityChart${index}"></canvas>
          </div>
        </details>
      `;
      }).join('');
      const keyCapacityMetrics = capacitySensors.length ? `
        ${wardMetric('Specific Capacity UIDs', formatNumber(capacityWard.uidCount || capacitySensors.length))}
        ${wardMetric('Valid Pumping Sessions', formatNumber(capacityWard.validSessions || 0))}
        ${wardMetric('Average Specific Capacity', formatNumber(scaledSpecificCapacity(capacityWard.averageTransmissivityScaled, capacityWard.averageSpecificCapacityM2s), 4))}
        ${wardMetric('Average Inverse Specific Capacity', `${formatNumber(capacityWard.averageInverseSpecificCapacitySPerM2, 0)} s/m2`)}
      ` : '';
      const detailedCapacityMetrics = capacitySensors.length ? `
        ${wardMetric('Specific Capacity UIDs', formatNumber(capacityWard.uidCount || capacitySensors.length))}
        ${wardMetric('Valid Pumping Sessions', formatNumber(capacityWard.validSessions || 0))}
        ${wardMetric('Average Specific Capacity', formatNumber(scaledSpecificCapacity(capacityWard.averageTransmissivityScaled, capacityWard.averageSpecificCapacityM2s), 4))}
        ${wardMetric('Maximum Specific Capacity', formatNumber(scaledSpecificCapacity(capacityWard.maxTransmissivityScaled, capacityWard.maxSpecificCapacityM2s), 4))}
        ${wardMetric('Median Specific Capacity', formatNumber(medianValue(capacitySpecificValues), 4))}
        ${wardMetric('Average Inverse Specific Capacity', `${formatNumber(capacityWard.averageInverseSpecificCapacitySPerM2, 0)} s/m2`)}
        ${wardMetric('Maximum Inverse Specific Capacity', `${formatNumber(capacityWard.maxInverseSpecificCapacitySPerM2, 0)} s/m2`)}
        ${wardMetric('Median Inverse Specific Capacity', `${formatNumber(medianValue(capacityInverseValues), 0)} s/m2`)}
        ${wardMetric('Ward Performance Trend', wardCapacityStatus, wardCapacityStatus === 'Needs attention' ? 'bad' : '')}
        ${wardMetric('Median Specific Capacity Change', medianCapacityChangePercentMonth == null ? '-' : `${formatNumber(medianCapacityChangePercentMonth, 1)}%/month`, Number(medianCapacityChangePercentMonth) < -5 ? 'bad' : '')}
        ${wardMetric('Specific Capacity UID List', uidChipList(capacitySensors, attentionUidSet))}
        ${wardMetric('Low Specific Capacity UIDs', `${formatNumber(lowSpecificCount)} / ${formatNumber(capacitySensors.length)}${uidChipList(lowSpecificSensors, lowSpecificUidSet)}`, lowSpecificCount ? 'bad' : '')}
        ${wardMetric('High Inverse Specific Capacity UIDs', `${formatNumber(highInverseCount)} / ${formatNumber(capacitySensors.length)}${uidChipList(highInverseSensors, highInverseUidSet)}`, highInverseCount ? 'bad' : '')}
        ${wardMetric('Confirmed Worsening UIDs', `${formatNumber(worseningCapacitySensors.length)} / ${formatNumber(capacitySensors.length)}${uidChipList(worseningCapacitySensors, worseningCapacityUidSet)}`, worseningCapacitySensors.length ? 'bad' : '')}
      ` : '';
      const pumpingData = specificCapacityData?.pumping || {};
      const pumpingWard = pumpingData.ward || {};
      const pumpingSensors = pumpingData.sensors || [];
      const groundwaterPlotUidCount = (wardData?.sensors || []).length;
      const pumpingQcStatus = (uid) => qcStatusForSensor({ uid: String(uid) }) || 'NOT_CLASSIFIED';
      const pumpingQcCounts = pumpingSensors.reduce((counts, sensor) => {
        const status = pumpingQcStatus(sensor.uid);
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {});
      const pumpingGoodCount = pumpingQcCounts.GOOD || 0;
      const pumpingCautionCount = pumpingQcCounts.USABLE_WITH_CAUTION || 0;
      const pumpingPoorCount = pumpingQcCounts.POOR || 0;
      const pumpingOtherQcCount = pumpingSensors.length - pumpingGoodCount - pumpingCautionCount - pumpingPoorCount;
      const eligibilityComparisonHtml = `
        <div class="analysis-population-strip">
          <div><strong>${formatNumber(groundwaterPlotUidCount)}</strong><span>QC-GOOD UIDs with trend-ready groundwater levels</span></div>
          <div><strong>${formatNumber(pumpingSensors.length)}</strong><span>UIDs with valid discharge + drawdown pumping sessions</span></div>
        </div>
      `;
      const pumpingStatusClass = ['High pumping stress', 'Low specific-capacity performance'].includes(pumpingWard.classification)
        ? 'bad'
        : pumpingWard.classification === 'Normal pumping performance'
          ? 'good'
          : '';
      const keyPumpingMetrics = pumpingSensors.length ? `
        ${wardMetric('Pumping Performance', htmlEscape(pumpingWard.classification || 'Not classified'), pumpingStatusClass)}
        ${wardMetric('Volume-normalized Drawdown', `${formatNumber(pumpingWard.medianNormalizedDrawdownFtPerM3, 2)} ft/m3`, pumpingStatusClass)}
        ${wardMetric('Estimated Pumped Volume', `${formatNumber(pumpingWard.totalPumpedVolumeM3, 0)} m3`)}
      ` : '';
      const pumpingMissingNote = pumpingData.loadError
        ? `<div class="ward-note">Pumping-volume performance could not be loaded: ${htmlEscape(pumpingData.loadError)}</div>`
        : !pumpingSensors.length
          ? '<div class="ward-note">No valid pumping sessions are available for volume-normalized drawdown in this ward. A valid session needs positive duration, positive drawdown, and discharge.</div>'
          : '';
      const pumpingRows = pumpingSensors.map((sensor) => {
        const pumpingSensorQcStatus = pumpingQcStatus(sensor.uid);
        const alertClass = sensor.interpretation === 'High priority' ? 'critical-row'
          : sensor.interpretation === 'High extraction' ? 'warning-row'
            : sensor.interpretation === 'Good performer' ? 'good-row' : '';
        return `
          <tr class="${alertClass}">
            <td><button type="button" class="table-uid-link" data-pumping-uid="${htmlEscape(sensor.uid)}">${htmlEscape(sensor.uid)}</button></td>
            <td>${formatNumber(sensor.sessions)}</td>
            <td>${formatNumber(sensor.totalPumpedVolumeM3, 0)}</td>
            <td>${formatNumber(sensor.medianNormalizedDrawdownFtPerM3, 2)}</td>
             <td>${formatNumber(sensor.medianSpecificCapacityScaled, 4)}</td>
             <td>${formatMotorHp(sensor.motorHp)}</td>
             <td>${pumpingSensorQcStatus === 'NOT_CLASSIFIED' ? '<span class="qc-badge unknown">Not classified</span>' : qcBadgeHtml(pumpingSensorQcStatus)}</td>
             <td><span class="performance-badge ${alertClass}">${htmlEscape(sensor.interpretation || '-')}</span></td>
          </tr>
        `;
      }).join('');

      return `
        <nav class="ward-tabs" aria-label="Ward detail sections">
          <button type="button" class="active" data-ward-tab="overview">Overview</button>
          <button type="button" data-ward-tab="groundwater">Groundwater Trend</button>
          <button type="button" data-ward-tab="pumping">Pumping Performance</button>
          <button type="button" data-ward-tab="capacity">Specific Capacity</button>
          <button type="button" data-ward-tab="uids">UID Charts</button>
          <button type="button" data-ward-tab="downloads">Downloads</button>
        </nav>
        ${selectedMapLensCategoryCardHtml(wardNumber(props), criticalGw, trendShape)}
        <section class="ward-tab-panel active" data-ward-panel="overview">
          ${wardAnalysisLens === 'groundwater' ? criticalReasonHtml(criticalGw) : ''}
          ${(() => {
            const vd = wardVolumetricDeficit(wardNumber(props));
            return `
              <section class="ward-summary-grid">
                ${wardMetric('Total Sensors', formatNumber(count))}
                ${wardMetric('QC-GOOD for Trend', formatNumber(goodSensors))}
                ${wardMetric('Not QC-GOOD for Trend', formatNumber(notUsable))}
                ${wardMetric('QC-GOOD Trend Coverage', goodPercent)}
                ${wardMetric('Avg Drop/day', formatTrend(avgDrop, 'ft/day', 2), dropClass)}
                ${wardMetric('Max Drop/day', formatTrend(maxDrop, 'ft/day', 2), dropClass)}
                ${vd.deficitMl > 0 ? wardMetric('Groundwater Volumetric Loss', `${formatNumber(vd.deficitMl, 2)} ML (~${formatNumber(vd.deficitTankers, 0)} tankers)`, 'bad') : ''}
                ${vd.category ? wardMetric('Observation Period', htmlEscape(vd.category)) : ''}
                ${keyPumpingMetrics}
                ${rainfallMetrics}
              </section>
            `;
          })()}

          ${dropNote}
          ${omittedNote}
          <section class="ward-explain formula-card">
            <h3>Calculation Notes</h3>
            <p><strong>Groundwater Volumetric Loss</strong> = Ward Area (m2) x Water Level Drop (m) x Specific Yield (S<sub>y</sub> = 0.02). Represents total physical volume of groundwater depleted from subsurface storage.</p>
            <p><strong>Static Rest Water Table</strong> = Measured at the KH pump START row to isolate true water table trends from active pumping drawdown.</p>
            <p><strong>Specific Capacity</strong> = Lowest pump flow during one KH START-to-END pump cycle / Drawdown.</p>
            <p><strong>Inverse Specific Capacity</strong> = Drawdown / Lowest pump flow during one KH START-to-END pump cycle.</p>
            <p><strong>Estimated Pumped Volume</strong> = End cumulative water yield - Start cumulative water yield, when available. Otherwise average session discharge x pumping duration is used.</p>
            <p><strong>Volume-normalized Drawdown</strong> = Drawdown / Estimated pumped volume. Higher values indicate a larger water-level response per cubic metre extracted.</p>
            <p>Groundwater decline uses cleaned weekly water-level readings; positive slope means water level below surface is increasing, which indicates decline.</p>
          </section>

        </section>
        <section class="ward-tab-panel" data-ward-panel="pumping">
          <section class="ward-explain pumping-spotlight">
            <div class="section-head">
              <div>
                <h3>Pumping Performance</h3>
                <p>Combines pumping duration, discharge, and drawdown to compare how strongly each borewell responds per cubic metre extracted.</p>
              </div>
              ${pumpingWard.classification ? `<span class="performance-badge ${pumpingStatusClass}">${htmlEscape(pumpingWard.classification)}</span>` : ''}
            </div>
            ${pumpingSensors.length ? `
              ${eligibilityComparisonHtml}
              <div class="ward-note population-note">
                Pumping performance uses session-level validity, not the overall sensor QC label. Of these ${formatNumber(pumpingSensors.length)} UIDs: ${formatNumber(pumpingGoodCount)} are QC-GOOD, ${formatNumber(pumpingCautionCount)} are usable with caution, ${formatNumber(pumpingPoorCount)} are poor${pumpingOtherQcCount ? `, and ${formatNumber(pumpingOtherQcCount)} have another or unavailable QC status` : ''}.
              </div>
              <div class="ward-summary-grid compact pumping-summary-grid">
                ${wardMetric('UIDs with Valid Pumping Sessions', formatNumber(pumpingWard.borewells))}
                ${wardMetric('QC-GOOD among these UIDs', `${formatNumber(pumpingGoodCount)} of ${formatNumber(pumpingSensors.length)}`)}
                ${wardMetric('Valid Pumping Sessions', formatNumber(pumpingWard.totalSessions))}
                ${wardMetric('HP Coverage', `${formatNumber(pumpingWard.borewellsWithHp)} of ${formatNumber(pumpingWard.borewells)}`)}
                ${wardMetric('Estimated Pumped Volume', `${formatNumber(pumpingWard.totalPumpedVolumeM3, 0)} m3`)}
                ${wardMetric('Median UID Volume', `${formatNumber(pumpingWard.medianUidPumpedVolumeM3, 0)} m3`)}
                ${wardMetric('Median Drawdown per m3', `${formatNumber(pumpingWard.medianNormalizedDrawdownFtPerM3, 2)} ft/m3`, pumpingStatusClass)}
                ${wardMetric('Median Specific Capacity (x10^-6 m2/s)', formatNumber(pumpingWard.medianSpecificCapacityScaled, 4))}
                ${wardMetric('High-priority UIDs', formatNumber(pumpingWard.highPriorityUids), Number(pumpingWard.highPriorityUids) > 0 ? 'bad' : '')}
                ${wardMetric('High-extraction UIDs', formatNumber(pumpingWard.highExtractionUids))}
              </div>
              <div class="mini-chart-wrap pumping-chart-wrap">
                <button class="mini-chart-expand chart-expand" data-chart-id="wardPumpingChart" data-chart-title="Ward Pumping Performance" type="button">Expand</button>
                <canvas id="wardPumpingChart"></canvas>
              </div>
              <div class="performance-table-wrap">
                <table class="performance-table">
                  <thead><tr><th>UID</th><th>Sessions</th><th>Volume (m3)</th><th>Drawdown / m3</th><th>Specific Capacity (x10^-6 m2/s)</th><th>Motor</th><th>Overall QC</th><th>Screening Result</th></tr></thead>
                  <tbody>${pumpingRows}</tbody>
                </table>
              </div>
              <div class="methodology-strip">
                <p><strong>Volume:</strong> ${htmlEscape(pumpingData.method?.volume || '')}</p>
                <p><strong>Normalized drawdown:</strong> ${htmlEscape(pumpingData.method?.normalizedDrawdown || '')}</p>
                <p><strong>Screening:</strong> ${htmlEscape(pumpingData.method?.classification || '')}</p>
              </div>
            ` : ''}
            ${pumpingMissingNote}
          </section>
        </section>
        <section class="ward-tab-panel" data-ward-panel="capacity">
          <section class="ward-explain capacity-spotlight">
            <div class="section-head">
              <div>
                <h3>Specific Capacity</h3>
                <p>Session-level pump performance using discharge divided by drawdown. Lower specific capacity or higher inverse specific capacity needs closer review.</p>
                <p class="ward-table-note">Specific Capacity values in this panel are scaled for readability: shown value = actual m2/s value x 1,000,000.</p>
              </div>
              <button class="primary ward-specific-capacity-download" type="button" data-ward-no="${wardNumber(props)}">Download Ward Excel</button>
            </div>
            ${capacitySensors.length ? `<div class="ward-summary-grid compact">${detailedCapacityMetrics}</div>` : ''}
            ${capacityMissingNote}
            ${capacityPanels ? `<div class="uid-chart-list">${capacityPanels}</div>` : ''}
          </section>
        </section>
        <section class="ward-tab-panel" data-ward-panel="groundwater">
                  <section class="ward-explain">
                    <div class="section-head compact-head">
                      <div>
                        <h3>${wardLevelConfig.title}</h3>
                        <p class="ward-table-note">Switch between average and median weekly ward levels for this graph and its trend statistics. Map colours use the selected official groundwater method.</p>
                      </div>
                    </div>
                    <div class="uid-mode-tabs ward-level-toggle" data-ward-level-toggle>
                      <button type="button" class="${wardLevelConfig.key === 'average' ? 'active' : ''}" data-ward-level-stat="average">Average</button>
                      <button type="button" class="${wardLevelConfig.key === 'median' ? 'active' : ''}" data-ward-level-stat="median">Median</button>
                    </div>

                    ${hasWardWeeklyData
                      ? `
                        <section class="ward-summary-grid compact slope-strip">
                          ${wardMetric(
                            `${wardLevelConfig.metricPrefix} Theil-Sen rate`,
                            formatTrend(
                              slopeFit.senSlopeFtPerWeek,
                              'ft/week',
                              2
                            ),
                            slopeClass(slopeFit.senSlopeFtPerWeek)
                          )}

                          ${wardMetric(
                            `${wardLevelConfig.metricPrefix} linear slope`,
                            formatTrend(
                              slopeFit.slopeFtPerWeek,
                              'ft/week',
                              2
                            ),
                            slopeClass(slopeFit.slopeFtPerWeek)
                          )}

                          ${wardMetric(
                            'Linear R²',
                            slopeFit.r2 == null
                              ? '-'
                              : formatNumber(slopeFit.r2, 3)
                          )}

                          ${wardMetric(
                            'Mann-Kendall',
                            slopeFit.mannKendallTrend || 'Not computed',
                            slopeClass(slopeFit.mannKendallS)
                          )}

                          ${wardMetric(
                            'MK p-value',
                            slopeFit.mannKendallPValue == null
                              ? '-'
                              : formatNumber(
                                  slopeFit.mannKendallPValue,
                                  3
                                )
                          )}

                          ${wardMetric(
                            'Recent 8-week Theil-Sen',
                            formatTrend(
                              recentFit.senSlopeFtPerWeek,
                              'ft/week',
                              2
                            ),
                            slopeClass(recentFit.senSlopeFtPerWeek)
                          )}

                          ${wardMetric(
                            'Trend shape',
                            trendShape.label,
                            trendShape.recent === 'decline'
                              ? 'bad'
                              : trendShape.recent === 'rise'
                              ? 'good'
                              : ''
                          )}

                          ${wardMetric(
                            `${wardLevelConfig.metricPrefix} interpretation`,
                            plottedTrend.label,
                            plottedTrend.className
                          )}

                          ${wardMetric(
                            'Weekly points used',
                            formatNumber(slopeFit.pointCount || 0)
                          )}
                        </section>

                        <div class="ward-note">
                          These statistics are calculated from the exact cleaned weekly
                          ${wardLevelConfig.noteLabel} values shown in the graph. Positive depth slope means
                          groundwater is becoming deeper and indicates decline. Negative depth
                          slope means groundwater is becoming shallower and indicates a rise.
                        </div>
                        <div class="ward-note">${htmlEscape(trendShape.note)}</div>

                        <div class="mini-chart-wrap large">
                          <button
                            class="mini-chart-expand chart-expand"
                            data-chart-id="wardWeeklyChart"
                            data-chart-title="${wardLevelConfig.title}"
                            type="button"
                          >
                            Expand
                          </button>
                          <canvas id="wardWeeklyChart"></canvas>
                        </div>

                        ${weeklyOutlierNote}
                      `
                      : `
                        <div class="ward-note">
                          Not enough valid weekly groundwater levels to calculate the
                          ${wardLevelConfig.emptyLabel} trend. Zero readings and isolated spikes are removed
                          before analysis.
                        </div>
                      `
                    }
                  </section>

                  <section class="ward-explain">
                    <h3>Individual Borewell Evidence</h3>

                    <p>
                      Individual borewell trends are calculated separately as supporting
                      evidence. They help identify localized decline or improvement, but
                      they do not determine or override the final ward classification.
                    </p>

                    <section class="ward-summary-grid compact">
                      ${wardMetric(
                        'Classifiable borewells',
                        formatNumber(borewellSummary.classifiedCount)
                      )}

                      ${wardMetric(
                        'Confirmed declining borewells',
                        `${formatNumber(
                          borewellSummary.confirmedDecliningCount
                        )} of ${formatNumber(
                          borewellSummary.classifiedCount
                        )}`,
                        borewellSummary.confirmedDecliningCount > 0
                          ? 'bad'
                          : ''
                      )}

                      ${wardMetric(
                        'Confirmed declining percentage',
                        borewellSummary.decliningPercent == null
                          ? '-'
                          : `${formatNumber(
                              borewellSummary.decliningPercent,
                              1
                            )}%`,
                        borewellSummary.decliningPercent >= 50
                          ? 'bad'
                          : ''
                      )}

                      ${wardMetric(
                        'Median individual-borewell Theil-Sen',
                        borewellSummary.medianSensorSlope == null
                          ? '-'
                          : formatTrend(
                              borewellSummary.medianSensorSlope,
                              'ft/week',
                              2
                            ),
                        slopeClass(
                          borewellSummary.medianSensorSlope
                        )
                      )}

                      ${wardMetric(
                        'Supporting borewell interpretation',
                        borewellSummary.label,
                        borewellSummary.className
                      )}

                      ${wardMetric(
                        'Final ward groundwater category',
                        criticalGw
                          ? wardMapCategory(criticalGw)
                          : 'Not available',
                        criticalGw &&
                        wardStatusKey(criticalGw)
                          ? 'bad'
                          : ''
                      )}
                    </section>

                   <div class="ward-note">
                    The final map status is calculated from the cleaned ${wardLevelConfig.noteLabel}
                    weekly groundwater trend shown above. Individual borewell trends are
                    retained as supporting evidence for identifying localized decline or
                    improvement, but they do not override the ward-level classification.
                  </div>
                  </section>
                </section>
        <section class="ward-tab-panel" data-ward-panel="uids">
          <section class="ward-explain">
            <h3>QC-GOOD Groundwater Trend UIDs (${formatNumber(groundwaterPlotUidCount)})</h3>
            ${eligibilityComparisonHtml}
            <p class="ward-table-note">This list is intentionally stricter than Pumping Performance. It includes only sensors whose overall QC status is GOOD and whose cleaned groundwater series is ready to plot. Pumping Performance may include additional UIDs when their individual pumping sessions contain valid duration, positive drawdown, and discharge; their overall QC status is shown in that tab.</p>
            <div class="uid-chart-list">${sensorPanels || '<div class="empty-chart">No GOOD UID weekly plot data for this ward.</div>'}</div>
          </section>
        </section>
        <section class="ward-tab-panel" data-ward-panel="downloads">
          <section class="ward-explain">
            <h3>Downloads</h3>
            <div class="export-actions ward-download-actions">
              <button class="primary ward-specific-capacity-download" type="button" data-ward-no="${wardNumber(props)}">Specific Capacity Excel for this ward</button>
              <button type="button" id="wardDownloadWeeklyLevels">Weekly Levels Excel</button>
              <button type="button" id="wardDownloadNotUsable">Not Usable Sensors Excel</button>
            </div>
            <p class="ward-table-note">Use ward-specific specific capacity Excel for faster download. The full city-wide file can be heavy.</p>
          </section>
        </section>
      `;
    };

    const renderSpecificCapacityCharts = (specificCapacityData) => {
      const sensorsWithCapacity = specificCapacityData?.sensors || [];
      const sessionDischargeLpm = (session) => {
        const m3s = Number(session.lowestDischargeM3s);
        return Number.isFinite(m3s) ? m3s * 60000 : null;
      };
      const sessionDurationMin = (session) => {
        const seconds = Number(session.durationSeconds);
        if (Number.isFinite(seconds)) return seconds / 60;
        const minutes = Number(session.durationMin);
        return Number.isFinite(minutes) ? minutes : null;
      };
      const drawSpecificCapacityChart = (sensor, index, mode = 'specific', range = 'all') => {
        const canvas = document.getElementById(`uidSpecificCapacityChart${index}`);
        if (!canvas) return;
        if (canvas._chart) {
          canvas._chart.destroy();
          wardInlineCharts = wardInlineCharts.filter((chart) => chart !== canvas._chart);
          canvas._chart = null;
        }
        const inverseMode = mode === 'inverse';
        const sessions = pointsForRange(sensor.sessions || [], range);
        if (mode === 'discharge' || mode === 'inverse-discharge' || mode === 'duration') {
          const inverseDischargeMode = mode === 'inverse-discharge';
          const rows = cleanedCapacitySeries(sessions, inverseDischargeMode).filter((row) => !row.isOutlier && Number.isFinite(row.value));
          const points = rows.map((row) => ({
            x: mode === 'duration' ? sessionDurationMin(row.session) : sessionDischargeLpm(row.session),
            y: row.value,
            label: shortDateTimeLabel(row.session.time || row.session.label)
          })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
          const jacob = mode === 'duration' ? null : jacobDischargeFit(rows.map((row) => row.session));
          const modelPoints = jacob ? jacob.points.map((point) => ({
            x: point.x,
            y: inverseDischargeMode
              ? jacob.b + (jacob.c * point.x)
              : 1000000 / (jacob.b + (jacob.c * point.x))
          })).filter((point) => Number.isFinite(point.y) && point.y > 0) : [];
          canvas._chart = renderWardLineChart(canvas, [], [
            {
              label: inverseDischargeMode ? 'Inverse specific capacity vs discharge' : mode === 'discharge' ? 'Specific capacity vs discharge' : 'Specific capacity vs pumping time',
              data: points,
              borderColor: 'rgb(0, 255, 0)',
              pointBackgroundColor: '#f8fafc',
              pointBorderColor: 'rgb(0, 255, 0)',
              pointRadius: 4,
              pointHoverRadius: 7,
              showLine: false,
              unit: inverseDischargeMode ? 's/m2' : 'x10^-6 m2/s'
            },
            ...(modelPoints.length ? [{
              label: `${inverseDischargeMode ? 'Jacob linear model' : 'Jacob reciprocal curve'} (R2 ${formatNumber(jacob.r2, 3)})`,
              data: modelPoints,
              borderColor: 'rgb(255, 0, 0)',
              borderWidth: 3,
              pointRadius: 0,
              showLine: true,
              unit: inverseDischargeMode ? 's/m2' : 'x10^-6 m2/s'
            }] : [])
          ], {
            chartType: 'scatter',
            showLine: false,
            reverseY: false,
            xType: 'linear',
            xTitle: mode === 'duration' ? 'Pumping Time (min)' : 'Lowest Discharge (L/min)',
            xDecimals: mode === 'duration' ? 0 : 1,
            yTitle: inverseDischargeMode ? 'Inverse Specific Capacity (s/m2)' : 'Specific Capacity (x10^-6 m2/s)',
            unit: inverseDischargeMode ? 's/m2' : 'x10^-6 m2/s',
            bottomPadding: 18
          });
          return;
        }
        const labels = sessions.map((session) => shortDateTimeLabel(session.time || session.label));
        const rows = cleanedCapacitySeries(sessions, inverseMode);
        const values = rows.map((row) => row.isOutlier ? null : row.value);
        const outlierValues = rows.map((row) => row.isOutlier ? row.value : null);
        const times = sessions.map((session) => session.time || session.date || session.label);
        const fit = indexedTrendFit(values, times);
        const seriesMedian = medianValue(values.filter(Number.isFinite));
        const trendLabel = performanceTrendLabel(fit, seriesMedian, inverseMode);
        const trendColor = trendLabel.includes('worsening') ? 'rgb(255, 0, 0)'
          : trendLabel.includes('improving') ? 'rgb(0, 255, 0)'
            : '#66727f';
        const trendDataset = trendLabel === 'Insufficient temporal data'
          ? []
          : [{
            label: `Straight Theil-Sen time trend (${trendLabel})`,
            data: fit.trendData,
            borderColor: trendColor,
            borderDash: [7, 5],
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 0,
            showLine: true,
            unit: inverseMode ? 's/m2' : 'x10^-6 m2/s'
          }];
        canvas._chart = renderWardLineChart(canvas, labels, [
          {
            label: inverseMode ? 'Inverse specific capacity' : 'Specific capacity',
            data: values,
            borderColor: 'rgb(0, 255, 0)',
            showLine: false,
            unit: inverseMode ? 's/m2' : 'x10^-6 m2/s'
          },
          {
            label: 'Flagged outliers',
            data: outlierValues,
            borderColor: '#f59e0b',
            pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#92400e',
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false,
            unit: inverseMode ? 's/m2' : 'x10^-6 m2/s'
          },
          ...trendDataset
        ], {
          showLine: false,
          reverseY: false,
          yTitle: inverseMode ? 'Inverse Specific Capacity (s/m2)' : 'Specific Capacity (x10^-6 m2/s)',
          unit: inverseMode ? 's/m2' : 'x10^-6 m2/s',
          rotateXLabels: true,
          autoSkipXLabels: false,
          maxTicksLimit: labels.length || 1
        });
      };

      sensorsWithCapacity.forEach((sensor, index) => {
        drawSpecificCapacityChart(sensor, index, 'specific', 'week');
      });

      const redrawSpecificCapacityChart = (index) => {
        const sensor = sensorsWithCapacity[index];
        if (!sensor) return;
        const modeTabs = document.querySelector(`.sc-toggle[data-sc-index="${index}"]`);
        const rangeTabs = document.querySelector(`.sc-range-tabs[data-sc-index="${index}"]`);
        const mode = modeTabs?.querySelector('button.active')?.dataset.scMode || 'specific';
        const range = rangeTabs?.querySelector('button.active')?.dataset.range || 'all';
        drawSpecificCapacityChart(sensor, index, mode, range);
      };

      document.querySelectorAll('.sc-toggle').forEach((tabs) => {
        const index = Number(tabs.dataset.scIndex);
        tabs.querySelectorAll('button[data-sc-mode]').forEach((button) => {
          button.addEventListener('click', () => {
            tabs.querySelectorAll('button[data-sc-mode]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            redrawSpecificCapacityChart(index);
            refreshFullscreenChart();
          });
        });
      });

      document.querySelectorAll('.sc-range-tabs').forEach((tabs) => {
        const index = Number(tabs.dataset.scIndex);
        tabs.querySelectorAll('button[data-range]').forEach((button) => {
          button.addEventListener('click', () => {
            tabs.querySelectorAll('button[data-range]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            redrawSpecificCapacityChart(index);
            refreshFullscreenChart();
          });
        });
      });
    };

    const renderWardPumpingChart = (pumpingData) => {
      const canvas = document.getElementById('wardPumpingChart');
      const sensorsWithMetrics = (pumpingData?.sensors || []).filter((sensor) => (
        Number.isFinite(Number(sensor.totalPumpedVolumeM3))
        && Number(sensor.totalPumpedVolumeM3) > 0
        && Number.isFinite(Number(sensor.medianNormalizedDrawdownFtPerM3))
      ));
      if (!canvas || !sensorsWithMetrics.length) return;
      const groups = [
        { label: 'High priority', color: '#b91c1c' },
        { label: 'High extraction', color: '#c2410c' },
        { label: 'Good performer', color: 'rgb(0, 255, 0)' },
        { label: 'Moderate / normal', color: '#2563eb' }
      ];
      canvas._chart = renderWardLineChart(canvas, [], groups.map((group) => ({
        label: group.label,
        data: sensorsWithMetrics
          .filter((sensor) => sensor.interpretation === group.label)
          .map((sensor) => ({
            x: Number(sensor.totalPumpedVolumeM3),
            y: Number(sensor.medianNormalizedDrawdownFtPerM3),
            label: `UID ${sensor.uid}`
          })),
        borderColor: group.color,
        pointBackgroundColor: group.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 9,
        showLine: false,
        unit: 'ft/m3'
      })), {
        chartType: 'scatter',
        showLine: false,
        reverseY: false,
        xType: 'logarithmic',
        xTitle: 'Estimated Pumped Volume (m3, log scale)',
        yTitle: 'Median Volume-normalized Drawdown (ft/m3)',
        unit: 'ft/m3',
        autoSkipXLabels: true,
        maxTicksLimit: 10,
        bottomPadding: 20
      });
    };

    const loadActiveWardSpecificCapacity = async () => {
      if (!activeWardProps || activeSpecificCapacityData?.deferred !== true) return;
      const wardNo = normalizeWardNo(wardNumber(activeWardProps));
      const pumping = activeSpecificCapacityData.pumping;
      activeSpecificCapacityData = { ...activeSpecificCapacityData, deferred: 'loading' };
      const activePanel = document.querySelector('[data-ward-panel="capacity"]');
      if (activePanel) activePanel.innerHTML = '<div class="empty-chart analysis-loading">Loading specific-capacity sessions and trend diagnostics...</div>';
      const capacity = await loadWardSpecificCapacity(wardNo);
      if (!activeWardProps || normalizeWardNo(wardNumber(activeWardProps)) !== wardNo) return;
      activeSpecificCapacityData = { ...capacity, pumping };
      if (hasValidSpecificCapacity(capacity.ward)) {
        specificCapacityByWardNo.set(wardNo, capacity.ward);
        activeWardProps._specificCapacity = capacity.ward;
      }
      els.wardDetailPanel.innerHTML = buildWardDetailHtml(
        activeWardProps,
        activeWardData,
        activeWardSensors,
        activeSpecificCapacityData
      );
      renderWardDetailCharts(activeWardData, activeSpecificCapacityData);
      refreshWardPopups();
      document.querySelector('[data-ward-tab="capacity"]')?.click();
    };

    const renderWardDetailCharts = (wardData, specificCapacityData = null) => {
      clearWardInlineCharts();
      renderSpecificCapacityCharts(specificCapacityData);
      renderWardPumpingChart(specificCapacityData?.pumping);
      if (!wardData) return;
      const wardCanvas = document.getElementById('wardWeeklyChart');
      if (wardCanvas) {
        const wardLevelConfig = wardLevelStatisticConfig();
        const weeklyGroups = cleanWeeklyGroundwater(prepareWardWeeklyForStatistic(wardData.weekly || [], wardLevelConfig.key));
        const chartWeekly = weeklyGroups.cleaned.filter(hasUsableWeeklyLevel);
        const labels = chartWeekly.map((point) => point.label);
        const slopeFit = weeklySlopeFit(chartWeekly);
        const recentFit = recentWeeklyFit(chartWeekly, 8);
        const recentTrendStart = Math.max(0, chartWeekly.length - 8);
        const recentTrendData = labels.map((_, index) => (
          index >= recentTrendStart
            ? recentFit.senTrendData?.[index - recentTrendStart] ?? null
            : null
        ));
        const slopeColor = Number(slopeFit.senSlopeFtPerWeek) > 0 ? 'rgb(255, 0, 0)' : Number(slopeFit.senSlopeFtPerWeek) < 0 ? 'rgb(0, 255, 0)' : 'rgb(255, 255, 0)';
        const recentSlopeColor = Number(recentFit.senSlopeFtPerWeek) > 0 ? 'rgb(255, 0, 0)' : Number(recentFit.senSlopeFtPerWeek) < 0 ? 'rgb(0, 255, 0)' : 'rgb(255, 255, 0)';
        renderWardLineChart(wardCanvas, labels, [
          {
            label: wardLevelConfig.levelLabel,
            data: chartWeekly.map((point) => point.averageLevel),
            borderColor: '#244e9a',
            showLine: false
          },
          {
            label: `Theil-Sen trend (${formatTrend(slopeFit.senSlopeFtPerWeek, 'ft/week', 2)})`,
            data: slopeFit.senTrendData,
            borderColor: slopeColor,
            borderDash: [7, 5],
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 0,
            showLine: true
          },
          {
            label: `Linear trend (${formatTrend(slopeFit.slopeFtPerWeek, 'ft/week', 2)}, R2 ${formatNumber(slopeFit.r2, 2)})`,
            data: slopeFit.trendData,
            borderColor: '#f97316',
            borderDash: [3, 4],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            showLine: true
          },
          {
            label: `Recent 8-week trend (${formatTrend(recentFit.senSlopeFtPerWeek, 'ft/week', 2)})`,
            data: recentTrendData,
            borderColor: recentSlopeColor,
            borderDash: [10, 3],
            borderWidth: 4,
            pointRadius: 0,
            pointHoverRadius: 0,
            showLine: true
          }
        ], { showLine: false, autoRotateXLabels: true, bottomPadding: 34, maxTicksLimit: 18 });
      }

      const renderUidModeChart = (sensor, index, mode = 'daily-level', range = 'all') => {
        const canvas = document.getElementById(`uidModeChart${index}`);
        const empty = document.getElementById(`uidModeEmpty${index}`);
        if (!canvas) return;
        if (canvas._chart) {
          canvas._chart.destroy();
          wardInlineCharts = wardInlineCharts.filter((chart) => chart !== canvas._chart);
          canvas._chart = null;
        }

        if (mode === 'daily-level') {
          const rawDaily = pointsForRange(sensor.dailyLevels || [], range);
          const dailyGroups = cleanChartPointGroups(rawDaily.map((point) => ({
            ...point,
            time: point.time || point.date || point.label,
            waterLevel: point.primaryLevel,
            offLevel: point.offLevel,
            onLevel: point.onLevel
          })));
          const compressedCleaned = compressRepeatedLevelPoints(dailyGroups.cleaned);
          const compressedOutliers = compressRepeatedLevelPoints(dailyGroups.outliers);
          const compressedAll = compressRepeatedLevelPoints(dailyGroups.all);
          const daily = showGroundwaterOutliers ? compressedAll : compressedCleaned;
          const cleanedDailySet = new Set(compressedCleaned);
          const outlierDailySet = new Set(compressedOutliers);
          if (daily.length < 3) {
            canvas.style.display = 'none';
            if (empty) {
              empty.style.display = 'grid';
              empty.textContent = 'Not plotted because fewer than 3 changed readings remain after removing repeated stale values.';
            }
            return;
          }
          canvas.style.display = 'block';
          if (empty) empty.style.display = 'none';
          const hasOnOffDaily = daily.some((point) => cleanedDailySet.has(point) && (Number.isFinite(point.offLevel) || Number.isFinite(point.onLevel)));
          const dailyDatasets = [
            ...(hasOnOffDaily ? [{
              label: 'Water level path',
              data: cycleConnectorData(daily, cleanedDailySet),
              borderColor: '#475569',
              borderDash: [6, 5],
              borderWidth: 2,
              pointStyle: 'line',
              pointRadius: 0,
              pointHoverRadius: 0,
              showLine: true,
              spanGaps: true,
              unit: 'ft'
            }] : []),
            ...(!hasOnOffDaily ? [{
              label: 'Water level',
              data: daily.map((point) => cleanedDailySet.has(point) ? point.primary : null),
              borderColor: 'rgba(0,0,0,0)',
              pointBorderColor: '#111827',
              pointBackgroundColor: '#111827',
              pointStyle: 'circle',
              borderWidth: 0,
              pointRadius: 3,
              pointHoverRadius: 5,
              showLine: false,
              unit: 'ft'
            }] : []),
            {
              label: 'Pump START level',
              data: sessionLevelPointData(daily, cleanedDailySet, 'on'),
              borderColor: 'rgba(0,0,0,0)',
              pointBorderColor: '#15803d',
              pointBackgroundColor: '#dcfce7',
              pointStyle: 'triangle',
              pointBorderWidth: 2,
              borderWidth: 0,
              pointRadius: 5,
              pointHoverRadius: 8,
              showLine: false,
              unit: 'ft'
            },
            {
              label: 'Pump END level',
              data: sessionLevelPointData(daily, cleanedDailySet, 'off'),
              borderColor: 'rgba(0,0,0,0)',
              pointBorderColor: '#1d4ed8',
              pointBackgroundColor: '#dbeafe',
              pointStyle: 'rectRot',
              pointBorderWidth: 2,
              borderWidth: 0,
              pointRadius: 4,
              pointHoverRadius: 7,
              showLine: false,
              unit: 'ft'
            },
            {
              label: 'Flagged outliers',
              data: levelPointData(daily, outlierDailySet, 'primary'),
              borderColor: '#f59e0b',
              pointBorderColor: '#92400e',
              pointBackgroundColor: '#f59e0b',
              borderWidth: 0,
              pointRadius: 4,
              pointHoverRadius: 6,
              showLine: false,
              unit: 'ft'
            }
          ];
          canvas._chart = renderWardLineChart(canvas, hasOnOffDaily ? [] : daily.map((point) => point.label), dailyDatasets, {
            yTitle: 'Feet below surface',
            unit: 'ft',
            rotateXLabels: daily.length > 8,
            autoSkipXLabels: daily.length > 18,
            maxTicksLimit: daily.length > 28 ? 14 : 18,
            xType: hasOnOffDaily ? 'linear-time' : undefined
          });
          return;
        }

        if (mode === 'weekly-level') {
          const weekly = sensor.points || [];
          if (weekly.length < 3) {
            canvas.style.display = 'none';
            if (empty) {
              empty.style.display = 'grid';
              empty.textContent = 'Not plotted because fewer than 3 weekly values are available.';
            }
            return;
          }
          canvas.style.display = 'block';
          if (empty) empty.style.display = 'none';
          canvas._chart = renderWardLineChart(canvas, weekly.map((point) => point.label), [
            {
              label: sensor.uid,
              data: weekly.map((point) => point.level),
              borderColor: '#d97706',
              showLine: false,
              unit: 'ft'
            }
          ], { showLine: false, yTitle: 'Feet below surface', unit: 'ft' });
          return;
        }

        if (mode === 'daily-drop') {
          const sessionDrops = sensor.sessionDrawdowns || [];
          const fallbackDrops = sensor.dailyDrops || [];
          const useSession = sessionDrops.length > 0;
          const drops = pointsForRange(useSession ? sessionDrops : fallbackDrops, range);
          if (drops.length < 2) {
            canvas.style.display = 'none';
            if (empty) {
              empty.style.display = 'grid';
              empty.textContent = 'Not plotted because fewer than 2 valid drop intervals remain for this range.';
            }
            return;
          }
          canvas.style.display = 'block';
          if (empty) empty.style.display = 'none';
          canvas._chart = renderWardLineChart(canvas, drops.map((point) => point.label), [
            {
              label: useSession ? 'Pump-cycle drawdown' : 'Level change',
              data: drops.map((point) => useSession ? point.dropFtPerHour : point.dropFtPerHour),
              borderColor: '#b91c1c',
              showLine: false,
              unit: 'ft/hr'
            }
          ], { showLine: false, reverseY: false, yTitle: 'Drop rate (ft/hr)', unit: 'ft/hr', rotateXLabels: true });
          return;
        }

        if (mode === 'weekly-drop') {
          const weeklyDrops = sensor.weeklyDrops || [];
          if (weeklyDrops.length < 1) {
            canvas.style.display = 'none';
            if (empty) {
              empty.style.display = 'grid';
              empty.textContent = 'Not plotted because fewer than 1 weekly drop interval is available.';
            }
            return;
          }
          canvas.style.display = 'block';
          if (empty) empty.style.display = 'none';
          canvas._chart = renderWardLineChart(canvas, weeklyDrops.map((point) => point.label), [
            {
              label: 'Weekly drop/day',
              data: weeklyDrops.map((point) => point.dropFtPerDay),
              borderColor: '#7f0000',
              showLine: false,
              unit: 'ft/day'
            },
            {
              label: 'Weekly drop/hour',
              data: weeklyDrops.map((point) => point.dropFtPerHour),
              borderColor: '#c77700',
              showLine: false,
              unit: 'ft/hr',
              yAxisID: 'y1'
            }
          ], { showLine: false, reverseY: false, yTitle: 'Drop/day (ft/day)', secondAxis: 'Drop/hour (ft/hr)' });
        }
      };

      (wardData.sensors || []).forEach((sensor, index) => {
        renderUidModeChart(sensor, index, 'daily-level', 'week');
      });

      const redrawUidChart = (index) => {
        const sensor = (wardData.sensors || [])[index];
        if (!sensor) return;
        const modeTabs = document.querySelector(`.uid-mode-tabs[data-uid-index="${index}"]`);
        const rangeTabs = document.querySelector(`.uid-range-tabs[data-uid-index="${index}"]`);
        const mode = modeTabs?.querySelector('button.active')?.dataset.mode || 'daily-level';
        const range = rangeTabs?.querySelector('button.active')?.dataset.range || 'all';
        renderUidModeChart(sensor, index, mode, range);
      };

      document.querySelectorAll('.uid-mode-tabs').forEach((tabs) => {
        const index = Number(tabs.dataset.uidIndex);
        tabs.querySelectorAll('button[data-mode]').forEach((button) => {
          button.addEventListener('click', () => {
            tabs.querySelectorAll('button[data-mode]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            const rangeTabs = document.querySelector(`.uid-range-tabs[data-uid-index="${index}"]`);
            if (rangeTabs) {
              rangeTabs.style.display = ['daily-level', 'daily-drop'].includes(button.dataset.mode) ? 'grid' : 'none';
            }
            redrawUidChart(index);
            refreshFullscreenChart();
          });
        });
      });

      document.querySelectorAll('.uid-range-tabs').forEach((tabs) => {
        const index = Number(tabs.dataset.uidIndex);
        const modeTabs = document.querySelector(`.uid-mode-tabs[data-uid-index="${index}"]`);
        const mode = modeTabs?.querySelector('button.active')?.dataset.mode || 'daily-level';
        tabs.style.display = ['daily-level', 'daily-drop'].includes(mode) ? 'grid' : 'none';
        tabs.querySelectorAll('button[data-range]').forEach((button) => {
          button.addEventListener('click', () => {
            tabs.querySelectorAll('button[data-range]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            redrawUidChart(index);
            refreshFullscreenChart();
          });
        });
      });

      document.querySelectorAll('.uid-chart-card').forEach((details) => {
        details.addEventListener('toggle', () => {
          if (details.open) {
            window.setTimeout(() => wardInlineCharts.forEach((chart) => chart.resize()), 80);
          }
        });
      });
      document.querySelectorAll('.ward-tabs button[data-ward-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.dataset.wardTab;
          document.querySelectorAll('.ward-tabs button[data-ward-tab]').forEach((item) => {
            item.classList.toggle('active', item === button);
          });
          document.querySelectorAll('.ward-tab-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.wardPanel === target);
          });
          if (target === 'capacity' && activeSpecificCapacityData?.deferred === true) {
            loadActiveWardSpecificCapacity();
          }
          window.setTimeout(() => wardInlineCharts.forEach((chart) => chart.resize()), 80);
          refreshFullscreenChart();
        });
      });
      document.querySelectorAll('[data-ward-level-stat]').forEach((button) => {
        button.addEventListener('click', () => {
          setWardLevelStatistic(button.dataset.wardLevelStat);
        });
      });
      refreshGroundwaterOutlierButtons();
      refreshCycleConnectorButtons();
    };
