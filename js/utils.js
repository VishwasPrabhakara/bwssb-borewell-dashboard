/* ==========================================================================
   BBMP Borewell Dashboard - Utilities, Normalizers & Toast Notifications
   ========================================================================== */

    const sourceQuery = () => `source=${encodeURIComponent(currentDataSource)}`;
    const sourceDisplayName = () => currentDataSource === 'vendor' ? 'Nimblevision' : 'KrishiHrudaya';
    const LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK = 0.1;
    const TREND_SIGNIFICANCE_ALPHA = 0.05;
    const GROUNDWATER_MIN_SLOPE_WEEKS = 4;
    const GROUNDWATER_MIN_MK_WEEKS = 8;

    const dataCategoryLabels = {
      both: 'Water  Level + Discharge',
      water: 'Water Level only',
      none: 'No data'
    };

    const dataCategoryColors = {
      both: '#003b8f',
      water: '#1d4ed8',
      discharge: '#d12f2f',
      none: '#020617'
    };

    const qcStatusLabels = {
      GOOD: 'Good',
      USABLE_WITH_CAUTION: 'Usable with caution',
      POOR: 'Poor',
      INSUFFICIENT_DATA: 'Insufficient data',
      NO_DATA: 'No data'
    };

    const qcStatusClass = {
      GOOD: 'good',
      USABLE_WITH_CAUTION: 'caution',
      POOR: 'poor',
      INSUFFICIENT_DATA: 'low-data',
      NO_DATA: 'no-data'
    };

    const wardConfidenceColors = {
      High: 'rgb(0, 255, 0)',
      Medium: '#f2a900',
      Low: '#d64545'
    };

    const colorForSensor = (sensor) => dataCategoryColors[sensor.dataCategory || 'none'];
    const qcForSensor = (sensor) => sensor.qc || sensorQcByUid.get(String(sensor.uid));
    const qcStatusForSensor = (sensor) => qcForSensor(sensor)?.qcStatus || '';
    const hasMajorQcPlotFlags = (qc) => {
      const flags = qc?.flags || [];
      return flags.includes('FLATLINES') || flags.includes('SPIKES') || flags.includes('LONG_GAPS');
    };
    const displayQcStatusForSensor = (sensor) => {
      const qc = qcForSensor(sensor);
      if (!qc?.qcStatus) return '';
      return qc.qcStatus === 'GOOD' && hasMajorQcPlotFlags(qc) ? 'USABLE_WITH_CAUTION' : qc.qcStatus;
    };
    const qcBadgeHtml = (status) => {
      if (!status) return '-';
      const label = qcStatusLabels[status] || status;
      const className = qcStatusClass[status] || 'unknown';
      return `<span class="qc-badge ${className}">${label}</span>`;
    };
    const reviewQcReasonDefinitions = [
      {
        key: 'low_coverage',
        label: 'Low coverage',
        help: 'Coverage score below 80',
        matches: (sensor) => Number(qcForSensor(sensor)?.coverageScore) < 80
      },
      {
        key: 'stale',
        label: 'Stale data',
        help: 'Last data is older than 14 days',
        matches: (sensor) => Number(qcForSensor(sensor)?.staleDataDays) > 14
      },
      {
        key: 'long_gaps',
        label: 'Long gaps',
        help: 'Large missing periods in the series',
        matches: (sensor) => (qcForSensor(sensor)?.flags || []).includes('LONG_GAPS')
      },
      {
        key: 'spikes',
        label: 'Jumps/spikes',
        help: 'Sudden jumps or drops flagged',
        matches: (sensor) => (qcForSensor(sensor)?.flags || []).includes('SPIKES')
      },
      {
        key: 'flatlines',
        label: 'Flat/stuck values',
        help: 'Repeated values suggest stuck sensor',
        matches: (sensor) => (qcForSensor(sensor)?.flags || []).includes('FLATLINES')
      },
      {
        key: 'too_few',
        label: 'Too few readings',
        help: 'Not enough usable readings',
        matches: (sensor) => (qcForSensor(sensor)?.flags || []).includes('TOO_FEW_READINGS') || Number(qcForSensor(sensor)?.validReadings) < 4
      },
      {
        key: 'outside_bbmp',
        label: 'Outside BBMP',
        help: 'Sensor point is outside ward boundary',
        matches: (sensor) => (qcForSensor(sensor)?.flags || []).includes('OUTSIDE_BBMP_BOUNDARY')
      }
    ];
    const isReviewQcSensor = (sensor) => ['USABLE_WITH_CAUTION', 'POOR', 'INSUFFICIENT_DATA'].includes(displayQcStatusForSensor(sensor));
    const reviewReasonMatches = (sensor, key) => {
      if (!key) return true;
      return reviewQcReasonDefinitions.find((item) => item.key === key)?.matches(sensor) || false;
    };
    const formatNumber = (value, decimals = 0) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return value || '-';
      return number.toLocaleString('en-IN', { maximumFractionDigits: decimals });
    };
    const formatMotorHp = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return '-';
      return `${formatNumber(number, number % 1 ? 1 : 0)} HP`;
    };
    const formatDepth = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return '-';
      return `${formatNumber(number, number % 1 ? 1 : 0)} ft`;
    };
    const htmlEscape = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const showToast = (message) => {
      els.toast.textContent = message;
      els.toast.classList.add('show');
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 5200);
    };

    const updateClearSelectionButton = () => {
      if (!els.clearSelection) return;

      const hasSelection = Boolean(
        selectedSensor ||
        focusedWardNo ||
        activeWardData
      );

      els.clearSelection.disabled = !hasSelection;
    };

    const showSensorLoading = (message = 'Loading sensors...') => {
      selectionSequence += 1;

      sensorLayer.clearLayers();
      sensors = [];

      selectedSensor = null;
      focusedWardNo = '';
      activeWardData = null;
      activeSpecificCapacityData = null;
      activeWardProps = null;
      activeWardSensors = [];
      waterPoints = [];

      updateClearSelectionButton();
      els.totalCount.textContent = '0';
      els.withDataCount.textContent = '0';
      els.withoutDataCount.textContent = '0';
      els.goodQcCount.textContent = '0';
      els.reviewQcCount.textContent = '0';
      els.filteredCount.textContent = '0';
      els.sensorList.innerHTML = `<div class="sensor-meta" style="padding:14px 10px">${message}</div>`;
    };

    const pointInRing = (point, ring) => {
      const [x, y] = point;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersects) inside = !inside;
      }
      return inside;
    };

    const pointInPolygon = (point, polygon) => {
      if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
      return !polygon.slice(1).some((hole) => pointInRing(point, hole));
    };

    const pointInFeature = (sensor, feature) => {
      if (!hasValidLocation(sensor)) return false;
      const point = [Number(sensor.lng), Number(sensor.lat)];
      const geometry = feature.geometry;
      if (!geometry) return false;
      if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
      if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
      return false;
    };

    const flattenGeoJsonFeatures = (geojson) => {
      if (!geojson) return [];
      if (geojson.type === 'FeatureCollection') return geojson.features || [];
      if (geojson.type === 'Feature') return [geojson];
      if (Array.isArray(geojson)) return geojson.flatMap(flattenGeoJsonFeatures);
      return [];
    };

    const wardPopupHtml = (feature) => {
        const props = feature.properties || {};
        const selectedWardNo = wardNumber(props);
        const selectedWardName = wardName(props);

        const sensorCount = Number(props._sensorCount || 0);
        const withDataCount = Number(props._sensorWithDataCount || 0);

        const weekly = wardWeeklyForProps(props);
        const criticalGw = criticalForWardNo(selectedWardNo);
        const pumping = pumpingWardSummaryForNo(selectedWardNo);
        const vd = wardVolumetricDeficit(selectedWardNo);

        const selectedMapCategory = mapWardCategoryForNo(selectedWardNo);
        const selectedMapCritical =
          mapWardStatusKey(selectedWardNo) === 'critical';

        const capacity =
          specificCapacityByWardNo.get(
            normalizeWardNo(selectedWardNo)
          );

        const showCapacity = hasValidSpecificCapacity(capacity);

        const flags =
          wardAnalysisLens === 'overall'
            ? overallCriticalLensFlags(selectedWardNo)
            : null;

        const activeLensCount = flags
          ? Object.values(flags).filter(Boolean).length
          : 0;

        const lensRows = flags
          ? `
            <div class="popup-section">
              <div class="popup-section-title">
                Active analytical lenses (${activeLensCount}/5)
              </div>

              <div class="popup-lens-row ${flags.groundwater ? 'active' : 'inactive'}">
                <span>${flags.groundwater ? '✓' : '✕'}</span>
                <span>Groundwater decline</span>
              </div>

              <div class="popup-lens-row ${flags.volumetric_deficit ? 'active' : 'inactive'}">
                <span>${flags.volumetric_deficit ? '✓' : '✕'}</span>
                <span>Volumetric deficit</span>
              </div>

              <div class="popup-lens-row ${flags.extraction ? 'active' : 'inactive'}">
                <span>${flags.extraction ? '✓' : '✕'}</span>
                <span>High extraction</span>
              </div>

              <div class="popup-lens-row ${flags.pumping_stress ? 'active' : 'inactive'}">
                <span>${flags.pumping_stress ? '✓' : '✕'}</span>
                <span>High pumping stress</span>
              </div>

              <div class="popup-lens-row ${flags.specific_capacity ? 'active' : 'inactive'}">
                <span>${flags.specific_capacity ? '✓' : '✕'}</span>
                <span>Low specific capacity</span>
              </div>
            </div>
          `
          : '';

        return `
          <div class="ward-popup">
            <div class="ward-popup-title">
              Ward ${htmlEscape(selectedWardNo)}:
              ${htmlEscape(selectedWardName)}
            </div>

            <div class="popup-section">
              <div class="popup-row">
                <span>Map lens</span>
                <strong>${htmlEscape(wardAnalysisLensLabel())}</strong>
              </div>

              <div class="popup-row">
                <span>Lens category</span>
                <strong>${htmlEscape(selectedMapCategory)}</strong>
              </div>

              ${
                selectedMapCritical
                  ? `
                    <div class="popup-reason">
                      <strong>Why marked</strong>
                      <div>
                        ${htmlEscape(
                          mapWardReasonForNo(selectedWardNo)
                        )}
                      </div>
                    </div>
                  `
                  : ''
              }
            </div>

            ${lensRows}

            <div class="popup-section">
              <div class="popup-section-title">
                Groundwater
              </div>

              <div class="popup-row">
                <span>Status</span>
                <strong>
                  ${
                    criticalGw
                      ? htmlEscape(
                          criticalGw.groundwaterStatus || '-'
                        )
                      : '-'
                  }
                </strong>
              </div>

              <div class="popup-row">
                <span>Direction</span>
                <strong>
                  ${
                    criticalGw
                      ? htmlEscape(
                          criticalGw.groundwaterDirection || '-'
                        )
                      : '-'
                  }
                </strong>
              </div>

              <div class="popup-row">
                <span>Linear slope</span>
                <strong>
                  ${formatTrend(
                    criticalGw?.linearSlopeFtPerWeek,
                    'ft/week',
                    2
                  )}
                </strong>
              </div>

              <div class="popup-row">
                <span>Theil-Sen slope</span>
                <strong>
                  ${formatTrend(
                    criticalGw?.senSlopeFtPerWeek,
                    'ft/week',
                    2
                  )}
                </strong>
              </div>

              <div class="popup-row">
                <span>Mann-Kendall p-value</span>
                <strong>
                  ${
                    criticalGw?.mannKendallPValue == null
                      ? '-'
                      : formatNumber(
                          criticalGw.mannKendallPValue,
                          4
                        )
                  }
                </strong>
              </div>

              <div class="popup-row">
                <span>Weekly points used</span>
                <strong>
                  ${formatNumber(
                    criticalGw?.pointCount
                    ?? criticalGw?.usableWeeklyValues
                    ?? 0
                  )}
                </strong>
              </div>
            </div>

            <div class="popup-section">
              <div class="popup-section-title">
                Ward sensors
              </div>

              <div class="popup-row">
                <span>Total sensors</span>
                <strong>${formatNumber(sensorCount)}</strong>
              </div>

              <div class="popup-row">
                <span>With data</span>
                <strong>${formatNumber(withDataCount)}</strong>
              </div>

              <div class="popup-row">
                <span>GOOD sensors</span>
                <strong>
                  ${formatNumber(weekly?.goodSensors || 0)}
                </strong>
              </div>

              <div class="popup-row">
                <span>Average drop/day</span>
                <strong>
                  ${formatTrend(
                    weekly?.avgDropPerDay,
                    'ft/day',
                    2
                  )}
                </strong>
              </div>
            </div>

            ${
              vd.deficitMl > 0
                ? `
                  <div class="popup-section">
                    <div class="popup-section-title">
                      Volumetric deficit
                    </div>

                    <div class="popup-row">
                      <span>Estimated loss</span>
                      <strong>
                        ${formatNumber(vd.deficitMl, 2)} ML
                      </strong>
                    </div>

                    <div class="popup-row">
                      <span>Equivalent tankers</span>
                      <strong>
                        ${formatNumber(
                          vd.deficitTankers,
                          0
                        )}
                      </strong>
                    </div>

                    <div class="popup-row">
                      <span>Observation period</span>
                      <strong>
                        ${htmlEscape(vd.category || '-')}
                      </strong>
                    </div>
                  </div>
                `
                : ''
            }

            ${
              pumping
                ? `
                  <div class="popup-section">
                    <div class="popup-section-title">
                      Pumping performance
                    </div>

                    <div class="popup-row">
                      <span>Estimated extraction</span>
                      <strong>
                        ${formatNumber(
                          pumping.totalPumpedVolumeM3,
                          0
                        )} m³
                      </strong>
                    </div>

                    <div class="popup-row">
                      <span>Median pumping stress</span>
                      <strong>
                        ${formatNumber(
                          pumping.medianNormalizedDrawdownFtPerM3,
                          2
                        )} ft/m³
                      </strong>
                    </div>

                    <div class="popup-row">
                      <span>Median specific capacity</span>
                      <strong>
                        ${formatNumber(
                          pumping.medianSpecificCapacityScaled,
                          4
                        )} ×10⁻⁶ m²/s
                      </strong>
                    </div>
                  </div>
                `
                : ''
            }

            ${
              showCapacity
                ? `
                  <div class="popup-section">
                    <div class="popup-section-title">
                      Specific capacity summary
                    </div>

                    <div class="popup-row">
                      <span>Average</span>
                      <strong>
                        ${formatNumber(
                          scaledSpecificCapacity(
                            capacity.averageTransmissivityScaled,
                            capacity.averageSpecificCapacityM2s
                          ),
                          4
                        )}
                      </strong>
                    </div>

                    <div class="popup-row">
                      <span>Maximum</span>
                      <strong>
                        ${formatNumber(
                          scaledSpecificCapacity(
                            capacity.maxTransmissivityScaled,
                            capacity.maxSpecificCapacityM2s
                          ),
                          4
                        )}
                      </strong>
                    </div>
                  </div>
                `
                : ''
            }

            <div class="popup-hint">
              Click the ward for complete details.
            </div>
          </div>
        `;
      };

    const renderMethodSummary = (payload) => {
      const sourceWards = Array.isArray(payload?.wards) ? payload.wards : [];
      const wardNos = new Set(sourceWards.map((ward) => normalizeWardNo(ward.wardNo)).filter(Boolean));
      initializeHighestCountGroundwaterMethod();
      const wards = Array.from(wardNos)
        .map((wardNo) => criticalForWardNo(wardNo))
        .filter(Boolean);
      if (!els.methodSummary || currentDataSource !== 'kh' || (!wards.length && !pumpingPerformanceWardSummaryByNo.size)) {
        if (els.methodSummary) els.methodSummary.style.display = 'none';
        return;
      }
      const allWardNumbers = Array.from(new Set([
        ...wardFeatures.map((f) => normalizeWardNo(wardNumber(f.properties || {}))),
        ...Array.from(criticalGroundwaterByNo.keys()),
        ...Array.from(wardIndicatorsByNo.keys())
      ])).filter(Boolean);

      const overallWards = Array.from(allWardNumbers).filter((wardNo) => overallLensCritical(wardNo));
      const counts = wardAnalysisLens === 'groundwater'
        ? {
            critical: wards.filter((ward) => wardStatusKey(ward) === 'critical').length,
            rise: wards.filter((ward) => wardStatusKey(ward) === 'rise').length,
            stable: wards.filter((ward) => wardStatusKey(ward) === 'stable').length
          }
        : wardAnalysisLens === 'overall'
          ? {
              critical: overallWards.length,
              rise: 0,
              stable: 0
            }
        : wardAnalysisLens === 'volumetric_deficit'
          ? {
              critical: allWardNumbers.filter((no) => mapWardStatusKey(no) === 'critical').length,
              rise: 0,
              stable: allWardNumbers.filter((no) => mapWardStatusKey(no) === 'stable').length
            }
          : {
              critical: wardAnalysisLens === 'consumption'
                ? Array.from(criticalGroundwaterByNo.values()).filter((ward) => isYes(ward.previousCriticalWard) || isYes(ward.oldConsumptionNoGroundwaterData)).length
                : Array.from(pumpingPerformanceWardSummaryByNo.values()).filter((ward) => (
                    wardAnalysisLens === 'extraction'
                      ? ward.criticalByExtraction
                      : wardAnalysisLens === 'pumping_stress'
                        ? ward.highNormalizedDrawdown
                        : ward.criticalBySpecificCapacity
                  )).length,
              rise: 0,
              stable: wardAnalysisLens === 'consumption'
                ? 0
                : Array.from(pumpingPerformanceWardSummaryByNo.values()).filter((ward) => !(
                    wardAnalysisLens === 'extraction'
                      ? ward.criticalByExtraction
                      : wardAnalysisLens === 'pumping_stress'
                        ? ward.highNormalizedDrawdown
                        : ward.criticalBySpecificCapacity
                  )).length
            };
      const selectedMethodLabel = groundwaterMethodLabel();
      latestWardStatusCounts = counts;
      const availableStatusKeys = wardAnalysisLens === 'groundwater'
        ? ['critical', 'rise', 'stable']
        : wardAnalysisLens === 'overall'
          ? ['critical']
        : wardAnalysisLens === 'consumption'
          ? ['critical']
          : ['critical', 'stable'];
      if (wardStatusFilter && !availableStatusKeys.includes(wardStatusFilter)) {
        wardStatusFilter = '';
        refreshWardPopups();
        renderSensors();
      }
      const lensNote = wardAnalysisLens === 'groundwater'
        ? `${selectedMethodLabel} using cleaned weekly ${wardLevelStatistic} levels.`
        : wardAnalysisLens === 'overall'
          ? `Highlights wards active in at least ${commonLensCount} of the 5 analytical lenses.`
        : wardAnalysisLens === 'volumetric_deficit'
          ? 'High volumetric deficit highlights wards losing >= 10 Million Liters (ML) of groundwater storage based on Specific Yield (Sy=0.02).'
        : wardAnalysisLens === 'consumption'
          ? 'Reproduces the original 60 wards identified by the previous consumption-based assessment.'
          : wardAnalysisLens === 'extraction'
            ? `High extraction uses the citywide ward 75th percentile: ${formatNumber(pumpingPerformanceWardThresholds.extractionP75M3, 0)} m3.`
            : wardAnalysisLens === 'pumping_stress'
              ? `High pumping stress uses the citywide ward 75th percentile: ${formatNumber(pumpingPerformanceWardThresholds.normalizedDrawdownP75FtPerM3, 2)} ft/m3.`
            : `Low specific capacity uses the citywide ward 25th percentile: ${formatNumber(pumpingPerformanceWardThresholds.specificCapacityP25Scaled, 4)} x10^-6 m2/s.`;

      els.methodSummary.style.display = '';
      els.methodSummary.innerHTML = `
        <div class="map-control-heading">
          <div><span>Ward analysis</span><strong>${htmlEscape(wardAnalysisLensLabel())}</strong></div>
          <div class="map-status-counts" aria-label="Ward status counts">
            <button type="button" data-method-status-filter="critical" title="Filter critical wards"><i style="background:${mapLensCriticalColor()}"></i>${formatNumber(counts.critical)}</button>
            ${wardAnalysisLens === 'groundwater' ? `
              <button type="button" data-method-status-filter="rise" title="Filter groundwater rise wards"><i style="background:rgb(0, 255, 0)"></i>${formatNumber(counts.rise)}</button>
              <button type="button" data-method-status-filter="stable" title="Filter analysed wards that are not critical or rising"><i style="background:rgb(255, 255, 0)"></i>${formatNumber(counts.stable)}</button>
            ` : ''}
            ${wardAnalysisLens !== 'groundwater' && wardAnalysisLens !== 'consumption' ? `
              <button type="button" data-method-status-filter="stable" title="Filter wards below this lens threshold"><i style="background:rgb(255, 255, 0)"></i>${formatNumber(counts.stable)}</button>
            ` : ''}
          </div>
        </div>
        <div class="method-control-grid">
          <label class="method-field method-field-primary">
            <span>Analysis lens</span>
            <select data-analysis-lens-select>
              ${wardAnalysisLensOptions.map((item) => `
                <option value="${item.value}" ${item.value === wardAnalysisLens ? 'selected' : ''}>${item.label}</option>
              `).join('')}
            </select>
          </label>
          ${wardAnalysisLens === 'overall' ? `
            <label class="method-field">
              <span>Common threshold</span>

              <select data-common-lens-count-select>
                ${[1, 2, 3, 4, 5].map((count) => `
                  <option
                    value="${count}"
                    ${count === commonLensCount ? 'selected' : ''}
                  >
                    ${count} / 5
                  </option>
                `).join('')}
              </select>
            </label>
          ` : ''}
          ${wardAnalysisLens === 'groundwater' ? `
            <label class="method-field method-field-wide">
              <span>Groundwater method</span>
              <select data-groundwater-method-select>
                ${groundwaterMethodOptions.map((item) => `
                  <option value="${item.value}" ${item.value === groundwaterMethodMode ? 'selected' : ''}>${item.label}</option>
                `).join('')}
              </select>
            </label>
          ` : ''}
        </div>
        <div class="method-note">${htmlEscape(lensNote)} Select the count to filter the map.</div>
      `;
      els.methodSummary.querySelector('[data-analysis-lens-select]')?.addEventListener('change', (event) => {
          wardAnalysisLens = event.target.value || 'groundwater';
          wardStatusFilter = '';
          refreshGroundwaterClassificationViews();
        });
        els.methodSummary
    .querySelector('[data-common-lens-count-select]')
    ?.addEventListener('change', (event) => {
      const nextCount = Number(event.target.value);

      commonLensCount = Number.isFinite(nextCount)
        ? Math.min(5, Math.max(1, nextCount))
        : 2;

      wardStatusFilter = '';

      refreshGroundwaterClassificationViews();
    });
      els.methodSummary.querySelector('[data-groundwater-method-select]')?.addEventListener('change', (event) => {
          groundwaterMethodMode = event.target.value || 'dashboard';
          refreshGroundwaterClassificationViews();
      });
      els.methodSummary.querySelectorAll('[data-global-ward-level-stat]').forEach((button) => {
        button.addEventListener('click', () => setWardLevelStatistic(button.dataset.globalWardLevelStat));
      });
      els.methodSummary.querySelectorAll('[data-method-status-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.methodStatusFilter === wardStatusFilter);
        button.addEventListener('click', () => {
          wardStatusFilter = wardStatusFilter === button.dataset.methodStatusFilter ? '' : button.dataset.methodStatusFilter;
          updateLegendFilterUi();
          renderMethodSummary({ wards: Array.from(criticalGroundwaterByNo.values()) });
          refreshWardPopups();
          renderSensors();
        });
      });
    };

    const refreshWardLevelToggleButtons = () => {
      document.querySelectorAll('[data-global-ward-level-stat], [data-ward-level-stat]').forEach((button) => {
        const value = button.dataset.globalWardLevelStat || button.dataset.wardLevelStat;
        button.classList.toggle('active', value === wardLevelStatistic);
      });
    };

    const refreshGroundwaterClassificationViews = () => {
      refreshWardLevelToggleButtons();
      renderMethodSummary({ wards: Array.from(criticalGroundwaterByNo.values()) });
      updateLegendFilterUi();
      refreshWardPopups();
      renderSensors();
      if (activeWardProps) {
        const selectedCritical = criticalForWardNo(wardNumber(activeWardProps));
        els.app.classList.remove('critical-ward-selected', 'screening-ward-selected', 'unverified-ward-selected');
        els.app.classList.toggle('critical-ward-selected', currentDataSource === 'kh' && mapWardStatusKey(wardNumber(activeWardProps)) === 'critical');
        els.app.classList.toggle('screening-ward-selected', currentDataSource === 'kh' && wardAnalysisLens === 'groundwater' && isLinearMannKendallScreeningWard(selectedCritical));
        els.detailSubhead.textContent = wardDetailSubheadText(
          selectedCritical,
          activeWardData
        );
        els.wardDetailPanel.innerHTML = buildWardDetailHtml(
          activeWardProps,
          activeWardData,
          activeWardSensors,
          activeSpecificCapacityData
        );
        renderWardDetailCharts(activeWardData, activeSpecificCapacityData);
      }
      refreshFullscreenChart();
    };

    const setWardLevelStatistic = (nextStatistic) => {
      const next = nextStatistic === 'median' ? 'median' : 'average';
      if (wardLevelStatistic === next) {
        refreshWardLevelToggleButtons();
        return;
      }
      wardLevelStatistic = next;
      refreshGroundwaterClassificationViews();
    };

    const refreshWardPopups = () => {
      for (const layer of wardLayers) {
        if (layer.feature) {
          layer.setStyle(wardStyle(layer.feature));
          const layerWardNo = normalizeWardNo(wardNumber(layer.feature.properties || {}));
          const isFocusedLayer = Boolean(focusedWardNo && layerWardNo === focusedWardNo);
          layer._path?.classList.toggle('ward-focused-shape', isFocusedLayer);
          layer.bindPopup(wardPopupHtml(layer.feature));
        }
      }
    };

    const assignSensorsToWards = () => {
      for (const feature of wardFeatures) {
        feature.properties = feature.properties || {};
        feature.properties._sensorCount = 0;
        feature.properties._sensorWithDataCount = 0;
        feature.properties._sensorWithoutDataCount = 0;
        const weekly = wardWeeklyForProps(feature.properties);
        feature.properties._avgDropPerDay = weekly?.avgDropPerDay ?? null;
        feature.properties._medianDropPerDay = weekly?.medianDropPerDay ?? null;
        feature.properties._maxDropPerDay = weekly?.maxDropPerDay ?? null;
        feature.properties._dropAllPositive = Boolean(weekly?.dropAllPositive);
        feature.properties._goodSensorCount = weekly?.goodSensors ?? 0;
      }
      for (const sensor of sensors) {
        if (!hasValidLocation(sensor)) {
          sensor.wardNo = '';
          sensor.wardName = '';
          continue;
        }
        const feature = wardFeatures.find((item) => pointInFeature(sensor, item));
        const props = feature?.properties || {};
        sensor.wardNo = feature ? wardNumber(props) : '';
        sensor.wardName = feature ? wardName(props) : '';
        if (feature) {
          props._sensorCount = (props._sensorCount || 0) + 1;
          if (sensor.hasData) {
            props._sensorWithDataCount = (props._sensorWithDataCount || 0) + 1;
          } else {
            props._sensorWithoutDataCount = (props._sensorWithoutDataCount || 0) + 1;
          }
        }
      }
      const wardsWithSensors = wardFeatures.filter((feature) => (feature.properties?._sensorCount || 0) > 0).length;
      if (els.wardSensorCount) els.wardSensorCount.textContent = formatNumber(wardsWithSensors);
      refreshWardPopups();
      renderSensors();
    };

    const sensorIcon = (sensor) => {
      const dimmed = focusedWardNo && normalizeWardNo(sensor.wardNo) !== focusedWardNo;
      return L.divIcon({
        className: '',
        html: `<div class="marker-pin ${dimmed ? 'dimmed' : ''}" style="background:${colorForSensor(sensor)}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10]
      });
    };

    const popupHtml = (sensor) => `
      <strong>${sensor.uid}</strong>
      <div><strong>UID:</strong> ${sensor.uid}</div>
      <div><strong>Ward No:</strong> ${sensor.wardNo || 'Not matched'}</div>
      <div><strong>Ward Name:</strong> ${sensor.wardName || 'Not matched'}</div>
      <div><strong>Motor HP:</strong> ${formatMotorHp(sensor.motorHp)}</div>
      <div><strong>Borewell Depth:</strong> ${formatDepth(sensor.borewellDepth)}</div>
      <div><strong>Lat/Lon:</strong> ${Number(sensor.lat).toFixed(6)}, ${Number(sensor.lng).toFixed(6)}</div>
      <div><strong>Data:</strong> ${dataCategoryLabels[sensor.dataCategory || 'none'] || dataCategoryLabels.none}</div>
      <div><strong>QC:</strong> ${qcStatusLabels[displayQcStatusForSensor(sensor)] || 'Not scored'}</div>
      <div><strong>First Data:</strong> ${formatDateTime(sensor.firstDataAt)}</div>
      <div><strong>Last Data:</strong> ${formatDateTime(sensor.lastDataAt)}</div>
      <div><strong>Readings:</strong> ${formatNumber(sensor.totalReadings || 0)}</div>
    `;

    const filteredSensors = () => {
      const query = els.search.value.trim().toLowerCase();
      const normalizedQuery = normalizeWardName(query);
      const wardNumberQuery = wardNumberFromSearch(query);
      return sensors.filter((sensor) => {
        const uid = String(sensor.uid || '').toLowerCase();
        const wardNumberMatch = wardNumberQuery && sensor.wardNo && normalizeWardNo(sensor.wardNo) === wardNumberQuery;
        const wardNameMatch = normalizedQuery && normalizeWardName(sensor.wardName).includes(normalizedQuery);
        const uidMatch = query && (uid === query || (query.length >= 5 && uid.includes(query)));
        const directMatch = !query || wardNumberMatch || wardNameMatch || uidMatch;
        const dataMatch = !legendFilter || sensor.dataCategory === legendFilter;
        const wardStatusMatch = !wardStatusFilter || mapWardStatusKey(sensor.wardNo) === wardStatusFilter;
        const qcMatch = !qcFilter || displayQcStatusForSensor(sensor) === qcFilter;
        const reviewReasonMatch = !reviewReasonFilter || (isReviewQcSensor(sensor) && reviewReasonMatches(sensor, reviewReasonFilter));
        return dataMatch && wardStatusMatch && qcMatch && reviewReasonMatch && directMatch;
      });
    };

    const renderReviewQcBreakdown = () => {
      if (!els.reviewQcBreakdown) return;
      const reviewSensors = sensors.filter(isReviewQcSensor);
      if (!reviewSensors.length) {
        els.reviewQcBreakdown.innerHTML = '';
        return;
      }
      const statusCounts = {
        caution: reviewSensors.filter((sensor) => displayQcStatusForSensor(sensor) === 'USABLE_WITH_CAUTION').length,
        insufficient: reviewSensors.filter((sensor) => displayQcStatusForSensor(sensor) === 'INSUFFICIENT_DATA').length,
        poor: reviewSensors.filter((sensor) => displayQcStatusForSensor(sensor) === 'POOR').length
      };
      const reasonButtons = reviewQcReasonDefinitions
        .map((reason) => ({ ...reason, count: reviewSensors.filter(reason.matches).length }))
        .filter((reason) => reason.count > 0)
        .map((reason) => `
          <button type="button" data-review-reason-filter="${reason.key}" class="${reviewReasonFilter === reason.key ? 'active' : ''}" title="${htmlEscape(reason.help)}">
            <strong>${formatNumber(reason.count)}</strong>
            <span>${htmlEscape(reason.label)}</span>
          </button>
        `).join('');
      els.reviewQcBreakdown.innerHTML = `
        <div class="review-qc-heading">
          <strong>Review QC breakdown</strong>
          <span>${formatNumber(statusCounts.caution)} caution + ${formatNumber(statusCounts.insufficient)} low data + ${formatNumber(statusCounts.poor)} poor</span>
        </div>
        <div class="review-qc-reasons">
          ${reasonButtons}
          ${reviewReasonFilter ? '<button type="button" data-review-reason-filter="">Clear reason filter</button>' : ''}
        </div>
      `;
      els.reviewQcBreakdown.querySelectorAll('[data-review-reason-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          reviewReasonFilter = button.dataset.reviewReasonFilter || '';
          renderSensors();
          fitSensors();
        });
      });
    };

    const renderSensors = () => {
      sensorLayer.clearLayers();
      const visible = filteredSensors();
      els.totalCount.textContent = String(sensors.length);
      els.withDataCount.textContent = String(sensors.filter((sensor) => sensor.hasData).length);
      els.withoutDataCount.textContent = String(sensors.filter((sensor) => !sensor.hasData).length);
      els.goodQcCount.textContent = String(sensors.filter((sensor) => displayQcStatusForSensor(sensor) === 'GOOD').length);
      els.reviewQcCount.textContent = String(sensors.filter(isReviewQcSensor).length);
      renderReviewQcBreakdown();
      if (els.specificCapacityCount) {
        els.specificCapacityCount.textContent = String(sensors.filter((sensor) => sensor.dataCategory === 'both').length);
      }
      els.filteredCount.textContent = String(visible.length);
      els.exportFiltered.disabled = !visible.length;

      for (const sensor of visible.filter(hasValidLocation)) {
        const marker = L.marker([Number(sensor.lat), Number(sensor.lng)], { icon: sensorIcon(sensor) })
          .bindPopup(popupHtml(sensor))
          .on('click', () => selectSensor(sensor, true));
        sensor.marker = marker;
        sensorLayer.addLayer(marker);
      }
      renderList(visible);
    };

    const bringSensorsToFront = () => {
      sensorLayer.eachLayer((layer) => {
        if (typeof layer.bringToFront === 'function') layer.bringToFront();
      });
    };

    const renderList = (visible) => {
      els.sensorList.innerHTML = '';
      if (!els.search.value.trim() && !legendFilter && !qcFilter && !reviewReasonFilter) {
        const empty = document.createElement('div');
        empty.className = 'sensor-meta';
        empty.style.padding = '14px 10px';
        empty.textContent = 'Use search, click a legend category, or click a map marker to inspect borewells.';
        els.sensorList.append(empty);
        return;
      }
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'sensor-meta';
        empty.style.padding = '14px 10px';
        empty.textContent = sensors.length ? 'No borewells match the current filter.' : 'Loading borewells...';
        els.sensorList.append(empty);
        return;
      }
      for (const sensor of visible) {
        const status = qcStatusForSensor(sensor);
        const item = document.createElement('button');
        item.className = `sensor-item${selectedSensor?.uid === sensor.uid ? ' active' : ''}`;
        item.innerHTML = `
          <span class="dot" style="background:${colorForSensor(sensor)}"></span>
          <span>
            <span class="sensor-row-head"><span class="sensor-name">${sensor.uid}</span>${qcBadgeHtml(status)}</span>
            <span class="sensor-meta">Ward ${sensor.wardNo || '-'}${sensor.wardName ? ' / ' + sensor.wardName : ''} / ${dataCategoryLabels[sensor.dataCategory || 'none']}</span>
          </span>
        `;
        item.addEventListener('click', () => selectSensor(sensor, true));
        els.sensorList.append(item);
      }
    };

    const fitSensors = () => {
      const visible = filteredSensors().filter(hasValidLocation);
      if (!visible.length) {
        showToast('No visible borewells to fit.');
        return;
      }
      const bounds = L.latLngBounds(visible.map((sensor) => [Number(sensor.lat), Number(sensor.lng)]));
      map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
    };

    const clearCurrentSelection = () => {
      // Invalidate any pending ward or sensor API request.
        selectionSequence += 1;

        selectedSensor = null;
        focusedWardNo = '';
        activeWardData = null;
        activeSpecificCapacityData = null;
        activeWardProps = null;
        activeWardSensors = [];
        waterPoints = [];

        selectedRange = 'week';
        showGroundwaterOutliers = false;
        showCycleConnector = true;

        map.closePopup();

        waterChart?.destroy();
        dischargeChart?.destroy();

        waterChart = null;
        dischargeChart = null;

        clearWardInlineCharts();
        closeChartFullscreen();

        els.app.classList.remove(
          'critical-ward-selected',
          'screening-ward-selected',
          'unverified-ward-selected',
          'chart-wide'
        );

        els.detailTitle.textContent = 'Select a borewell';
        els.detailSubhead.textContent =
          'Click a marker or ward to view groundwater details and time-series charts.';

        els.detailUid.textContent = '-';
        els.detailWardNo.textContent = '-';
        els.detailWardName.textContent = '-';
        els.detailMotorHp.textContent = '-';
        els.detailBorewellDepth.textContent = '-';
        els.detailLatLon.textContent = '-';
        els.detailFirstData.textContent = '-';
        els.detailLastData.textContent = '-';
        els.detailReadings.textContent = '-';
        els.detailDataType.textContent = '-';
        els.detailQcStatus.textContent = '-';
        els.detailQcScore.textContent = '-';
        els.detailQcFlags.textContent = '-';

        if (els.wardDetailPanel) {
          els.wardDetailPanel.innerHTML = '';
          els.wardDetailPanel.style.display = 'none';
        }

        if (els.sensorDetailGrid) {
          els.sensorDetailGrid.style.display = '';
        }

        if (els.sensorExportControls) {
          els.sensorExportControls.style.display = 'none';
        }

        if (els.timeRangeSection) {
          els.timeRangeSection.style.display = 'none';
        }

        if (els.waterChartBox) {
          els.waterChartBox.style.display = 'none';
        }

        if (els.dischargeChartBox) {
          els.dischargeChartBox.style.display = 'none';
        }

        document.querySelectorAll('.range-tabs button').forEach((button) => {
          button.classList.toggle(
            'active',
            button.dataset.range === 'week'
          );
        });

        wardLayers.forEach((layer) => {
          layer._path?.classList.remove('ward-focused-shape');
        });

        els.app.classList.add('right-collapsed');

        els.toggleRight.textContent = '‹';
        els.toggleRight.title = 'Expand details panel';
        els.toggleRight.setAttribute(
          'aria-label',
          els.toggleRight.title
        );

        refreshWardPopups();
        renderSensors();
        updateClearSelectionButton();

        window.setTimeout(() => {
          map.invalidateSize();

          const bounds = shapeLayer?.getBounds?.();

          if (bounds?.isValid?.()) {
            map.fitBounds(bounds.pad(0.08));
          } else {
            fitSensors();
          }
        }, 220);

        showToast('Selection cleared.');
      };

    const csvEscape = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const exportFilteredSensors = () => {
      const visible = filteredSensors();
      if (!visible.length) {
        showToast('No filtered borewells to export.');
        return;
      }
      const headers = [
        'ward_name',
        'ward_number',
        'uid',
        'data_category',
        'first_data_at',
        'last_data_at',
        'water_readings',
        'discharge_readings',
        'total_readings',
        'latitude',
        'longitude'
      ];
      const rows = visible.map((sensor) => [
        sensor.wardName || '',
        sensor.wardNo || '',
        sensor.uid,
        dataCategoryLabels[sensor.dataCategory || 'none'],
        sensor.firstDataAt || '',
        sensor.lastDataAt || '',
        sensor.waterReadings || 0,
        sensor.dischargeReadings || 0,
        sensor.totalReadings || 0,
        sensor.lat,
        sensor.lng
      ]);
      const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      const query = els.search.value.trim() ? 'search' : '';
      const label = [legendFilter || 'all', query].filter(Boolean).join('_');
      link.href = URL.createObjectURL(blob);
      link.download = `bbmp_borewells_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
      showToast(`Exported ${visible.length} borewells.`);
    };

    const exportSelectedSensor = () => {
      if (!selectedSensor) {
        showToast('Select a borewell before exporting.');
        return;
      }

      const headers = [
        'uid',
        'ward_name',
        'ward_number',
        'data_category',
        'latitude',
        'longitude',
        'time',
        'water_level_ft',
        'off_level_ft',
        'on_level_ft',
        'discharge_l_min'
      ];

      const rows = waterPoints.length
        ? waterPoints.map((point) => [
            selectedSensor.uid,
            selectedSensor.wardName || '',
            selectedSensor.wardNo || '',
            dataCategoryLabels[selectedSensor.dataCategory || 'none'],
            selectedSensor.lat,
            selectedSensor.lng,
            point.time || '',
            Number.isFinite(point.waterLevel) ? point.waterLevel : '',
            Number.isFinite(point.offLevel) ? point.offLevel : '',
            Number.isFinite(point.onLevel) ? point.onLevel : '',
            Number.isFinite(point.discharge) ? point.discharge : ''
          ])
        : [[
            selectedSensor.uid,
            selectedSensor.wardName || '',
            selectedSensor.wardNo || '',
            dataCategoryLabels[selectedSensor.dataCategory || 'none'],
            selectedSensor.lat,
            selectedSensor.lng,
            '',
            '',
            '',
            '',
            ''
          ]];

      const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      const safeUid = String(selectedSensor.uid).replace(/[^a-z0-9_-]+/gi, '_');
      link.href = URL.createObjectURL(blob);
      link.download = `bbmp_borewell_${safeUid}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
      showToast(`Exported selected borewell ${selectedSensor.uid}.`);
    };

    const downloadChartImage = (chart, label) => {
      if (!chart || !selectedSensor) {
        showToast('No chart is available to download.');
        return;
      }
      const source = chart.canvas;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0);

      const safeUid = String(selectedSensor.uid).replace(/[^a-z0-9_-]+/gi, '_');
      const safeRange = String(selectedRange).replace(/[^a-z0-9_-]+/gi, '_');
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `bbmp_${label}_${safeUid}_${safeRange}_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.append(link);
      link.click();
      link.remove();
    };

    const chartByCanvasId = (canvasId) => {
      const canvas = document.getElementById(canvasId);
      return canvas ? Chart.getChart(canvas) : null;
    };

    const fullscreenRangeContext = (canvasId) => {
      const uidMatch = String(canvasId || '').match(/^uidModeChart(\d+)$/);
      if (uidMatch) {
        const index = Number(uidMatch[1]);
        const modeTabs = document.querySelector(`.uid-mode-tabs[data-uid-index="${index}"]`);
        const rangeTabs = document.querySelector(`.uid-range-tabs[data-uid-index="${index}"]`);
        const mode = modeTabs?.querySelector('button.active')?.dataset.mode;
        if (!['daily-level', 'daily-drop'].includes(mode) || !rangeTabs) return null;
        return { index, rangeTabs };
      }
      const capacityMatch = String(canvasId || '').match(/^uidSpecificCapacity(?:Discharge|Duration)?Chart(\d+)$/);
      if (capacityMatch) {
        const index = Number(capacityMatch[1]);
        const rangeTabs = document.querySelector(`.sc-range-tabs[data-sc-index="${index}"]`);
        if (!rangeTabs) return null;
        return { index, rangeTabs };
      }
      return null;
    };

    const updateFullscreenRangeControls = (canvasId) => {
      const context = fullscreenRangeContext(canvasId);
      if (!context) {
        els.chartFullscreenControls.style.display = 'none';
        els.chartFullscreenControls.innerHTML = '';
        return;
      }
      const activeRange = context.rangeTabs.querySelector('button.active')?.dataset.range || 'week';
      const labels = [
        ['week', 'Last Week'],
        ['month', 'Last Month'],
        ['three', '3 Months'],
        ['all', 'All Time']
      ];
      els.chartFullscreenControls.innerHTML = labels.map(([range, label]) =>
        `<button type="button" data-fullscreen-range="${range}" class="${range === activeRange ? 'active' : ''}">${label}</button>`
      ).join('');
      els.chartFullscreenControls.style.display = 'grid';
    };

    const refreshFullscreenChart = () => {
      if (!fullscreenSource || !els.chartFullscreen.classList.contains('open')) return;
      openChartFullscreen(fullscreenSource.canvasId, fullscreenSource.title, true);
    };

    const openChartFullscreen = (canvasId, title = 'Chart') => {
      const sourceChart = chartByCanvasId(canvasId);
      if (!sourceChart) {
        showToast('No chart is available to expand.');
        if (els.chartFullscreen.classList.contains('open')) closeChartFullscreen();
        return;
      }
      fullscreenChart?.destroy();
      fullscreenChart = null;
      fullscreenSource = { canvasId, title };
      els.chartFullscreenTitle.textContent = title;
      els.chartFullscreen.classList.add('open');
      els.chartFullscreen.setAttribute('aria-hidden', 'false');
      updateFullscreenRangeControls(canvasId);

      const sourceScales = sourceChart.options?.scales || {};
      const fullscreenScales = {};
      Object.entries(sourceScales).forEach(([key, scale]) => {
        const isTimestampAxis = key === 'x'
          && scale.type === 'linear'
          && (sourceChart.data.datasets || []).some((dataset) => (dataset.data || []).some((item) => item && typeof item === 'object' && Number(item.x) > 1000000000000));
        fullscreenScales[key] = {
          type: scale.type,
          position: scale.position,
          reverse: Boolean(scale.reverse),
          grid: scale.grid ? { drawOnChartArea: scale.grid.drawOnChartArea } : undefined,
          title: {
            display: Boolean(scale.title?.display),
            text: scale.title?.text || '',
            font: { size: 22, weight: '800' }
          },
          ticks: {
            minRotation: scale.ticks?.minRotation || 0,
            maxRotation: scale.ticks?.maxRotation || 0,
            autoSkip: scale.ticks?.autoSkip,
            maxTicksLimit: scale.ticks?.maxTicksLimit,
            font: { size: 20 },
            padding: 12,
            callback: isTimestampAxis
              ? (value) => new Date(Number(value)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              : scale.ticks?.callback
          }
        };
      });
      const sourceOptions = {
        responsive: true,
        maintainAspectRatio: false,
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        hover: { mode: 'nearest', intersect: false },
        scales: fullscreenScales,
        plugins: {
          legend: {
            display: sourceChart.options?.plugins?.legend?.display !== false,
            labels: {
              font: { size: 22, weight: '700' },
              boxWidth: 34,
              padding: 18
            }
          },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            titleFont: { size: 22 },
            bodyFont: { size: 20 },
            padding: 14,
            callbacks: {
              title(context) {
                const raw = context[0]?.raw || {};
                if (raw && typeof raw === 'object' && Number(raw.x) > 1000000000000) {
                  return raw.label || new Date(Number(raw.x)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                }
                return context[0]?.label || '';
              },
              label(context) {
                const value = context.parsed.y;
                const unit = context.dataset.unit || 'ft';
                const decimals = unit === 'm2/s' ? 4 : unit === 's/m2' ? 0 : 2;
                return Number.isFinite(value)
                  ? `${context.dataset.label}: ${value.toFixed(decimals)} ${unit}`
                  : `${context.dataset.label}: N/A`;
              }
            }
          }
        }
      };
      const sourceData = {
        labels: [...(sourceChart.data.labels || [])],
        datasets: (sourceChart.data.datasets || []).map((dataset) => ({
          ...dataset,
          data: (dataset.data || []).map((item) => item && typeof item === 'object' ? { ...item } : item)
        }))
      };
      const labelCount = sourceData.labels.length;
      sourceOptions.layout = {
        padding: { bottom: labelCount > 10 ? 52 : 18 }
      };
      const denseChartWidth = labelCount > 18
        ? Math.min(Math.max(labelCount * 70, 1800), 10000)
        : 0;
      els.chartFullscreenCanvas.classList.toggle('dense-x-axis', Boolean(denseChartWidth));
      els.chartFullscreenCanvas.style.width = denseChartWidth ? `${denseChartWidth}px` : '';
      els.chartFullscreenCanvas.style.minWidth = denseChartWidth ? `${denseChartWidth}px` : '';
      if (denseChartWidth) {
        const denseChartHeight = Math.max(560, Math.round(window.innerHeight * 0.72));
        els.chartFullscreenCanvas.width = denseChartWidth;
        els.chartFullscreenCanvas.height = denseChartHeight;
        els.chartFullscreenCanvas.style.height = `${denseChartHeight}px`;
        sourceOptions.responsive = false;
      }
      sourceData.datasets = (sourceData.datasets || []).map((dataset) => ({
        ...dataset,
        pointRadius: Math.max(Number(dataset.pointRadius ?? 3), 6),
        pointHoverRadius: Math.max(Number(dataset.pointHoverRadius ?? 5), 10),
        borderWidth: Math.max(Number(dataset.borderWidth ?? 2), 4)
      }));

      fullscreenChart = new Chart(els.chartFullscreenCanvas, {
        type: sourceChart.config.type,
        data: sourceData,
        options: sourceOptions
      });
      window.setTimeout(() => fullscreenChart?.resize(), 60);
    };

    const closeChartFullscreen = () => {
      fullscreenChart?.destroy();
      fullscreenChart = null;
      fullscreenSource = null;
      els.chartFullscreenCanvas.classList.remove('dense-x-axis');
      els.chartFullscreenCanvas.style.width = '';
      els.chartFullscreenCanvas.style.minWidth = '';
      els.chartFullscreenCanvas.style.height = '';
      els.chartFullscreenCanvas.removeAttribute('width');
      els.chartFullscreenCanvas.removeAttribute('height');
      els.chartFullscreen.classList.remove('open');
      els.chartFullscreen.setAttribute('aria-hidden', 'true');
      els.chartFullscreenControls.style.display = 'none';
      els.chartFullscreenControls.innerHTML = '';
    };
