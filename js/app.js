/* ==========================================================================
   BBMP Borewell Dashboard - Main Map Lifecycle & UI Controller
   ========================================================================== */

// Global Unhandled Promise Rejection Handler for Application Resiliency
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  if (typeof showToast === 'function') {
    showToast(event.reason?.message || 'A background data operation encountered an error.');
  }
});

const hoverPopup = { setLatLng(){return this;}, setContent(){return this;}, openOn(){return this;}, addTo(){return this;}, remove(){return this;}, _origConfig: L.popup({
    closeButton: false,
    autoClose: false,
    closeOnClick: false,
    className: 'ward-hover-popup',
    offset: [16, -12],
    maxWidth: 420
}) };

let hoverTimer = null;
let hoveredLayer = null;

    const drawShapeFile = async () => {
  const response = await fetch('bbmpwards.zip');

  if (!response.ok) {
    throw new Error(
      `Could not load bbmpwards.zip: HTTP ${response.status}`
    );
  }

  const geojson = await shp(await response.arrayBuffer());

  if (shapeLayer) {
    map.removeLayer(shapeLayer);
  }

  wardFeatures = flattenGeoJsonFeatures(geojson);
  wardLayers = [];

  assignSensorsToWards();

  shapeLayer = L.geoJSON(
    {
      type: 'FeatureCollection',
      features: wardFeatures
    },
    {
      style: wardStyle,

      onEachFeature: (feature, layer) => {
        wardLayers.push(layer);

        

        /*
         * Click-only selection (redesign 2026-09-10).
         * Hover previously mutated state and re-rendered the detail panel,
         * causing a jumpy tooltip that followed the cursor and flipped between
         * wards. That is gone. Hover now only applies a subtle CSS-driven
         * outline via `layer.setStyle`, no popup, no panel changes.
         */
        layer.on('mouseover', () => {
          if (focusedWardNo === normalizeWardNo(wardNumber(feature.properties || {}))) return;
          layer.setStyle({ weight: 2.4, color: '#0f6cbf' });
          layer.bringToFront();
        });
        layer.on('mouseout', () => {
          layer.setStyle(wardStyle(feature));
          const selectedLayer = wardLayers.find(item =>
            normalizeWardNo(wardNumber(item.feature?.properties || {})) === focusedWardNo
          );
          if (selectedLayer) selectedLayer.bringToFront();
          bringSensorsToFront();
        });
        layer.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          selectWard(feature);
        });
      }
    }
  ).addTo(map);

  map.fitBounds(
    shapeLayer.getBounds().pad(0.08)
  );

  try {
    await drawLakeFile();
  } catch (lakeError) {
    console.warn(
      '[GIS] Optional Lakes_final.zip layer could not be rendered:',
      lakeError.message
    );
  }
};

    const lakeName = (feature) => {
      const props = feature?.properties || {};
      return props.Name || props.name || props.LAKE_NAME || props.lake_name || '';
    };

    const drawLakeFile = async () => {
      const response = await fetch('Lakes_final.zip');
      if (!response.ok) throw new Error(`Could not load Lakes_final.zip: HTTP ${response.status}`);
      const geojson = await shp(await response.arrayBuffer());
      const lakeFeatures = flattenGeoJsonFeatures(geojson);
      if (lakeLayer) map.removeLayer(lakeLayer);
      lakeLayer = L.geoJSON({ type: 'FeatureCollection', features: lakeFeatures }, {
        style: {
          color: 'rgba(0,0,0,0.62)',
          weight: 1.5,
          opacity: 1,
          fillColor: '#003b8f',
          fillOpacity: 0.38
        },
        onEachFeature: (feature, layer) => {
          const name = lakeName(feature);
          const wardNo = feature?.properties?.WARD_NO;
          const wardName = feature?.properties?.WARD_NAME;
          if (name) {
            layer.bindTooltip(name, {
              sticky: true,
              className: 'lake-tooltip'
            });
          }
          layer.bindPopup(`
            <strong>${name || 'Lake'}</strong><br>
            Ward: ${wardNo || '-'} ${wardName ? `- ${wardName}` : ''}
          `);
        }
      }).addTo(map);
      lakeLayer.bringToFront();
      bringSensorsToFront();
    };

    const applySharedDashboardData = (consumptionPayload = { wards: [] }, populationPayload = { wards: [] }) => {
      consumptionRows = consumptionPayload.wards || [];
      consumptionByWardName = new Map(consumptionRows.map((item) => [normalizeWardName(item.wardName), item]));
      consumptionByCanonicalName = new Map(consumptionRows.map((item) => [canonicalWardName(item.wardName), item]));
      populationByWardNo = new Map((populationPayload.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      populationByCanonicalName = new Map((populationPayload.wards || []).map((item) => [canonicalWardName(item.wardName), item]));
      consumptionByWardNo = new Map();
      for (const consumption of consumptionRows) {
        const population = populationByCanonicalName.get(canonicalWardName(consumption.wardName));
        if (population?.wardNo) {
          consumptionByWardNo.set(normalizeWardNo(population.wardNo), consumption);
        }
      }
    };

    const keepLayerInsideMapView = (layer) => {
      const pathRect = layer?._path?.getBoundingClientRect?.();
      const mapRect = map.getContainer().getBoundingClientRect();
      if (!pathRect || !mapRect) return;
      const margin = 28;
      const overflowRight = pathRect.right - (mapRect.right - margin);
      const overflowLeft = (mapRect.left + margin) - pathRect.left;
      const overflowBottom = pathRect.bottom - (mapRect.bottom - margin);
      const overflowTop = (mapRect.top + margin) - pathRect.top;
      const dx = overflowRight > 0 ? overflowRight : overflowLeft > 0 ? -overflowLeft : 0;
      const dy = overflowBottom > 0 ? overflowBottom : overflowTop > 0 ? -overflowTop : 0;
      if (dx || dy) map.panBy([dx, dy], { animate: false });
    };

    const applySensorDashboardData = (payload, qcPayload, sourceLabel, fromCache = false) => {
      sensorQcByUid = new Map((qcPayload.sensors || []).map((item) => [String(item.uid), item]));
      sensors = (payload.sensors || []).map((sensor) => ({
        ...sensor,
        qc: sensorQcByUid.get(String(sensor.uid)) || null
      }));
      assignSensorsToWards();
      renderSensors();
      fitSensors();
      els.refreshStatus.textContent = `${sourceLabel} sensors ${fromCache ? 'restored' : 'loaded'}. Loading ward metrics in background...`;
    };

    const applyWardDashboardData = (loaded, sourceLabel, fromCache = false) => {
      const {
        wardQcPayload,
        indicatorsPayload,
        wardWeeklyPayload,
        criticalApiPayload,
        criticalGroundwaterPayload,
        pumpingPerformanceWardPayload,
        consumptionPayload,
        populationPayload
      } = loaded;
      wardWeeklyByNo = new Map((wardWeeklyPayload.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      const activeCriticalGroundwaterPayload = currentDataSource === 'kh'
        ? mergeCriticalGroundwaterWithWeekly(
            wardWeeklyPayload,
            criticalApiPayload || criticalGroundwaterPayload
          )
        : criticalGroundwaterPayload;
      loaded.criticalGroundwaterPayload = activeCriticalGroundwaterPayload;

      wardQcByNo = new Map((wardQcPayload.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      wardQcByName = new Map((wardQcPayload.wards || []).map((item) => [normalizeWardName(item.wardName), item]));
      wardIndicatorsByNo = new Map((indicatorsPayload.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      wardIndicatorsByName = new Map((indicatorsPayload.wards || []).map((item) => [normalizeWardName(item.wardName), item]));
      criticalGroundwaterByNo = new Map((activeCriticalGroundwaterPayload?.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      pumpingPerformanceWardSummaryByNo = new Map((pumpingPerformanceWardPayload?.wards || []).map((item) => [normalizeWardNo(item.wardNo), item]));
      pumpingPerformanceWardThresholds = pumpingPerformanceWardPayload?.thresholds || {};
      initializeHighestCountGroundwaterMethod();
      renderMethodSummary(activeCriticalGroundwaterPayload);
      applySharedDashboardData(consumptionPayload, populationPayload);
      assignSensorsToWards();
      renderSensors();
      if (selectedSensor) {
        const updated = sensors.find((sensor) => sensor.uid === selectedSensor.uid);
        if (updated) selectSensor(updated, false);
      }
      if (shapeLayer) shapeLayer.setStyle(wardStyle);
      els.refreshStatus.textContent = `${sourceLabel} ward metrics ${fromCache ? 'restored' : 'loaded'}. ${sensors.length} sensors ready.`;
    };

    const applyLoadedDashboardData = (loaded, sourceLabel, fromCache = false) => {
      applySensorDashboardData(loaded.payload, loaded.qcPayload, sourceLabel, fromCache);
      applyWardDashboardData(loaded, sourceLabel, fromCache);
      showToast(`${fromCache ? 'Restored' : 'Loaded'} ${sensors.length} ${sourceLabel} sensors.`);
    };

    const loadSensors = async () => {
      const sourceLabel = sourceDisplayName();
      els.app.classList.toggle('nimblevision-mode', currentDataSource === 'vendor');
      const cacheKey = currentDataSource;
      const sequence = ++loadSequence;
      if (dashboardDataCache.has(cacheKey)) {
        applyLoadedDashboardData(dashboardDataCache.get(cacheKey), sourceLabel, true);
        return;
      }
      els.refreshStatus.textContent = `Loading ${sourceLabel} sensor data...`;
      showSensorLoading(`Loading ${sourceLabel} sensors...`);
      let payload, qcPayload;
      try {
        const [sensorData, qcData] = await Promise.all([
          fetchJsonWithRetry(`${API_BASE_URL}/api/sensors?${sourceQuery()}`, null, 2),
          fetchJsonWithRetry(`${API_BASE_URL}/api/qc/sensors?${sourceQuery()}`, { sensors: [] }, 2)
        ]);
        if (sequence !== loadSequence) return;
        if (!sensorData || !Array.isArray(sensorData.sensors)) {
          throw new Error(`Could not load sensors from API server (${API_BASE_URL}).`);
        }
        payload = sensorData;
        qcPayload = qcData || { sensors: [] };
      } catch (error) {
        if (sequence !== loadSequence) return;
        hideSensorLoading();
        els.refreshStatus.innerHTML = `<span style="color: #ef4444; font-weight: 600;">Failed to load ${sourceLabel} sensors.</span> <button id="retryLoadSensorsBtn" style="margin-left: 8px; padding: 2px 8px; border-radius: 4px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer;">Retry</button>`;
        document.getElementById('retryLoadSensorsBtn')?.addEventListener('click', () => loadSensors());
        throw error;
      }
      applySensorDashboardData(payload, qcPayload, sourceLabel, false);

      const sharedPromise = sharedDashboardDataCache
        ? Promise.resolve(sharedDashboardDataCache)
        : Promise.all([
          fetch(`${API_BASE_URL}/api/consumption/wards`),
          fetch(`${API_BASE_URL}/api/population/wards`)
        ]).then(async ([consumptionResponse, populationResponse]) => {
          const shared = {
            consumptionPayload: consumptionResponse.ok ? await consumptionResponse.json() : { wards: [] },
            populationPayload: populationResponse.ok ? await populationResponse.json() : { wards: [] }
          };
          sharedDashboardDataCache = shared;
          return shared;
        });

      Promise.all([
        fetchJsonWithRetry(`${API_BASE_URL}/api/qc/wards`, { wards: [] }),
        fetchJsonWithRetry(`${API_BASE_URL}/api/indicators/wards`, { wards: [] }),
        fetchJsonWithRetry(`${API_BASE_URL}/api/ward-weekly-levels?${sourceQuery()}&cache_v=${WARD_WEEKLY_API_VERSION}`, { wards: [], weeks: [] }, 2),
        currentDataSource === 'kh'
          ? fetchJsonWithRetry(`${API_BASE_URL}/api/critical-wards-groundwater?cache_v=${WARD_WEEKLY_API_VERSION}`, { wards: [] }, 2)
          : Promise.resolve({ wards: [] }),
        currentDataSource === 'kh'
          ? fetchJsonWithRetry(`${API_BASE_URL}/api/pumping-performance/wards?cache_v=${PUMPING_PERFORMANCE_API_VERSION}`, { wards: [], thresholds: {} }, 2)
          : Promise.resolve({ wards: [], thresholds: {} }),
        sharedPromise
      ]).then(async ([wardQcPayload, indicatorsPayload, wardWeeklyPayload, criticalApiPayload, pumpingPerformanceWardPayload, shared]) => {
        if (sequence !== loadSequence) return;
        const criticalGroundwaterPayload = mergeCriticalGroundwaterWithWeekly(
          wardWeeklyPayload,
          criticalApiPayload
        );
        const loaded = {
          payload,
          qcPayload,
          wardQcPayload,
          indicatorsPayload,
          wardWeeklyPayload,
          criticalApiPayload,
          criticalGroundwaterPayload,
          pumpingPerformanceWardPayload,
          consumptionPayload: shared.consumptionPayload,
          populationPayload: shared.populationPayload
        };
        dashboardDataCache.set(cacheKey, loaded);
        applyWardDashboardData(loaded, sourceLabel, false);
      }).catch((error) => {
        if (sequence === loadSequence) {
          els.refreshStatus.textContent = `${sourceLabel} sensors loaded. Ward metrics are still unavailable.`;
          showToast(`Could not load ${sourceLabel} ward metrics.`);
          console.error(error);
        }
      });
    };

    const refreshData = async () => {
      if (currentDataSource === 'vendor') {
        showToast('Nimblevision data is imported from CSV files. Use the local Nimblevision import script to update it.');
        return;
      }
      try {
        dashboardDataCache.delete('kh');
        els.refreshStatus.textContent = 'Reloading latest uploaded KH Excel ZIP data...';
        await loadSensors();
      } catch (error) {
        els.refreshStatus.textContent = 'Could not reload dashboard data.';
        showToast(error.message);
      }
    };

    const rangeStart = (points, range = selectedRange) => {
      if (range === 'all' || !points.length) return null;
      const latest = new Date(points[points.length - 1].time);
      const days = range === 'week' ? 7 : range === 'month' ? 30 : 90;
      return new Date(latest.getTime() - days * 24 * 60 * 60 * 1000);
    };

    const filteredPoints = () => {
      const start = rangeStart(waterPoints);
      return waterPoints.filter((point) => !start || new Date(point.time) >= start);
    };

    const pointsForRange = (points, range = 'all') => {
      const ordered = (points || []).filter((point) => point.time).sort((a, b) => new Date(a.time) - new Date(b.time));
      const start = rangeStart(ordered, range);
      return ordered.filter((point) => !start || new Date(point.time) >= start);
    };

    const pointDateKey = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
      return date.toISOString().slice(0, 10);
    };

    const levelNumber = (point, key) => {
      const value = Number(point?.[key]);
      return Number.isFinite(value) ? value : null;
    };

    const levelChanged = (previous, current, tolerance = 0.25) => {
      const keys = ['primary', 'waterLevel', 'offLevel', 'onLevel'];
      return keys.some((key) => {
        const before = levelNumber(previous, key);
        const after = levelNumber(current, key);
        if (before == null && after == null) return false;
        if (before == null || after == null) return true;
        return Math.abs(after - before) > tolerance;
      });
    };

    const compressRepeatedLevelPoints = (points, tolerance = 0.25) => {
      const ordered = (points || [])
        .filter((point) => point.time)
        .sort((a, b) => new Date(a.time) - new Date(b.time));
      const kept = [];
      let lastKept = null;
      ordered.forEach((point) => {
        if (!lastKept || levelChanged(lastKept, point, tolerance)) {
          kept.push(point);
          lastKept = point;
        }
      });
      return kept;
    };


    const selectWard = async (feature) => {
      const currentSelectionSequence = ++selectionSequence;

      const props = feature.properties || {};
      const count = props._sensorCount || 0;
      const selectedWardNo = normalizeWardNo(wardNumber(props));

      selectedSensor = null;
      focusedWardNo = selectedWardNo;
      activeWardData = null;
      activeSpecificCapacityData = null;
      activeWardProps = props;
      activeWardSensors = [];
      waterPoints = [];

      map.closePopup();

      updateClearSelectionButton();

      const selectedWardName = normalizeWardName(wardName(props));
      const criticalGw = criticalForWardNo(selectedWardNo);
      const wardSensors = sensors
        .filter((sensor) => normalizeWardNo(sensor.wardNo) === selectedWardNo || normalizeWardName(sensor.wardName) === selectedWardName)
        .sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
      activeWardSensors = wardSensors;

      setSensorSectionsVisible(false);
      els.app.classList.remove('right-collapsed', 'chart-wide', 'critical-ward-selected', 'screening-ward-selected', 'unverified-ward-selected');
      if (window.innerWidth < 1700 && !els.app.classList.contains('left-collapsed')) {
        els.app.classList.add('left-collapsed');
        els.app.dataset.autoCollapsedLeft = 'true';
        els.toggleLeft.textContent = '>';
      }
      els.app.classList.toggle('critical-ward-selected', currentDataSource === 'kh' && mapWardStatusKey(selectedWardNo) === 'critical');
      els.app.classList.toggle('screening-ward-selected', currentDataSource === 'kh' && wardAnalysisLens === 'groundwater' && isLinearMannKendallScreeningWard(criticalGw));
      els.toggleRight.textContent = '›';
      els.toggleRight.title = 'Collapse details panel';
      els.toggleRight.setAttribute('aria-label', els.toggleRight.title);
      waterPoints = [];
      clearWardInlineCharts();
      waterChart?.destroy();
      dischargeChart?.destroy();
      waterChart = null;
      dischargeChart = null;
      refreshWardPopups();
      renderSensors();
      const selectedLayer = wardLayers.find((layer) => layer.feature === feature);
      if (selectedLayer) {
        selectedLayer.bringToFront();
      }
      bringSensorsToFront();

      els.detailTitle.textContent = `Ward ${wardNumber(props)}: ${wardName(props)}`;
      els.detailSubhead.textContent = wardDetailSubheadText(criticalGw);
      els.wardDetailPanel.innerHTML = '<div class="empty-chart">Loading ward weekly groundwater trend...</div>';
      const zoomToSelectedWard = () => {
        if (
          currentSelectionSequence !== selectionSequence ||
          focusedWardNo !== selectedWardNo
        ) {
          return;
        }

        map._size = null;
        map.invalidateSize({ pan: false, animate: false });
        window.requestAnimationFrame(() => {
          map._size = null;
          map.invalidateSize({ pan: false, animate: false });
          const layer = wardLayers.find((item) => item.feature === feature);
          const bounds = layer?.getBounds?.();
          if (bounds?.isValid?.()) {
            layer.bringToFront();
            layer._path?.classList.add('ward-focused-shape');
            map.fitBounds(bounds.pad(0.22), {
              animate: true,
              maxZoom: 14,
              paddingTopLeft: [28, 24],
              paddingBottomRight: [28, 24]
            });
            window.setTimeout(() => {
              if (
                currentSelectionSequence !== selectionSequence ||
                focusedWardNo !== selectedWardNo
              ) {
                return;
              }

              layer.bringToFront();
              layer._path?.classList.add('ward-focused-shape');
              keepLayerInsideMapView(layer);
              window.setTimeout(() => keepLayerInsideMapView(layer), 420);
              bringSensorsToFront();
            }, 520);
          }
        });
      };
      window.setTimeout(zoomToSelectedWard, 520);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/ward-weekly-levels?ward_no=${encodeURIComponent(selectedWardNo)}&${sourceQuery()}`
        );

        const payload = response.ok
          ? await response.json()
          : { ward: null };

        if (
          currentSelectionSequence !== selectionSequence ||
          focusedWardNo !== selectedWardNo
        ) {
          return;
        }

        const pumpingPayload = await loadWardPumpingPerformance(selectedWardNo);
        const capacityPayload = { ward: null, sensors: [], deferred: true, pumping: pumpingPayload };

        if (
          currentSelectionSequence !== selectionSequence ||
          focusedWardNo !== selectedWardNo
        ) {
          return;
        }
        const shapeLayer = wardLayers.find((layer) => layer.feature === feature);
        if (shapeLayer) {
          
          shapeLayer.bringToFront();
        }
        const wardData = payload.ward || wardWeeklyByNo.get(selectedWardNo) || null;
        if (wardData) {
          wardWeeklyByNo.set(selectedWardNo, wardData);
        }
        if (
            currentSelectionSequence !== selectionSequence ||
            focusedWardNo !== selectedWardNo
          ) {
            return;
          }
        activeWardData = wardData;
        activeSpecificCapacityData = capacityPayload;
        activeWardProps = props;
        activeWardSensors = wardSensors;
        const selectedCritical = criticalForWardNo(selectedWardNo);
        els.app.classList.remove('critical-ward-selected', 'screening-ward-selected', 'unverified-ward-selected');
        els.app.classList.toggle('critical-ward-selected', currentDataSource === 'kh' && mapWardStatusKey(selectedWardNo) === 'critical');
        els.app.classList.toggle('screening-ward-selected', currentDataSource === 'kh' && wardAnalysisLens === 'groundwater' && isLinearMannKendallScreeningWard(selectedCritical));
        els.detailSubhead.textContent = wardDetailSubheadText(
          selectedCritical,
          wardData
        );
        els.wardDetailPanel.innerHTML = buildWardDetailHtml(props, wardData, wardSensors, capacityPayload);
        renderWardDetailCharts(wardData, capacityPayload);
        refreshWardPopups();
     } catch (error) {
        if (
          currentSelectionSequence !== selectionSequence ||
          focusedWardNo !== selectedWardNo
        ) {
          return;
        }

        const wardData =
          wardWeeklyByNo.get(selectedWardNo) ||
          null;
        if (wardData) {
          wardWeeklyByNo.set(selectedWardNo, wardData);
        }

        const pumpingPayload = await loadWardPumpingPerformance(selectedWardNo);
        const capacityPayload = { ward: null, sensors: [], deferred: true, pumping: pumpingPayload };

        if (
          currentSelectionSequence !== selectionSequence ||
          focusedWardNo !== selectedWardNo
        ) {
          return;
        }

        activeWardData = wardData;
        activeSpecificCapacityData = capacityPayload;
        activeWardProps = props;
        activeWardSensors = wardSensors;
        const selectedCritical = criticalForWardNo(selectedWardNo);
        els.app.classList.remove('critical-ward-selected', 'screening-ward-selected', 'unverified-ward-selected');
        els.app.classList.toggle('critical-ward-selected', currentDataSource === 'kh' && mapWardStatusKey(selectedWardNo) === 'critical');
        els.app.classList.toggle('screening-ward-selected', currentDataSource === 'kh' && wardAnalysisLens === 'groundwater' && isLinearMannKendallScreeningWard(selectedCritical));
        els.detailSubhead.textContent = wardDetailSubheadText(
          selectedCritical,
          wardData
        );

        els.wardDetailPanel.innerHTML =
          buildWardDetailHtml(
            props,
            wardData,
            wardSensors,
            capacityPayload
          );

        renderWardDetailCharts(
          wardData,
          capacityPayload
        );
        refreshWardPopups();

        showToast(
          `Could not load ward weekly data for ward ${selectedWardNo}.`
        );
      }
    };

    const legend = L.control({ position: 'topright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML = `
        <div class="legend-title">Sensor data</div>
        <button class="legend-row" data-filter="both" type="button"><span class="dot" style="background:#003b8f"></span>WL + discharge</button>
        <button class="legend-row" data-filter="none" type="button"><span class="dot" style="background:#020617"></span>No data</button>
        <div class="legend-title legend-title-spaced">Ward status</div>
        <button class="legend-row" data-ward-filter="critical" type="button"><span class="swatch" style="background:rgb(255, 0, 0)"></span><span data-ward-legend-label="critical">Critical: GW Decline</span></button>
        <button class="legend-row" data-ward-filter="rise" type="button"><span class="swatch" style="background:rgb(0, 255, 0)"></span><span data-ward-legend-label="rise">Groundwater Rise</span></button>
        <button class="legend-row" data-ward-filter="stable" type="button"><span class="swatch" style="background:rgb(255, 255, 0)"></span><span data-ward-legend-label="stable">Stable / below threshold</span></button>
        <div class="legend-note" data-ward-legend-note>
          Red, green, and yellow fills show final mapped groundwater status. Wards without usable trend evidence are left unfilled.
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    document.querySelectorAll('.legend button[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        legendFilter = legendFilter === button.dataset.filter ? '' : button.dataset.filter;
        updateLegendFilterUi();
        renderSensors();
        fitSensors();
      });
    });

    const selectedLensThresholdText = () => {
      if (wardAnalysisLens === 'groundwater') return `|slope| ≤ ${LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK} ft/week`;
      if (wardAnalysisLens === 'overall') return `active in < ${commonLensCount}/5 lenses`;
      if (wardAnalysisLens === 'volumetric_deficit') return '< 10 ML groundwater storage loss';
      if (wardAnalysisLens === 'extraction') return `< ${formatNumber(pumpingPerformanceWardThresholds.extractionP75M3, 0)} m3 pumped volume`;
      if (wardAnalysisLens === 'specific_capacity') return `> ${formatNumber(pumpingPerformanceWardThresholds.specificCapacityP25Scaled, 4)} x10^-6 m2/s`;
      if (wardAnalysisLens === 'pumping_stress') return `< ${formatNumber(pumpingPerformanceWardThresholds.normalizedDrawdownP75FtPerM3, 2)} ft/m3`;
      return 'below selected threshold';
    };

    const updateLegendFilterUi = () => {
      const criticalLegendButton = document.querySelector('.legend button[data-ward-filter="critical"]');
      const criticalLegendSwatch = criticalLegendButton?.querySelector('.swatch');
      const criticalLegendLabel = criticalLegendButton?.querySelector('[data-ward-legend-label="critical"]');
      if (criticalLegendSwatch) criticalLegendSwatch.style.background = mapLensCriticalColor();
      if (criticalLegendLabel) criticalLegendLabel.textContent = mapLensCriticalLabel();
      const riseLegendLabel = document.querySelector('[data-ward-legend-label="rise"]');
      const stableLegendLabel = document.querySelector('[data-ward-legend-label="stable"]');
      if (riseLegendLabel) riseLegendLabel.textContent = 'Groundwater Rise';
      if (stableLegendLabel) {
        stableLegendLabel.textContent = wardAnalysisLens === 'groundwater'
          ? `Stable groundwater trend (${selectedLensThresholdText()})`
          : `Below threshold (${selectedLensThresholdText()})`;
      }
      const legendNote = document.querySelector('[data-ward-legend-note]');
      if (legendNote) {
        legendNote.textContent = wardAnalysisLens === 'groundwater'
          ? `Red = selected groundwater decline method marks the ward critical. Green = groundwater depth is reducing/rising. Yellow = enough data exists and the trend is near-flat/stable within ±${LINEAR_DECLINE_THRESHOLD_FT_PER_WEEK} ft/week. Unfilled = mixed, unclassified, or insufficient evidence.`
          : `Red = ward meets the selected ${wardAnalysisLensLabel()} critical threshold. Yellow = ward has data for this lens but does not meet the critical threshold. Unfilled = no usable data for this lens.`;
      }
      document.querySelectorAll('.legend button[data-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.filter === legendFilter);
      });
      document.querySelectorAll('.legend button[data-ward-filter]').forEach((button) => {
        if (button.dataset.wardFilter === 'rise') {
          button.style.display = wardAnalysisLens === 'groundwater' && latestWardStatusCounts.rise > 0 ? '' : 'none';
        }
        if (button.dataset.wardFilter === 'stable') {
          button.style.display = latestWardStatusCounts.stable > 0 && !['overall', 'consumption'].includes(wardAnalysisLens) ? '' : 'none';
        }
        button.classList.toggle('active', button.dataset.wardFilter === wardStatusFilter);
      });
    };

    const updateQcFilterUi = () => {
      document.querySelectorAll('button[data-qc-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.qcFilter === qcFilter);
      });
    };

    document.querySelectorAll('.legend button[data-ward-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const hadSelection = Boolean(
          selectedSensor ||
          focusedWardNo ||
          activeWardData
        );

        if (hadSelection) {
          selectionSequence += 1;

          selectedSensor = null;
          focusedWardNo = '';
          activeWardData = null;
          activeSpecificCapacityData = null;
          activeWardProps = null;
          activeWardSensors = [];
          waterPoints = [];

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

        if (els.app.dataset.autoCollapsedLeft === 'true') {
          els.app.classList.remove('left-collapsed');
          delete els.app.dataset.autoCollapsedLeft;
          els.toggleLeft.textContent = '<';
        }

          els.wardDetailPanel.innerHTML = '';
          els.wardDetailPanel.style.display = 'none';

          els.app.classList.add('right-collapsed');
          updateClearSelectionButton();
        }

        wardStatusFilter =
          wardStatusFilter === button.dataset.wardFilter
            ? ''
            : button.dataset.wardFilter;

        updateLegendFilterUi();
        refreshWardPopups();
        renderSensors();
      });
    });

    document.querySelectorAll('button[data-qc-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        qcFilter = button.dataset.qcFilter || '';
        reviewReasonFilter = '';
        updateQcFilterUi();
        renderSensors();
        fitSensors();
      });
    });

    document.querySelectorAll('button[data-source]').forEach((button) => {
      button.addEventListener('click', async () => {
        const nextSource = button.dataset.source || 'kh';
        if (nextSource === currentDataSource) return;
        currentDataSource = nextSource;
        document.querySelectorAll('button[data-source]').forEach((item) => {
          item.classList.toggle('active', item.dataset.source === currentDataSource);
          item.disabled = true;
        });
        els.app.classList.toggle('nimblevision-mode', currentDataSource === 'vendor');
        selectedSensor = null;
        waterPoints = [];
        waterChart?.destroy();
        dischargeChart?.destroy();
        waterChart = null;
        dischargeChart = null;
        clearWardInlineCharts();
        setSensorSectionsVisible(false);
        showSensorLoading(`Loading ${sourceDisplayName()} sensors...`);
        try {
          await loadSensors();
          if (shapeLayer) shapeLayer.setStyle(wardStyle);
        } finally {
          document.querySelectorAll('button[data-source]').forEach((item) => {
            item.disabled = false;
          });
        }
      });
    });

    document.getElementById('exportSelected').addEventListener('click', () => {
      exportSelectedSensor();
    });
    els.exportFiltered.addEventListener('click', exportFilteredSensors);
    els.downloadWeeklyLevelsCsv.addEventListener('click', () => {
      window.open(`${API_BASE_URL}/api/good-sensor-weekly-start-levels.xlsx`, '_blank', 'noopener');
    });
    els.downloadNotUsableCsv.addEventListener('click', () => {
      window.open(`${API_BASE_URL}/api/qc/not-usable-sensors.xlsx`, '_blank', 'noopener');
    });
    els.downloadSpecificCapacity.addEventListener('click', () => {
      window.open(`${API_BASE_URL}/api/specific-capacity/wards.xlsx`, '_blank', 'noopener');
    });
    els.downloadCriticalGroundwater.addEventListener('click', () => {
      window.open(`${API_BASE_URL}/api/critical-wards-groundwater.xlsx`, '_blank', 'noopener');
    });
    els.downloadCriticalComparison.addEventListener('click', () => {
      window.open(`${API_BASE_URL}/api/critical-wards-comparison.xlsx`, '_blank', 'noopener');
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.ward-specific-capacity-download');
      if (!button) return;
      const wardNo = button.dataset.wardNo;
      window.open(`${API_BASE_URL}/api/specific-capacity/wards.xlsx?ward_no=${encodeURIComponent(wardNo)}`, '_blank', 'noopener');
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#wardDownloadWeeklyLevels')) {
        window.open(`${API_BASE_URL}/api/good-sensor-weekly-start-levels.xlsx`, '_blank', 'noopener');
      }
      if (event.target.closest('#wardDownloadNotUsable')) {
        window.open(`${API_BASE_URL}/api/qc/not-usable-sensors.xlsx`, '_blank', 'noopener');
      }
    });
    document.addEventListener('click', (event) => {
      const uidButton = event.target.closest('[data-pumping-uid]');
      if (!uidButton) return;
      const sensor = sensors.find((item) => String(item.uid) === String(uidButton.dataset.pumpingUid));
      if (sensor) selectSensor(sensor, true);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('#toggleGroundwaterOutliers, [data-toggle-groundwater-outliers]');
      if (!button) return;
      showGroundwaterOutliers = !showGroundwaterOutliers;
      redrawGroundwaterCharts();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('#toggleCycleConnector, [data-toggle-cycle-connector]');
      if (!button) return;
      showCycleConnector = !showCycleConnector;
      redrawGroundwaterCharts();
    });
    els.downloadWaterChart?.addEventListener('click', () => downloadChartImage(waterChart, 'water_level'));
    els.downloadDischargeChart?.addEventListener('click', () => downloadChartImage(dischargeChart, 'discharge'));
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.chart-expand');
      if (!button) return;
      openChartFullscreen(button.dataset.chartId, button.dataset.chartTitle || 'Chart');
    });
    els.chartFullscreenClose?.addEventListener('click', closeChartFullscreen);
    els.chartFullscreen?.addEventListener('click', (event) => {
      if (event.target === els.chartFullscreen) closeChartFullscreen();
    });
    els.chartFullscreenControls?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-fullscreen-range]');
      if (!button || !fullscreenSource) return;
      const context = fullscreenRangeContext(fullscreenSource.canvasId);
      if (!context) return;
      const target = context.rangeTabs.querySelector(`button[data-range="${button.dataset.fullscreenRange}"]`);
      target?.click();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.chartFullscreen?.classList.contains('open')) {
        closeChartFullscreen();
      }
    });

    document.querySelectorAll('.range-tabs button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.range-tabs button').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        selectedRange = button.dataset.range;
        renderCharts();
      });
    });

    els.search?.addEventListener('input', renderSensors);
    els.fitSensors?.addEventListener('click', fitSensors);
    els.refreshData?.addEventListener('click', refreshData);
    els.clearSelection?.addEventListener(
      'click',
      clearCurrentSelection
    );
    els.toggleLeft?.addEventListener('click', () => {
      els.app.classList.toggle('left-collapsed');
      const collapsed = els.app.classList.contains('left-collapsed');

      els.toggleLeft.textContent = collapsed ? '›' : '‹';
      els.toggleLeft.title = collapsed ? 'Expand sensor list' : 'Collapse sensor list';
      els.toggleLeft.setAttribute('aria-label', els.toggleLeft.title);
      setTimeout(() => map.invalidateSize(), 220);
    });
    els.toggleRight?.addEventListener('click', () => {

      els.app.classList.toggle('right-collapsed');
      const collapsed = els.app.classList.contains('right-collapsed');
      els.toggleRight.textContent = collapsed ? '‹' : '›';
      els.toggleRight.title = collapsed ? 'Expand details panel' : 'Collapse details panel';
      els.toggleRight.setAttribute('aria-label', els.toggleRight.title);
      setTimeout(() => map.invalidateSize(), 220);
    });

    document.getElementById('closeDetails')?.addEventListener('click', () => {
      els.app.classList.add('right-collapsed');
      els.toggleRight.textContent = '‹';
      els.toggleRight.title = 'Expand details panel';
      els.toggleRight.setAttribute('aria-label', els.toggleRight.title);
      setTimeout(() => map.invalidateSize(), 220);
    });

    (async () => {
      try {
        await Promise.all([drawShapeFile(), loadSensors()]);
      } catch (error) {
        showToast(error.message);
      }
    })();
  
